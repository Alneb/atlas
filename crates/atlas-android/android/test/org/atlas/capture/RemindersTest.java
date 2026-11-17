package org.atlas.capture;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** The phone's reminders and notifications (android/test/run.sh): which channel a notice goes to (NoticeKind), when the
 *  alarm wakes the app (Reminders: the core's plan, plan/next.md with its 2-minute grace, what already fired), exact or
 *  not, and what it says it armed; and the note view's failures (WebHealth). A failed check prints what it got and the run exits 1. */
public final class RemindersTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want == null ? got == null : want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) {
        kinds();
        alarms();
        next();
        web();
        System.out.println("RemindersTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }

    private static void kinds() {
        eq("a calendar reminder", NoticeKind.REMINDERS, NoticeKind.of("dav"));
        eq("a nudge", NoticeKind.NUDGES, NoticeKind.of("plan"));
        eq("mail", NoticeKind.MAIL, NoticeKind.of("email"));
        eq("the core's conflict copies", NoticeKind.SYNC, NoticeKind.of("sync"));
        eq("Syncthing", NoticeKind.SYNC, NoticeKind.of("syncthing"));
        eq("a scheduled command's failure", NoticeKind.OTHER, NoticeKind.of("schedule"));
        eq("no source", NoticeKind.OTHER, NoticeKind.of(null));
        Set<String> ids = new HashSet<>();
        for (NoticeKind k : NoticeKind.values()) ids.add(k.channel);
        eq("one channel per kind", NoticeKind.values().length, ids.size());
        eq("reminders ring loudest (heads-up)", 4, NoticeKind.REMINDERS.importance);
        eq("sync is quiet", 2, NoticeKind.SYNC.importance);
        eq("the old per-source channels are recognised", true, NoticeKind.oldChannel("notice.dav"));
        eq("the kinds' are not", false, NoticeKind.oldChannel(NoticeKind.MAIL.channel));
    }

    private static void alarms() {
        long now = Reminders.instant("2026-11-17T10:00:00+01:00");
        eq("RFC 3339 with an offset", 1_794_906_000_000L, now);
        eq("chrono's to_rfc3339 with nanoseconds", now + 500, Reminders.instant("2026-11-17T09:00:00.500000000+00:00"));
        eq("not a moment", -1L, Reminders.instant("tomorrow"));
        List<Reminders.Moment> plan = new ArrayList<>();
        plan.add(new Reminders.Moment("dav", "dav:a::0", now + 30 * 60_000));
        plan.add(new Reminders.Moment("dav", "dav:b::0", now + 10 * 60_000));
        plan.add(new Reminders.Moment("plan", "plan:x", now - 60_000)); // due: the core rings it while it runs
        Set<String> fired = new HashSet<>();
        List<Long> none = Collections.emptyList();
        eq("the earliest one to come", now + 10 * 60_000, Reminders.next(plan, fired, none, now, 0));
        fired.add(plan.get(1).key());
        eq("one that fired is skipped (planned.rs's key)", now + 30 * 60_000, Reminders.next(plan, fired, none, now, 0));
        eq("the key is planned.rs's: plugin:id@seconds", "dav:dav:a::0@" + (now / 1000 + 1800), plan.get(0).key());
        eq("a planner's nudge earlier wins", now + 5 * 60_000, Reminders.next(plan, fired, Arrays.asList(now + 5 * 60_000, now - 1), now, 0));
        eq("never closer than a minute to the last wake", now + 60_000, Reminders.next(plan, fired, Arrays.asList(now + 1_000), now, now));
        eq("nothing planned", -1L, Reminders.next(new ArrayList<>(), fired, none, now, 0));
        eq("Android before 12: always exact", Reminders.Mode.EXACT, Reminders.mode(30, false));
        eq("12+ with the permission", Reminders.Mode.EXACT, Reminders.mode(34, true));
        eq("12+ without it: inexact, still allowed while idle", Reminders.Mode.INEXACT, Reminders.mode(33, false));
        eq("the hold stays under a background receiver's minute", true, Reminders.HOLD_MS < 60_000 && Reminders.HOLD_MS > 15_000);
    }

    private static void next() {
        ZoneId paris = ZoneId.of("Europe/Paris");
        long now = Reminders.stamp("2026-11-17 13:30", paris);
        eq("a stamp in the zone", Reminders.instant("2026-11-17T13:30:00+01:00"), now);
        eq("H:MM too", Reminders.instant("2026-11-17T08:05:00+01:00"), Reminders.stamp("2026-11-17 8:05", paris));
        String note = "---\ntype: plan-next\ndevice: laptop\nplanned_at: 2026-11-17 13:00\n---\n"
            + "The next nudges, as planned by laptop. Written by the Plan plugin each time the plan changes; edits are replaced.\n\n"
            + "- 2026-11-17 14:05 · [[notes/Thesis|Write the introduction]] · due tomorrow, ⏫\n"
            + "- 2026-11-18 08:00 · digest · 1 overdue, 2 due today\n";
        List<Long> got = Reminders.fromNext(note, paris, now);
        eq("each line two minutes after its moment", Arrays.asList(
            Reminders.stamp("2026-11-17 14:07", paris), Reminders.stamp("2026-11-18 08:02", paris)), got);
        eq("CRLF line ends", got, Reminders.fromNext(note.replace("\n", "\r\n"), paris, now));
        eq("a stale plan (2 h): the phone plans for itself", 0, Reminders.fromNext(note, paris, now + 2 * 3_600_000L).size());
        eq("not a plan note", 0, Reminders.fromNext(note.replace("plan-next", "note"), paris, now).size());
        eq("no front matter", 0, Reminders.fromNext("- 2026-11-17 14:05 · x\n", paris, now).size());
        eq("nothing planned", 0, Reminders.fromNext(note.replaceAll("(?m)^- .*\n", "") + "- nothing planned\n", paris, now).size());
        eq("no note", 0, Reminders.fromNext(null, paris, now).size());
        // what was armed, for Plan's device rule: the stamps themselves (the wake less its grace), exact or not
        long first = Reminders.stamp("2026-11-17 14:05", paris), second = Reminders.stamp("2026-11-18 08:00", paris);
        eq("the stamps the phone wakes for", "{\"exact\":true,\"armed_at\":" + now + ",\"nudges\":[" + first + "," + second + "]}",
            Reminders.armed(Reminders.Mode.EXACT, got, first + Reminders.NEXT_GRACE_MS, now));
        eq("inexact: said so (the rule does not trust it)", true, Reminders.armed(Reminders.Mode.INEXACT, got, first, now).startsWith("{\"exact\":false,"));
        eq("no alarm set: none armed", "{\"exact\":true,\"armed_at\":" + now + ",\"nudges\":[]}", Reminders.armed(Reminders.Mode.EXACT, got, -1, now));
        eq("a wake gone already is not armed", "{\"exact\":true,\"armed_at\":" + (first + Reminders.NEXT_GRACE_MS) + ",\"nudges\":[" + second + "]}",
            Reminders.armed(Reminders.Mode.EXACT, got, second + Reminders.NEXT_GRACE_MS, first + Reminders.NEXT_GRACE_MS));
        eq("the file the core reads (devices.rs ALARMS_FILE)", ".atlas/cache/alarms.json", Reminders.ARMED_FILE);
    }

    private static void web() {
        WebHealth.Restarts r = new WebHealth.Restarts();
        long t = 1_000_000;
        eq("first restart", true, r.allow(t));
        eq("second", true, r.allow(t + 1_000));
        eq("third", true, r.allow(t + 2_000));
        eq("a fourth within two minutes waits for the person", false, r.allow(t + 3_000));
        eq("two minutes after the first: allowed again", true, r.allow(t + WebHealth.Restarts.WINDOW_MS + 1));
        eq("the same core", WebHealth.Resume.NOTHING, WebHealth.onResume("{\"commit\":\"a\"}", "{\"commit\":\"a\"}", false));
        eq("another core (updated)", WebHealth.Resume.RELOAD, WebHealth.onResume("{\"commit\":\"a\"}", "{\"commit\":\"b\"}", false));
        eq("no answer: once more", WebHealth.Resume.RETRY, WebHealth.onResume("x", null, false));
        eq("no answer twice: said, not reloaded", WebHealth.Resume.SAY_DOWN, WebHealth.onResume("x", null, true));
        eq("an answer after none: it was restarting", WebHealth.Resume.RELOAD, WebHealth.onResume("x", "x", true));
        eq("not known yet: kept", WebHealth.Resume.NOTHING, WebHealth.onResume(null, "x", false));
        eq("in view, memory low: caches go", WebHealth.Trim.CACHES, WebHealth.trim(10));
        eq("in view, moderate: kept", WebHealth.Trim.NOTHING, WebHealth.trim(5));
        eq("just hidden (UI_HIDDEN): kept", WebHealth.Trim.NOTHING, WebHealth.trim(20));
        eq("in the background: caches go", WebHealth.Trim.CACHES, WebHealth.trim(40));
        eq("about to be ended: caches go", WebHealth.Trim.CACHES, WebHealth.trim(80));
        eq("the failure's name", "renderer-gone", WebHealth.Failure.RENDERER_GONE.name);
        eq("what it says", "The page stopped (out of memory): opened again where you were", WebHealth.Failure.RENDERER_GONE.says("out of memory"));
        eq("memory is not said", null, WebHealth.Failure.MEMORY_LOW.says("x"));
    }
}
