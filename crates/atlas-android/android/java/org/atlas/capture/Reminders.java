package org.atlas.capture;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** When the phone's alarm wakes the app for a planned notice (ReminderAlarms; docs/guides/ANDROID.md, "Reminders on
 *  time"). The core decides what rings (crates/atlas-core/src/planned.rs: it asks the plugin again just before, and
 *  keeps what fired); this only says when to wake it, so a reminder rings on time with the phone asleep and the app's
 *  process gone. Plain Java, tested on the JVM (android/test). */
final class Reminders {
    private Reminders() {}

    /** How long the woken app keeps its core: the planned loop's first look comes a tick (15 s) after it starts, then
     *  it asks the plugin, then rings. Under the minute Android gives a receiver in the background. */
    static final long HOLD_MS = 40_000;
    /** Plan's device rule (plugins/beta/plan, DESIGN-calendar-tasks-nudges.md §3.7): a nudge the planning device has
     *  planned rings there; the phone looks this long after it, by when the desktop's ledger line has had time to
     *  arrive, and rings it only if the plugin, asked then, says the phone is the device to. */
    static final long NEXT_GRACE_MS = 2 * 60_000;
    /** `plan/next.md` this old is no longer the planner's word (plan's next.ts STALE): the phone plans for itself, and its
     *  own plan (planned.json) has the times. */
    static final long NEXT_STALE_MS = 2 * 3_600_000L;
    /** An alarm is never set closer than this to the last one: a plan that keeps something due cannot spin the app. */
    static final long MIN_GAP_MS = 60_000;

    /** One planned notice as the core keeps it: its plugin, its id, when (ms). */
    static final class Moment {
        final String plugin, id;
        final long at;
        Moment(String plugin, String id, long at) { this.plugin = plugin; this.id = id; this.at = at; }
        /** planned.rs `key`: what the core keeps a fired notice by. */
        String key() { return plugin + ":" + id + "@" + Math.floorDiv(at, 1000); }
    }

    /** An RFC 3339 moment (planned.json's `at`) in ms, or -1. */
    static long instant(String rfc3339) {
        if (rfc3339 == null) return -1;
        try { return OffsetDateTime.parse(rfc3339.trim()).toInstant().toEpochMilli(); }
        catch (RuntimeException e) { return -1; }
    }

    /** The next moment to wake at, after `now` (the core rings what is due while it runs: an alarm is for later), not
     *  before `last + MIN_GAP_MS`; -1 when nothing is planned. `fired`: planned-fired.json's keys. `extra`: other
     *  moments (fromNext). */
    static long next(List<Moment> planned, Set<String> fired, List<Long> extra, long now, long last) {
        long best = -1;
        for (Moment m : planned) {
            if (m.at <= now || fired.contains(m.key())) continue;
            if (best < 0 || m.at < best) best = m.at;
        }
        for (long t : extra) if (t > now && (best < 0 || t < best)) best = t;
        if (best < 0) return -1;
        return last > 0 ? Math.max(best, last + MIN_GAP_MS) : best;
    }

    private static final Pattern HEAD = Pattern.compile("\\A---\n([\\s\\S]*?)\n---\n");
    private static final Pattern LINE = Pattern.compile("^- (\\d{4}-\\d{2}-\\d{2} \\d{1,2}:\\d{2}) · ", Pattern.MULTILINE);
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd H:mm");

    /** A plan stamp (`2026-11-17 14:05`, local time in `zone`) in ms, or -1. */
    static long stamp(String s, ZoneId zone) {
        try { return LocalDateTime.parse(s.trim(), STAMP).atZone(zone).toInstant().toEpochMilli(); }
        catch (RuntimeException e) { return -1; }
    }

    /** The planner's next nudges from `plan/next.md` (plan's next.ts renderNext), each NEXT_GRACE_MS late; none when
     *  the note is not one, or stale (the phone plans for itself then). Read in the phone's zone: the stamps are the
     *  planner's local time, the same person's day. A wake for a nudge the phone already holds in its own plan costs
     *  one look of the core, nothing rings twice (planned.rs keeps what fired). */
    static List<Long> fromNext(String text, ZoneId zone, long now) {
        List<Long> out = new ArrayList<>();
        if (text == null) return out;
        text = text.replace("\r\n", "\n");
        Matcher h = HEAD.matcher(text);
        if (!h.find()) return out;
        String head = h.group(1);
        if (!Pattern.compile("^type: plan-next$", Pattern.MULTILINE).matcher(head).find()) return out;
        Matcher at = Pattern.compile("^planned_at: (.+)$", Pattern.MULTILINE).matcher(head);
        long planned = at.find() ? stamp(at.group(1), zone) : -1;
        if (planned < 0 || now - planned >= NEXT_STALE_MS) return out;
        Matcher l = LINE.matcher(text.substring(h.end()));
        while (l.find()) {
            long t = stamp(l.group(1), zone);
            if (t > 0) out.add(t + NEXT_GRACE_MS);
        }
        return out;
    }

    /** Where the app says what it armed, in the vault it armed for: the vault's core reads it into its presence
     *  report (crates/atlas-core/src/devices.rs `Alarms`), and Plan's device rule trusts the phone with exactly those
     *  nudges while the app is closed (plugins/beta/plan/helper/devices.ts `armedFor`). */
    static final String ARMED_FILE = ".atlas/cache/alarms.json";

    /** That file's text: whether the alarms are exact, when they were set, and the `plan/next.md` stamps the phone wakes
     *  for (`wakes`: fromNext's, each NEXT_GRACE_MS late; `at`: the alarm set now, -1 for none). Each wake sets the
     *  next, so every stamp from the first alarm on is covered while the alarms are exact; none when no alarm is set.
     *  Written by hand (numbers and a boolean): the JVM tests have no org.json. */
    static String armed(Mode mode, List<Long> wakes, long at, long now) {
        StringBuilder nudges = new StringBuilder();
        for (long w : wakes) {
            if (at < 0 || w <= now) continue;
            if (nudges.length() > 0) nudges.append(',');
            nudges.append(w - NEXT_GRACE_MS);
        }
        return "{\"exact\":" + (mode == Mode.EXACT) + ",\"armed_at\":" + now + ",\"nudges\":[" + nudges + "]}";
    }

    /** How the alarm is set. */
    enum Mode {
        /** setExactAndAllowWhileIdle: on time, even in Doze. */
        EXACT,
        /** setAndAllowWhileIdle: the exact-alarm permission is withheld; Android may defer it (minutes in Doze). */
        INEXACT
    }

    /** Exact unless Android 12+ withholds the permission (`canExact`: AlarmManager.canScheduleExactAlarms). */
    static Mode mode(int sdk, boolean canExact) { return sdk < 31 || canExact ? Mode.EXACT : Mode.INEXACT; }
}
