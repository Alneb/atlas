package org.atlas.plugins.books;

/** The PDF reader's page on screen (PageFit): fitted whole or to the width, cropped to its print, and turned a
 *  screenful at a time when taller than the screen (android/test/run.sh). */
public final class PageFitTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (String.valueOf(want).equals(String.valueOf(got))) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    private static String r(float[] f) {
        StringBuilder s = new StringBuilder();
        for (float v : f) s.append(s.length() == 0 ? "" : " ").append(Math.round(v));
        return s.toString();
    }

    public static void main(String[] a) {
        // a 600 × 800 view (a portrait phone), an A4-ish page of 612 × 792 points
        eq("whole: fitted by the width here, centred", "0 12 600 788", r(PageFit.rect(600, 800, 612, 792, null, false, 1, 0, 0)));
        // a landscape view: whole fits by the height, width fills it and runs past the bottom
        eq("whole in landscape: by the height", "191 0 809 800", r(PageFit.rect(1000, 800, 612, 792, null, false, 1, 0, 0)));
        eq("width in landscape: the width filled", "0 -247 1000 1047", r(PageFit.rect(1000, 800, 612, 792, null, true, 1, 0, 0)));
        // cropped to its print (10 % margins all round): the print fills the width, the margins off screen
        float[] crop = { 0.1f, 0.1f, 0.9f, 0.9f };
        float[] c = PageFit.rect(600, 800, 612, 792, crop, true, 1, 0, 0);
        eq("cropped: the print's left at the screen's", 0, Math.round(c[0] + 0.1f * (c[2] - c[0])));
        eq("cropped: the print's right at the screen's", 600, Math.round(c[0] + 0.9f * (c[2] - c[0])));

        // a page twice the screen's height: pan ±400; going on steps a screenful (less the overlap), then turns
        float lim = PageFit.panLimits(1000, 800, 612, 792, null, true, 1)[1];
        eq("pan limit: half the overflow", 247, Math.round(lim));
        float top = PageFit.arrive(lim, 1);
        eq("a page turned to going on: its top", 0, Math.round(PageFit.rect(1000, 800, 612, 792, null, true, 1, 0, top)[1]));
        float next = PageFit.step(top, lim, 800, 1);
        eq("a step on: down to the bottom (clamped)", Math.round(-lim), Math.round(next));
        eq("at the bottom: the page turns", true, Float.isNaN(PageFit.step(next, lim, 800, 1)));
        eq("a step back from the bottom: up again", Math.round(lim), Math.round(PageFit.step(next, lim, 800, -1)));
        eq("a page turned to coming back: its bottom", Math.round(-lim), Math.round(PageFit.arrive(lim, -1)));
        float tall = PageFit.panLimits(600, 800, 612, 792, null, true, 3)[1];
        float s1 = PageFit.step(tall, tall, 800, 1);
        eq("zoomed: a screenful less the overlap", Math.round(800 * (1 - PageFit.OVERLAP)), Math.round(tall - s1));
        eq("a page that fits: no step, a turn", true, Float.isNaN(PageFit.step(0, 0, 800, 1)));

        // the print found in a drawing: white but for a block in the middle
        int w = 100, h = 100;
        int[] px = new int[w * h];
        java.util.Arrays.fill(px, 0xffffffff);
        for (int y = 20; y < 80; y++) for (int x = 15; x < 85; x++) px[y * w + x] = 0xff000000;
        float[] p = PageFit.printed(px, w, h, 1);
        eq("the print, a margin kept", "0.135 0.185 0.865 0.815", String.format(java.util.Locale.ROOT, "%.3f %.3f %.3f %.3f", p[0], p[1], p[2], p[3]));
        java.util.Arrays.fill(px, 0xffffffff);
        eq("a blank page: no crop", null, PageFit.printed(px, w, h, 1));
        for (int y = 1; y < 99; y++) for (int x = 1; x < 99; x++) px[y * w + x] = 0xff000000;
        eq("print to the edges: nothing to crop", null, PageFit.printed(px, w, h, 1));

        System.out.println("PageFitTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
