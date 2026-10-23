package org.atlas.capture;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Run by Android once there is a network: sends the captures kept for servers that did not answer (Outbox). */
public final class OutboxJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            int sent = Outbox.send(this);
            if (sent > 0) said(sent);
            // send() schedules again itself while captures still wait; this run is over either way
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    /** "Sent N kept captures": what was kept while offline has left the phone (shown only when notifications are allowed). */
    private void said(int sent) {
        android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
        if (nm == null) return;
        nm.createNotificationChannel(new android.app.NotificationChannel("outbox", "Captures sent later", android.app.NotificationManager.IMPORTANCE_LOW));
        int icon = getResources().getIdentifier("ic_check", "drawable", getPackageName());
        nm.notify(4243, new android.app.Notification.Builder(this, "outbox")
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.stat_sys_upload_done)
            .setContentTitle(sent == 1 ? "A kept capture was sent" : sent + " kept captures were sent")
            .setContentText("Saved while the server did not answer; it has them now")
            .setAutoCancel(true)
            .build());
    }
}
