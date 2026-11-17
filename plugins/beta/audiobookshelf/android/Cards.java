package org.atlas.plugins.audiobookshelf;

import org.atlas.capture.Json;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Audiobookshelf's answers as the native screens draw them, plain Java (CardsTest reads cut-down copies of the server's
 * answers): a library item — minified or expanded, from a shelf, a search, a series, a collection or a playlist — as
 * one Card; the home's shelves (`/api/libraries/<id>/personalized`), the library's series, authors, collections and
 * playlists, search hits, a podcast's episodes, a book's bookmarks. The same rules as the page's shelf.js (`cardOf`,
 * `shelvesOf`, `hitsOf`…), so the phone and the desktop show a book alike.
 */
final class Cards {
    private Cards() {}

    enum Kind { BOOK, SHOW, EPISODE, SERIES, COLLECTION, PLAYLIST, AUTHOR }

    /** One thing a screen lists: a book, a podcast, an episode, or a group of them (a series, a collection, a
     *  playlist, an author's books). */
    static final class Card {
        final Kind kind;
        final String id, title;
        /** An episode's id ("" for anything else). */
        String episode = "";
        String author = "", narrator = "", series = "";
        /** Seconds; 0 unknown. */
        double duration;
        /** 0–1, 1 finished; -1 never begun. */
        double progress = -1;
        /** Where you are (seconds) and when you last listened (ms). */
        double at;
        long lastUsed;
        /** A podcast's episode count; an author's book count. */
        int count;
        /** It carries an ebook (read-along). */
        boolean ebook;
        /** A group's cards (a series' books…); empty for a book. */
        final List<Card> cards = new ArrayList<>();

        Card(Kind kind, String id, String title) { this.kind = kind; this.id = id; this.title = title; }

        boolean group() { return kind == Kind.SERIES || kind == Kind.COLLECTION || kind == Kind.PLAYLIST || kind == Kind.AUTHOR; }

        /** The cover's item: the card's own, a group's first book's. */
        String coverItem() { return group() ? (cards.isEmpty() ? "" : cards.get(0).coverItem()) : id; }

        /** The line under its title: the author, how long, how far (a group: how many). */
        String detail() {
            if (group()) {
                int n = kind == Kind.AUTHOR && cards.isEmpty() ? count : cards.size();
                return n + (kind == Kind.PLAYLIST ? " item" : " book") + (n == 1 ? "" : "s");
            }
            List<String> parts = new ArrayList<>();
            if (kind == Kind.SHOW) { if (!author.isEmpty()) parts.add(author); if (count > 0) parts.add(count + " episode" + (count == 1 ? "" : "s")); return String.join(" · ", parts); }
            if (kind == Kind.EPISODE && !series.isEmpty()) parts.add(series);
            else if (!author.isEmpty()) parts.add(author);
            parts.add(Clock.howFar(progress, duration, at));
            parts.removeIf(String::isEmpty);
            return String.join(" · ", parts);
        }

        @Override public String toString() { return kind.name().toLowerCase(Locale.ROOT) + ":" + id + (episode.isEmpty() ? "" : "/" + episode) + " " + title; }
    }

    /** A titled row of cards (a home shelf, a search's section). */
    static final class Shelf {
        final String id, label;
        final List<Card> cards;
        Shelf(String id, String label, List<Card> cards) { this.id = id; this.label = label; this.cards = cards; }
    }

    // ---- reading the answers ----

    static double dbl(Object o, String key, double or) {
        String v = Json.str(o, key, null);
        if (v == null) return or;
        try { double d = Double.parseDouble(v.trim()); return Double.isFinite(d) ? d : or; } catch (NumberFormatException e) { return or; }
    }

    static String text(Object o, String key) { return Json.str(o, key, ""); }

    /** Where you are in an item (or one episode): the key `/api/me`'s mediaProgress is looked up by. */
    static String progressKey(String item, String episode) { return episode == null || episode.isEmpty() ? item : item + "/" + episode; }

