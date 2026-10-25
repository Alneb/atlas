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
            save(host, s, old); // into the note once; `atlas companions` then retires the file
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
        return r;
    }

    private static int parse(String v) { try { return v == null ? 0 : Integer.parseInt(v.trim()); } catch (NumberFormatException e) { return 0; } }

    /** The screens' shape → the series' note (view.js readingProps), made when missing. */
    static void save(Host host, Series s, JSONObject r) throws Exception {
        String note = noteOf(host, s);
        // a note of its own when missing, made by the core as on every device (the vault's template rules)
        String text = host.exists(note) ? host.readText(note) : host.readText(host.ensureCompanionNote(s.path + "/", s.title, null));
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
        host.write(note, Props.set(text, set).getBytes(StandardCharsets.UTF_8));
    }

    /** Saves where you are in a chapter (and that it was read once on its last page), behind the UI: a vault series'
     *  note, a server's series on the server. A series that is no folder (a loose .cbz) keeps nothing. */
    static void mark(Host host, Series s, String chapter, int page, int pages) {
        if (s.remote > 0) {
            if (s.reading == null) s.reading = new JSONObject();
            remember(host, chapter, page, place(s.reading, chapter, page, page >= pages - 1));
            return;
        }
        if (s.reading != null) place(s.reading, chapter, page, page >= pages - 1); // the reader's copy (its chapter list)
        long ask = asks.incrementAndGet();
        newest.put(chapter, ask);
        Pages.run(saver, () -> { if (newest.get(chapter) == ask) markNow(host, s, chapter, page, pages); });
    }

    private static void markNow(Host host, Series s, String chapter, int page, int pages) {
        if (!host.isDir(s.path)) return;
        try {
            JSONObject r = reading(host, s); // the note as it is now: another device may have read on
            place(r, chapter, page, page >= pages - 1);
            save(host, s, r);
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
                save(host, s, r);
            } catch (Exception e) { host.toast("Not saved: " + e.getMessage()); }
        });
    }

    /** A server's series: sent to the server behind (its place is already in `s.reading`). */
    private static void remember(Host host, String chapter, int page, boolean read) {
        long ask = asks.incrementAndGet();
        newest.put(chapter, ask);
        Pages.run(saver, () -> {
            if (newest.get(chapter) != ask) return;
            try { Suwayomi.mark(host, chapter, page, read); }
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
