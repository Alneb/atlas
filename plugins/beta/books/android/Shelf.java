package org.atlas.plugins.books;

import org.atlas.capture.Host;
import org.atlas.capture.Props;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;

/** Where each book is read: its place in its note's properties (notePath, entryOf, update — below); the library's
 *  `<folder>/reading.json` keeps the place of books not yet moved to a note (and the themes of older versions, read only:
 *  yours are the `themes` setting now):
 *  `{ books: { <path>: { spine, at, progress, updated, options?, bookmarks? } }, themes?: [{ name, options }], last }`. Every
 *  write reads the file again and changes only its own fields, so another device's progress, and the fields one side
 *  does not know, are kept. Never on the UI thread (a server's vault answers over the network). */
final class Shelf {
    static final String READING = "reading.json";

    private Shelf() {}

    static String folder(Host host) {
        String f = host.settings().optString("folder", "books").trim();
        return f.isEmpty() ? "books" : f.replaceAll("^/+|/+$", "");
    }

    /** The folder's reading.json for a book anywhere in the vault: the library's when the book is in it, else the one
     *  beside the book (a book opened from elsewhere keeps its place too). */
    static String readingFor(Host host, String book) {
        String f = folder(host);
        if (book.startsWith(f + "/")) return f + "/" + READING;
        int slash = book.lastIndexOf('/');
        return (slash < 0 ? "" : book.substring(0, slash + 1)) + READING;
    }

    static JSONObject reading(Host host, String at) {
        try { return host.exists(at) ? new JSONObject(host.readText(at)) : new JSONObject(); } catch (Exception e) { return new JSONObject(); }
    }

    /** A book's entry (never null). */
    static JSONObject entry(JSONObject reading, String book) {
        JSONObject books = reading.optJSONObject("books");
        JSONObject e = books == null ? null : books.optJSONObject(book);
        return e == null ? new JSONObject() : e;
    }

    /** Edit the book's entry (its note's properties) and write it back; `reading` is a scratch object (the library's
     *  file is not written here any more). */
    interface Change { void apply(JSONObject entry, JSONObject reading) throws Exception; }

    /** The library's own reading.json (where your themes are). */
    static String library(Host host) { return folder(host) + "/" + READING; }

    /** Read a reading.json again, let `change` edit it whole, write it back. */
    interface FileChange { void apply(JSONObject reading) throws Exception; }

    static synchronized void updateFile(Host host, String at, FileChange change) throws Exception {
        JSONObject r = reading(host, at);
        change.apply(r);
        host.write(at, r.toString(2).getBytes(StandardCharsets.UTF_8));
    }

    // ---- where you are, in the book's note: `quantum.epub` → `quantum.md` (the note that already holds its highlights), `paper.pdf` →
    // `paper.md`. Legible properties: progress: 42% · reading_chapter: 4 · reading_at: 25.12% (EPUB) · reading_page: 12
    // (PDF) · last_read: <ISO time> · reader_options / reader_bookmarks: JSON, only when set. A book only in an old
    // reading.json is read from there and moves to its note at the next save.

    /** The note that holds the book's place (and its highlights). */
    static String notePath(String book) {
        String b = book.replaceAll("/+$", "");
        int dot = b.lastIndexOf('.'), slash = b.lastIndexOf('/');
        return (dot > slash ? b.substring(0, dot) : b) + ".md";
    }

    private static final java.util.Map<String, String> notes = new java.util.concurrent.ConcurrentHashMap<>();

    /** The note that holds the book's place: the book's one note, as the core says (Host.companionNote: a paper's PDF or
     *  book has the paper's note, else `<name>.md` beside it — one note per thing, ebooks
     *  and manga included), asked once per book; written by `update` when missing. Never on the UI thread. */
    static String noteOf(Host host, String book) {
        String had = notes.get(book);
        if (had != null) return had;
        try { String n = host.companionNote(book); notes.put(book, n); return n; }
        catch (Exception e) { return notePath(book); } // the core could not say: beside the book, as before
    }

    /** The book's note as last asked (noteOf, which the library's list asks for every book), on any thread. */
    static String knownNote(String book) { return notes.getOrDefault(book, notePath(book)); }

    /** The book's entry — spine, at, progress, updated, options, bookmarks — from its note, else its old reading.json. */
    static JSONObject entryOf(Host host, String book) {
        String note = noteOf(host, book);
        try {
            String text = host.exists(note) ? host.readText(note) : null;
            java.util.Map<String, String> p = Props.read(text);
            boolean pdf = book.toLowerCase(Locale.ROOT).endsWith(".pdf");
            String place = p.get(pdf ? "reading_page" : "reading_chapter");
            if (place != null) {
                JSONObject e = new JSONObject();
                e.put("spine", Math.max(0, Integer.parseInt(place.trim()) - 1));
                e.put("at", percent(p.get("reading_at")));
                if (p.containsKey("progress")) e.put("progress", percent(p.get("progress")));
                if (p.containsKey("last_read")) e.put("updated", p.get("last_read"));
                if (p.containsKey("reader_options")) e.put("options", new JSONObject(p.get("reader_options")));
                if (p.containsKey("reader_bookmarks")) e.put("bookmarks", new JSONArray(p.get("reader_bookmarks")));
                return e;
            }
        } catch (Exception e) { /* an old or hand-edited note: the old file's place, if any */ }
        return entry(reading(host, readingFor(host, book)), book);
    }