    /** `/api/me`'s mediaProgress by progressKey. */
    static Map<String, Object> progressMap(Object me) {
        Map<String, Object> out = new HashMap<>();
        for (Object p : Json.arr(me, "mediaProgress")) out.put(progressKey(text(p, "libraryItemId"), text(p, "episodeId")), p);
        return out;
    }

    /** Authors, narrators: expanded (`[{name}]`, `["…"]`) or minified (`"A, B"`) → one line. */
    @SuppressWarnings("unchecked")
    static String names(Object v) {
        if (v instanceof String) return ((String) v).trim();
        if (!(v instanceof List)) return "";
        List<String> out = new ArrayList<>();
        for (Object n : (List<Object>) v) {
            String s = n instanceof Map ? text(n, "name") : n instanceof String ? (String) n : "";
            if (!s.trim().isEmpty()) out.add(s.trim());
        }
        return String.join(", ", out);
    }

    @SuppressWarnings("unchecked")
    private static Object field(Object o, String key) { return o instanceof Map ? ((Map<String, Object>) o).get(key) : null; }

    /** The first non-null of the keys. */
    private static Object first(Object o, String... keys) {
        for (String k : keys) { Object v = field(o, k); if (v != null) return v; }
        return null;
    }

    /** The series line: minified `seriesName` ("Dune #1"), else the expanded `series` ([{name, sequence}]). */
    @SuppressWarnings("unchecked")
    static String seriesLine(Object m) {
        String s = text(m, "seriesName");
        if (!s.isEmpty()) return s;
        Object v = field(m, "series");
        Object one = v instanceof List && !((List<Object>) v).isEmpty() ? ((List<Object>) v).get(0) : v instanceof Map ? v : null;
        String name = text(one, "name"), seq = text(one, "sequence");
        return name.isEmpty() ? "" : seq.isEmpty() ? name : name + " #" + seq;
    }

    /** How far a progress entry says: 0–1, 1 finished, -1 never begun. */
    static double howFar(Object p) {
        if (p == null) return -1;
        if (Json.yes(p, "isFinished")) return 1;
        double v = dbl(p, "progress", 0);
        return v > 0 ? Math.min(1, v) : -1;
    }

    /** One card: a book, a podcast or one episode (`episode`, or the item's `recentEpisode`). */
    static Card cardOf(Object item, Map<String, Object> progress, Object episode) {
        Map<String, Object> media = Json.obj(item, "media");
        Map<String, Object> m = Json.obj(media, "metadata");
        String id = text(item, "id");
        if (id.isEmpty()) id = text(item, "libraryItemId");
        boolean show = "podcast".equals(text(item, "mediaType")) || (media.containsKey("episodes") && !media.containsKey("tracks")) || media.get("numEpisodes") instanceof Long;
        Object ep = episode != null ? episode : field(item, "recentEpisode");
        if (ep instanceof Map) {
            Card c = new Card(Kind.EPISODE, id, text(ep, "title"));
            c.episode = text(ep, "id");
            c.series = text(m, "title");
            c.duration = dbl(ep, "duration", 0);
            if (c.duration == 0) c.duration = dbl(Json.obj(ep, "audioFile"), "duration", dbl(Json.obj(ep, "audioTrack"), "duration", 0));
            Object p = progress.get(progressKey(id, c.episode));
            c.progress = howFar(p);
            c.at = dbl(p, "currentTime", 0);
            c.lastUsed = Json.num(p, "lastUpdate", 0);
            return c;
        }
        Object t = field(m, "title");
        Card c = new Card(show ? Kind.SHOW : Kind.BOOK, id, t == null ? id : String.valueOf(t));
        c.author = names(first(m, "authors", "authorName", "author"));
        c.narrator = names(first(m, "narrators", "narratorName"));
        c.series = seriesLine(m);
        c.duration = dbl(media, "duration", 0);
        c.count = show ? (int) Json.num(media, "numEpisodes", Json.arr(media, "episodes").size()) : 0;
        c.ebook = field(media, "ebookFile") != null || !text(media, "ebookFormat").isEmpty();
        Object p = progress.get(id);
        c.progress = howFar(p);
        c.at = dbl(p, "currentTime", 0);
        c.lastUsed = Json.num(p, "lastUpdate", 0);
        return c;
    }

