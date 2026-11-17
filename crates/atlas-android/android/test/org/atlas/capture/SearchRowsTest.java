package org.atlas.capture;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The Search screen's rules (SearchRows): sections from the core's answer, hits cut around their match, the timing of
 *  results as you type (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class SearchRowsTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    private static String marked(SearchRows.Snip s) {
        StringBuilder b = new StringBuilder(s.text);
        for (int i = s.marks.length - 2; i >= 0; i -= 2) b.insert(s.marks[i + 1], ']').insert(s.marks[i], '[');
        return b.toString();
    }

    public static void main(String[] a) {
        // sections: the names first, then a section per file in the core's order, its header the file
        Map<String, Integer> counts = new HashMap<>();
        counts.put("notes/b.md", 7);
        List<PlaceItem> rows = SearchRows.rows("hub", Arrays.asList("notes/hubbard.md", "hub.pdf"),
            Arrays.asList(new SearchRows.Hit("notes/b.md", 3, "  the Hubbard model"), new SearchRows.Hit("notes/b.md", 9, "hub"), new SearchRows.Hit("a.md", 1, "x hub")),
            counts, FileRowsTest.SHOWN);
        eq("names, then the files' lines in the core's order",
            "[# Files, - hubbard | notes @notes/hubbard.md, - hub.pdf @hub.pdf, # b | 7 lines @notes/b.md, - the Hubbard model | Line 3 @notes/b.md:3, - hub | Line 9 @notes/b.md:9, # a | 1 line @a.md, - x hub | Line 1 @a.md:1]",
            rows.toString());
        eq("a name's match is marked", "[0, 3]", Arrays.toString(rows.get(1).marks));
        eq("a line has no icon (its file's header says which)", "null", String.valueOf(rows.get(4).icon));
        eq("names only: no line sections", 2, SearchRows.rows("x", Arrays.asList("x.md"), Collections.emptyList(), counts, FileRowsTest.SHOWN).size());
        eq("lines only: no Files header", "# a | 1 line @a.md", SearchRows.rows("x", Collections.emptyList(), Arrays.asList(new SearchRows.Hit("a.md", 2, "x")), counts, FileRowsTest.SHOWN).get(0).toString());

        // smart case, as the core's
        eq("lower case: any case", "[4, 7, 8, 11]", Arrays.toString(SearchRows.find("The Hub hub", "hub")));
        eq("a capital: exactly", "[4, 7]", Arrays.toString(SearchRows.find("The Hub hub", "Hub")));
        eq("no overlaps", "[0, 2, 2, 4]", Arrays.toString(SearchRows.find("aaaa", "aa")));
        eq("an empty query finds nothing", 0, SearchRows.find("abc", " ").length);

        // the hit's text around its match
        eq("short: whole, indent dropped", "the [Hubbard] model", marked(SearchRows.snip("   the Hubbard model  ", "hubbard", 40)));
        String longLine = "x".repeat(100) + " found here";
        SearchRows.Snip s = SearchRows.snip(longLine, "found", 10);
        eq("long: cut ahead of the match", "…" + "x".repeat(9) + " [found] here", marked(s));
        eq("no match (a regex hit, a PDF's text): the line as it is", "plain", marked(SearchRows.snip(" plain ", "zzz", 40)));
        eq("every match marked", "[a] b [a]", marked(SearchRows.snip("a b a", "a", 40)));
        eq("never cut through an emoji", true, SearchRows.snip("a😀" + "y".repeat(39) + "q", "q", 40).text.startsWith("…😀"));

        // as you type
        SearchRows.Typing t = new SearchRows.Typing();
        SearchRows.Typing.Ask h = t.typed("h");
        eq("a key: a search after the pause", SearchRows.Typing.WAIT_MS, h.delay);
        SearchRows.Typing.Ask hu = t.typed("hu");
        eq("the next key makes the first stale", false, t.current(h));
        eq("its answer is dropped", false, t.lines(h));
        eq("a space at the end changes nothing", "null", String.valueOf(t.typed("hu ")));
        eq("the names come first", true, t.names(hu));
        eq("then the lines", true, t.lines(hu));
        eq("names after the lines: dropped", false, t.names(hu));
        SearchRows.Typing.Ask cleared = t.typed("");
        eq("cleared: at once", 0L, cleared.delay);
        eq("cleared: an empty query", "", cleared.query);
        t.typed("hub");
        SearchRows.Typing.Ask again = t.again();
        eq("again: the same query, at once", "hub/0", again.query + "/" + again.delay);
        eq("again: names shown afresh", true, t.names(again));

        System.out.println("SearchRowsTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