    private static double percent(String v) {
        if (v == null) return 0;
        String t = v.trim().replace("%", "").trim();
        try { double d = Double.parseDouble(t); return v.contains("%") ? d / 100 : d; } catch (NumberFormatException e) { return 0; }
    }

    private static String pct(double f, int decimals) {
        double m = Math.pow(10, decimals);
        double v = Math.round(f * 100 * m) / m;
        return (v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v)) + "%";
    }

    static synchronized void update(Host host, String book, Change change) throws Exception {
        JSONObject e = entryOf(host, book);
        change.apply(e, new JSONObject());
        String note = noteOf(host, book);
        boolean pdf = book.toLowerCase(Locale.ROOT).endsWith(".pdf");
        String text = host.exists(note) ? host.readText(note) : null;
        if (text == null) { // a note of its own, made by the core as on every device (the vault's template rules, the book's block)
            String name = book.substring(book.lastIndexOf('/') + 1), title = name.replaceFirst("\\.[^.]+$", "");
            note = host.ensureCompanionNote(book, title, new JSONObject().put(pdf ? "pdf" : "book", "[[" + name + "]]"));
            notes.put(book, note);
            text = host.readText(note);
        }
        java.util.Map<String, String> set = new java.util.LinkedHashMap<>();
        if (e.has("progress")) set.put("progress", pct(e.optDouble("progress"), 1));
        if (e.has("spine")) {
            set.put(pdf ? "reading_page" : "reading_chapter", String.valueOf(e.optInt("spine") + 1));
            if (!pdf) set.put("reading_at", pct(e.optDouble("at"), 2));
        }
        if (e.has("updated")) set.put("last_read", e.optString("updated"));
        set.put("reader_options", e.optJSONObject("options") != null ? e.optJSONObject("options").toString() : null);
        set.put("reader_bookmarks", e.optJSONArray("bookmarks") != null && e.optJSONArray("bookmarks").length() > 0 ? e.optJSONArray("bookmarks").toString() : null);
        host.write(note, Props.set(text, set).getBytes(StandardCharsets.UTF_8));
    }

    /** Where you are: spine entry `spine`, `at` of the way through it (0–1), `progress` of the way through the book
     *  (the library shows it). */
    static void saveAt(Host host, String book, int spine, double at, double progress) throws Exception {
        update(host, book, (e, r) -> {
            e.put("spine", spine);
            e.put("at", Math.round(at * 10000) / 10000.0);
            e.put("progress", Math.round(progress * 1000) / 1000.0);
            e.put("updated", java.time.Instant.now().toString().replaceFirst("\\.\\d+Z$", "Z"));
        });
    }

    /** The settings the book is read with: yours (the plugin's settings), this book's own over them. */
    static JSONObject options(JSONObject yours, JSONObject entry) {
        JSONObject o = copy(yours);
        JSONObject own = entry.optJSONObject("options");
        if (own != null) for (Iterator<String> k = own.keys(); k.hasNext(); ) { String key = k.next(); try { o.put(key, own.get(key)); } catch (Exception e) { /* skip */ } }
        return o;
    }

    static JSONObject copy(JSONObject o) {
        try { return new JSONObject(o == null ? "{}" : o.toString()); } catch (Exception e) { return new JSONObject(); }
    }

    static JSONArray themes(JSONObject reading) {
        JSONArray t = reading.optJSONArray("themes");
        return t == null ? new JSONArray() : t;
    }

    /** Your themes as `[{name, options}]`: the plugin's `themes` setting (records, TOML: settings
     *  in TOML, not loose JSON), else the ones an older version kept in the library's reading.json. Never on the UI thread. */
    static JSONArray savedThemes(Host host) {
        JSONArray records = host.settings().optJSONArray("themes");
        if (records == null || records.length() == 0) return themes(reading(host, library(host)));
        JSONArray out = new JSONArray();
        for (int i = 0; i < records.length(); i++) {
            JSONObject r = records.optJSONObject(i);
            if (r == null) continue;
            JSONObject options = copy(r);
            options.remove("name");
            try { out.put(new JSONObject().put("name", r.optString("name", "Mine")).put("options", options)); } catch (Exception e) { /* skip */ }
        }
        return out;
    }

    /** `themes` (`[{name, options}]`) saved as the `themes` setting: null, or why not. */
    static String saveThemes(Host host, JSONArray themes) {
        JSONArray records = new JSONArray();
        try {
            for (int i = 0; i < themes.length(); i++) {
                JSONObject t = themes.optJSONObject(i);
                if (t == null) continue;
                JSONObject r = copy(t.optJSONObject("options"));
                records.put(r.put("name", t.optString("name", "Mine")));
            }
            return host.saveSettings(new JSONObject().put("themes", records));
        } catch (Exception e) { return String.valueOf(e.getMessage()); }
    }
}
