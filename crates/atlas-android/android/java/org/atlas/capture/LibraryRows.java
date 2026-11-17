package org.atlas.capture;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The phone's Library as plain data (no Android: LibraryRowsTest, android/test/run.sh). The vault's libraries and their
 * things come from the core (`GET /api/libraries`, `GET /api/library?id=`, libraries.rs: what is in a library, its
 * order and its Continue row are decided there); this reads those answers, says which libraries the phone shows (a
 * folder's or a Base's, not hidden — a library a plugin gives is the page's), narrows the things to what is typed, and
 * words their lines. LibraryScreen draws what this says.
 */
final class LibraryRows {
    private LibraryRows() {}

    /** One of the vault's libraries (core LibraryInfo). */
    static final class Lib {
        final String id, title, kind, layout, sort;
        Lib(String id, String title, String kind, String layout, String sort) {
            this.id = id; this.title = title; this.kind = kind; this.layout = layout; this.sort = sort;
        }
        boolean covers() { return !"list".equals(layout); }
    }

    /** One thing of a library (core LibraryThing). */
    static final class Thing {
        final String path, title, sub, cover, note;
        /** 0–1, or -1: not said. */
        final double progress;
        final long lastRead;
        Thing(String path, String title, String sub, String cover, String note, double progress, long lastRead) {
            this.path = path; this.title = title; this.sub = sub; this.cover = cover; this.note = note; this.progress = progress; this.lastRead = lastRead;
        }
    }

    /** A library with its things and what is under way, as the core sent it. */
    static final class View {
        final Lib lib;
        final List<Thing> continuing, items;
        View(Lib lib, List<Thing> continuing, List<Thing> items) { this.lib = lib; this.continuing = continuing; this.items = items; }
    }

    /** A plugin's own app the Library lists after the vault's libraries (Manga's, Audiobookshelf's): its server's
     *  things are never mixed with the vault's. */
    static final class App {
        /** `icon`: the app's icon name — its launcher entry's (`[android] launcher = { icon = … }`), else "server". */
        final String id, title, address, icon;
        App(String id, String title, String address, String icon) { this.id = id; this.title = title; this.address = address; this.icon = icon; }
    }

    /** The libraries the phone shows, in the vault's order (`GET /api/libraries`): a folder's or a Base's, not hidden. */
    static List<Lib> libraries(String json) {
        List<Lib> out = new ArrayList<>();
        Object all = Json.parse(json);
        if (!(all instanceof List)) return out;
        for (Object l : (List<?>) all) {
            if (Json.yes(l, "hidden") || "given".equals(Json.str(l, "source", ""))) continue;
            out.add(lib(l));
        }
        return out;
    }

    private static Lib lib(Object l) {
        return new Lib(Json.str(l, "id", ""), Json.str(l, "title", ""), Json.str(l, "kind", "any"), Json.str(l, "layout", "covers"), Json.str(l, "sort", ""));
    }

    /** A library's answer (`GET /api/library?id=`). */
    static View view(String json) {
        Object v = Json.parse(json);
        return new View(lib(Json.obj(v, "library")), things(Json.arr(v, "continue")), things(Json.arr(v, "items")));
    }

    private static List<Thing> things(List<Object> a) {
        List<Thing> out = new ArrayList<>();
        for (Object t : a) {
            String p = Json.str(t, "progress", null);
            double progress = -1;
            try { if (p != null) progress = Double.parseDouble(p); } catch (NumberFormatException e) { /* not said */ }
            out.add(new Thing(Json.str(t, "path", ""), Json.str(t, "title", ""), Json.str(t, "sub", ""), Json.str(t, "cover", null),
                Json.str(t, "note", null), progress, Json.num(t, "last_read", 0)));
        }
        return out;
    }

    /** The things whose title, line or path hold every word typed (any case). */
    static List<Thing> matching(List<Thing> all, String query) {
        String[] words = query == null ? new String[0] : query.trim().toLowerCase(Locale.ROOT).split("\\s+");
        List<Thing> out = new ArrayList<>();
        for (Thing t : all) {
            String hay = (t.title + " " + t.sub + " " + t.path).toLowerCase(Locale.ROOT);
            boolean all_ = true;
            for (String w : words) if (!w.isEmpty() && !hay.contains(w)) { all_ = false; break; }
            if (all_) out.add(t);
        }
        return out;
    }

    /** A thing's second line: its author or folder, then how far ("Frank Herbert · 42 %"; "Finished" at the end). */
    static String detail(Thing t) {
        String far = t.progress >= 1 ? "Finished" : t.progress > 0 ? Math.round(t.progress * 100) + " %" : "";
        return t.sub.isEmpty() ? far : far.isEmpty() ? t.sub : t.sub + " · " + far;
    }

    /** The orders a screen can pick, as the core reads them, and their names. */
    static final String[][] SORTS = { { "", "Title" }, { "-last_read", "Last read" }, { "-modified", "Changed" } };

    /** The order after `sort` (the library's own first time round). */
    static String nextSort(String sort) {
        for (int i = 0; i < SORTS.length; i++) if (SORTS[i][0].equals(sort == null ? "" : sort)) return SORTS[(i + 1) % SORTS.length][0];
        return SORTS[0][0];
    }

    static String sortName(String sort) {
        for (String[] s : SORTS) if (s[0].equals(sort == null ? "" : sort)) return s[1];
        return "Title";
    }

    /** The phone's icon for a library's kind (one of the icons the app draws). */
    static String icon(String kind) {
        switch (kind == null ? "" : kind) {
            case "notes": return "notes";
            case "books": return "library";
            case "comics": case "papers": return "pages";
            case "audio": return "music";
            case "video": case "pictures": return "image";
            case "drawings": return "pen";
            default: return "vault";
        }
    }

    /** A plugin's own app, when it has one: a native side that opens `<id>:library` (its server's library, as Manga's and
     *  Audiobookshelf's do), named by its manifest's title. Null: none. */
    static App app(String id, java.util.function.Predicate<String> opens, String manifest) {
        String address = id + ":library";
        if (!opens.test(address)) return null;
        String title = id.isEmpty() ? id : Character.toUpperCase(id.charAt(0)) + id.substring(1);
        if (manifest != null) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?m)^title\\s*=\\s*\"([^\"]+)\"").matcher(manifest);
            if (m.find()) title = m.group(1);
        }
        String icon = "server";
        if (manifest != null) {
            // its launcher icon's label and icon, when it has one: the name and picture it has on the home screen
            java.util.regex.Matcher l = java.util.regex.Pattern.compile("(?m)^launcher\\s*=\\s*\\{([^}]*)\\}").matcher(manifest);
            if (l.find()) {
                java.util.regex.Matcher lab = java.util.regex.Pattern.compile("label\\s*=\\s*\"([^\"]+)\"").matcher(l.group(1));
                java.util.regex.Matcher ic = java.util.regex.Pattern.compile("icon\\s*=\\s*\"([^\"]+)\"").matcher(l.group(1));
                if (lab.find()) title = lab.group(1);
                if (ic.find()) icon = ic.group(1);
            }
        }
        return new App(id, title, address, icon);
    }

    /** Which library to show: the one asked (still there), else the first; null: none. */
    static Lib pick(List<Lib> libs, String want) {
        for (Lib l : libs) if (l.id.equals(want)) return l;
        return libs.isEmpty() ? null : libs.get(0);
    }
}
