package org.atlas.plugins.manga;

/** A series as the catalog's `note` tool takes it (docs/design/DESIGN-server-libraries.md §3: one note per thing, made
 *  once it is yours) — the pure part, as suwayomi.js `suwayomiId` / `engagement` give it on the page. */
final class Thing {
    private Thing() {}

    /** A Suwayomi series' id for its note: its source and its address there, which a reinstalled server keeps ("" when
     *  either is missing). */
    static String suwayomiId(String sourceId, String url) {
        return sourceId == null || url == null || sourceId.isEmpty() || url.isEmpty() ? "" : sourceId + ":" + url;
    }

    /** What a reading change is to the rule: `finished` on a chapter's last page or marked read, `progress` past its
     *  first page, else `opened` (never makes a note). */
    static String why(int page, int pages, boolean read) {
        if (read || (pages > 0 && page >= pages - 1)) return "finished";
        return page > 0 && pages > 0 ? "progress" : "opened";
    }

    /** How far into the chapter (0–1) for `progress`. */
    static double progress(int page, int pages) {
        return pages > 0 ? Math.max(0, Math.min(1, page / (double) pages)) : 0;
    }
}
