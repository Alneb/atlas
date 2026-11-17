package org.atlas.plugins.manga;

import org.atlas.capture.Host;
import org.atlas.capture.Props;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** A series on disk, for the reader: the folder a chapter is in; its chapters are .cbz files or folders of pictures
 *  (natural order); a .cbz loose in the library folder is a series of one. Where you are, per series, is in
 *  the series' note (its folder's own): reading_chapter · reading_page ·
 *  last_read · chapter_progress (each chapter's page, or "read": JSON text) · reader_options — the same properties as
 *  view.js. The screens keep `{chapters: {name: {read, page}}, last, options}`. */
final class Library {
    static final String READING = "reading.json"; // the older place file: read until the note has the place

    static final class Series {
        final String path, title;
        final List<String> chapters = new ArrayList<>(); // vault paths, in order (a server's: `suwayomi:<id>/<name>`)
        /** A series of the user's Suwayomi (its manga id; 0: the vault's) and where you are in it (a server's asked with
         *  its chapters; both kept up to date here as you read, the note or the server written behind). */
        int remote;
        JSONObject reading;
        /** Why a server's chapters are the ones last seen (it could not be reached); "" when it answered. */
        String offline = "";
        /** A server's chapters it keeps itself (its Downloads), by id: they read even once their source is gone. */
        final java.util.Set<Integer> onServer = new java.util.HashSet<>();
        Series(String path, String title) { this.path = path; this.title = title; }
    }

    /** One at a time, off the UI: where you are, written into the note or back to the server. */
    private static volatile long told;
    private static final java.util.concurrent.ExecutorService saver = Pages.pool(1, "manga-save");
    /** The newest place asked to be saved, per chapter: an older one still queued is skipped (pages turned fast); a
     *  chapter finished keeps its own "read" when the next one begins. */
    private static final Map<String, Long> newest = new ConcurrentHashMap<>();
    private static final java.util.concurrent.atomic.AtomicLong asks = new java.util.concurrent.atomic.AtomicLong();

    private Library() {}

    static String folder(Host host) {
        String f = host.settings().optString("folder", "manga").trim();
        return f.isEmpty() ? "manga" : f.replaceAll("^/+|/+$", "");
    }

    /** The vault's series, as view.js `seriesIn` lists them: each folder of the library folder that holds chapters, and
     *  each .cbz loose there (a series of one). Their chapters listed, not yet where you are. Never on the UI thread. */
    static List<Series> inVault(Host host) {
        List<Series> out = new ArrayList<>();
        String folder = folder(host);
        if (!host.isDir(folder)) return out; // a vault with only Suwayomi
        for (String e : host.list(folder)) {
            String name = e.replaceAll("/+$", "");
            name = name.substring(name.lastIndexOf('/') + 1);
            if (e.endsWith("/")) {
                Series s = new Series(folder + "/" + name, name);
                chapters(host, s);
                if (!s.chapters.isEmpty()) out.add(s);
            } else if (Chapter.isZip(name)) {
                Series s = new Series(folder + "/" + name, Chapter.titleOf(name));
                s.chapters.add(s.path);
                out.add(s);
            }
        }
        return out;
    }

    /** A vault series as the library lists it: its chapters, how many unread, when last read (its note). */
    static Shelf.Item item(Series s) {
        Shelf.Item it = new Shelf.Item(s.path, s.title, Shelf.Origin.VAULT);
        it.chapters = s.chapters.size();
        JSONObject r = s.reading == null ? new JSONObject() : s.reading;
        int read = 0;
        for (String c : s.chapters) if (isRead(r, c)) read++;
        it.unread = it.chapters - read;
        it.lastRead = r.has("last") ? lastRead(r) : 0;
        return it;
    }

    /** The note's `last_read` in ms (0: none, or not a time). */
    static long lastRead(JSONObject reading) {
        String at = reading.optString("at", "");
        try { return at.isEmpty() ? 1 : java.time.Instant.parse(at).toEpochMilli(); } // started with no time: still started
        catch (java.time.format.DateTimeParseException e) { return 1; }
    }

    /** Chapters marked read or unread (a long press in the series), in memory at once and written behind: a vault
     *  series' note (chapter_progress, as the reader writes it), a server's series on the server. Unread forgets the
     *  chapter's page too. `done` on the saver's thread with null or why it failed. */
    static void setRead(Host host, Series s, List<String> chapters, boolean read, java.util.function.Consumer<String> done) {
        if (s.reading == null) s.reading = new JSONObject();
        for (String c : chapters) mark(s.reading, c, read);
        Pages.run(saver, () -> {
            String why = null;
            try {
                if (s.remote > 0) { for (String c : chapters) Suwayomi.mark(host, c, 0, read); if (read) remoteNote(host, s, "finished", 0); }
                else if (host.isDir(s.path)) {
                    JSONObject r = reading(host, s); // the note as it is now
                    for (String c : chapters) mark(r, c, read);
                    save(host, s, r, Thing.why(0, 0, read), 0);
                }
            } catch (Exception e) { why = e.getMessage() == null ? e.toString() : e.getMessage(); }
            if (done != null) done.accept(why);
        });
    }

    /** One chapter read (at page 0) or unread (no entry: never opened) in the screens' shape. */
    private static void mark(JSONObject r, String chapter, boolean read) {
        try {
            JSONObject all = r.optJSONObject("chapters");
            if (all == null) { all = new JSONObject(); r.put("chapters", all); }
            if (read) all.put(name(chapter), new JSONObject().put("read", true).put("page", 0));
            else all.remove(name(chapter));
        } catch (org.json.JSONException e) { /* left as it was */ }
    }

    /** A series' chapters: its .cbz files and picture folders; a folder of pictures alone is one chapter. */
    static void chapters(Host host, Series s) {
        boolean pictures = false;
        for (String e : host.list(s.path)) {
            if (e.endsWith("/")) s.chapters.add(s.path + "/" + e);
            else if (Chapter.isZip(e)) s.chapters.add(s.path + "/" + e);
            else if (Chapter.PICTURE.matcher(e).matches()) pictures = true;
        }
        if (s.chapters.isEmpty() && pictures) s.chapters.add(s.path + "/");
        s.chapters.sort(Chapter::natural);
    }

    /** The series a chapter belongs to (its folder), or the chapter alone. */
    static String seriesOf(String chapter) {
        String c = chapter.endsWith("/") ? chapter.substring(0, chapter.length() - 1) : chapter;
        int i = c.lastIndexOf('/');
        return i < 0 ? c : c.substring(0, i);
    }

    private static final Map<String, String> notes = new ConcurrentHashMap<>();

    /** The series' note: its folder's own, as the core says (Host.companionNote), asked once. Never on the UI thread. */
    static String noteOf(Host host, Series s) {
        String had = notes.get(s.path);
        if (had != null) return had;
        String n;
        try { n = host.companionNote(s.path + "/"); }
        catch (Exception e) { n = s.path + "/" + s.path.substring(s.path.lastIndexOf('/') + 1) + ".md"; } // the core could not say
        notes.put(s.path, n);
        return n;
    }

    static JSONObject reading(Host host, Series s) {
        if (s.remote > 0) return s.reading != null ? s.reading : new JSONObject();
        if (!host.isDir(s.path)) return new JSONObject();
        try {
            String note = noteOf(host, s);
            Map<String, String> p = Props.read(host.exists(note) ? host.readText(note) : null);
            if (p.containsKey("chapter_progress") || p.containsKey("reading_chapter")) return fromProps(p);
        } catch (Exception e) { /* an unreadable note: the old file, if any */ }
        String t = host.readText(s.path + "/" + READING);
        if (t == null) return new JSONObject();
        try {
            JSONObject old = new JSONObject(t);
            save(host, s, old, "progress", 1); // into the note once; `atlas companions` then retires the file
            return old;
        } catch (Exception e) { return new JSONObject(); }
    }

    /** The note's properties → the screens' shape (view.js readingOf). */
    static JSONObject fromProps(Map<String, String> p) throws Exception {
        JSONObject chapters = new JSONObject(), r = new JSONObject().put("chapters", chapters);
        JSONObject progress = new JSONObject(p.getOrDefault("chapter_progress", "{}"));
        for (Iterator<String> it = progress.keys(); it.hasNext(); ) {
            String k = it.next();
            chapters.put(k, "read".equals(progress.opt(k)) ? new JSONObject().put("read", true).put("page", 0) : new JSONObject().put("page", progress.optInt(k)));
        }
        String last = p.get("reading_chapter");
        if (last != null && !last.isEmpty()) {
            r.put("last", last);
            JSONObject c = chapters.optJSONObject(last);
            if (c == null) chapters.put(last, c = new JSONObject());
            if (!c.optBoolean("read")) c.put("page", parse(p.get("reading_page")));
        }
        if (p.get("reader_options") != null) r.put("options", new JSONObject(p.get("reader_options")));
        if (p.get("last_read") != null) r.put("at", p.get("last_read")); // for the library's Reading tab; never written back from here
        return r;
    }

    private static int parse(String v) { try { return v == null ? 0 : Integer.parseInt(v.trim()); } catch (NumberFormatException e) { return 0; } }

    /** The series' one note by the catalog's rule (Host.thingNote, DESIGN-server-libraries §3): found, or made once
     *  the series is yours (`why`: Thing.why). Its path, or null: not yours yet, or none could be made. Without the
     *  catalog, a vault series still gets its folder's note from the core once read. Never on the UI thread. */
    static String thingNote(Host host, Series s, String why, double progress) {
        try {
            JSONObject thing = s.remote > 0 ? Suwayomi.thing(host, s.remote)
                : new JSONObject().put("kind", "manga").put("file", s.path + "/").put("fields", new JSONObject().put("title", s.title));
            thing.put("why", why);
            if ("progress".equals(why)) thing.put("progress", progress);
            JSONObject r = host.thingNote(thing);
            String p = r.isNull("path") ? null : r.optString("path", null);
            if (p != null) notes.put(s.path, p);
            return p;
        } catch (Exception e) {
            if (s.remote > 0 || "opened".equals(why)) return null;
            try { String p = host.ensureCompanionNote(s.path + "/", s.title, null); notes.put(s.path, p); return p; }
            catch (Exception again) { return null; }
        }
    }

    private static final Map<String, String> remoteNotes = new ConcurrentHashMap<>(), remoteTold = new ConcurrentHashMap<>();

    /** A server series' note told which chapter you are at and when (the place itself is the server's): asked for once
     *  it is yours, remembered for the app's life ("" once none could be made). Never on the UI thread. */
    static void remoteNote(Host host, Series s, String why, double progress) {
        String note = remoteNotes.get(s.path);
        if ("".equals(note)) return;
        if (note == null) {
            if ("opened".equals(why)) return;
            note = thingNote(host, s, why, progress);
            remoteNotes.put(s.path, note == null ? "" : note);
            if (note == null) return;
        }
        String last = s.reading == null ? "" : s.reading.optString("last", "");
        if (last.isEmpty() || last.equals(remoteTold.get(s.path))) return;
        remoteTold.put(s.path, last);
        String text = host.readText(note);
        if (text == null) return;
        Map<String, String> set = new LinkedHashMap<>();
        set.put("reading_chapter", last);
        set.put("last_read", java.time.Instant.now().toString().replaceFirst("\\.\\d+Z$", "Z"));
        try { host.write(note, Props.set(text, set).getBytes(StandardCharsets.UTF_8)); } catch (Exception e) { remoteTold.remove(s.path); }
    }

    /** The screens' shape → the series' note (view.js readingProps); a series with no note gets one only once it is
     *  yours (thingNote), else nothing is kept. */
    static void save(Host host, Series s, JSONObject r, String why, double far) throws Exception {
        String note = noteOf(host, s);
        if (!host.exists(note)) note = thingNote(host, s, why, far);
        if (note == null) return;
        String text = host.readText(note);
        JSONObject chapters = r.optJSONObject("chapters"), progress = new JSONObject();
        if (chapters != null) for (Iterator<String> it = chapters.keys(); it.hasNext(); ) {
            String k = it.next();
            JSONObject c = chapters.optJSONObject(k);
            if (c == null) continue;
            if (c.optBoolean("read")) progress.put(k, "read"); else if (c.optInt("page") > 0) progress.put(k, c.optInt("page"));
        }
        String last = r.optString("last", "");
        Map<String, String> set = new LinkedHashMap<>();
        set.put("reading_chapter", last.isEmpty() ? null : last);
        set.put("reading_page", last.isEmpty() || chapters == null || chapters.optJSONObject(last) == null ? null : String.valueOf(chapters.optJSONObject(last).optInt("page")));
        set.put("last_read", java.time.Instant.now().toString().replaceFirst("\\.\\d+Z$", "Z"));
        set.put("chapter_progress", progress.toString());
        set.put("reader_options", r.optJSONObject("options") != null ? r.optJSONObject("options").toString() : null);
        // nothing but the time changed: the note is left alone
        String stamp = set.remove("last_read");
        String moved = Props.set(text, set);
        if (moved.equals(text)) return;
        Map<String, String> t = new LinkedHashMap<>();
        t.put("last_read", stamp);
        host.write(note, Props.set(moved, t).getBytes(StandardCharsets.UTF_8));
    }

    /** Saves where you are in a chapter (and that it was read once on its last page), behind the UI: a vault series'
     *  note, a server's series on the server. A series that is no folder (a loose .cbz) keeps nothing. */
    static void mark(Host host, Series s, String chapter, int page, int pages, boolean write) {
        if (s.remote > 0) {
            if (s.reading == null) s.reading = new JSONObject();
            boolean read = place(s.reading, chapter, page, page >= pages - 1);
            remember(host, s, chapter, page, read, Thing.why(page, pages, read), Thing.progress(page, pages));
            return;
        }
        if (s.reading != null) place(s.reading, chapter, page, page >= pages - 1); // the reader's copy (its chapter list)
        if (!write) return; // kept in memory: the reader writes it on a new chapter, the last page or leaving
        long ask = asks.incrementAndGet();
        newest.put(chapter, ask);
        Pages.run(saver, () -> { if (newest.get(chapter) == ask) markNow(host, s, chapter, page, pages); });
    }

    private static void markNow(Host host, Series s, String chapter, int page, int pages) {
        if (!host.isDir(s.path)) return;
        try {
            JSONObject r = reading(host, s); // the note as it is now: another device may have read on
            place(r, chapter, page, page >= pages - 1);
            save(host, s, r, Thing.why(page, pages, page >= pages - 1), Thing.progress(page, pages));
        } catch (Exception e) { /* kept for next time */ }
    }

    /** Where you are, in the screens' shape, in memory: the chapter's page, read once its last page was shown (and
     *  still read when read again), this chapter the last one. Whether it is read. */
    static boolean place(JSONObject r, String chapter, int page, boolean last) {
        try {
            JSONObject all = r.optJSONObject("chapters");
            if (all == null) { all = new JSONObject(); r.put("chapters", all); }
            JSONObject c = all.optJSONObject(name(chapter));
            if (c == null) { c = new JSONObject(); all.put(name(chapter), c); }
            boolean read = last || c.optBoolean("read");
            c.put("page", page);
            c.put("read", read);
            r.put("last", name(chapter));
            return read;
        } catch (org.json.JSONException e) { return last; }
    }

    /** The reader's options for this series (a vault series' note, `reader_options`), saved behind the UI. */
    static void setOptions(Host host, Series s, JSONObject options) {
        Pages.run(saver, () -> {
            try {
                if (!host.isDir(s.path)) return;
                JSONObject r = reading(host, s);
                r.put("options", options);
                save(host, s, r, "opened", 0); // options alone never make a note
            } catch (Exception e) { host.toast("Not saved: " + e.getMessage()); }
        });
    }

    /** A server's series: sent to the server behind (its place is already in `s.reading`). */
    private static void remember(Host host, Series s, String chapter, int page, boolean read, String why, double progress) {
        long ask = asks.incrementAndGet();
        newest.put(chapter, ask);
        Pages.run(saver, () -> {
            if (newest.get(chapter) != ask) return;
            try { Suwayomi.mark(host, chapter, page, read); remoteNote(host, s, why, progress); }
            catch (Exception e) { // said once a minute, not at every page turned
                if (System.currentTimeMillis() - told > 60_000) { told = System.currentTimeMillis(); host.toast("Not saved on " + Suwayomi.base(host) + ": " + e.getMessage()); }
            }
        });
    }

    static boolean isRead(JSONObject reading, String chapter) {
        JSONObject all = reading.optJSONObject("chapters");
        return all != null && all.optJSONObject(name(chapter)) != null && all.optJSONObject(name(chapter)).optBoolean("read");
    }

    static int pageOf(JSONObject reading, String chapter) {
        JSONObject all = reading.optJSONObject("chapters");
        return all == null || all.optJSONObject(name(chapter)) == null ? 0 : all.optJSONObject(name(chapter)).optInt("page");
    }

    static String name(String chapter) { return chapter.substring(chapter.lastIndexOf('/', chapter.length() - 2) + 1); }
}
