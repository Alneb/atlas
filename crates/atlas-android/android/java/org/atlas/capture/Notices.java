package org.atlas.capture;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

/** The core's notices as the phone's notifications (crates/atlas-android/src/notices.rs calls show; the rules of when
 *  are the core's, notify.rs). One channel per source, so Android's own settings can mute a source; a click opens the
 *  notice's vault path in the app. */
final class Notices {
    private Notices() {}

    /** Above the fixed ids of the app's own notifications (the outbox's, the media chip's). */
    private static int next = 5000;

    /** Called by the core, on one of its threads. `replaces`: the id to update, or -1. The id shown, or -1 before the app has started. */
    static synchronized int show(String title, String body, String source, String open, boolean failure, int replaces) {
        Context c = Server.app();
        NotificationManager nm = c == null ? null : c.getSystemService(NotificationManager.class);
        if (nm == null) return -1;
        String who = source == null ? "atlas" : source, channel = "notice." + who;
        // no-op when it exists: what the person set for the channel stays
        nm.createNotificationChannel(new NotificationChannel(channel, who, NotificationManager.IMPORTANCE_DEFAULT));
        int id = replaces >= 0 ? replaces : next++;
        Intent i = new Intent(c, AtlasActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (open != null) i.putExtra(AtlasActivity.OPEN, open);
        int icon = c.getResources().getIdentifier("ic_check", "drawable", c.getPackageName());
        Notification.Builder b = new Notification.Builder(c, channel)
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setGroup(channel)
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        if (failure) b.setCategory(Notification.CATEGORY_ERROR);
        nm.notify(id, b.build());
        return id;
    }

    /** Android 13 on: notifications need asking. Once, when the app first opens. */
    static void askOnce(Activity a) {
        final String permission = "android.permission.POST_NOTIFICATIONS", key = "noticesAsked";
        if (Build.VERSION.SDK_INT < 33 || a.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences prefs = a.getSharedPreferences("atlas", Context.MODE_PRIVATE);
        if (prefs.getBoolean(key, false)) return;
        prefs.edit().putBoolean(key, true).apply();
        a.requestPermissions(new String[] {permission}, 4);
    }
}
