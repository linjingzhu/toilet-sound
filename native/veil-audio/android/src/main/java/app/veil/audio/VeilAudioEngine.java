package app.veil.audio;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.AudioRouting;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** All player, service and callback access is confined to the main Looper. */
final class VeilAudioEngine {
    interface Listener { void changed(JSObject state); }
    interface Completion { void resolve(JSObject state); }

    private static final long RAMP_MS = 120;
    private static final String DEFAULT_OUTPUT = "기기 기본 출력";
    private static VeilAudioEngine instance;

    static VeilAudioEngine acquire(Context context) {
        if (instance == null) instance = new VeilAudioEngine(context.getApplicationContext());
        return instance;
    }

    static VeilAudioEngine peek() { return instance; }

    private static final class Track {
        final String id;
        final String file;
        final MediaPlayer player;
        AudioRouting.OnRoutingChangedListener routingListener;
        Runnable ramp;
        Runnable rampCompletion;
        float gain;
        float targetGain;
        boolean prepared;
        boolean started;
        boolean released;

        Track(MixRequest.Entry entry) {
            id = entry.id;
            file = entry.file;
            player = new MediaPlayer();
        }
    }

    private static final class PendingMix {
        final MixRequest request;
        final Completion completion;
        final Map<String, Track> staged = new LinkedHashMap<>();
        int preparing;
        Runnable timeout;

        PendingMix(MixRequest request, Completion completion) {
            this.request = request;
            this.completion = completion;
        }
    }