    private static Card group(Kind kind, Object id, Object title, List<Card> cards) {
        Card g = new Card(kind, id == null ? "" : String.valueOf(id), title == null ? "" : String.valueOf(title));
        g.cards.addAll(cards);
        return g;
    }

    private static List<Card> books(Object o, String key, Map<String, Object> progress) {
        List<Card> out = new ArrayList<>();
        for (Object b : Json.arr(o, key)) out.add(cardOf(b, progress, null));
        return out;
    }

    /** `/api/libraries/<id>/personalized` (an array) → shelves of books, podcasts, episodes or series; authors' shelves
     *  and empty ones left out (as the page does). */
    @SuppressWarnings("unchecked")
    static List<Shelf> shelvesOf(Object personalized, Map<String, Object> progress) {
        List<Shelf> out = new ArrayList<>();
        if (!(personalized instanceof List)) return out;
        for (Object s : (List<Object>) personalized) {
            String type = text(s, "type");
            List<Card> cards = new ArrayList<>();
            for (Object x : Json.arr(s, "entities")) {
                if ("series".equals(type)) cards.add(group(Kind.SERIES, field(x, "id"), field(x, "name"), books(x, "books", progress)));
                else if ("book".equals(type) || "podcast".equals(type) || "episode".equals(type)) cards.add(cardOf(x, progress, null));
            }
            String label = text(s, "label");
            if (!cards.isEmpty()) out.add(new Shelf(text(s, "id"), label.isEmpty() ? text(s, "id") : label, cards));
        }
        return out;
    }

    /** `/api/libraries/<id>/series` → series, their books inside. */
    static List<Card> seriesOf(Object answer, Map<String, Object> progress) {
        List<Card> out = new ArrayList<>();
        for (Object s : Json.arr(answer, "results")) out.add(group(Kind.SERIES, field(s, "id"), field(s, "name"), books(s, "books", progress)));
        return out;
    }

    /** `/api/libraries/<id>/authors` (`{authors}`, or `{results}` on some versions) → authors, each with its book count
     *  (its books asked when opened: `/api/authors/<id>?include=items`). */
    static List<Card> authorsOf(Object answer) {
        List<Object> all = Json.arr(answer, "authors");
        if (all.isEmpty()) all = Json.arr(answer, "results");
        List<Card> out = new ArrayList<>();
        for (Object a : all) {
            Card c = group(Kind.AUTHOR, field(a, "id"), field(a, "name"), new ArrayList<>());
            c.count = (int) Json.num(a, "numBooks", 0);
            out.add(c);
        }
        return out;
    }

    /** `/api/authors/<id>?include=items` → the author's books. */
    static List<Card> authorBooks(Object answer, Map<String, Object> progress) { return books(answer, "libraryItems", progress); }

    /** `/api/libraries/<id>/collections` → collections of books (empty ones left out). */
    static List<Card> collectionsOf(Object answer, Map<String, Object> progress) {
        List<Card> out = new ArrayList<>();
        for (Object c : Json.arr(answer, "results")) {
            Card g = group(Kind.COLLECTION, field(c, "id"), field(c, "name"), books(c, "books", progress));
            if (!g.cards.isEmpty()) out.add(g);
        }
        return out;
    }

    /** `/api/libraries/<id>/playlists` → playlists: books and episodes in the playlist's order. */
    static List<Card> playlistsOf(Object answer, Map<String, Object> progress) {
        List<Card> out = new ArrayList<>();
        for (Object p : Json.arr(answer, "results")) {
            List<Card> cards = new ArrayList<>();
            for (Object x : Json.arr(p, "items")) {
                Object it = field(x, "libraryItem");
                if (it != null) cards.add(cardOf(it, progress, field(x, "episode")));
            }
            Card g = group(Kind.PLAYLIST, field(p, "id"), field(p, "name"), cards);
            if (!g.cards.isEmpty()) out.add(g);
        }
        return out;
    }

