package org.atlas.plugins.books;

/** Where the PDF reader's page strip puts its pages (PageStrip): a row of cells `cell` px wide with `gap` px between
 *  and around them, scrolled by `scroll` px; which pages show, which page a tap is on, and the scroll that brings a page
 *  to the middle. Plain Java (no Android): tested on the desktop JVM (android/test, StripLayoutTest). */
final class StripLayout {
    final int pages, cell, gap;

    StripLayout(int pages, int cell, int gap) { this.pages = Math.max(0, pages); this.cell = Math.max(1, cell); this.gap = Math.max(0, gap); }

    /** The whole row's width. */
    int width() { return pages * cell + (pages + 1) * gap; }

    /** Page p's (1-based) left edge in the row. */
    int left(int p) { return gap + (p - 1) * (cell + gap); }

    /** The scroll kept within the row: never past either end; 0 when the row is narrower than the view (then centred:
     *  `offset`). */
    int clamp(int scroll, int view) { return Math.max(0, Math.min(scroll, width() - view)); }

    /** Where the row starts on screen when it is narrower than the view (centred), else 0. */
    int offset(int view) { return Math.max(0, (view - width()) / 2); }

    /** The page under x (px from the view's left) at this scroll, or 0 (between cells, outside the row). */
    int pageAt(float x, int scroll, int view) {
        float in = x + scroll - offset(view) - gap;
        if (in < 0) return 0;
        int i = (int) (in / (cell + gap));
        if (i >= pages || in - i * (cell + gap) > cell) return 0;
        return i + 1;
    }

    /** The first and last page at least partly in view. */
    int[] shown(int scroll, int view) {
        if (pages == 0) return new int[] { 1, 0 };
        int from = Math.max(1, (scroll - offset(view)) / (cell + gap) + 1);
        int to = Math.min(pages, (scroll - offset(view) + view) / (cell + gap) + 1);
        return new int[] { from, to };
    }

    /** The scroll that puts page p in the middle of the view (clamped). */
    int centre(int p, int view) { return clamp(left(p) + cell / 2 - view / 2, view); }

    /** Whether page p is wholly in view at this scroll. */
    boolean inView(int p, int scroll, int view) { int l = left(p) - scroll + offset(view); return l >= 0 && l + cell <= view; }
}
