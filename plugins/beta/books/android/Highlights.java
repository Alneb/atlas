package org.atlas.plugins.books;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** A book's highlights in its companion note, the web reader's format (shared/marks.js highlightBlock / highlightsIn /
 *  addHighlight, whose comment shows it): `> passage` then `> — where, chapter N <!-- atlas-hl k=K -->`, under the
 *  note's "## Highlights" heading. The page marks them with marks.js itself; this side reads them for the Notes panel
 *  and writes a new one (BookNote loads the note) — the same rules, plain Java (no Android), tested in android/test (HighlightsTest) as marks.js is in example-books.spec. */
final class Highlights {
    private Highlights() {}

    /** One highlight: its passage, and — when the note says — where it is (the `— …` line), its chapter (1-based)
     *  and anchor `k` (-1 / 0 when not said: written before anchors). */
    static final class Highlight {
        final String text, where;
        final int chapter, k;
        Highlight(String text, String where, int chapter, int k) { this.text = text; this.where = where; this.chapter = chapter; this.k = k; }
        /** Anchored: it can be gone to in the book. */
        boolean anchored() { return chapter > 0 && k >= 0; }
        @Override public String toString() { return text + " | " + where + " | " + chapter + " | " + k; }
        /** A removed one, kept in the reader's list so the others keep their index (the page's marks carry it). */
        static final Highlight GONE = new Highlight("", null, 0, -1);
    }

    static String squash(String t) { return t.replaceAll("\\s+", " ").trim(); }

    private static final Pattern HEADING = Pattern.compile("^## Highlights\\s*$");
    /** The core's marks block (marks.js addHighlight's rule too). */
    private static final Pattern MARKS = Pattern.compile("^```pdf-marks(\\s.*)?$");
    private static final Pattern SECTION = Pattern.compile("^#{1,2}\\s.*");
    private static final Pattern ANCHOR = Pattern.compile("\\s*<!--\\s*atlas-hl\\s+k=(\\d+)\\s*-->\\s*$");
    private static final Pattern CHAPTER = Pattern.compile("\\bchapter (\\d+)\\s*$");

    /** One highlight as Markdown: the passage quoted, then where it is, with its anchor when known (k ≥ 0). */
    static String block(String text, String where, int k) {
        return "\n> " + squash(text) + "\n> — " + where + (k >= 0 ? " <!-- atlas-hl k=" + k + " -->" : "") + "\n";
    }

    /** The highlights the note keeps: each `>` block under "## Highlights" (to the next heading of level 1 or 2) →
     *  Highlight. Callouts (`> [!…]`) are not highlights. */
    static List<Highlight> in(String md) {
        List<Highlight> out = new ArrayList<>();
        boolean under = false, callout = false;
        StringBuilder cur = new StringBuilder();
        for (String line : (md + "\n").split("\n", -1)) {
            if (SECTION.matcher(line).matches()) { end(out, cur, callout, null); callout = false; under = HEADING.matcher(line).matches(); continue; }
            if (!under) continue;
            boolean quote = line.startsWith(">");
            String body = quote ? line.replaceFirst("^>\\s?", "") : "";
            if (quote && body.startsWith("— ")) { end(out, cur, callout, body.substring(2)); callout = false; continue; }
            if (quote) { if (cur.length() == 0 && body.startsWith("[!")) callout = true; if (cur.length() > 0) cur.append(' '); cur.append(body); continue; }
            end(out, cur, callout, null); callout = false;
        }
        return out;
    }

    private static void end(List<Highlight> out, StringBuilder cur, boolean callout, String where) {
        String text = squash(cur.toString());
        cur.setLength(0);
        if (text.isEmpty() || callout) return;
        if (where == null) { out.add(new Highlight(text, null, 0, -1)); return; }
        Matcher a = ANCHOR.matcher(where);
        int k = a.find() ? Integer.parseInt(a.group(1)) : -1;
        String w = ANCHOR.matcher(where).replaceFirst("").trim();
        Matcher c = CHAPTER.matcher(w);
        out.add(new Highlight(text, w, c.find() ? Integer.parseInt(c.group(1)) : 0, k));
    }

