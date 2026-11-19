package org.atlas.plugins.manga;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The native library's rules as plain data (no Android: ShelfTest, android/test/run.sh): which tabs the library has
 * (Reading, the Suwayomi server's categories, the vault's folder), what each tab lists, and where a series' Continue
 * button opens. LibraryView and SeriesView draw what this decides.
 */
final class Shelf {
    private Shelf() {}

    /** Where a series lives: a folder of the vault's manga folder, or the user's Suwayomi library. */
    enum Origin { VAULT, SERVER }

    /** The tab of what was started, newest first (Mihon's history, as a tab of the library). */
    static final String READING = "Reading";
    /** The tab of the vault's own series (the manga folder). */
    static final String VAULT = "In the vault";
    /** Suwayomi's own category for series in none (its "Default"). */
    static final String DEFAULT = "Default";

    /** A series as the library lists it. */
    static final class Item {
        /** The vault folder (or loose .cbz) path, or `suwayomi:<manga id>`. */
        final String key, title;
        final Origin origin;
        /** The server's categories it is in (its default one left out); none for the vault's. */
        final List<String> categories = new ArrayList<>();
        /** How many chapters (-1: not known until the series is opened: a server's), and how many are unread. */
        int chapters = -1, unread;
        /** When it was last read (ms since 1970; 0: never). */
        long lastRead;
        /** How many chapters are kept on this device or the server's disk (-1: not known); a vault series is files. */
        int downloaded = -1;
        /** A server's cover address (its `thumbnailUrl`, relative to the server); null for the vault's. */
        String cover;

        Item(String key, String title, Origin origin) { this.key = key; this.title = title; this.origin = origin; }
    }

    /** The library's tabs, in order: Reading (when anything was started), then the server's categories by name
     *  (Default first, for series in none, only when there are other categories too — with none at all the server's
     *  whole library is one tab, `server`), then the vault's series. */
    static List<String> tabs(List<Item> items, String server) { return tabs(items, server, new ArrayList<>()); }

    /** The same, the server's categories in the server's own order (`order`: their names as Suwayomi orders them,
     *  Browse.categories); one it does not name goes after, by name. */
    static List<String> tabs(List<Item> items, String server, List<String> order) {
        List<String> out = new ArrayList<>();
        boolean started = false, vault = false, uncategorised = false, remote = false;
        Set<String> cats = new java.util.TreeSet<>((a, b) -> {
            int x = order.indexOf(a), y = order.indexOf(b);
            if (x < 0) x = Integer.MAX_VALUE;
            if (y < 0) y = Integer.MAX_VALUE;
            if (x != y) return Integer.compare(x, y);
            int n = natural(a, b);
            return n != 0 ? n : a.compareTo(b); // "Read" and "read" both kept
        });
        for (Item i : items) {
            started |= i.lastRead > 0;
            if (i.origin == Origin.VAULT) { vault = true; continue; }
            remote = true;
            if (i.categories.isEmpty()) uncategorised = true;
            cats.addAll(i.categories);
        }
        if (started) out.add(READING);
        if (remote && cats.isEmpty()) out.add(server);
        else {
            if (uncategorised) out.add(DEFAULT);
            out.addAll(cats);
        }
        if (vault) out.add(VAULT);
        return out;
    }

    /** The library's order (the plugin's `library_order`, the bar's sort button): `AUTO` is Reading by last read,
     *  newest first, and the other tabs by title; the others apply to every tab. */
    enum Order {
        AUTO("auto", "Reading by last read, the rest by title"), TITLE("title", "Title"), LAST_READ("last read", "Last read"),
        UNREAD("unread", "Unread chapters"), CHAPTERS("chapters", "Chapters");
        final String word, label;
        Order(String word, String label) { this.word = word; this.label = label; }
        /** The setting's word; anything else is AUTO. */
        static Order of(String word) {
            for (Order o : values()) if (o.word.equals(word)) return o;
            return AUTO;
        }
    }

    /** Which series the library shows (the plugin's `library_show`; the order dialog). */
    enum Show {
        ALL("all", "Every series"), UNREAD("unread", "With chapters left to read"), STARTED("started", "Started"),
        DOWNLOADED("downloaded", "Downloaded");
        final String word, label;
        Show(String word, String label) { this.word = word; this.label = label; }
        /** The setting's word; anything else is ALL. */
        static Show of(String word) {
            for (Show s : values()) if (s.word.equals(word)) return s;
            return ALL;
        }
        boolean keeps(Item i) {
            switch (this) {
                case UNREAD: return i.unread > 0;
                case STARTED: return i.lastRead > 0;
                case DOWNLOADED: return i.origin == Origin.VAULT || i.downloaded > 0;
                default: return true;
            }
        }
    }

    /** What tab `tab` lists, matching `filter` (words of the title, any case; null or "": all), in the default order. */
    static List<Item> shelf(String tab, List<Item> items, String filter, String server) {
        return shelf(tab, items, filter, server, Order.AUTO, false);
    }

    /** What tab `tab` lists, matching `filter`, in `order` (`descending` turns it round; a tie goes by title, numbers
     *  as numbers). `server`: the name `tabs` gave a server with no categories. Last read, unread and chapters run from
     *  the most when not turned round (what one looks for first). */
    static List<Item> shelf(String tab, List<Item> items, String filter, String server, Order order, boolean descending) {
        return shelf(tab, items, filter, server, order, descending, Show.ALL);
    }

