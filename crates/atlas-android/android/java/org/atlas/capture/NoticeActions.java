package org.atlas.capture;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** A button on one of the core's notifications (Notices.show), other than Open: the notification goes, and the press
 *  goes to the core, which answers it (notice_actions.rs: the core's Snooze, or the notice's plugin's own action).
 *  Its delete intent comes here too, as `atlas:dismissed` (the notification is already gone). */
public final class NoticeActions extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        int id = intent.getIntExtra(Notices.ID, -1);
        String action = intent.getStringExtra(Notices.ACTION);
        if (id < 0 || action == null) return;
        // the receiver's own context: Server.app() is null when the process was started for this broadcast
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(id);
        boolean heard;
        try {
            heard = Notices.chosen(id, action);
        } catch (UnsatisfiedLinkError e) {
            heard = false; // the process was started for this broadcast: no core, nothing to hand it to
        }
        if (!heard) Log.w("atlas", "a notification's " + action + " came when no core knew it");
    }
}
