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
 *  are the core's, notify.rs). One channel per kind of notice (NoticeKind: reminders, nudges, mail, sync, other), so
 *  Android's own settings can silence one kind; a click opens the notice's vault path in the app. A notice's buttons: the core's Open opens the app as a click does (an activity must
 *  be started by the notification itself, not by a receiver in the background); any other goes to NoticeActions,
 *  which hands it back to the core (chosen). Swiping it away goes there too, as the core's `atlas:dismissed`. */
final class Notices {
    private Notices() {}

    /** Above the fixed ids of the app's own notifications (the outbox's, the media chip's). */
    private static int next = 5000;

    /** The core's Open (api.rs NoticeAction::OPEN). */
    private static final String OPEN_ACTION = "atlas:open";
    /** What a swipe says (api.rs NoticeAction::DISMISSED): not a button. */
    private static final String DISMISSED = "atlas:dismissed";
    /** NoticeActions' extras: the notification's id, the action's. */
    static final String ID = "org.atlas.notice", ACTION = "org.atlas.notice.action";

    /** Called by the core, on one of its threads. `replaces`: the id to update, or -1. `actions`: one button per line,
     *  `id<TAB>label`. The id shown, or -1 before the app has started. */
    static synchronized int show(String title, String body, String source, String open, boolean failure, int replaces, String actions) {
        Context c = Server.app();
        NotificationManager nm = c == null ? null : c.getSystemService(NotificationManager.class);
        if (nm == null) return -1;
        channels(nm);
        NoticeKind kind = NoticeKind.of(source);
        String channel = kind.channel;
        int id = replaces >= 0 ? replaces : next++;
        Intent i = new Intent(c, AtlasActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (open != null) i.putExtra(AtlasActivity.OPEN, open);
        int icon = c.getResources().getIdentifier("ic_check", "drawable", c.getPackageName());
        Notification.Builder b = new Notification.Builder(c, channel)
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setGroup(source == null ? channel : channel + ":" + source)
            .setCategory(kind == NoticeKind.REMINDERS ? Notification.CATEGORY_EVENT : kind == NoticeKind.NUDGES ? Notification.CATEGORY_REMINDER : kind == NoticeKind.MAIL ? Notification.CATEGORY_EMAIL : null)
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        if (failure) b.setCategory(Notification.CATEGORY_ERROR);
        // swiped away or cleared by the person (not a click, not the core's cancel): the source plugin may back off.
        // Only one with buttons: the core keeps no other to hand it to (notices.rs PRESSABLE)
        if (!actions.isEmpty()) {
            Intent gone = new Intent(c, NoticeActions.class).putExtra(ID, id).putExtra(ACTION, DISMISSED);
            b.setDeleteIntent(PendingIntent.getBroadcast(c, id * 8, gone, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        int n = 0;
        for (String line : actions.split("\n")) {
            int tab = line.indexOf('\t');
            if (tab <= 0) continue;
            String action = line.substring(0, tab), label = line.substring(tab + 1);
            // each button its own request code: PendingIntents that differ only in extras are one and the same
            int code = id * 8 + (++n);
            PendingIntent press;
            if (action.equals(OPEN_ACTION)) {
                press = PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            } else {
                Intent r = new Intent(c, NoticeActions.class).putExtra(ID, id).putExtra(ACTION, action);
                press = PendingIntent.getBroadcast(c, code, r, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            }
            b.addAction(new Notification.Action.Builder(null, label, press).build());
        }
        nm.notify(id, b.build());
        return id;
    }

    private static boolean channelsMade;

    /** Every kind's channel, made once per process (making one that exists changes nothing: what the person set for it
     *  stays), all listed in Android's settings from the first notice on; the per-source channels of older builds go. */
    private static void channels(NotificationManager nm) {
        if (channelsMade) return;
        channelsMade = true;
        for (NoticeKind k : NoticeKind.values()) {
            NotificationChannel ch = new NotificationChannel(k.channel, k.title, k.importance);
            ch.setDescription(k.description);
            nm.createNotificationChannel(ch);
        }
        for (NotificationChannel ch : nm.getNotificationChannels()) if (NoticeKind.oldChannel(ch.getId())) nm.deleteNotificationChannel(ch.getId());
    }

    /** The core withdrew it (notify.rs `withdraw`). */
    static synchronized void cancel(int id) {
        Context c = Server.app();
        NotificationManager nm = c == null ? null : c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(id);
    }

    /** A button of notification `id` pressed: said to the core that showed it (notices.rs). False when no core of this
     *  process knows it (the process was ended since: the press is lost, the notice's plugin plans it again). */
    static native boolean chosen(int id, String action);

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
