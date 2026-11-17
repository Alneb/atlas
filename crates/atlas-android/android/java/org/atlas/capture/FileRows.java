package org.atlas.capture;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/**
 * The Files screen's rules as plain data (no Android: FileRowsTest, android/test/run.sh): a folder's entries as the
 * core's `/api/tree` lists them made into a list's sections, a file's icon and detail, the breadcrumbs of a folder,
 * and a rename that keeps the extension the phone does not show. FilesScreen reads the tree and draws what this says;
 * the order is the core's (folders first, by name), never re-sorted here.
 */
final class FileRows {
    private FileRows() {}

    /** One entry of `/api/tree` (core api.rs TreeEntry). */
    static final class Entry {
        final String name, path;
        final boolean dir;
        /** Bytes (-1: unknown, a folder) and the last change in seconds since 1970 (0: unknown). */
        final long size, modified;
        /** On the ignore list; a companion note the tree hides (`shown: false`). */
        final boolean ignored, unshown;

        Entry(String name, String path, boolean dir, long size, long modified, boolean ignored, boolean unshown) {
            this.name = name; this.path = path; this.dir = dir; this.size = size; this.modified = modified;
            this.ignored = ignored; this.unshown = unshown;
        }
    }

    /** The list for a folder: a "Folders" section, then a "Files" one (a header only when both have lines). `shown`
     *  names a file as the app does (Look.shownName: a note without its extension); `now`, `zone` and `locale` date
     *  the details. Companion notes the tree hides stay hidden, as on the desktop. */
    static List<PlaceItem> rows(List<Entry> entries, Function<String, String> shown, long now, ZoneId zone, Locale locale) {
        List<PlaceItem> folders = new ArrayList<>(), files = new ArrayList<>();
        for (Entry e : entries) {
            if (e.unshown) continue;
            PlaceItem r = PlaceItem.row(e.dir ? e.name : shown.apply(e.path));
            r.path = e.path;
            r.folder = e.dir;
            r.icon = icon(e.name, e.dir);
            r.detail = e.dir ? "" : detail(e, now, zone, locale);
            r.dim = e.ignored;
            r.more = true;
            (e.dir ? folders : files).add(r);
        }
        List<PlaceItem> out = new ArrayList<>();
        boolean both = !folders.isEmpty() && !files.isEmpty();
        if (both) out.add(PlaceItem.header("Folders"));
        out.addAll(folders);
        if (both) out.add(PlaceItem.header("Files"));
        out.addAll(files);
        return out;
    }

    /** A Look.icon name for a file by its kind (the names phone.rs checks are drawn). */
    static String icon(String name, boolean dir) {
        if (dir) return "vault";
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".excalidraw") || n.endsWith(".excalidraw.md")) return "pen";
        if (n.matches(".*\\.(md|markdown|txt|page)$")) return "note";
        if (n.matches(".*\\.(png|jpe?g|gif|webp|svg|avif|jxl|bmp|heic)$")) return "image";
        if (n.endsWith(".pdf")) return "pages";
        if (n.matches(".*\\.(epub|cbz|cbr|mobi|azw3?)$")) return "library";
        if (n.matches(".*\\.(mp3|m4a|m4b|ogg|oga|opus|flac|wav|aac|mp4|mkv|webm|mov|avi)$")) return "music";
        if (n.matches(".*\\.(base|csv|tsv|xlsx|ods)$")) return "grid";
        return "text";
    }

    /** A file's supporting line: when it last changed, then its size ("14:05 · 2.4 KB"). */
    static String detail(Entry e, long now, ZoneId zone, Locale locale) {
        String when = e.modified > 0 ? when(e.modified, now, zone, locale) : "";
        String size = e.size >= 0 ? size(e.size) : "";
        return when.isEmpty() ? size : size.isEmpty() ? when : when + " · " + size;
    }

    /** Bytes as a person reads them: "812 B", "4.2 KB", "13 MB" (1024 steps, one decimal under ten). */
    static String size(long bytes) {
        if (bytes < 1024) return bytes + " B";
        String[] units = { "KB", "MB", "GB", "TB" };
        double v = bytes;
        int u = -1;
        while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
        return (v < 10 ? String.format(Locale.ROOT, "%.1f", v) : String.valueOf(Math.round(v))) + " " + units[u];
    }

    /** A change's time: the hour today, the day this year, the day and year before. */
    static String when(long seconds, long now, ZoneId zone, Locale locale) {
        ZonedDateTime t = Instant.ofEpochSecond(seconds).atZone(zone);
        LocalDate today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        String pattern = t.toLocalDate().equals(today) ? "HH:mm" : t.getYear() == today.getYear() ? "d MMM" : "d MMM yyyy";
        return DateTimeFormatter.ofPattern(pattern, locale).format(t);
    }

    /** A folder's way back to the vault's top, as breadcrumbs: (label, folder) from the top (`root`, the vault's name,
     *  for "") down to `dir` itself. */
    static List<String[]> crumbs(String dir, String root) {
        List<String[]> out = new ArrayList<>();
        out.add(new String[] { root, "" });
        String d = clean(dir);
        if (d.isEmpty()) return out;
        StringBuilder at = new StringBuilder();
        for (String part : d.split("/")) {
            if (at.length() > 0) at.append('/');
            at.append(part);
            out.add(new String[] { part, at.toString() });
        }
        return out;
    }

    /** The folder holding `path` ("" at the vault's top). */
    static String parent(String path) {
        String p = clean(path);
        int i = p.lastIndexOf('/');
        return i < 0 ? "" : p.substring(0, i);
    }

    /** A vault path without the slashes around it. */
    static String clean(String path) { return path == null ? "" : path.replaceAll("^/+|/+$", ""); }

    /** Where `path` goes when renamed to `typed` in its folder, or null (empty, a slash, unchanged). A name typed as
     *  the phone shows it keeps the extension it hides (ui/src/lib/paths.ts `keepExt`, the page's rename the same). */
    static String renamed(String path, String typed, Function<String, String> shown) {
        String name = typed == null ? "" : typed.trim();
        if (name.isEmpty() || name.contains("/")) return null;
        String p = clean(path);
        String base = p.substring(p.lastIndexOf('/') + 1);
        String ext = base.substring(shown.apply(p).length());
        String full = ext.isEmpty() || name.toLowerCase(Locale.ROOT).endsWith(ext.toLowerCase(Locale.ROOT)) ? name : name + ext;
        String dir = parent(p);
        String to = dir.isEmpty() ? full : dir + "/" + full;
        return to.equals(p) ? null : to;
    }
}
