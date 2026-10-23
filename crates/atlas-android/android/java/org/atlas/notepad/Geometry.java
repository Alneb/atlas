package org.atlas.notepad;

/** Small geometry for the canvas: distances, the lasso's inside test, rounding for the file. */
final class Geometry {
    private Geometry() {}

    /** Distance from (px, py) to the segment (ax, ay)–(bx, by). */
    static double segmentDistance(float px, float py, float ax, float ay, float bx, float by) {
        float dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
        float t = len == 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    /** The distance between segments a–b and c–d: 0 when they cross, else the nearest end to the other segment. */
    static double segmentsDistance(float ax, float ay, float bx, float by, float cx, float cy, float dx, float dy) {
        float d1 = cross(cx, cy, dx, dy, ax, ay), d2 = cross(cx, cy, dx, dy, bx, by), d3 = cross(ax, ay, bx, by, cx, cy), d4 = cross(ax, ay, bx, by, dx, dy);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
        return Math.min(Math.min(segmentDistance(ax, ay, cx, cy, dx, dy), segmentDistance(bx, by, cx, cy, dx, dy)),
            Math.min(segmentDistance(cx, cy, ax, ay, bx, by), segmentDistance(dx, dy, ax, ay, bx, by)));
    }

    /** Which side of a–b point p lies (the sign of the cross product). */
    private static float cross(float ax, float ay, float bx, float by, float px, float py) { return (bx - ax) * (py - ay) - (by - ay) * (px - ax); }

    /** Whether (x, y) is inside the closed polygon `xy` (x0, y0, x1, y1, …): even–odd crossings. */
    static boolean inside(float[] xy, int n, float x, float y) {
        boolean in = false;
        for (int i = 0, j = n - 1; i < n; j = i++) {
            float xi = xy[2 * i], yi = xy[2 * i + 1], xj = xy[2 * j], yj = xy[2 * j + 1];
            if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) in = !in;
        }
        return in;
    }

    /** The (x, y) pairs of `v` from `off`, every `stride` floats, scaled by `s` and turned by `a` radians about
     *  (ax, ay), in place: the selection's handles. */
    static void transform(float[] v, int off, int stride, float ax, float ay, float s, float a) {
        double c = Math.cos(a) * s, sn = Math.sin(a) * s;
        for (int i = off; i + 1 < v.length; i += stride) {
            float dx = v[i] - ax, dy = v[i + 1] - ay;
            v[i] = ax + (float) (dx * c - dy * sn);
            v[i + 1] = ay + (float) (dx * sn + dy * c);
        }
    }

    /** Two decimals: what the file keeps of a coordinate. */
    static double r2(float v) { return Math.round(v * 100) / 100.0; }
}
