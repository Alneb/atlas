package org.atlas.plugins.books;

/** Where the PDF reader puts a page on screen (PdfView): fitted whole or to the width, its white margins cropped or
 *  not, zoomed and moved; and how a turn steps through a page taller than the screen — a screenful at a time, the next
 *  page from its top, the one before from its bottom — so reading a paper zoomed or fitted to the width is turning,
 *  not pinching and panning. Plain Java (no Android): tested on the desktop JVM (android/test, PageFitTest). */
final class PageFit {
    private PageFit() {}

    /** What a screenful step keeps of the last one, as a fraction of the view's height: a line or two to read on from. */
    static final float OVERLAP = 0.08f;

    /** The page's box on screen: left, top, right, bottom px. `crop`: the part to fit (fractions of the page: left,
     *  top, right, bottom; null for the whole page); `width`: fitted to the view's width (else whole); `zoom` ≥ 1 on top;
     *  `panX`/`panY`: the offset from the centred place. */
    static float[] rect(float viewW, float viewH, float pageW, float pageH, float[] crop, boolean width, float zoom, float panX, float panY) {
        float[] c = crop != null ? crop : new float[] { 0, 0, 1, 1 };
        float cw = (c[2] - c[0]) * pageW, ch = (c[3] - c[1]) * pageH;
        float k = (width ? viewW / cw : Math.min(viewW / cw, viewH / ch)) * zoom;
        float w = pageW * k, h = pageH * k;
        // the part fitted is centred: the whole page is placed by where that part sits in it
        float cx = (c[0] + c[2]) / 2 * w, cy = (c[1] + c[3]) / 2 * h;
        float x = viewW / 2 - cx + panX, y = viewH / 2 - cy + panY;
        return new float[] { x, y, x + w, y + h };
    }

    /** The farthest the pan may go each way (x, y) so the fitted part never leaves the screen empty on a side: half of
     *  how much the fitted part is larger than the view, 0 when it is not. */
    static float[] panLimits(float viewW, float viewH, float pageW, float pageH, float[] crop, boolean width, float zoom) {
        float[] r = rect(viewW, viewH, pageW, pageH, crop, width, zoom, 0, 0);
        float[] c = crop != null ? crop : new float[] { 0, 0, 1, 1 };
        float pw = (c[2] - c[0]) * (r[2] - r[0]), ph = (c[3] - c[1]) * (r[3] - r[1]);
        return new float[] { Math.max(0, (pw - viewW) / 2), Math.max(0, (ph - viewH) / 2) };
    }

    /** Where `panY` goes for a turn by `dir` (1 on, -1 back) on a page whose pan may go ±`limitY`: the next screenful
     *  (keeping OVERLAP of the view), or NaN when the page's end that way is already shown — then the page turns. */
    static float step(float panY, float limitY, float viewH, int dir) {
        float edge = dir > 0 ? -limitY : limitY; // the pan that shows the page's bottom (on) or top (back)
        if (Math.abs(panY - edge) < 1) return Float.NaN;
        float next = panY - dir * viewH * (1 - OVERLAP);
        return dir > 0 ? Math.max(edge, next) : Math.min(edge, next);
    }

    /** The pan of a page just turned to: its top going on, its bottom coming back. */
    static float arrive(float limitY, int dir) { return dir >= 0 ? limitY : -limitY; }

    /** The page's printed part in a drawing of it (`px`: w × h ARGB): left, top, right, bottom fractions around every
     *  pixel not near white, a little margin kept; null when the page is blank or there is little to crop (under 4 %
     *  each way), so a page is only ever cropped to something real. Rows and columns are sampled every `stride` px. */
    static float[] printed(int[] px, int w, int h, int stride) {
        int l = w, t = h, r = -1, b = -1;
        for (int y = 0; y < h; y += stride) for (int x = 0; x < w; x += stride) {
            int p = px[y * w + x];
            int red = (p >> 16) & 0xff, green = (p >> 8) & 0xff, blue = p & 0xff;
            if (red > 235 && green > 235 && blue > 235) continue;
            if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
        }
        if (r < 0) return null;
        float m = 0.015f; // a margin around the print: no letter touching the screen's edge
        float[] f = { Math.max(0, (float) l / w - m), Math.max(0, (float) t / h - m), Math.min(1, (float) (r + stride) / w + m), Math.min(1, (float) (b + stride) / h + m) };
        boolean little = f[2] - f[0] > 0.96f && f[3] - f[1] > 0.96f;
        return little ? null : f;
    }
}
