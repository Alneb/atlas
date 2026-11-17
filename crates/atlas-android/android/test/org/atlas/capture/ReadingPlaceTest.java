package org.atlas.capture;

/** When a reader writes where you are (ReadingPlace): on leaving, on a new chapter, else every two minutes at most
 *  (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class ReadingPlaceTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) {
        ReadingPlace p = new ReadingPlace();
        long t = 1_000_000;
        eq("the first move is written (the book was just opened)", true, p.moved("ch1", t));
        p.saved("ch1", t);
        eq("nothing pending once written", false, p.leaving());
        int writes = 0;
        for (int i = 1; i <= 20; i++) if (p.moved("ch1", t + i * 5_000)) { writes++; p.saved("ch1", t + i * 5_000); }
        eq("20 page turns in 100 s of one chapter: no write", 0, writes);
        eq("but the last place is pending, written on leaving", true, p.leaving());
        eq("two minutes on: written", true, p.moved("ch1", t + ReadingPlace.EVERY));
        p.saved("ch1", t + ReadingPlace.EVERY);
        eq("a new chapter: written at once", true, p.moved("ch2", t + ReadingPlace.EVERY + 3_000));
        p.saved("ch2", t + ReadingPlace.EVERY + 3_000);
        eq("written: nothing left for leaving", false, p.leaving());
        System.out.println("ReadingPlaceTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
