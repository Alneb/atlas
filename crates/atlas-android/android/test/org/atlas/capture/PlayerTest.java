package org.atlas.capture;

import java.util.Arrays;
import java.util.List;

/** The phone player's rules without a device (android/test/run.sh): the item's time over its tracks and chapters
 *  (PlayerTimeline, the cases of ui/tests/player.spec.ts) and the reports' accounting (PlayerReports). */
public final class PlayerTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (String.valueOf(want).equals(String.valueOf(got))) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) {
        // tracks given out of order: sorted by start
        PlayerTimeline t = new PlayerTimeline(
            Arrays.asList(new PlayerTimeline.Track("b", 100, 50), new PlayerTimeline.Track("a", 0, 100)),
            Arrays.asList(new PlayerTimeline.Chapter(0, 60, "1"), new PlayerTimeline.Chapter(60, 120, "2")));
        eq("tracks sorted", "a", t.tracks.get(0).src);
        eq("duration: the last track's end", 150.0, t.duration());
        eq("0: the first track's start", "0@0.0", t.placeOf(0));
        eq("99.5: still the first", "0@99.5", t.placeOf(99.5));
        eq("100: a track's start is that track's", "1@0.0", t.placeOf(100));
        eq("past the end: the last track's end", "1@50.0", t.placeOf(150));
        eq("before the start: the first track's start", "0@0.0", t.placeOf(-5));
        eq("chapters", "0 1 -1", t.chapterAt(59.9) + " " + t.chapterAt(60) + " " + t.chapterAt(500));
        eq("previous, past 3 s in: this chapter's start", 60.0, t.previousChapter(70));
        eq("previous, within its first 3 s: the one before", 0.0, t.previousChapter(62));
        eq("previous in the first chapter: its start", 0.0, t.previousChapter(1));
        eq("next", 60.0, t.nextChapter(10));
        eq("next in the last chapter: none", true, Double.isNaN(t.nextChapter(70)));
        eq("no chapters: no previous", true, Double.isNaN(new PlayerTimeline(t.tracks, List.of()).previousChapter(10)));

        PlayerReports r = new PlayerReports("{\"item\":\"li_1\",\"session\":\"s0\"}");
        r.listened(4);
        r.listened(60); // the phone asleep a minute: counted as 5 s at most
        PlayerReports.Report one = r.report(12.5, 900, PlayerReports.State.PAUSED);
        eq("the body", "{\"key\":{\"item\":\"li_1\",\"session\":\"s0\"},\"at\":12.5,\"duration\":900,\"listened\":9,\"state\":\"paused\"}", one.body);
        // not taken (offline): the next report carries the time listened since
        r.listened(2);
        PlayerReports.Report two = r.report(14.5, 900, PlayerReports.State.PLAYING);
        eq("a report not taken: its time kept for the next", 11L, two.listened);
        r.took(two, "{\"item\":\"li_1\",\"session\":\"s1\"}");
        PlayerReports.Report three = r.report(20, 900, PlayerReports.State.CLOSED);
        eq("taken: nothing left to send", 0L, three.listened);
        eq("the answer's key replaces the old one", true, three.body.contains("\"session\":\"s1\""));
        r.took(three, null);
        eq("an answer without a key keeps it", "{\"item\":\"li_1\",\"session\":\"s1\"}", r.key());
        eq("NaN never reaches the JSON", true, r.report(Double.NaN, 900, PlayerReports.State.ENDED).body.contains("\"at\":0,"));
        eq("sending", true, r.sending());
        r.refused();
        eq("a plugin with no [media] progress: no more reports", false, r.sending());

        System.out.println("PlayerTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
