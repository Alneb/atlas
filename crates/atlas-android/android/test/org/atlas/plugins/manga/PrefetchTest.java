package org.atlas.plugins.manga;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** The manga reader's page work order (Prefetch): the page on screen first, then the next ones the way you read, the
 *  ones behind, the next chapter's first pages near the end; pages turned away from dropped unstarted; a full queue
 *  lets the farthest go (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class PrefetchTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    static Prefetch.Focus at(int page, int size, boolean forward, String next) { return new Prefetch.Focus("ch1", page, size, forward, next); }

    public static void main(String[] a) throws InterruptedException {
        ranks();
        queue();
        progress();
        System.out.println("PrefetchTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }

    static void ranks() {
        Prefetch.Focus f = at(10, 40, true, null);
        eq("the page on screen first", 0, Prefetch.rank(f, "ch1", 10));
        eq("the next one", 2, Prefetch.rank(f, "ch1", 11));
        eq("the one behind after the second ahead", true, Prefetch.rank(f, "ch1", 12) < Prefetch.rank(f, "ch1", 9) && Prefetch.rank(f, "ch1", 9) < Prefetch.rank(f, "ch1", 13));
        eq("five ahead wanted", true, Prefetch.rank(f, "ch1", 15) > 0);
        eq("six ahead not yet", -1, Prefetch.rank(f, "ch1", 16));
        eq("three behind not", -1, Prefetch.rank(f, "ch1", 7));
        eq("past the chapter's end: no page", -1, Prefetch.rank(at(39, 40, true, null), "ch1", 40));
        eq("another chapter: not wanted", -1, Prefetch.rank(f, "ch9", 0));
        eq("no focus yet: nothing", -1, Prefetch.rank(null, "ch1", 0));

        Prefetch.Focus back = at(10, 40, false, null);
        eq("reading back: the page before is the next one", 2, Prefetch.rank(back, "ch1", 9));
        eq("reading back: five before wanted", true, Prefetch.rank(back, "ch1", 5) > 0);
        eq("reading back: the one after is behind", 5, Prefetch.rank(back, "ch1", 11));

        eq("the order around page 10", Arrays.asList(11, 12, 9, 13, 8, 14, 15), Prefetch.around(10, 40, true));
        eq("at the start nothing behind", Arrays.asList(1, 2, 3, 4, 5), Prefetch.around(0, 40, true));
        eq("at the end nothing past it", Arrays.asList(38, 37), Prefetch.around(39, 40, true));
        eq("back from page 2", Arrays.asList(1, 0, 3, 4), Prefetch.around(2, 40, false));

        // the next chapter
        eq("far from the end: the next chapter waits", -1, Prefetch.rank(at(10, 40, true, "ch2"), "ch2", 0));
        Prefetch.Focus near = at(36, 40, true, "ch2");
        eq("near the end: its first page", true, Prefetch.rank(near, "ch2", 0) > 0);
        eq("after this chapter's last pages", true, Prefetch.rank(near, "ch2", 0) > Prefetch.rank(near, "ch1", 39));
        eq("its first three only", -1, Prefetch.rank(near, "ch2", 3));
        eq("on the last page: the next chapter's first page right after", 2, Prefetch.rank(at(39, 40, true, "ch2"), "ch2", 0));
        eq("reading back: not the next chapter", -1, Prefetch.rank(at(39, 40, false, "ch2"), "ch2", 0));
        eq("near the end opens the next", true, Prefetch.nearEnd(35, 40));
        eq("five pages before the end", true, Prefetch.nearEnd(34, 40));
        eq("not before", false, Prefetch.nearEnd(33, 40));
        eq("a short chapter: at once", true, Prefetch.nearEnd(0, 3));
    }

    static void queue() throws InterruptedException {
        List<String> dropped = new ArrayList<>();
        Prefetch<String> q = new Prefetch<>(dropped::add);
        q.focus(at(10, 40, true, null));
        eq("a page far away is not queued", false, q.add("ch1", 30, "p30"));
        eq("… and said dropped", Arrays.asList("p30"), dropped);
        // asked in the reader's order: the prefetches first, then the page you wait for (a slider let go)
        q.add("ch1", 12, "p12");
        q.add("ch1", 9, "p9");
        q.add("ch1", 11, "p11");
        q.add("ch1", 10, "p10");
        eq("the page on screen first, whenever it was asked", "p10", q.poll());
        eq("then the next", "p11", q.poll());
        q.focus(at(20, 40, true, null));
        eq("turned away: the rest dropped unstarted", Arrays.asList("p30", "p12", "p9"), dropped);
        eq("nothing left", "null", String.valueOf(q.poll()));

        // equals in the order asked
        q.focus(at(0, 40, true, null));
        q.add("ch1", 1, "a");
        q.add("ch1", 1, "b");
        eq("two for one page: the first asked first", "a", q.poll());
        eq("then the other", "b", q.poll());

        // a full queue lets the farthest go
        dropped.clear();
        Prefetch<String> big = new Prefetch<>(dropped::add);
        big.focus(at(0, 40, true, null));
        for (int i = 0; i < Prefetch.CAP; i++) big.add("ch1", 1 + i % 5, "near" + i);
        big.add("ch1", 0, "now");
        eq("full: one dropped", 1, dropped.size());
        eq("the farthest, newest", true, dropped.get(0).startsWith("near") && Integer.parseInt(dropped.get(0).substring(4)) % 5 == 4);
        eq("the page on screen kept and first", "now", big.poll());

        // take() waits for work and answers null once closed
        Prefetch<String> w = new Prefetch<>(dropped::add);
        w.focus(at(0, 10, true, null));
        String[] got = new String[2];
        Thread t = new Thread(() -> { try { got[0] = w.take(); got[1] = String.valueOf(w.take()); } catch (InterruptedException e) { got[0] = "interrupted"; } });
        t.start();
        Thread.sleep(50);
        w.add("ch1", 0, "page");
        Thread.sleep(50);
        w.close();
        t.join(2000);
        eq("a waiting worker gets the page", "page", got[0]);
        eq("closed: null", "null", got[1]);
        dropped.clear();
        eq("closed: nothing more queued", false, w.add("ch1", 0, "late"));
        eq("… and dropped", Arrays.asList("late"), dropped);
    }

    static void progress() {
        eq("unknown size", -1, Prefetch.shown(-1, false));
        eq("to five", 40, Prefetch.shown(43, false));
        eq("e-ink in quarters", 25, Prefetch.shown(43, true));
        eq("done", 100, Prefetch.shown(100, true));
    }
}
