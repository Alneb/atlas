package org.atlas.capture;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * The Search screen's rules as plain data (no Android: SearchRowsTest, android/test/run.sh): the core's answer
 * (`/api/search`: the files matched by name, best first, then the matching lines grouped by file, the files ranked —
 * core search.rs, the desktop's ranking) made into a list's sections, each hit's text cut around the query with the
 * matches marked, and the timing of results as you type (Typing). SearchScreen asks and draws; nothing is re-ranked.
 */
final class SearchRows {
    private SearchRows() {}

    /** One matching line (core api.rs LineHit). */
    static final class Hit {
        final String path, text;
        final int line;
        Hit(String path, int line, String text) { this.path = path; this.line = line; this.text = text; }
    }

    /** The list: a "Files" section of the names, then a section per file of its lines, its header the file (a tap
     *  opens it at the top) with how many lines match in all (`counts`, more than are listed). */
    static List<PlaceItem> rows(String query, List<String> names, List<Hit> lines, Map<String, Integer> counts, Function<String, String> shown) {
        List<PlaceItem> out = new ArrayList<>();
        if (!names.isEmpty()) out.add(PlaceItem.header("Files"));
        for (String path : names) {
            PlaceItem r = PlaceItem.row(shown.apply(path));
            r.path = path;
            r.icon = FileRows.icon(path, false);
            r.detail = FileRows.parent(path);
            r.marks = find(r.title, query);
            r.more = true;
            out.add(r);
        }
        Map<String, List<Hit>> byFile = new LinkedHashMap<>();
        for (Hit h : lines) byFile.computeIfAbsent(h.path, k -> new ArrayList<>()).add(h);
        for (Map.Entry<String, List<Hit>> f : byFile.entrySet()) {
            PlaceItem h = PlaceItem.header(shown.apply(f.getKey()));
            h.path = f.getKey();
            Integer n = counts.get(f.getKey());
            int all = n == null ? f.getValue().size() : n;
            h.detail = all == 1 ? "1 line" : all + " lines";
            out.add(h);
            for (Hit hit : f.getValue()) {
                Snip s = snip(hit.text, query, 40);
                PlaceItem r = PlaceItem.row(s.text);
                r.marks = s.marks;
                r.path = hit.path;
                r.line = hit.line;
                r.detail = "Line " + hit.line;
                out.add(r);
            }
        }
        return out;
    }

    /** A line cut to show its first match: text and the matches' ranges in it. */
    static final class Snip {
        final String text;
        final int[] marks;
        Snip(String text, int[] marks) { this.text = text; this.marks = marks; }
    }

    /** `text` from `before` characters ahead of its first match ("…" where cut), its indent dropped, the matches
     *  marked — the desktop's Search pane cuts its hits the same (Search.svelte `mark`). */
    static Snip snip(String text, String query, int before) {
        int[] all = find(text, query);
        int start = all.length == 0 ? 0 : Math.max(0, all[0] - before);
        // never cut through a surrogate pair (an emoji): one character earlier
        if (start > 0 && Character.isLowSurrogate(text.charAt(start))) start--;
        String rest = text.substring(start);
        int lead = 0;
        while (lead < rest.length() && Character.isWhitespace(rest.charAt(lead))) lead++;
        if (all.length > 0 && start + lead > all[0]) lead = all[0] - start; // the match itself is never cut
        String prefix = start > 0 ? "…" : "";
        String body = rest.substring(lead).replaceAll("\\s+$", "");
        int shift = prefix.length() - start - lead;
        List<Integer> kept = new ArrayList<>();
        for (int i = 0; i + 1 < all.length; i += 2) {
            int a = all[i] + shift, b = Math.min(all[i + 1] + shift, prefix.length() + body.length());
            if (a >= prefix.length() && a < b) { kept.add(a); kept.add(b); }
        }
        int[] marks = new int[kept.size()];
        for (int i = 0; i < marks.length; i++) marks[i] = kept.get(i);
        return new Snip(prefix + body, marks);
    }

    /** Where `query` occurs in `text`, without overlaps: start, end, … The core's smart case (search.rs): any capital
     *  in the query makes it match case exactly; otherwise case is ignored. */
    static int[] find(String text, String query) {
        String q = query == null ? "" : query.trim();
        if (q.isEmpty() || text == null) return new int[0];
        boolean exact = !q.equals(q.toLowerCase(java.util.Locale.ROOT));
        List<Integer> at = new ArrayList<>();
        for (int i = 0; i + q.length() <= text.length(); ) {
            if (text.regionMatches(!exact, i, q, 0, q.length())) { at.add(i); at.add(i + q.length()); i += q.length(); }
            else i++;
        }
        int[] out = new int[at.size()];
        for (int i = 0; i < out.length; i++) out[i] = at.get(i);
        return out;
    }

    /**
     * Results as you type, the desktop's way (lib/newest.ts `Newest(180)`, Search.svelte): a search starts once the
     * typing pauses; the names come first (no file read: at once), then the lines; an answer to an older query, or the
     * names arriving after the lines, is dropped. One per screen, on its main thread.
     */
    static final class Typing {
        /** The pause after the last key before a search starts (the desktop's). */
        static final long WAIT_MS = 180;

        /** One search asked: its query (""), how long to wait before starting it. */
        static final class Ask {
            final int gen;
            final String query;
            final long delay;
            Ask(int gen, String query, long delay) { this.gen = gen; this.query = query; this.delay = delay; }
        }

        private int gen;
        private String last = "";
        private boolean linesIn;

        /** The field now reads `raw`: the search to start (after its delay), or null when the query is unchanged (a
         *  space added at the end). An empty query is an Ask too, at once: the list is cleared. */
        Ask typed(String raw) {
            String q = raw == null ? "" : raw.trim();
            if (q.equals(last)) return null;
            return next(q, q.isEmpty() ? 0 : WAIT_MS);
        }

        /** The same query again, at once (pull to refresh, the screen shown again). */
        Ask again() { return next(last, 0); }

        private Ask next(String q, long delay) {
            gen++;
            last = q;
            linesIn = false;
            return new Ask(gen, q, delay);
        }

        /** Whether `a` is still the latest search (its delay over: start it; its answer in: show it). */
        boolean current(Ask a) { return a != null && a.gen == gen; }

        /** The names' answer to `a` arrived: shown only while it is current and its lines have not come first. */
        boolean names(Ask a) { return current(a) && !linesIn; }

        /** The full answer (names and lines) to `a` arrived: shown while it is current. */
        boolean lines(Ask a) {
            if (!current(a)) return false;
            linesIn = true;
            return true;
        }

        String query() { return last; }
    }
}
