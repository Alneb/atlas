package org.atlas.plugins.books;

/** The PDF reader's page strip (StripLayout): cells in a row, scrolled, a tap's page, a page brought to the middle
 *  (android/test/run.sh). */
public final class StripLayoutTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (String.valueOf(want).equals(String.valueOf(got))) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) {
        // 100 pages, cells 60 px with 10 px around: the row is 7010 px; a view of 1000 px
        StripLayout s = new StripLayout(100, 60, 10);
        eq("the row's width", 7010, s.width());
        eq("page 1 starts after a gap", 10, s.left(1));
        eq("page 3's left", 150, s.left(3));
        eq("a tap on page 1", 1, s.pageAt(15, 0, 1000));
        eq("a tap between cells: none", 0, s.pageAt(75, 0, 1000));
        eq("a tap on page 2", 2, s.pageAt(85, 0, 1000));
        eq("scrolled by 700: the tap at 15 is on page 11", 11, s.pageAt(15, 700, 1000));
        eq("the last gap: none", 0, s.pageAt(999, 6010, 1000));
        eq("scroll clamped at the start", 0, s.clamp(-50, 1000));
        eq("scroll clamped at the end", 6010, s.clamp(9999, 1000));
        int[] v = s.shown(700, 1000);
        eq("pages in view at 700", "11..25", v[0] + ".." + v[1]);
        int c = s.centre(50, 1000);
        eq("page 50 brought to the middle", 500, s.left(50) - c + 30);
        eq("then wholly in view", true, s.inView(50, c, 1000));
        eq("page 1 to the middle: clamped at 0", 0, s.centre(1, 1000));
        eq("page 100: clamped at the end", 6010, s.centre(100, 1000));
        eq("page 1 not in view at 700", false, s.inView(1, 700, 1000));

        // 3 pages in a wide view: the row centred, scroll 0, taps found through the offset
        StripLayout few = new StripLayout(3, 60, 10);
        eq("few: centred", (1000 - 220) / 2, few.offset(1000));
        eq("few: no scroll", 0, few.clamp(100, 1000));
        eq("few: a tap on page 2 through the offset", 2, few.pageAt(390 + 85, 0, 1000));
        eq("few: all shown", "1..3", few.shown(0, 1000)[0] + ".." + few.shown(0, 1000)[1]);
        eq("no pages: nothing shown", "1..0", new StripLayout(0, 60, 10).shown(0, 1000)[0] + ".." + new StripLayout(0, 60, 10).shown(0, 1000)[1]);

        System.out.println("StripLayoutTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
