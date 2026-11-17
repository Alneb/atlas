package org.atlas.plugins.manga;

import org.atlas.capture.Json;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Browse, as plain data (no Android: BrowseTest, android/test/run.sh): the Suwayomi GraphQL it asks — the installed
 * sources, a source's popular / latest / search pages (`fetchSourceManga`), a series' details (fetched from its source
 * once when the server has only what a listing gave), adding to and removing from the library (`updateManga`'s
 * `inLibrary`) and its categories (`updateMangaCategories`), the categories in the server's own order — what its answers
 * mean, and the paging of a source's results as the grid scrolls. Suwayomi.java sends; SourcesView, SourceView and
 * SeriesView draw.
 *
 * Names are Suwayomi's GraphQL schema's (the server's introspection): a source's id is a LongString (sent as text),
 * `inLibrary` is per user (`MangaType.user`), `fetchSourceManga` is a mutation answering `{mangas, hasNextPage}`.
 */
final class Browse {
    private Browse() {}

    /** What a source lists: its popular series, its latest updates, or what a search finds. */
    enum Type { POPULAR, LATEST, SEARCH }

    // ---- the questions ----

    static final String SOURCES = "{ sources { nodes { id name lang displayName iconUrl isNsfw supportsLatest } } }";

    static final String FETCH = "mutation($source: LongString!, $type: FetchSourceMangaType!, $page: Int!, $query: String) "
        + "{ fetchSourceManga(input: {source: $source, type: $type, page: $page, query: $query}) { hasNextPage mangas { id title thumbnailUrl user { inLibrary } } } }";

    /** A series' fields for its screen. */
    private static final String SERIES = "id title thumbnailUrl author artist description genre status realUrl initialized "
        + "source { displayName } user { inLibrary } categories { nodes { id name default } } chapters { totalCount }";

    static final String DETAILS = "query($id: Int!) { manga(id: $id) { " + SERIES + " } }";

    /** The series' details and/or chapters fetched from its source by the server (a series a listing found has neither). */
    static final String FILL = "mutation($id: Int!, $manga: Boolean!, $chapters: Boolean!) "
        + "{ fetchMangaAndChapters(input: {id: $id, fetchManga: $manga, fetchChapters: $chapters}) { manga { " + SERIES + " } } }";

    static final String SET_IN_LIBRARY = "mutation($id: Int!, $inLibrary: Boolean!) { updateManga(input: {id: $id, patch: {inLibrary: $inLibrary}}) { clientMutationId } }";

    static final String SET_CATEGORIES = "mutation($id: Int!, $add: [Int!], $remove: [Int!]) "
        + "{ updateMangaCategories(input: {id: $id, patch: {addToCategories: $add, removeFromCategories: $remove}}) { clientMutationId } }";

    /** The categories, asked beside the library (Suwayomi.library) and alone (the Add to library choice). */
    static final String CATEGORIES_FIELD = "categories { nodes { id name order default } }";
    static final String CATEGORIES = "{ " + CATEGORIES_FIELD + " }";

    static Map<String, Object> fetchVars(String source, Type type, int page, String query) {
        Map<String, Object> v = new HashMap<>();
        v.put("source", source);
        v.put("type", type.name());
        v.put("page", page);
        if (type == Type.SEARCH) v.put("query", query == null ? "" : query.trim());
        return v;
    }

    static Map<String, Object> idVars(int id) {
        Map<String, Object> v = new HashMap<>();
        v.put("id", id);
        return v;
    }

    /** What FILL asks for: the details when the server has only a listing's (`initialized` false), the chapters when it
     *  lists none; null when it has both (nothing to fetch). */
    static Map<String, Object> fillVars(Details d) {
        if (d.initialized && d.chapters > 0) return null;
        Map<String, Object> v = idVars(d.id);
        v.put("manga", !d.initialized);
        v.put("chapters", d.chapters == 0);
        return v;
    }

    static Map<String, Object> inLibraryVars(int id, boolean in) {
        Map<String, Object> v = idVars(id);
        v.put("inLibrary", in);
        return v;
    }

    static Map<String, Object> categoryVars(int id, List<Integer> add, List<Integer> remove) {
        Map<String, Object> v = idVars(id);
        v.put("add", add);
        v.put("remove", remove);
        return v;
    }

    // ---- the answers ----

    /** The server answered with an error of its own (it was reached); the message as it gave it. */
    static final class Refused extends IOException {
        Refused(String message) { super(message); }
    }

    /** A GraphQL answer's `data`; its first error as Refused. */
    static Map<String, Object> data(String answer) throws IOException {
        Object o;
        try { o = Json.parse(answer); } catch (IllegalArgumentException e) { throw new IOException("Suwayomi answered something else: " + e.getMessage()); }
        List<Object> errors = Json.arr(o, "errors");
        if (!errors.isEmpty()) throw new Refused(Json.str(errors.get(0), "message", "an error"));
        return Json.obj(o, "data");
    }

    /** An installed source. */
    static final class Source {
        /** Its id (a LongString: more than an int), its name, its language code, its name with the language. */
        final String id, name, lang, displayName;
        String icon;
        boolean nsfw, latest;
        Source(String id, String name, String lang, String displayName) { this.id = id; this.name = name; this.lang = lang; this.displayName = displayName; }
        @Override public String toString() { return displayName; }
    }

    static List<Source> sources(Map<String, Object> data) {
        List<Source> out = new ArrayList<>();
        for (Object n : Json.arr(Json.obj(data, "sources"), "nodes")) {
            String id = Json.str(n, "id", null);
            if (id == null) continue;
            String name = Json.str(n, "name", id);
            Source s = new Source(id, name, Json.str(n, "lang", ""), Json.str(n, "displayName", name));
            s.icon = Json.str(n, "iconUrl", null);
            s.nsfw = Json.yes(n, "isNsfw");
            s.latest = Json.yes(n, "supportsLatest");
            out.add(s);
        }
        return out;
    }

    /** Suwayomi's Local source's language (the server's own folder of manga). */
    static final String LOCAL = "localsourcelang";

    /** A language's heading in the sources list. */
    static String language(String code) {
        if ("all".equals(code)) return "All languages";
        if ("multi".equals(code)) return "Several languages";
        if (LOCAL.equals(code) || code.isEmpty()) return "On the server";
        String name = Locale.forLanguageTag(code).getDisplayName(Locale.ENGLISH);
        return name.isEmpty() || name.equalsIgnoreCase(code) ? code : name;
    }

    /** The sources list's rows, matching `filter` (words of the name, any case): a language's heading (a String) then
     *  its sources (Source) by name — the phone's language first (`mine`, a code such as "en"), then the ones that span
     *  languages, then the others by heading, the server's own folder last. */
    static List<Object> rows(List<Source> sources, String filter, String mine) {
        Map<String, List<Source>> by = new HashMap<>();
        for (Source s : sources) if (matches(s, filter)) by.computeIfAbsent(s.lang, k -> new ArrayList<>()).add(s);
        List<String> langs = new ArrayList<>(by.keySet());
        langs.sort((a, b) -> {
            int x = rank(a, mine), y = rank(b, mine);
            return x != y ? Integer.compare(x, y) : language(a).compareToIgnoreCase(language(b));
        });
        List<Object> out = new ArrayList<>();
        for (String l : langs) {
            out.add(language(l));
            List<Source> in = by.get(l);
            in.sort((a, b) -> Shelf.natural(a.displayName, b.displayName));
            out.addAll(in);
        }
        return out;
    }

    private static int rank(String lang, String mine) {
        String base = lang.replaceFirst("[-_].*$", "");
        if (mine != null && !mine.isEmpty() && base.equalsIgnoreCase(mine)) return 0;
        if ("all".equals(lang) || "multi".equals(lang)) return 1;
        if (LOCAL.equals(lang) || lang.isEmpty()) return 3;
        return 2;
    }

    private static boolean matches(Source s, String filter) {
        if (filter == null || filter.trim().isEmpty()) return true;
        String t = (s.displayName + " " + s.name).toLowerCase(Locale.ROOT);
        for (String w : filter.toLowerCase(Locale.ROOT).trim().split("\\s+")) if (!t.contains(w)) return false;
        return true;
    }

    /** A series a source listed (the server keeps it under this id from then on). */
    static final class Found {
        final int id;
        final String title, cover;
        boolean inLibrary;
        Found(int id, String title, String cover) { this.id = id; this.title = title; this.cover = cover; }
        String key() { return Transition.SERVER + id; }
        @Override public String toString() { return title; }
    }

    /** One page of a source's results. */
    static final class Page {
        final List<Found> mangas = new ArrayList<>();
        boolean hasNext;
    }

    static Page page(Map<String, Object> data) {
        Map<String, Object> f = Json.obj(data, "fetchSourceManga");
        Page p = new Page();
        p.hasNext = Json.yes(f, "hasNextPage");
        for (Object m : Json.arr(f, "mangas")) {
            long id = Json.num(m, "id", 0);
            if (id <= 0) continue;
            Found x = new Found((int) id, Json.str(m, "title", ""), Json.str(m, "thumbnailUrl", null));
            x.inLibrary = Json.yes(Json.obj(m, "user"), "inLibrary");
            p.mangas.add(x);
        }
        return p;
    }

    /** A series' details, as its screen shows them. */
    static final class Details {
        int id;
        String title = "", cover, author = "", artist = "", description = "", status = "", url = "", source = "";
        final List<String> genres = new ArrayList<>();
        boolean initialized, inLibrary;
        /** How many chapters the server lists for it (0: none fetched yet). */
        long chapters;
        /** The categories it is in, by id (the server's default one left out). */
        final Set<Integer> categories = new HashSet<>();
    }

    /** The series in `data.manga` (DETAILS) or `data.fetchMangaAndChapters.manga` (FILL). */
    static Details details(Map<String, Object> data) {
        Map<String, Object> m = data.containsKey("manga") ? Json.obj(data, "manga") : Json.obj(Json.obj(data, "fetchMangaAndChapters"), "manga");
        Details d = new Details();
        d.id = (int) Json.num(m, "id", 0);
        d.title = Json.str(m, "title", "");
        d.cover = Json.str(m, "thumbnailUrl", null);
        d.author = Json.str(m, "author", "");
        d.artist = Json.str(m, "artist", "");
        d.description = Json.str(m, "description", "").trim();
        d.status = status(Json.str(m, "status", ""));
        d.url = Json.str(m, "realUrl", "");
        d.source = Json.str(Json.obj(m, "source"), "displayName", "");
        d.initialized = Json.yes(m, "initialized");
        d.inLibrary = Json.yes(Json.obj(m, "user"), "inLibrary");
        d.chapters = Json.num(Json.obj(m, "chapters"), "totalCount", 0);
        for (Object g : Json.arr(m, "genre")) if (g != null && !String.valueOf(g).trim().isEmpty()) d.genres.add(String.valueOf(g).trim());
        for (Object c : Json.arr(Json.obj(m, "categories"), "nodes")) if (!Json.yes(c, "default")) d.categories.add((int) Json.num(c, "id", 0));
        return d;
    }

    /** Suwayomi's MangaStatus in words ("ON_HIATUS" → "On hiatus"; UNKNOWN: ""). */
    static String status(String s) {
        if (s == null || s.isEmpty() || "UNKNOWN".equals(s)) return "";
        String w = s.toLowerCase(Locale.ROOT).replace('_', ' ');
        return Character.toUpperCase(w.charAt(0)) + w.substring(1);
    }

    /** The line under a series' title: who made it, how it stands, where it is from. */
    static String byline(Details d) {
        List<String> bits = new ArrayList<>();
        String who = d.author;
        if (!d.artist.isEmpty() && !d.artist.equals(d.author)) who = who.isEmpty() ? d.artist : who + ", " + d.artist;
        if (!who.isEmpty()) bits.add(who);
        if (!d.status.isEmpty()) bits.add(d.status);
        if (!d.source.isEmpty()) bits.add(d.source);
        return String.join(" · ", bits);
    }

    // ---- categories ----

    /** A category of the server's library. */
    static final class Category {
        final int id, order;
        final String name;
        final boolean isDefault;
        Category(int id, String name, int order, boolean isDefault) { this.id = id; this.name = name; this.order = order; this.isDefault = isDefault; }
        @Override public String toString() { return name; }
    }

    /** The categories in the server's order (its `order`, then id), its own default one left out. */
    static List<Category> categories(Map<String, Object> data) {
        List<Category> out = new ArrayList<>();
        for (Object n : Json.arr(Json.obj(data, "categories"), "nodes")) {
            if (Json.yes(n, "default")) continue;
            out.add(new Category((int) Json.num(n, "id", 0), Json.str(n, "name", ""), (int) Json.num(n, "order", 0), false));
        }
        out.sort((a, b) -> a.order != b.order ? Integer.compare(a.order, b.order) : Integer.compare(a.id, b.id));
        return out;
    }

    /** The categories' names, in order: the library's tabs follow it (Shelf.tabs). */
    static List<String> names(List<Category> cats) {
        List<String> out = new ArrayList<>();
        for (Category c : cats) out.add(c.name);
        return out;
    }

    /** From the categories a series is in to the ones chosen: {to add, to remove}, each by id, in id order. */
    static List<List<Integer>> change(Set<Integer> had, Set<Integer> want) {
        List<Integer> add = new ArrayList<>(), remove = new ArrayList<>();
        for (int c : want) if (!had.contains(c)) add.add(c);
        for (int c : had) if (!want.contains(c)) remove.add(c);
        add.sort(null);
        remove.sort(null);
        List<List<Integer>> out = new ArrayList<>();
        out.add(add);
        out.add(remove);
        return out;
    }

    // ---- a source's results, page by page ----

    /**
     * A source's grid as it scrolls: the pages asked one at a time, the next asked when the grid comes within `AHEAD`
     * tiles of its end, a series listed twice (a source's pages overlap as its list moves) shown once, the end when the
     * source says so or a page brings nothing new (a source that repeats its last page). A new list (another kind, a new
     * search) starts again and an answer to the old one is dropped.
     */
    static final class Paging {
        static final int AHEAD = 12;
        Type type = Type.POPULAR;
        String query = "";
        final List<Found> items = new ArrayList<>();
        private final Set<Integer> ids = new HashSet<>();
        /** The last page added (0: none), whether there are more, whether one is being asked. */
        int page;
        boolean more = true, loading;
        /** Which list an answer belongs to (each new list a new one). */
        private int generation;

        /** A new list: `type`, and for a search its words. */
        void reset(Type type, String query) {
            this.type = type;
            this.query = query == null ? "" : query.trim();
            items.clear();
            ids.clear();
            page = 0;
            more = type != Type.SEARCH || !this.query.isEmpty();
            loading = false;
            generation++;
        }

        /** The grid shows up to tile `last`: is the next page to be asked now? */
        boolean wants(int last) { return more && !loading && last >= items.size() - AHEAD; }

        /** The next page is being asked: its ticket, to hand back with its answer. */
        int[] ask() {
            loading = true;
            return new int[] { generation, page + 1 };
        }

        /** A page came for `ticket`: its new series added → how many (-1: the answer was for an older list, dropped). */
        int add(int[] ticket, Page p) {
            if (ticket[0] != generation || ticket[1] != page + 1) return -1;
            loading = false;
            page = ticket[1];
            int added = 0;
            for (Found f : p.mangas) if (ids.add(f.id)) { items.add(f); added++; }
            more = p.hasNext && added > 0;
            return added;
        }

        /** The page for `ticket` failed: it may be asked again (a scroll, a pull). */
        void failed(int[] ticket) { if (ticket[0] == generation) loading = false; }
    }

    // ---- the library's own copy ----

    /** The categories kept with the library (Kept.library's `categories`), the same shape as the server's answer. */
    static List<Category> keptCategories(String keptLibrary) {
        if (keptLibrary == null) return new ArrayList<>();
        try {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("categories", Json.obj(Json.parse(keptLibrary), "categories"));
            return categories(m);
        } catch (IllegalArgumentException spoilt) { return new ArrayList<>(); }
    }
}