    /** `/api/libraries/<id>/items` → its books (or podcasts), and `total` in `total[0]` when given. */
    static List<Card> itemsOf(Object answer, Map<String, Object> progress, long[] total) {
        if (total != null && total.length > 0) total[0] = Json.num(answer, "total", 0);
        return books(answer, "results", progress);
    }

    /** `/api/libraries/<id>/search` → shelves: the books and podcasts found, the series, the authors. */
    static List<Shelf> hitsOf(Object answer, Map<String, Object> progress) {
        List<Card> cards = new ArrayList<>(), groups = new ArrayList<>();
        for (String k : new String[] { "book", "podcast" }) for (Object h : Json.arr(answer, k)) { Object it = field(h, "libraryItem"); if (it != null) cards.add(cardOf(it, progress, null)); }
        for (Object s : Json.arr(answer, "series")) {
            Card g = group(Kind.SERIES, field(Json.obj(s, "series"), "id"), field(Json.obj(s, "series"), "name"), books(s, "books", progress));
            if (!g.cards.isEmpty()) groups.add(g);
        }
        List<Shelf> out = new ArrayList<>();
        if (!cards.isEmpty()) out.add(new Shelf("found", "Books and podcasts", cards));
        if (!groups.isEmpty()) out.add(new Shelf("series", "Series", groups));
        List<Card> authors = authorsOf(java.util.Collections.singletonMap("authors", Json.arr(answer, "authors")));
        if (!authors.isEmpty()) out.add(new Shelf("authors", "Authors", authors));
        return out;
    }

    /** Several libraries' shelves of one search made one: the same section's cards together, in the first's order. */
    static List<Shelf> merged(List<List<Shelf>> parts) {
        Map<String, Shelf> by = new java.util.LinkedHashMap<>();
        for (List<Shelf> p : parts) for (Shelf s : p) {
            Shelf had = by.get(s.id);
            if (had == null) by.put(s.id, new Shelf(s.id, s.label, new ArrayList<>(s.cards)));
            else had.cards.addAll(s.cards);
        }
        return new ArrayList<>(by.values());
    }

    /** A podcast's episodes (its expanded item's `media.episodes`), newest first. */
    static List<Card> episodesOf(Object item, Map<String, Object> progress) {
        List<Object> eps = new ArrayList<>(Json.arr(Json.obj(item, "media"), "episodes"));
        eps.sort((p, q) -> {
            int by = Long.compare(Json.num(q, "publishedAt", 0), Json.num(p, "publishedAt", 0));
            return by != 0 ? by : Long.compare(Json.num(q, "index", 0), Json.num(p, "index", 0));
        });
        List<Card> out = new ArrayList<>();
        for (Object e : eps) out.add(cardOf(item, progress, e));
        return out;
    }

    /** A bookmark of a book: where (seconds) and its note. */
    static final class Mark {
        final double time;
        final String title;
        Mark(double time, String title) { this.time = time; this.title = title; }
    }

    /** An item's bookmarks from `/api/me` (`bookmarks: [{libraryItemId, time, title}]`), in the book's order. */
    static List<Mark> bookmarksOf(Object me, String item) {
        List<Mark> out = new ArrayList<>();
        for (Object b : Json.arr(me, "bookmarks")) if (item.equals(text(b, "libraryItemId"))) out.add(new Mark(dbl(b, "time", 0), text(b, "title")));
        out.sort((p, q) -> Double.compare(p.time, q.time));
        return out;
    }

    /** The cards whose title, author, narrator or series hold `q` (no case), for the library's filter. */
    static List<Card> filter(List<Card> cards, String q) {
        String n = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        if (n.isEmpty()) return new ArrayList<>(cards);
        List<Card> out = new ArrayList<>();
        for (Card c : cards) if ((c.title + "\n" + c.author + "\n" + c.narrator + "\n" + c.series).toLowerCase(Locale.ROOT).contains(n)) out.add(c);
        return out;
    }
}