    /** `md` with `block` at the end of its Highlights section (before the next heading of level 1 or 2, or the marks
     *  block); the heading added at the end (before the marks block) when the note has none. */
    static String add(String md, String block) {
        String[] lines = md.replaceFirst("\\n*\\z", "").split("\n", -1);
        int h = -1;
        for (int i = 0; i < lines.length; i++) if (HEADING.matcher(lines[i]).matches()) { h = i; break; }
        // the core keeps the marks block (a book's ink, pdf_marks.rs) last: a highlight never lands after it
        int b = -1;
        for (int i = 0; i < lines.length; i++) if (MARKS.matcher(lines[i]).matches()) { b = i; break; }
        if (h < 0 && b < 0) return md.replaceFirst("\\n*\\z", "\n") + "\n## Highlights\n" + block;
        if (h < 0) {
            String before = String.join("\n", java.util.Arrays.copyOfRange(lines, 0, b)).replaceFirst("\\n*\\z", "\n");
            return before + "\n## Highlights\n" + block + "\n" + String.join("\n", java.util.Arrays.copyOfRange(lines, b, lines.length)) + "\n";
        }
        int e = lines.length;
        for (int i = h + 1; i < lines.length; i++) if (SECTION.matcher(lines[i]).matches() || MARKS.matcher(lines[i]).matches()) { e = i; break; }
        while (e > h + 1 && lines[e - 1].trim().isEmpty()) e--; // the section's blank lines stay after the new block
        String before = String.join("\n", java.util.Arrays.copyOfRange(lines, 0, e));
        String after = String.join("\n", java.util.Arrays.copyOfRange(lines, e, lines.length)).replaceFirst("^\\n*", "");
        return before + "\n" + block + (after.isEmpty() ? "" : "\n" + after + "\n");
    }

    /** `md` without the highlight quoting `text` (anchored at `k`, when both say): the first such block under
     *  "## Highlights", its `— where` line and the blank line before it. Unchanged when not found. */
    static String remove(String md, String text, int k) {
        String[] lines = md.split("\n", -1);
        String want = squash(text);
        boolean under = false;
        for (int i = 0; i < lines.length; i++) {
            if (SECTION.matcher(lines[i]).matches()) { under = HEADING.matcher(lines[i]).matches(); continue; }
            if (!under || !lines[i].startsWith(">") || (i > 0 && lines[i - 1].startsWith(">"))) continue; // a block's first line
            int e = i;
            StringBuilder t = new StringBuilder();
            while (e < lines.length && lines[e].startsWith(">") && !WHERE.matcher(lines[e]).find()) { if (t.length() > 0) t.append(' '); t.append(lines[e++].replaceFirst("^>\\s?", "")); }
            String where = e < lines.length && WHERE.matcher(lines[e]).find() ? lines[e] : null;
            if (!squash(t.toString()).equals(want)) continue;
            Matcher a = where == null ? null : ANCHOR.matcher(where);
            if (k >= 0 && a != null && a.find() && Integer.parseInt(a.group(1)) != k) continue;
            int from = i > 0 && lines[i - 1].trim().isEmpty() ? i - 1 : i, to = where != null ? e + 1 : e;
            return join(lines, from, to);
        }
        return md;
    }

    private static final Pattern WHERE = Pattern.compile("^>\\s?—\\s");

    /** `lines` joined without [from, to). */
    private static String join(String[] lines, int from, int to) {
        java.util.List<String> keep = new ArrayList<>();
        for (int j = 0; j < lines.length; j++) if (j < from || j >= to) keep.add(lines[j]);
        return String.join("\n", keep);
    }
}
