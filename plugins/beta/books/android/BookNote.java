package org.atlas.plugins.books;

import org.json.JSONObject;

/** A book's companion note (`quantum.epub` → `quantum.md`), where its highlights (Highlights) and pinned notes
 *  (EpubInk) are written. */
final class BookNote {
    private BookNote() {}

    /** The note as it is now, made by the core when missing — as every device makes it (the vault's template rules,
     *  the book's block; `book`, `author` as properties). */
    static String text(org.atlas.capture.Host host, String book, String note, String title, String author) throws Exception {
        if (host.exists(note)) return host.readText(note);
        String name = book.substring(book.lastIndexOf('/') + 1);
        JSONObject props = new JSONObject().put("book", "[[" + name + "]]");
        if (author != null && !author.isEmpty()) props.put("author", author);
        return host.readText(host.ensureCompanionNote(book, title == null || title.isEmpty() ? Formats.bare(name) : title, props));
    }
}
