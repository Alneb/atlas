package org.atlas.capture;

/** Where a PDF page's points are shown. PDFium's characters, links and find boxes, and the note's marks, are page
 *  points (y up, the page box's origin wherever the file put it, before the page's own /Rotate); the page is drawn
 *  turned by its /Rotate and cropped to its box, "shown" space (points, y down, from its top left). Every screen ↔
 *  page conversion of the phone's readers goes through here — the desktop's ui/src/lib/pdf-geom.ts toShown/toPage,
 *  the same formulas. A reader that mapped by the shown size alone selected other words (or none) on a turned page
 *  or one whose box is not at the origin (pdfium.rs's rotated-page test). Plain Java: tested on the desktop JVM. */
public final class PageSpace {
    /** The page box shown: left, bottom, right, top in page points. */
    final float x0, y0, x1, y1;
    /** The page's own /Rotate in quarter turns clockwise, 0..3. */
    final int rotate;

    public PageSpace(float x0, float y0, float x1, float y1, int rotate) {
        this.x0 = Math.min(x0, x1); this.y0 = Math.min(y0, y1); this.x1 = Math.max(x0, x1); this.y1 = Math.max(y0, y1);
        this.rotate = ((rotate % 4) + 4) % 4;
    }

    /** Core.pdfiumSpace's five floats; a plain space of `w` × `h` when there are not five (PDFium not there). */
    public static PageSpace of(float[] f, float w, float h) {
        return f != null && f.length >= 5 ? new PageSpace(f[0], f[1], f[2], f[3], Math.round(f[4])) : plain(w, h);
    }

    /** A page of `w` × `h` points at the origin, not turned: what PdfRenderer (no /Rotate given) is taken to show. */
    public static PageSpace plain(float w, float h) { return new PageSpace(0, 0, w, h, 0); }

    /** The shown width and height in points (a quarter turn swaps them). */
    public float shownW() { return (rotate & 1) == 1 ? y1 - y0 : x1 - x0; }
    public float shownH() { return (rotate & 1) == 1 ? x1 - x0 : y1 - y0; }

    /** A page point in shown points. */
    public float[] toShown(float x, float y) {
        switch (rotate) {
            case 1: return new float[] { y - y0, x - x0 };
            case 2: return new float[] { x1 - x, y - y0 };
            case 3: return new float[] { y1 - y, x1 - x };
            default: return new float[] { x - x0, y1 - y };
        }
    }

    /** A shown point back in page points (toShown's inverse). */
    public float[] toPage(float X, float Y) {
        switch (rotate) {
            case 1: return new float[] { x0 + Y, y0 + X };
            case 2: return new float[] { x1 - X, y0 + Y };
            case 3: return new float[] { x1 - Y, y1 - X };
            default: return new float[] { x0 + X, y1 - Y };
        }
    }

    /** A point at fractions (fx, fy) of the shown page (0..1 from its top left) in page points. */
    public float[] fromFraction(float fx, float fy) { return toPage(fx * shownW(), fy * shownH()); }

    /** A page point as fractions of the shown page. */
    public float[] fraction(float x, float y) { float[] s = toShown(x, y); return new float[] { s[0] / shownW(), s[1] / shownH() }; }

    /** A page box (left, bottom, right, top) as fractions of the shown page: left, top, right, bottom (y down). */
    public float[] boxFraction(float[] b) {
        float[] p = fraction(b[0], b[1]), q = fraction(b[2], b[3]);
        return new float[] { Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1]) };
    }

    /** A length in page points as a fraction of the shown width (a pen's width, a note's text size). */
    public float widthFraction(float points) { return points / shownW(); }
}
