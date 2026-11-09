package org.atlas.capture;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;

/** Ways into the capture box beyond the tile, sharing and the accessibility button, each a switch in Settings → Capture:
 *  a "Capture" icon of its own (the app drawer, the home screen, a Pixel's double tap on the back: Quick Tap opens an
 *  app) and a quiet notification that stays, one tap from anywhere, the lock screen included. */
final class CaptureWays {
    private CaptureWays() {}

    /** The manifest's activity-alias with a launcher entry, off until asked for (a second icon nobody wanted otherwise). */
    private static ComponentName icon(Context c) { return new ComponentName(c.getPackageName(), "org.atlas.capture.CaptureIcon"); }

    /** Whether this app has the icon to offer (the capture-only app is its own icon already). */
    static boolean hasIcon(Context c) {
        try { c.getPackageManager().getActivityInfo(icon(c), PackageManager.MATCH_DISABLED_COMPONENTS); return true; }
        catch (PackageManager.NameNotFoundException e) { return false; }
    }

    static boolean iconOn(Context c) {
        return hasIcon(c) && c.getPackageManager().getComponentEnabledSetting(icon(c)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    static void setIcon(Context c, boolean on) {
        if (!hasIcon(c)) return;
        c.getPackageManager().setComponentEnabledSetting(icon(c),
            on ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DEFAULT, PackageManager.DONT_KILL_APP);
    }

    /** Android 13 on: the notification needs the permission; asked each time the switch is turned on without it. */
    static void askToNotify(android.app.Activity a) {
        if (a != null && android.os.Build.VERSION.SDK_INT >= 33 && a.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED)
            a.requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, 5);
    }

    private static final String KEY = "captureNotification", CHANNEL = "capture.ready";
    private static final int ID = 4100; // below Notices' own ids (5000 on)

    static boolean notificationOn(Context c) { return c.getSharedPreferences("atlas", Context.MODE_PRIVATE).getBoolean(KEY, false); }

    static void setNotification(Context c, boolean on) {
        c.getSharedPreferences("atlas", Context.MODE_PRIVATE).edit().putBoolean(KEY, on).apply();
        post(c);
    }

    /** Shows the notification when it is on (the app's start puts it back after a restart of the phone), else takes it away. */
    static void post(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (!notificationOn(c)) { nm.cancel(ID); return; }
        // the lowest importance that still shows in the shade: no sound, no icon in the status bar
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Capture, always at hand", NotificationManager.IMPORTANCE_MIN));
        Intent box = new Intent(c, CaptureActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int icon = c.getResources().getIdentifier("ic_plus", "drawable", c.getPackageName());
        Notification n = new Notification.Builder(c, CHANNEL)
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_input_add)
            .setContentTitle("Capture")
            .setContentText("A thought, a to-do, a link, a photo")
            .setOngoing(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC) // on the lock screen too: it shows no content of the vault
            .setContentIntent(PendingIntent.getActivity(c, ID, box, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
            .build();
        nm.notify(ID, n);
    }
}