    private final Context context;
    private final AudioManager audioManager;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<Listener> listeners = new LinkedHashSet<>();
    private Map<String, Track> tracks = new LinkedHashMap<>();
    private final Set<Track> retiring = new HashSet<>();
    private PendingMix pending;
    private VeilAudioService service;
    private boolean startingService;
    private boolean playing;
    private boolean interrupted;
    private boolean disposed;
    private String error;
    private String outputName = DEFAULT_OUTPUT;
    private int outputId;
    private Runnable serviceTimeout;

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ignored, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                outputName = DEFAULT_OUTPUT;
                outputId = 0;
                if (wantsPlayback() || hasRunningAudio()) stopExternally(null);
                else emit();
            }
        }
    };

    private final AudioDeviceCallback devices = new AudioDeviceCallback() {
        @Override
        public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
            for (AudioDeviceInfo device : removed) {
                if (device.getId() == outputId) {
                    outputName = DEFAULT_OUTPUT;
                    outputId = 0;
                    if (wantsPlayback() || hasRunningAudio()) stopExternally(null);
                    else emit();
                    return;
                }
            }
        }
    };

    // Permission-free fallback for call/communication modes; no phone-state permission.
    private final Runnable modeMonitor = new Runnable() {
        @Override
        public void run() {
            if (disposed || !wantsPlayback()) return;
            if (inCommunication()) stopExternally(null);
            else main.postDelayed(this, 500);
        }
    };

    private VeilAudioEngine(Context context) {
        this.context = context;
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(noisyReceiver, filter);
        }
        audioManager.registerAudioDeviceCallback(devices, main);
    }

    void addListener(Listener listener) { listeners.add(listener); }
    void removeListener(Listener listener) { listeners.remove(listener); }
    boolean hasListeners() { return !listeners.isEmpty(); }

    JSObject state() {
        JSObject state = new JSObject();
        state.put("playing", playing);
        // A paused MediaPlayer has no authoritative routed device.
        state.put("outputName", playing ? outputName : DEFAULT_OUTPUT);
        state.put("interrupted", interrupted);
        if (error != null) state.put("error", error);
        return state;
    }

    private void emit() {
        if (disposed) return;
        JSObject status = state();
        for (Listener listener : new ArrayList<>(listeners)) listener.changed(status);
    }

    private boolean wantsPlayback() {
        return playing || (pending != null && pending.request.playing);
    }

    private boolean hasRunningAudio() {
        if (!retiring.isEmpty()) return true;
        for (Track track : tracks.values()) if (track.started) return true;
        return false;
    }

    private boolean inCommunication() {
        return audioManager.getMode() != AudioManager.MODE_NORMAL;
    }

    void setMix(MixRequest request, boolean foregroundAllowed, Completion completion) {
        if (disposed) { completion.resolve(state()); return; }
        // The next Play supplies the complete selection again. Stop never opens a file.
        if (!request.playing) {
            playing = false;
            error = null;
            cancelPending();
            main.removeCallbacks(modeMonitor);
            Map<String, Track> retained = new LinkedHashMap<>();
            for (MixRequest.Entry entry : request.tracks) {
                Track old = tracks.get(entry.id);
                if (old != null && old.file.equals(entry.file) && !old.released) retained.put(entry.id, old);
            }
            for (Track old : tracks.values()) {
                if (retained.get(old.id) == old) fadePause(old);
                else retire(old);
            }
            tracks = retained;
            stopServiceIfIdle();
            emit();
            completion.resolve(state());
            return;
        }
        cancelPending();
        if (request.playing && inCommunication()) {
            stopExternally("통화나 시스템 오디오 중단이 끝난 뒤 다시 재생해 주세요.");
            completion.resolve(state());
            return;
        }
        if (request.playing && service == null && !startingService && !foregroundAllowed) {
            stopExternally("앱을 연 뒤 다시 재생해 주세요.");
            completion.resolve(state());
            return;
        }
        PendingMix next = new PendingMix(request, completion);
        pending = next;
        next.timeout = () -> failPending(next, "소리를 준비하지 못했습니다. 다시 시도해 주세요.");
        main.postDelayed(next.timeout, 15000);

        if (request.playing) {
            startServiceIfNeeded();
            if (pending != next) return;
            main.removeCallbacks(modeMonitor);
            main.post(modeMonitor);
        }
        try {
            for (MixRequest.Entry entry : request.tracks) {
                Track existing = tracks.get(entry.id);
                if (existing != null && existing.file.equals(entry.file) && !existing.released) continue;
                Track track = new Track(entry);
                next.staged.put(entry.id, track);
                next.preparing++;
                prepare(track, next);
            }
            commitIfReady(next);
        } catch (IOException | RuntimeException failure) {
            failPending(next, "내장 음원을 열 수 없습니다. 앱의 오디오 파일을 확인해 주세요.");
        }
    }

    private void prepare(Track track, PendingMix command) throws IOException {
        MediaPlayer player = track.player;
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build());
        player.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK);
        // No audio focus request, stream-volume operation or external session control.
        try (AssetFileDescriptor file = context.getAssets().openFd("public/app/audio/" + track.file)) {
            player.setDataSource(file.getFileDescriptor(), file.getStartOffset(), file.getLength());
        }
        player.setLooping(true);
        player.setVolume(0, 0);
        player.setOnPreparedListener(ready -> {
            if (track.released || pending != command) return;
            track.prepared = true;
            command.preparing--;
            commitIfReady(command);
        });
        player.setOnErrorListener((failed, what, extra) -> {
            if (track.released) return true;
            if (pending == command && command.staged.containsValue(track)) {
                failPending(command, "내장 음원을 재생할 수 없습니다.");
            } else if (tracks.get(track.id) == track) {
                stopExternally("소리 재생이 중단되었습니다. 다시 재생해 주세요.");
                tracks.remove(track.id);
                release(track);
            } else {
                retiring.remove(track);
                release(track);
                stopServiceIfIdle();
            }
            return true;
        });
        track.routingListener = routing -> routeChanged(track);
        player.addOnRoutingChangedListener(track.routingListener, main);
        player.prepareAsync();
    }

    private void commitIfReady(PendingMix command) {
        if (pending != command || command.preparing != 0) return;
        if (command.request.playing && service == null) return;
        if (command.request.playing && inCommunication()) { stopExternally(null); return; }
        if (command.request.playing && !playing) {
            outputId = 0;
            outputName = DEFAULT_OUTPUT;
        }
        Map<String, Track> nextTracks = new LinkedHashMap<>();
        ArrayList<Track> started = new ArrayList<>();
        try {
            for (MixRequest.Entry entry : command.request.tracks) {
                Track track = command.staged.get(entry.id);
                if (track == null) track = tracks.get(entry.id);
                nextTracks.put(entry.id, track);
                if (command.request.playing && !track.started) {
                    cancelRamp(track);
                    setGain(track, 0);
                    track.player.start();
                    track.started = true;
                    started.add(track);
                }
            }
        } catch (RuntimeException failure) {
            for (Track track : started) pauseNow(track);
            failPending(command, "소리 재생을 시작하지 못했습니다. 다시 시도해 주세요.");
            return;
        }

        Map<String, Track> previous = tracks;
        tracks = nextTracks;
        playing = command.request.playing;
        if (playing) interrupted = false;
        error = null;
        pending = null;
        main.removeCallbacks(command.timeout);
        command.staged.clear(); // Ownership moves to tracks.
        for (Track old : previous.values()) {
            if (tracks.get(old.id) != old) retire(old);
        }
        for (MixRequest.Entry entry : command.request.tracks) {
            Track track = tracks.get(entry.id);
            if (playing) ramp(track, entry.gain, null);
            else fadePause(track);
        }
        if (!playing) main.removeCallbacks(modeMonitor);
        updateOutput();
        stopServiceIfIdle();
        emit();
        command.completion.resolve(state());
    }

    private void failPending(PendingMix command, String message) {
        if (pending != command) return;
        error = message;
        if (!playing) interrupted = true;
        cancelPending();
        stopServiceIfIdle();
        emit();
    }

    private void cancelPending() {
        PendingMix old = pending;
        pending = null;
        if (old == null) return;
        main.removeCallbacks(old.timeout);
        for (Track track : old.staged.values()) release(track);
        old.staged.clear();
        // Superseded commands settle without rejecting or resurrecting their playback intent.
        old.completion.resolve(state());
    }

    private void setGain(Track track, float gain) {
        track.player.setVolume(gain, gain);
        track.gain = gain;
    }

    private void cancelRamp(Track track) {
        if (track.ramp != null) main.removeCallbacks(track.ramp);
        track.ramp = null;
        track.rampCompletion = null;
    }

    private void ramp(Track track, float target, Runnable after) {
        if (track.released) return;
        if (after == null && track.ramp != null && track.rampCompletion == null && track.targetGain == target) return;
        cancelRamp(track);
        track.targetGain = target;
        track.rampCompletion = after;
        float from = track.gain;
        long began = SystemClock.uptimeMillis();
        Runnable step = new Runnable() {
            @Override
            public void run() {
                if (track.released || track.ramp != this) return;
                float progress = Math.min(1f, (SystemClock.uptimeMillis() - began) / (float) RAMP_MS);
                try {
                    setGain(track, from + (target - from) * progress);
                } catch (RuntimeException failure) {
                    if (tracks.get(track.id) == track) stopExternally("소리 재생이 중단되었습니다.");
                    else { retiring.remove(track); release(track); stopServiceIfIdle(); }
                    return;
                }
                if (progress < 1f) main.postDelayed(this, 16);
                else {
                    track.ramp = null;
                    track.rampCompletion = null;
                    if (after != null) after.run();
                }
            }
        };
        track.ramp = step;
        step.run();
    }

    private void fadePause(Track track) {
        if (!track.started) { cancelRamp(track); return; }
        ramp(track, 0, () -> { pauseNow(track); stopServiceIfIdle(); });
    }

    private void retire(Track track) {
        if (!track.started) { release(track); return; }
        retiring.add(track);
        ramp(track, 0, () -> { retiring.remove(track); release(track); stopServiceIfIdle(); });
    }

    private void pauseNow(Track track) {
        cancelRamp(track);
        if (track.released) return;
        try {
            setGain(track, 0);
            if (track.started) track.player.pause();
        } catch (RuntimeException ignored) {
            // A player in an error state cannot be reused.
            release(track);
        }
        track.started = false;
    }

    private void release(Track track) {
        if (track.released) return;
        cancelRamp(track);
        track.released = true;
        track.started = false;
        track.player.setOnPreparedListener(null);
        track.player.setOnErrorListener(null);
        if (track.routingListener != null) track.player.removeOnRoutingChangedListener(track.routingListener);
        track.player.release();
    }

    void stopExternally(String message) {
        if (disposed) return;
        playing = false;
        interrupted = true;
        error = message;
        cancelPending();
        main.removeCallbacks(modeMonitor);
        for (Track track : tracks.values()) pauseNow(track);
        for (Track track : new ArrayList<>(retiring)) release(track);
        retiring.clear();
        stopServiceIfIdle();
        emit();
    }

    private void routeChanged(Track track) {
        if (track.released || tracks.get(track.id) != track || !track.started) return;
        AudioDeviceInfo device = track.player.getRoutedDevice();
        if (device == null) return;
        boolean changed = outputId != 0 && outputId != device.getId();
        outputId = device.getId();
        outputName = device.getProductName().toString();
        if (changed && (wantsPlayback() || hasRunningAudio())) stopExternally(null);
        else emit();
    }

    private void updateOutput() {
        for (Track track : tracks.values()) {
            if (!track.started || track.released) continue;
            AudioDeviceInfo device = track.player.getRoutedDevice();
            if (device != null) {
                outputId = device.getId();
                outputName = device.getProductName().toString();
                return;
            }
        }
    }

    private void startServiceIfNeeded() {
        if (service != null || startingService) return;
        startingService = true;
        serviceTimeout = () -> {
            if (startingService) onServiceStartFailed();
        };
        main.postDelayed(serviceTimeout, 4000);
        Intent intent = new Intent(context, VeilAudioService.class).setAction(VeilAudioService.ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (RuntimeException failure) {
            onServiceStartFailed();
        }
    }

    void onServiceReady(VeilAudioService ready) {
        startingService = false;
        if (serviceTimeout != null) main.removeCallbacks(serviceTimeout);
        if (disposed || !wantsPlayback()) { ready.stopAndExit(); return; }
        service = ready;
        if (pending != null) commitIfReady(pending);
    }

    void onServiceStartFailed() {
        startingService = false;
        if (serviceTimeout != null) main.removeCallbacks(serviceTimeout);
        stopExternally("백그라운드 소리 재생을 시작하지 못했습니다. 앱을 연 뒤 다시 시도해 주세요.");
        context.stopService(new Intent(context, VeilAudioService.class));
    }

    void onServiceDestroyed(VeilAudioService destroyedService) {
        if (service != destroyedService) return;
        service = null;
        if (wantsPlayback()) stopExternally("백그라운드 소리 재생이 종료되었습니다.");
    }

    private void stopServiceIfIdle() {
        if (wantsPlayback()) return;
        for (Track track : tracks.values()) if (track.started) return;
        if (!retiring.isEmpty()) return;
        if (serviceTimeout != null) main.removeCallbacks(serviceTimeout);
        if (startingService) {
            startingService = false;
            context.stopService(new Intent(context, VeilAudioService.class));
        }
        if (service != null) {
            VeilAudioService old = service;
            service = null;
            old.stopAndExit();
        }
    }

    void dispose() {
        if (disposed) return;
        playing = false;
        interrupted = false;
        error = null;
        cancelPending();
        for (Track track : tracks.values()) release(track);
        tracks.clear();
        for (Track track : retiring) release(track);
        retiring.clear();
        main.removeCallbacks(modeMonitor);
        stopServiceIfIdle();
        outputName = DEFAULT_OUTPUT;
        outputId = 0;
        emit();
        disposed = true;
        context.unregisterReceiver(noisyReceiver);
        audioManager.unregisterAudioDeviceCallback(devices);
        if (instance == this) instance = null;
    }
}
