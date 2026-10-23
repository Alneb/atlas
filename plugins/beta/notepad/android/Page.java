package org.atlas.plugins.notepad;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;

import org.json.JSONException;
import org.json.JSONObject;

/** A page of the notebook: an Excalidraw frame of A4 proportions (the web notebook's, ui/src/lib/draw-pages.ts), and
 *  its paper — blank, lined, squared, dotted, fine, graph or music staves, as Boox Notes' templates — kept in the frame's
 *  `customData.atlasTemplate`, so the desktop draws the same paper. */
final class Page {
    /** A4 portrait at 96 dpi and the gap between pages (draw-pages.ts PAGE). */
    static final float W = 794, H = 1123, GAP = 48;
    /** The paper's spacing, on the scene's own grid (multiples of it from the origin): the desktop's (draw-notepad.ts
     *  RULE), so both draw the lines in the same places; about 8 mm on A4, Boox Notes' ruling. */
    static final float RULE = 32;

    enum Paper {
        BLANK("Blank"), LINES("Lines"), GRID("Grid"), DOTS("Dots"), FINE("Fine grid"), GRAPH("Graph"), STAFF("Music staves");

        final String label;

        Paper(String label) { this.label = label; }

        /** The file's word for it (`customData.atlasTemplate`); blank is no word at all. */
        String key() { return this == BLANK ? null : name().toLowerCase(java.util.Locale.ROOT); }

        static Paper of(String key) {
            for (Paper p : values()) if (p.key() != null && p.key().equals(key)) return p;
            return BLANK;
        }
    }

    final String id;
    final RectF r;
    String name;
    Paper paper;
    /** The frame as read (null for a page made here): what Notepad does not know of it is kept. */
    final JSONObject source;

    Page(String id, RectF r, String name, Paper paper, JSONObject source) {
        this.id = id; this.r = r; this.name = name; this.paper = paper; this.source = source;
    }

    static Page from(JSONObject e) {
        float x = (float) e.optDouble("x"), y = (float) e.optDouble("y");
        JSONObject custom = e.optJSONObject("customData");
        return new Page(e.optString("id"), new RectF(x, y, x + (float) e.optDouble("width"), y + (float) e.optDouble("height")),
            e.isNull("name") ? null : e.optString("name", null), Paper.of(custom != null ? custom.optString("atlasTemplate", null) : null), e);
    }

    JSONObject element() throws JSONException {
        JSONObject custom = source != null && source.optJSONObject("customData") != null ? new JSONObject(source.optJSONObject("customData").toString()) : new JSONObject();
        if (paper.key() != null) custom.put("atlasTemplate", paper.key()); else custom.remove("atlasTemplate");
        JSONObject o = Figure.base(source, "frame", id, r.left, r.top, r.width(), r.height(), null).put("name", name == null ? JSONObject.NULL : name);
        if (source == null) o.put("strokeColor", "#bbb");
        if (custom.length() > 0) o.put("customData", custom); else o.remove("customData");
        return o;
    }

    /** Fine and graph paper's small square, graph paper's large one (5 small), music staves' line gap and their period:
     *  the desktop's (draw-notepad.ts), multiples from the scene's origin as the rest. */
    static final float FINE_STEP = RULE / 2, GRAPH_MAJOR = FINE_STEP * 5, STAFF_GAP = RULE / 4, STAFF_PERIOD = RULE * 3;

    /** The first multiple of `step` after `v`. */
    private static float first(float v, float step) { return (float) (Math.floor(v / step) + 1) * step; }

    private static float first(float v) { return first(v, RULE); }

    private void grid(Canvas c, Paint ink, float step) {
        for (float y = first(r.top, step); y < r.bottom; y += step) c.drawLine(r.left, y, r.right, y, ink);
        for (float x = first(r.left, step); x < r.right; x += step) c.drawLine(x, r.top, x, r.bottom, ink);
    }

    /** The paper's ruling inside the page, in scene units; `ink` a light grey that stays under the writing. */
    void drawPaper(Canvas c, Paint ink, float k) {
        if (paper == Paper.BLANK) return;
        // About 2 screen px at any zoom.
        ink.setStrokeWidth(Math.max(1.0f, 2.0f / k));
        float top = first(r.top), left = first(r.left);
        switch (paper) {
            case LINES:
                for (float y = top; y < r.bottom; y += RULE) c.drawLine(r.left, y, r.right, y, ink);
                break;
            case GRID:
                for (float y = top; y < r.bottom; y += RULE) c.drawLine(r.left, y, r.right, y, ink);
                for (float x = left; x < r.right; x += RULE) c.drawLine(x, r.top, x, r.bottom, ink);
                break;
            case FINE:
                grid(c, ink, FINE_STEP);
                break;
            case GRAPH: {
                grid(c, ink, FINE_STEP);
                float w = ink.getStrokeWidth();
                ink.setStrokeWidth(w * 2.2f); // every fifth line heavier, as engineering paper
                grid(c, ink, GRAPH_MAJOR);
                ink.setStrokeWidth(w);
                break;
            }
            case STAFF: // five lines a staff, a staff every STAFF_PERIOD
                for (float y0 = first(r.top - STAFF_PERIOD, STAFF_PERIOD); y0 < r.bottom; y0 += STAFF_PERIOD)
                    for (int l = 0; l < 5; l++) { float y = y0 + RULE + l * STAFF_GAP; if (y > r.top && y < r.bottom) c.drawLine(r.left, y, r.right, y, ink); }
                break;
            case DOTS: {
                Paint.Style keep = ink.getStyle();
                ink.setStyle(Paint.Style.FILL);
                float d = Math.max(1.2f, 2.4f / k);
                for (float y = top; y < r.bottom; y += RULE) for (float x = left; x < r.right; x += RULE) c.drawCircle(x, y, d, ink);
                ink.setStyle(keep);
                break;
            }
            default:
        }
    }
}
