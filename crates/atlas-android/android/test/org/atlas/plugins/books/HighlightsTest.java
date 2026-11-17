package org.atlas.plugins.books;

import java.util.List;

/** A book's highlights in its note (Highlights), the same rules as shared/marks.js (example-books.spec on CI): only
 *  quotes under "## Highlights", callouts left out, the chapter and anchor read back, a new one under the heading
 *  (android/test/run.sh). */
public final class HighlightsTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (String.valueOf(want).equals(String.valueOf(got))) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) {
        String md = "---\nbook: x\n---\n\n> [!note] mine\n> a quote of my own\n\n## Highlights\n\n> old one\n> — Intro, chapter 1\n\n"
            + "> the cat sat\n> — Two, chapter 2 <!-- atlas-hl k=19 -->\n\n> [!tip]\n> not one\n\n## My thoughts\n\n> also mine\n";
        List<Highlights.Highlight> hs = Highlights.in(md);
        eq("only the two under the heading", 2, hs.size());
        eq("written before anchors: chapter known, no k", "old one | Intro, chapter 1 | 1 | -1", hs.get(0));
        eq("anchored", "the cat sat | Two, chapter 2 | 2 | 19", hs.get(1));
        eq("anchored: can be gone to", true, hs.get(1).anchored());
        eq("not anchored: cannot", false, hs.get(0).anchored());

        String added = Highlights.add(md, Highlights.block("new  words", "Three, chapter 3", 7));
        eq("inserted at the end of the section, before the next heading", true,
            added.contains("> not one\n\n> new words\n> — Three, chapter 3 <!-- atlas-hl k=7 -->\n\n## My thoughts\n\n> also mine\n"));
        eq("then read back", "new words | Three, chapter 3 | 3 | 7", Highlights.in(added).get(2));
        eq("no heading: made at the end", "# T\n\nbody\n\n## Highlights\n\n> a\n> — chapter 1\n", Highlights.add("# T\n\nbody\n", Highlights.block("a", "chapter 1", -1)));
        eq("heading last: the block after it", "x\n\n## Highlights\n\n> a\n> — chapter 1\n", Highlights.add("x\n\n## Highlights\n", Highlights.block("a", "chapter 1", -1)));
        String block = "```pdf-marks\nm-aaaaaaa1 text-ink p1 {}\n```\n";
        eq("no heading, a marks block: the section before the block", "# T\n\n## Highlights\n\n> a\n> — chapter 1\n\n" + block, Highlights.add("# T\n\n" + block, Highlights.block("a", "chapter 1", -1)));
        eq("heading then the block: the highlight before the block", "x\n\n## Highlights\n\n> a\n> — chapter 1\n\n" + block, Highlights.add("x\n\n## Highlights\n\n" + block, Highlights.block("a", "chapter 1", -1)));
        String two = Highlights.add(Highlights.add("x\n", Highlights.block("same", "A, chapter 1", 3)), Highlights.block("same", "A, chapter 1", 40));
        eq("remove the one at k=40, the other kept", "x\n\n## Highlights\n\n> same\n> — A, chapter 1 <!-- atlas-hl k=3 -->\n", Highlights.remove(two, "same", 40));
        eq("not found: unchanged", two, Highlights.remove(two, "other", -1));
        eq("no k: the first", "x\n\n## Highlights\n\n> same\n> — A, chapter 1 <!-- atlas-hl k=40 -->\n", Highlights.remove(two, "same", -1));
        eq("a quote outside the section is never removed", md, Highlights.remove(md, "a quote of my own", -1));
        eq("a removed one keeps its place in the list, empty", "", Highlights.Highlight.GONE.text);
        System.out.println("HighlightsTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
