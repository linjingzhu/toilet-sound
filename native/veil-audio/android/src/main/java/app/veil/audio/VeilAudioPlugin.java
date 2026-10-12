package app.veil.audio;

import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VeilAudio")
public class VeilAudioPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean destroyed;
    private final VeilAudioEngine.Listener listener = state -> getBridge().execute(() -> {
        if (!destroyed) notifyListeners("stateChanged", state);
    });
    private VeilAudioEngine audio;

    private VeilAudioEngine engine() {
        VeilAudioEngine current = VeilAudioEngine.acquire(getContext());
        if (audio != current) {
            if (audio != null) audio.removeListener(listener);
            audio = current;
            audio.addListener(listener);
        }
        return audio;
    }

    @Override
    public void load() {
        main.post(() -> {
            if (!destroyed) engine();
        });
    }

    @PluginMethod
    public void setMix(PluginCall call) {
        final MixRequest request;
        try {
            request = MixRequest.parse(call.getData());
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), "INVALID_MIX");
            return;
        }
        main.post(() -> {
            if (destroyed) {
                call.reject("Audio bridge has been destroyed", "UNAVAILABLE");
                return;
            }
            engine().setMix(request, getBridge().getApp().isActive(), call::resolve);
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        main.post(() -> {
            if (destroyed) {
                call.reject("Audio bridge has been destroyed", "UNAVAILABLE");
            } else {
                call.resolve(engine().state());
            }
        });
    }

    @PluginMethod
    public void dispose(PluginCall call) {
        main.post(() -> {
            if (audio != null) {
                audio.dispose();
                audio.removeListener(listener);
                audio = null;
            }
            call.resolve();
        });
    }

    // Activity pause/stop deliberately leaves a running foreground service alone.
    @Override
    protected void handleOnDestroy() {
        main.post(() -> {
            destroyed = true;
            if (audio != null) {
                audio.removeListener(listener);
                if (!audio.hasListeners()) audio.dispose();
                audio = null;
            }
        });
    }
}
