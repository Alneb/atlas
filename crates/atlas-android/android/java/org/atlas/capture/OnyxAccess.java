package org.atlas.capture;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Intent;
import android.util.Log;

/** Whether this app may reach Onyx's pen methods (instant ink, Look's refreshes). Boox firmware 4.2.1 (Android 15) puts
 *  android.onyx.ViewUpdateHelper behind the hidden-API filter for apps outside Onyx's own whitelist: `getMethod` then
 *  fails ("Accessing hidden method … denied" in logcat). Onyx adds a package to that list itself on the broadcast
 *  `com.onyx.action.disable_restriction` (system_server's OnyxAlarmManagerReceiver; persisted in /onyxconfig, traced in
 *  boox_5c_re docs/OPEN-STACK.md); the filter is decided at process start, so the app restarts after it. */
enum OnyxAccess {
    NONE,    // not an Onyx framework: nothing to ask for
    BLOCKED, // Onyx's class is there, its methods hidden from this app: the whitelist is needed
    OPEN;

    private static final String TAG = "AtlasInk", ACTION = "com.onyx.action.disable_restriction", ASKED = "onyxWhitelistAsked";

    static OnyxAccess here() {
        Class<?> h;
        try { h = Class.forName("android.onyx.ViewUpdateHelper"); } catch (ClassNotFoundException | LinkageError e) { return NONE; }
        try { h.getMethod("setScreenHandWritingPenState", int.class); return OPEN; }
        catch (NoSuchMethodException e) { return BLOCKED; }
    }

    /** On a blocked Boox, once per install: ask the user, then Onyx, then restart. A second refusal is only logged
     *  (never a prompt at every drawing). Changing Onyx's settings is the user's call, so never without the dialog. */
    static void offer(Activity a) {
        if (here() != BLOCKED) return;
        android.content.SharedPreferences p = a.getSharedPreferences("atlas-onyx", Activity.MODE_PRIVATE);
        if (p.getBoolean(ASKED, false)) { Log.w(TAG, "still blocked after asking Onyx to whitelist " + a.getPackageName()); return; }
        new AlertDialog.Builder(a)
            .setTitle("Instant ink")
            .setMessage("This Boox lets only the apps on its list draw the pen's line at once; Atlas draws it a moment later.\n\n"
                + "Ask the Boox to add Atlas to that list? It is Onyx's own setting (kept in its system settings) and Atlas restarts once.")
            .setPositiveButton("Add Atlas and restart", (d, w) -> { p.edit().putBoolean(ASKED, true).apply(); whitelist(a); })
            .setNegativeButton("Not now", null)
            .show();
    }

    private static void whitelist(Activity a) {
        a.sendBroadcast(new Intent(ACTION).putExtra("package", a.getPackageName()));
        Log.i(TAG, "asked Onyx to whitelist " + a.getPackageName() + "; restarting");
        android.widget.Toast.makeText(a, "Atlas restarts with instant ink (if it does not come back, open it again)", android.widget.Toast.LENGTH_LONG).show();
        // back in a moment, in a new process (the whitelist also lets Onyx's alarms run for it); then this one ends
        Intent open = a.getPackageManager().getLaunchIntentForPackage(a.getPackageName());
        if (open != null) {
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            PendingIntent pi = PendingIntent.getActivity(a, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_CANCEL_CURRENT);
            AlarmManager am = a.getSystemService(AlarmManager.class);
            if (am != null) am.set(AlarmManager.RTC, System.currentTimeMillis() + 1500, pi);
        }
        a.getWindow().getDecorView().postDelayed(() -> { a.finishAffinity(); System.exit(0); }, 800);
    }
}
