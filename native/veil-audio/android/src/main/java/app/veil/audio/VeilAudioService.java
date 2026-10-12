package app.veil.audio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/** A private foreground service; it never creates a MediaSession or handles media keys. */
public final class VeilAudioService extends Service {
    static final String ACTION_START = "app.veil.audio.START";
    static final String ACTION_STOP = "app.veil.audio.STOP";
    private static final String CHANNEL = "veil_audio_playback";
    private static final int NOTIFICATION_ID = 7641;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        VeilAudioEngine engine = VeilAudioEngine.peek();
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            if (engine != null) engine.stopExternally(null);
            stopAndExit();
            return START_NOT_STICKY;
        }
        try {
            // Fulfil startForegroundService's deadline even if a Stop raced this start.
            Notification notification = notification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            if (engine == null) stopAndExit();
            else engine.onServiceReady(this);
        } catch (RuntimeException error) {
            if (engine != null) engine.onServiceStartFailed();
            stopAndExit();
        }
        // Process death must never silently restart sound.
        return START_NOT_STICKY;
    }

    private Notification notification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL, getString(R.string.veil_audio_channel), NotificationManager.IMPORTANCE_LOW
            );
            channel.setSound(null, null);
            channel.enableVibration(false);
            manager.createNotificationChannel(channel);
        }
        Intent stop = new Intent(this, VeilAudioService.class).setAction(ACTION_STOP);
        PendingIntent stopAction = PendingIntent.getService(
            this, 0, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(getString(R.string.veil_audio_notification_title))
            .setContentText(getString(R.string.veil_audio_notification_body))
            .setCategory(Notification.CATEGORY_SERVICE)
            .setPriority(Notification.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setShowWhen(false)
            .setDeleteIntent(stopAction)
            .addAction(android.R.drawable.ic_media_pause, getString(R.string.veil_audio_notification_stop), stopAction);
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            builder.setContentIntent(PendingIntent.getActivity(
                this, 1, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            ));
        }
        return builder.build();
    }

    void stopAndExit() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        VeilAudioEngine engine = VeilAudioEngine.peek();
        if (engine != null) engine.stopExternally(null);
        stopAndExit();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        VeilAudioEngine engine = VeilAudioEngine.peek();
        if (engine != null) engine.onServiceDestroyed(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
