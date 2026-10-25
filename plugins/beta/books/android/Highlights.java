package org.atlas.plugins.books;

import org.json.JSONArray;
import org.json.JSONObject;

/** A book's highlights in its companion note, the web reader's format (view.js ensureNote / highlightBlock / highlightsIn):
 *  `> passage` then `> — chapter`, under a "Highlights" heading of the note the core made for the book. */
final class Highlights {
    private Highlights() {}

    static String squash(String t) { return t.replaceAll("\\s+", " ").trim(); }

    /** The book's note as it is now, made by the core when missing — as every device makes it (the vault's template
     *  rules, the book's block; `book`, `author` as properties) — and with a "Highlights" heading to write under. */
    static String noteText(org.atlas.capture.Host host, String book, String note, String title, String author) throws Exception {
        String md;
        if (host.exists(note)) md = host.readText(note);
        else {
            String name = book.substring(book.lastIndexOf('/') + 1);
            JSONObject props = new JSONObject().put("book", "[[" + name + "]]");
            if (author != null && !author.isEmpty()) props.put("author", author);
            md = host.readText(host.ensureCompanionNote(book, title == null || title.isEmpty() ? Formats.bare(name) : title, props));
        }
        if (!java.util.regex.Pattern.compile("(?m)^## Highlights\\s*$").matcher(md).find()) md = md.replaceAll("\\n*$", "\n") + "\n## Highlights\n";
        return md;
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
