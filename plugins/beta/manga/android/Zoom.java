package org.atlas.plugins.manga;

/**
 * A page zoomed in the paged modes, as plain numbers (no Android: GesturesTest): the page's rectangle on the reader,
 * from its size fitted to the screen and a scale from 1 (fitted) to MAX. A page smaller than the reader on a side is
 * centred on it; a larger one never leaves a gap at its edges. ReaderView makes the ImageView's matrix from `left`,
 * `top`, `width`, `height` (so the ink over the page, which reads that matrix, stays on it).
 */
final class Zoom {
    static final float MAX = 4f;
    /** A double tap's zoom. */
    static final float DOUBLE = 2.5f;

    private float viewW, viewH, fitW, fitH;
    private float scale = 1, left, top;

    /** The reader's size and the page's size there at scale 1 (fit screen); the zoom starts again. */
    void size(float viewW, float viewH, float pageW, float pageH) {
        this.viewW = viewW; this.viewH = viewH;
        float k = pageW > 0 && pageH > 0 ? Math.min(viewW / pageW, viewH / pageH) : 1;
        fitW = pageW * k; fitH = pageH * k;
        reset();
    }

    void reset() { scale = 1; left = (viewW - fitW) / 2; top = (viewH - fitH) / 2; }

    boolean zoomed() { return scale > 1.01f; }

    float scale() { return scale; }
    float left() { return left; }
    float top() { return top; }
    float width() { return fitW * scale; }
    float height() { return fitH * scale; }

    /** Scaled by `k` about (fx, fy) on the reader, kept between 1 and MAX. */
    void scaleBy(float k, float fx, float fy) {
        float to = Math.max(1, Math.min(MAX, scale * k));
        float real = to / scale;
        left = fx - (fx - left) * real;
        top = fy - (fy - top) * real;
        scale = to;
        clamp();
    }

    /** Moved by (dx, dy), as far as the page's edges allow. */
    void pan(float dx, float dy) { left += dx; top += dy; clamp(); }

    /** Double tap: zoomed in at (x, y), or back to the whole page. */
    void toggle(float x, float y) { if (zoomed()) reset(); else scaleBy(DOUBLE / scale, x, y); }

    /** Whether the page can still move to show more on that side: `dx` < 0 shows more of its right (the finger goes
     *  left), and so on. */
    boolean canPan(float dx, float dy) {
        if (dx < 0 && left + width() > viewW + 0.5f) return true;
        if (dx > 0 && left < -0.5f) return true;
        if (dy < 0 && top + height() > viewH + 0.5f) return true;
        return dy > 0 && top < -0.5f;
    }

    private void clamp() {
        float w = width(), h = height();
        left = w <= viewW ? (viewW - w) / 2 : Math.max(viewW - w, Math.min(0, left));
        top = h <= viewH ? (viewH - h) / 2 : Math.max(viewH - h, Math.min(0, top));
    }
}
