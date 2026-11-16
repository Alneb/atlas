package org.atlas.capture;

import java.util.Arrays;

/** A share's pieces made one text (Shares), as apps fill them in (android/test/run.sh). No framework: a failed check
 *  prints what it got and the run exits 1. */
public final class SharesTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want == null ? got == null : want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) {
        String yt = "https://youtu.be/dQw4w9WgXcQ?si=AbC";
        // the text and the ClipData copy the share sheet makes of it
        eq("a text and its clip copy", yt, Shares.join(Arrays.asList(yt, yt)));
        // a styled text whose link target is hidden behind its words
        eq("a link the words hide", "Listen to this\nhttps://open.spotify.com/track/4u",
            Shares.join(Arrays.asList("Listen to this", "https://open.spotify.com/track/4u")));
        // a link the text already shows is not repeated
        eq("a link the text shows", "Dune https://boxd.it/AbC", Shares.join(Arrays.asList("Dune https://boxd.it/AbC", "https://boxd.it/AbC")));
        // a bare link first, the fuller text after (a ClipData item richer than EXTRA_TEXT): the fuller one, in its place
        eq("the fuller one kept", "Dune https://boxd.it/AbC\nmore", Shares.join(Arrays.asList("https://boxd.it/AbC", "Dune https://boxd.it/AbC", "more")));
        eq("blanks and nulls", "", Shares.join(Arrays.asList("  ", null, "")));
        eq("SEND_MULTIPLE's texts in order", "one\ntwo", Shares.join(Arrays.asList("one", "two", "one")));
        eq("an HTML text's links", Arrays.asList("https://example.org/a?x=1&y=2", "https://example.org/b"),
            Shares.hrefs("<p><a href=\"https://example.org/a?x=1&amp;y=2\">A</a> <a href='https://example.org/b'>B</a> <a href=\"mailto:a@example.org\">m</a> <a href=\"https://example.org/b\">again</a></p>"));
        eq("no HTML", Arrays.asList(), Shares.hrefs(null));
        eq("web addresses only", false, Shares.isWeb("mailto:a@example.org"));
        eq("any case", true, Shares.isWeb("HTTPS://example.org"));
        System.out.println(failed == 0 ? "SharesTest: " + ran + "/" + ran + " checks passed" : "SharesTest: " + failed + " of " + ran + " failed");
        if (failed > 0) System.exit(1);
    }
}
