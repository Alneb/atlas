package org.atlas.plugins.books;

import org.json.JSONArray;
import org.json.JSONObject;

/** A book's highlights in its companion note, the web reader's format (view.js newNote / highlightBlock / highlightsIn):
 *  `> passage` then `> — chapter`, under a "Highlights" heading of a note made with the book's properties. */
final class Highlights {
    private Highlights() {}

    static String squash(String t) { return t.replaceAll("\\s+", " ").trim(); }

    /** A new note: `book: "[[x.epub]]"`, title and author as properties, the title, "## Highlights". */
    static String newNote(String bookName, String title, String author) {
        String t = title == null || title.isEmpty() ? Formats.bare(bookName) : title;
        return "---\nbook: " + JSONObject.quote("[[" + bookName + "]]") + "\ntitle: " + JSONObject.quote(t) + "\nauthor: " + JSONObject.quote(author == null ? "" : author)
            + "\n---\n# " + t + "\n\n## Highlights\n";
    }

    static String block(String text, String where) { return "\n> " + squash(text) + "\n> — " + where + "\n"; }

    /** The passages a note quotes (each `>` block without its `— where` line). */
    static JSONArray in(String md) {
        JSONArray out = new JSONArray();
        StringBuilder cur = new StringBuilder();
        for (String line : (md + "\n").split("\n", -1)) {
            boolean quote = line.startsWith(">");
            String body = quote ? line.replaceFirst("^>\\s?", "") : "";
            if (quote && !body.startsWith("— ")) { if (cur.length() > 0) cur.append(' '); cur.append(body); continue; }
            if (!quote && cur.length() > 0) { String p = squash(cur.toString()); if (!p.isEmpty()) out.put(p); cur.setLength(0); }
        }
        return out;
    }
}
