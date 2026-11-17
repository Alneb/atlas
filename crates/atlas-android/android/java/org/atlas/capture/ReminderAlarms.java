package org.atlas.capture;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

/** A reminder rings on time with the phone asleep and the app's process gone (docs/guides/ANDROID.md, "Reminders on
 *  time"). The core plans and rings (planned.rs: the plugins' planned notices, asked again just before, kept once fired);
 *  this sets one alarm per folder vault at the next moment (Reminders.next, from the core's own files), and when it
 *  goes off starts that vault's core in this process and keeps it a moment (Reminders.HOLD_MS), so its planned loop
 *  rings what is due through Notices as it always does, then sets the next. Exact (setExactAndAllowWhileIdle) where
 *  Android lets the app (USE_EXACT_ALARM on 13+, SCHEDULE_EXACT_ALARM on 12), else allowed-while-idle but inexact.
 *  Set again when the app goes to the background, after the phone restarts, after an update and when the exact-alarm
 *  permission changes. A server's vault rings from the server's own reminders' route, not here. */
public final class ReminderAlarms extends BroadcastReceiver {
    private static final String TAG = "AtlasAlarm";
    private static final String RING = "org.atlas.reminders.ring", VAULT = "org.atlas.reminders.vault";
    private static final String PREFS = "reminders";

    @Override
    public void onReceive(Context c, Intent intent) {
        Context app = c.getApplicationContext();
        PendingResult done = goAsync(); // the core starts off the main thread
        String asked = RING.equals(intent.getAction()) ? intent.getStringExtra(VAULT) : null;
        // the receiver is exported for the system's broadcasts: a ring names one of this app's folder vaults, or nothing
        String vault = asked != null && !Server.is(asked) && new Vaults(app).list().contains(asked) ? asked : null;
        if (asked != null && vault == null) { Log.w(TAG, "a ring for a vault this app does not have: ignored"); }
        new Thread(() -> {
            PowerManager.WakeLock awake = null;
            try {
                if (vault != null) {
                    // the alarm's own wake lock lasts only through onReceive: ours keeps the CPU up while the core looks
                    PowerManager pm = app.getSystemService(PowerManager.class);
                    if (pm != null) { awake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "atlas:reminder"); awake.acquire(Reminders.HOLD_MS + 10_000); }
                    Server.init(app); // Notices shows through the app's context
                    Log.i(TAG, "woken for " + Vaults.name(vault) + (Local.running(vault) ? " (its core runs)" : ": starting its core"));
                    Local.of(app, vault);
                    Thread.sleep(Reminders.HOLD_MS);
                } else {
                    Log.i(TAG, "set again after " + intent.getAction());
                }
                plan(app);
            } catch (Exception e) {
                Log.w(TAG, "woken, but " + e);
            } finally {
                if (awake != null && awake.isHeld()) awake.release();
                done.finish();
            }
        }, "reminders").start();
    }

    /** Each folder vault's next alarm set (or taken back when nothing is planned). Reads files: never on the main thread. */
    static void plan(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        Reminders.Mode mode = Reminders.mode(Build.VERSION.SDK_INT, Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms());
        android.content.SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        for (String vault : new Vaults(c).list()) {
            if (Server.is(vault)) continue;
            PendingIntent ring = PendingIntent.getBroadcast(c, vault.hashCode(),
                new Intent(c, ReminderAlarms.class).setAction(RING).putExtra(VAULT, vault),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            long at;
            List<Long> wakes = new ArrayList<>();
            try { at = nextOf(new File(vault), now, prefs.getLong("last:" + vault, 0), wakes); }
            catch (Exception e) { Log.w(TAG, Vaults.name(vault) + ": its plan unreadable: " + e); continue; }
            // what was armed, for Plan's device rule (Reminders.armed): rewritten each time, empty when nothing is set
            try {
                File armed = new File(vault, Reminders.ARMED_FILE);
                armed.getParentFile().mkdirs();
                Files.write(armed.toPath(), Reminders.armed(mode, wakes, at, now).getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) { Log.w(TAG, Vaults.name(vault) + ": what was armed not kept: " + e); }
            if (at < 0) { am.cancel(ring); continue; }
            if (mode == Reminders.Mode.EXACT) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, ring);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, ring);
            prefs.edit().putLong("last:" + vault, at).apply();
            Log.i(TAG, Vaults.name(vault) + ": next at " + new java.util.Date(at) + (mode == Reminders.Mode.EXACT ? "" : " (inexact: the exact-alarm permission is withheld)"));
        }
    }

    /** The vault's next moment: its core's plan and snoozed copies less what fired (`.atlas/cache/planned*.json`,
     *  planned.rs), and the planning device's nudges in `plan/next.md` (Reminders.fromNext, also put in `wakes`). */
    private static long nextOf(File vault, long now, long last, List<Long> wakes) throws Exception {
        File cache = new File(vault, ".atlas/cache");
        List<Reminders.Moment> moments = new ArrayList<>();
        for (String name : new String[] { "planned.json", "planned-snoozed.json" }) {
            JSONObject plans = json(new File(cache, name));
            for (Iterator<String> p = plans.keys(); p.hasNext(); ) {
                String plugin = p.next();
                JSONArray list = plans.optJSONArray(plugin);
                for (int i = 0; list != null && i < list.length(); i++) {
                    JSONObject n = list.optJSONObject(i);
                    long at = n == null ? -1 : Reminders.instant(n.optString("at", null));
                    if (at > 0) moments.add(new Reminders.Moment(plugin, n.optString("id", ""), at));
                }
            }
        }
        Set<String> fired = new HashSet<>();
        for (Iterator<String> k = json(new File(cache, "planned-fired.json")).keys(); k.hasNext(); ) fired.add(k.next());
        File next = new File(vault, "plan/next.md");
        String text = next.isFile() ? new String(Files.readAllBytes(next.toPath()), StandardCharsets.UTF_8) : null;
        // `last` only holds back a wake set at a moment already gone (one that keeps coming due)
        wakes.addAll(Reminders.fromNext(text, ZoneId.systemDefault(), now));
        return Reminders.next(moments, fired, wakes, now, last <= now ? last : 0);
    }

    private static JSONObject json(File f) throws Exception {
        if (!f.isFile()) return new JSONObject();
        return new JSONObject(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
    }
}