    /** The same, keeping only the series `show` keeps. */
    static List<Item> shelf(String tab, List<Item> items, String filter, String server, Order order, boolean descending, Show show) {
        List<Item> out = new ArrayList<>();
        for (Item i : items) if (in(tab, i, server) && matches(i, filter) && show.keeps(i)) out.add(i);
        Comparator<Item> byTitle = (a, b) -> natural(a.title, b.title);
        Comparator<Item> c;
        switch (order == Order.AUTO ? (READING.equals(tab) ? Order.LAST_READ : Order.TITLE) : order) {
            case LAST_READ: c = Comparator.comparingLong((Item i) -> -i.lastRead); break;
            case UNREAD: c = Comparator.comparingInt((Item i) -> -i.unread); break;
            case CHAPTERS: c = Comparator.comparingInt((Item i) -> -i.chapters); break;
            default: c = byTitle;
        }
        c = c.thenComparing(byTitle);
        out.sort(descending ? c.reversed() : c);
        return out;
    }

    private static boolean in(String tab, Item i, String server) {
        if (READING.equals(tab)) return i.lastRead > 0;
        if (VAULT.equals(tab)) return i.origin == Origin.VAULT;
        if (i.origin != Origin.SERVER) return false;
        if (tab.equals(server) && !DEFAULT.equals(tab)) return true; // the one tab of a server with no categories
        return DEFAULT.equals(tab) ? i.categories.isEmpty() : i.categories.contains(tab);
    }

    /** Every word of `filter` in the title (any case, any order). */
    static boolean matches(Item i, String filter) {
        if (filter == null || filter.trim().isEmpty()) return true;
        String t = i.title.toLowerCase(Locale.ROOT);
        for (String w : filter.toLowerCase(Locale.ROOT).trim().split("\\s+")) if (!t.contains(w)) return false;
        return true;
    }

    /** A server's time (Suwayomi's `lastReadAt`: seconds, some versions ms) in ms. */
    static long millis(long t) { return t <= 0 ? 0 : t < 100_000_000_000L ? t * 1000 : t; }

    // ---- a series' Continue ----

    /** What a series' main button does. */
    enum Kind {
        /** Nothing read yet: the first chapter. */
        START,
        /** The chapter read last, not finished: at its page. */
        CONTINUE,
        /** The chapter read last was finished: the first unread after it. */
        NEXT,
        /** Everything read: from the start again. */
        AGAIN,
        /** No chapters. */
        NONE
    }

    /** Where Continue opens: chapter index, page, and what kind of resume it is. */
    static final class Resume {
        final Kind kind;
        final int chapter, page;
        Resume(Kind kind, int chapter, int page) { this.kind = kind; this.chapter = chapter; this.page = page; }
        @Override public String toString() { return kind + " " + chapter + ":" + page; }
    }

    /** Continue for chapters in reading order: `read[i]`, `page[i]` (where it was left), `last` the chapter read last
     *  (-1: none). A finished last chapter goes on to the first unread after it (else before it: one skipped). */
    static Resume resume(boolean[] read, int[] page, int last) {
        int n = read.length;
        if (n == 0) return new Resume(Kind.NONE, -1, 0);
        if (last >= 0 && last < n && !read[last]) return new Resume(Kind.CONTINUE, last, Math.max(0, page[last]));
        if (last >= 0 && last < n) {
            for (int i = last + 1; i < n; i++) if (!read[i]) return new Resume(Kind.NEXT, i, Math.max(0, page[i]));
            for (int i = 0; i < last; i++) if (!read[i]) return new Resume(Kind.NEXT, i, Math.max(0, page[i]));
            return new Resume(Kind.AGAIN, 0, 0);
        }
        boolean any = false;
        for (boolean r : read) any |= r;
        for (int i = 0; i < n; i++) if (!read[i]) return new Resume(any ? Kind.NEXT : Kind.START, i, Math.max(0, page[i]));
        return new Resume(Kind.AGAIN, 0, 0);
    }

    /** How many are unread. */
    static int unread(boolean[] read) { int u = 0; for (boolean r : read) if (!r) u++; return u; }

    /** The chapters to keep for offline from Continue on: the next `n` unread from `from` (indices, reading order). */
    static List<Integer> next(boolean[] read, int from, int n) {
        List<Integer> out = new ArrayList<>();
        for (int i = Math.max(0, from); i < read.length && out.size() < n; i++) if (!read[i]) out.add(i);
        return out;
    }

    /** Chapters `upTo` and before it (reading order): Mihon's "mark previous as read". */
    static List<Integer> before(int upTo) {
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < upTo; i++) out.add(i);
        return out;
    }

    private static final Pattern NUM = Pattern.compile("\\d+|\\D+");

    /** "p2" before "p10": numbers compared as numbers, the rest as text (how series, chapters and pages are named). */
    static int natural(String a, String b) {
        Matcher x = NUM.matcher(a.toLowerCase(Locale.ROOT)), y = NUM.matcher(b.toLowerCase(Locale.ROOT));
        while (x.find() && y.find()) {
            String p = x.group(), q = y.group();
            int c = Character.isDigit(p.charAt(0)) && Character.isDigit(q.charAt(0))
                ? new java.math.BigInteger(p).compareTo(new java.math.BigInteger(q)) : p.compareTo(q);
            if (c != 0) return c;
        }
        return a.length() - b.length();
    }
}
