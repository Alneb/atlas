package org.atlas.plugins.manga;

/** A series as the one-note rule sees it (Thing): its stable Suwayomi id, and when reading makes it yours — the page's
 *  suwayomi.js engagement the same (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class ThingTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] args) {
        eq("the id is the source and its address", "2499283573021220255:/manga/123", Thing.suwayomiId("2499283573021220255", "/manga/123"));
        eq("no source: no id", "", Thing.suwayomiId("", "/manga/123"));
        eq("the first page is only looking", "opened", Thing.why(0, 20, false));
        eq("a page turned is progress", "progress", Thing.why(1, 20, false));
        eq("that far into the chapter", 0.05, Thing.progress(1, 20));
        eq("the last page finishes it", "finished", Thing.why(19, 20, false));
        eq("marked read finishes it", "finished", Thing.why(0, 0, true));
        eq("no pages known: only looking", "opened", Thing.why(3, 0, false));
        System.out.println("ThingTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
