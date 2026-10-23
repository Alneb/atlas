package org.atlas.plugins.notepad;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

import org.atlas.capture.Host;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Any Excalidraw element that is not a pen stroke: rectangles, ellipses, diamonds, lines, arrows, text, pictures —
 *  made on the desktop, or by Notepad's shape snapping. Shown as Excalidraw draws them (Painter), moved, recoloured,
 *  duplicated and erased whole; everything else in the element is kept as it was. */
final class Figure extends Item {
    /** The element; edits change it in place (a copy of what was read). */
    final JSONObject e;
    /** Its outline in scene units (x0, y0, x1, y1, …): closed for boxes, open for lines; null for text and pictures. */
    private float[] outline;
    private boolean closed;

    Figure(JSONObject e) {
        this.e = e;
        id = e.optString("id");
        frame = e.isNull("frameId") ? null : e.optString("frameId", null);
        measure();
    }

    @Override void setFrame(String f) {
        super.setFrame(f);
        try { e.put("frameId", f == null ? JSONObject.NULL : f); } catch (JSONException ignored) { }
    }

    /** Excalidraw's text sizes (S, M, L, XL) and line height. */
    static final int[] FONT_SIZES = { 16, 20, 28, 36 };
    static final float LINE_HEIGHT = 1.25f;

    String type() { return e.optString("type"); }

    /** Locked by its flag, or a picture of a PDF's page (linked `x.pdf#page=N`: drawings made before the flag). */
    @Override boolean locked() {
        String l = link();
        return e.optBoolean("locked") || ("image".equals(type()) && l != null && l.matches("(?s).*\\.pdf#page=\\d+.*"));
    }

    void lock() { try { e.put("locked", true); } catch (JSONException ex) { /* a boolean */ } }

    /** A text of its own (not a shape's label, which goes with its shape): what the text tool changes. */
    boolean freeText() { return "text".equals(type()) && (e.isNull("containerId") || e.optString("containerId").isEmpty()); }

    float x() { return (float) e.optDouble("x"); }
    float y() { return (float) e.optDouble("y"); }
    float w() { return (float) e.optDouble("width"); }
    float h() { return (float) e.optDouble("height"); }
    float angle() { return (float) e.optDouble("angle", 0); }

    /** The point Excalidraw turns it about: the middle of its box, or for a line or arrow the middle of its points'
     *  bounds (which need not start at its x, y: a line drawn up or to the left has negative points). */
    float[] pivot() {
        JSONArray pts = e.optJSONArray("points");
        if (pts == null || pts.length() == 0 || !("line".equals(type()) || "arrow".equals(type()))) return new float[] { x() + w() / 2, y() + h() / 2 };
        float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
        for (int i = 0; i < pts.length(); i++) {
            JSONArray p = pts.optJSONArray(i);
            float px = p == null ? 0 : (float) p.optDouble(0), py = p == null ? 0 : (float) p.optDouble(1);
            minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        }
        return new float[] { x() + (minX + maxX) / 2, y() + (minY + maxY) / 2 };
    }

    /** Its box and outline from the element. */
    private void measure() {
        float[] pv = pivot();
        float x = x(), y = y(), w = w(), h = h(), cx = pv[0], cy = pv[1], a = angle();
        switch (type()) {
            case "line":
            case "arrow": {
                JSONArray pts = e.optJSONArray("points");
                int n = pts == null ? 0 : pts.length();
                outline = new float[n * 2];
                for (int i = 0; i < n; i++) {
                    JSONArray p = pts.optJSONArray(i);
                    outline[2 * i] = x + (p == null ? 0 : (float) p.optDouble(0));
                    outline[2 * i + 1] = y + (p == null ? 0 : (float) p.optDouble(1));
                }
                rotate(outline, cx, cy, a);
                closed = n > 2 && outline[0] == outline[2 * n - 2] && outline[1] == outline[2 * n - 1];
                break;
            }
            case "rectangle":
                outline = new float[] { x, y, x + w, y, x + w, y + h, x, y + h };
                rotate(outline, cx, cy, a);
                closed = true;
                break;
            case "diamond":
                outline = new float[] { cx, y, x + w, cy, cx, y + h, x, cy };
                rotate(outline, cx, cy, a);
                closed = true;
                break;
            case "ellipse": {
                outline = new float[64];
                for (int i = 0; i < 32; i++) {
                    double t = i * Math.PI / 16;
                    outline[2 * i] = cx + (float) (w / 2 * Math.cos(t));
                    outline[2 * i + 1] = cy + (float) (h / 2 * Math.sin(t));
                }
                rotate(outline, cx, cy, a);
                closed = true;
                break;
            }
            default: { // text, image, embeds: their (turned) box
                float[] c = { x, y, x + w, y, x + w, y + h, x, y + h };
                rotate(c, cx, cy, a);
                outline = null;
                box.set(bounds(c));
                return;
            }
        }
        box.set(bounds(outline));
    }

    private static void rotate(float[] xy, float cx, float cy, float a) {
        if (a == 0) return;
        double s = Math.sin(a), c = Math.cos(a);
        for (int i = 0; i + 1 < xy.length; i += 2) {
            float dx = xy[i] - cx, dy = xy[i + 1] - cy;
            xy[i] = cx + (float) (dx * c - dy * s);
            xy[i + 1] = cy + (float) (dx * s + dy * c);
        }
    }

    private static RectF bounds(float[] xy) {
        RectF r = new RectF(Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE);
        for (int i = 0; i + 1 < xy.length; i += 2) r.union(xy[i], xy[i + 1]);
        return xy.length < 2 ? new RectF() : r;
    }

    @Override void draw(Canvas c, Painter p) { p.figure(c, this); }

    @Override boolean touches(float x, float y, float r) {
        float reach = r + (float) e.optDouble("strokeWidth", 1);
        if (x < box.left - reach || x > box.right + reach || y < box.top - reach || y > box.bottom + reach) return false;
        if (outline == null) return true; // text and pictures: anywhere on them
        int n = outline.length / 2;
        for (int i = 0; i + 1 < n + (closed ? 1 : 0); i++) {
            int j = (i + 1) % n;
            if (Geometry.segmentDistance(x, y, outline[2 * i], outline[2 * i + 1], outline[2 * j], outline[2 * j + 1]) < reach) return true;
        }
        // a filled shape is touched anywhere inside
        return closed && !"transparent".equals(e.optString("backgroundColor", "transparent")) && Geometry.inside(outline, n, x, y);
    }

    /** Along the eraser's whole path: a fast swipe samples either side of a line, so its two ends alone miss it. */
    @Override boolean crossedBy(float x0, float y0, float x1, float y1, float r) {
        if (touches(x0, y0, r) || touches(x1, y1, r)) return true;
        if (outline == null) return false;
        float reach = r + (float) e.optDouble("strokeWidth", 1);
        int n = outline.length / 2;
        for (int i = 0; i + 1 < n + (closed ? 1 : 0); i++) {
            int j = (i + 1) % n;
            if (Geometry.segmentsDistance(x0, y0, x1, y1, outline[2 * i], outline[2 * i + 1], outline[2 * j], outline[2 * j + 1]) < reach) return true;
        }
        return false;
    }

    @Override float[] anchors() {
        if (outline != null) return outline;
        return new float[] { box.left, box.top, box.right, box.top, box.right, box.bottom, box.left, box.bottom, box.centerX(), box.centerY() };
    }

    @Override void moveBy(float dx, float dy) {
        try { e.put("x", Geometry.r2(x() + dx)).put("y", Geometry.r2(y() + dy)); } catch (JSONException ex) { /* numbers */ }
        measure();
    }

    /** Its centre moves as the selection does; its size, points and font scale, and its angle adds `a` (Excalidraw
     *  turns every element about its centre, so that is all it takes). The line width stays, as Excalidraw's resize. */
    @Override void transform(float ax, float ay, float s, float a, Host host) {
        float w = w() * s, h = h() * s;
        float[] c = pivot();
        float rx = c[0] - x(), ry = c[1] - y(); // the pivot from x, y: it scales with the points
        Geometry.transform(c, 0, 2, ax, ay, s, a);
        double turn = (angle() + a) % (2 * Math.PI);
        try {
            e.put("x", Geometry.r2(c[0] - rx * s)).put("y", Geometry.r2(c[1] - ry * s)).put("width", Geometry.r2(w)).put("height", Geometry.r2(h))
                .put("angle", turn < 0 ? turn + 2 * Math.PI : turn);
            JSONArray pts = e.optJSONArray("points");
            for (int i = 0; pts != null && i < pts.length(); i++) {
                JSONArray p = pts.optJSONArray(i);
                if (p != null) p.put(0, Geometry.r2((float) p.optDouble(0) * s)).put(1, Geometry.r2((float) p.optDouble(1) * s));
            }
            if (e.has("fontSize")) e.put("fontSize", Geometry.r2((float) e.optDouble("fontSize", 20) * s));
        } catch (JSONException ex) { /* numbers */ }
        measure();
    }

    @Override String color() { return e.optString("strokeColor", "#000000"); }

    @Override void setColor(String c) { try { e.put("strokeColor", c); } catch (JSONException ex) { /* a string */ } }

    @Override String link() { return e.isNull("link") ? null : e.optString("link", null); }

    @Override void setLink(String l) { try { e.put("link", l == null ? JSONObject.NULL : l); } catch (JSONException ex) { /* a string */ } }

    @Override JSONObject element() throws JSONException { return changed(e); }

    /** `o`'s version moved on, as Excalidraw does on every edit: its merge keeps the higher version, a random nonce
     *  breaking ties (a nonce from the id would tie the same way on every device). */
    static JSONObject changed(JSONObject o) throws JSONException {
        return o.put("version", o.optLong("version", 0) + 1).put("versionNonce", java.util.concurrent.ThreadLocalRandom.current().nextInt(1, Integer.MAX_VALUE))
            .put("updated", System.currentTimeMillis());
    }

    @Override Item copy(String newId, float dx, float dy) {
        try {
            JSONObject c = new JSONObject(e.toString()).put("id", newId).put("seed", Math.abs(newId.hashCode())).put("boundElements", JSONObject.NULL);
            Figure f = new Figure(c);
            f.moveBy(dx, dy);
            return f;
        } catch (JSONException ex) { return null; }
    }

    // ---- new elements --------------------------------------------------------------------------------------------

    /** The fields every Excalidraw element has: from `source` when it was read (so what Notepad does not know is
     *  kept), else Excalidraw's defaults; its version moved on. */
    static JSONObject base(JSONObject source, String type, String id, float x, float y, float w, float h, String frame) throws JSONException {
        JSONObject o = source != null ? new JSONObject(source.toString()) : new JSONObject()
            .put("angle", 0).put("strokeColor", "#000000").put("backgroundColor", "transparent").put("fillStyle", "solid")
            .put("strokeWidth", 1).put("strokeStyle", "solid").put("roughness", 0).put("opacity", 100).put("groupIds", new JSONArray())
            .put("roundness", JSONObject.NULL).put("seed", Math.abs(id.hashCode())).put("isDeleted", false)
            .put("boundElements", JSONObject.NULL).put("link", JSONObject.NULL).put("locked", false);
        return changed(o.put("id", id).put("type", type).put("x", Geometry.r2(x)).put("y", Geometry.r2(y)).put("width", Geometry.r2(w)).put("height", Geometry.r2(h))
            .put("frameId", frame == null ? JSONObject.NULL : frame));
    }

    /** The shape a held stroke snapped to (Host.penShape's answer), as Excalidraw's own element — clean lines, the
     *  pen's colour and about its width. Null for `[0]`. */
    static Figure snapped(float[] s, String id, String color, float width, String frame) {
        try {
            JSONObject o;
            switch ((int) s[0]) {
                case 1: // a line
                    o = base(null, "line", id, s[1], s[2], Math.abs(s[3] - s[1]), Math.abs(s[4] - s[2]), frame)
                        .put("points", new JSONArray().put(pt(0, 0)).put(pt(s[3] - s[1], s[4] - s[2])));
                    break;
                case 2: // a rectangle
                case 3: // an ellipse
                    o = base(null, s[0] == 2 ? "rectangle" : "ellipse", id, s[1] - s[3] / 2, s[2] - s[4] / 2, s[3], s[4], frame).put("angle", s[5]);
                    break;
                case 4: { // a triangle: a closed line, as Excalidraw draws polygons
                    float minX = Math.min(s[1], Math.min(s[3], s[5])), minY = Math.min(s[2], Math.min(s[4], s[6]));
                    float maxX = Math.max(s[1], Math.max(s[3], s[5])), maxY = Math.max(s[2], Math.max(s[4], s[6]));
                    o = base(null, "line", id, s[1], s[2], maxX - minX, maxY - minY, frame)
                        .put("points", new JSONArray().put(pt(0, 0)).put(pt(s[3] - s[1], s[4] - s[2])).put(pt(s[5] - s[1], s[6] - s[2])).put(pt(0, 0)));
                    break;
                }
                case 5: { // a path: closed, start head, end head, n, then n points (polygons, arrows, arcs)
                    boolean closed = s[1] != 0;
                    int n = (int) s[4];
                    if (n < 2 || s.length < 5 + 2 * n) return null;
                    float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
                    JSONArray pts = new JSONArray();
                    for (int i = 0; i < n; i++) {
                        float x = s[5 + 2 * i], y = s[6 + 2 * i];
                        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                        pts.put(pt(x - s[5], y - s[6]));
                    }
                    if (closed) pts.put(pt(0, 0));
                    boolean heads = s[2] != 0 || s[3] != 0;
                    o = base(null, heads ? "arrow" : "line", id, s[5], s[6], maxX - minX, maxY - minY, frame).put("points", pts);
                    o.put("strokeColor", color).put("strokeWidth", Geometry.r2(Math.max(0.5f, width)))
                        .put("lastCommittedPoint", JSONObject.NULL).put("startBinding", JSONObject.NULL).put("endBinding", JSONObject.NULL)
                        .put("startArrowhead", s[2] != 0 ? "arrow" : JSONObject.NULL).put("endArrowhead", s[3] != 0 ? "arrow" : JSONObject.NULL);
                    return new Figure(o);
                }
                default:
                    return null;
            }
            o.put("strokeColor", color).put("strokeWidth", Geometry.r2(Math.max(0.5f, width)));
            if (o.has("points")) o.put("lastCommittedPoint", JSONObject.NULL).put("startBinding", JSONObject.NULL).put("endBinding", JSONObject.NULL)
                .put("startArrowhead", JSONObject.NULL).put("endArrowhead", JSONObject.NULL);
            return new Figure(o);
        } catch (JSONException e) { return null; }
    }

    /** A shape drawn with the shapes tool, dragged from (x0, y0) to (x1, y1): a line or arrow between them, or the
     *  box between them as a rectangle, ellipse, diamond or triangle (its apex up). Null when it fails. */
    static Figure drawn(NotepadView.Shape kind, float x0, float y0, float x1, float y1, String id, String color, float width, String frame) {
        float l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
        Figure f;
        switch (kind) {
            case LINE: return snapped(new float[] { 1, x0, y0, x1, y1 }, id, color, width, frame);
            case ARROW: f = snapped(new float[] { 1, x0, y0, x1, y1 }, id, color, width, frame); break;
            case RECTANGLE: return snapped(new float[] { 2, l + w / 2, t + h / 2, w, h, 0 }, id, color, width, frame);
            case ELLIPSE: return snapped(new float[] { 3, l + w / 2, t + h / 2, w, h, 0 }, id, color, width, frame);
            case DIAMOND: f = snapped(new float[] { 2, l + w / 2, t + h / 2, w, h, 0 }, id, color, width, frame); break;
            case TRIANGLE: return snapped(new float[] { 4, l + w / 2, t, l + w, t + h, l, t + h }, id, color, width, frame);
            default: return null;
        }
        if (f == null) return null;
        try {
            if (kind == NotepadView.Shape.ARROW) f.e.put("type", "arrow").put("endArrowhead", "arrow");
            else f.e.put("type", "diamond");
        } catch (JSONException ex) { return null; }
        f.measure();
        return f;
    }

    /** XY axes filling the box (x0, y0)–(x1, y1), as Excalidraw elements in one group (moved and sized together, on the
     *  desktop too): two arrows, a tick every Page.RULE from the origin (so they meet a grid paper's lines), "x" and
     *  "y". `full`: all four quadrants, the origin in the middle; else the first, the origin at the bottom left. The
     *  origin and the ends sit on the ruling. Empty when the box is too small for one tick. */
    static java.util.List<Figure> axes(boolean full, float x0, float y0, float x1, float y1, IdMaker ids, String color, float width, String frame) {
        java.util.List<Figure> out = new java.util.ArrayList<>();
        float R = Page.RULE, l = snap(Math.min(x0, x1)), r = snap(Math.max(x0, x1)), t = snap(Math.min(y0, y1)), b = snap(Math.max(y0, y1));
        if (r - l < 2 * R || b - t < 2 * R) return out;
        float ox = full ? snap((l + r) / 2) : l, oy = full ? snap((t + b) / 2) : b, tick = R * 0.2f;
        String group = ids.next("axes");
        java.util.List<Figure> parts = new java.util.ArrayList<>();
        parts.add(drawn(NotepadView.Shape.ARROW, l, oy, r + R / 2, oy, ids.next("axis"), color, width, frame)); // x, past the last tick
        parts.add(drawn(NotepadView.Shape.ARROW, ox, b, ox, t - R / 2, ids.next("axis"), color, width, frame)); // y, upwards
        for (float x = l; x <= r + 0.1f; x += R) if (Math.abs(x - ox) > 0.1f) parts.add(drawn(NotepadView.Shape.LINE, x, oy - tick, x, oy + tick, ids.next("tick"), color, width * 0.7f, frame));
        for (float y = t; y <= b + 0.1f; y += R) if (Math.abs(y - oy) > 0.1f) parts.add(drawn(NotepadView.Shape.LINE, ox - tick, y, ox + tick, y, ids.next("tick"), color, width * 0.7f, frame));
        parts.add(text("x", r + R * 0.7f, oy + tick, 20, ids.next("label"), color, frame));
        parts.add(text("y", ox + tick * 1.5f, t - R * 1.2f, 20, ids.next("label"), color, frame));
        for (Figure f : parts) {
            if (f == null) continue;
            try { f.e.put("groupIds", new JSONArray().put(group)); } catch (JSONException e) { continue; }
            out.add(f);
        }
        return out;
    }

    private static float snap(float v) { return Math.round(v / Page.RULE) * Page.RULE; }

    /** A text element of `text` with its top left at (x, y), in Excalidraw's default font (Excalifont, 5). */
    static Figure text(String text, float x, float y, float size, String id, String color, String frame) {
        try {
            JSONObject o = base(null, "text", id, x, y, 0, 0, frame).put("strokeColor", color).put("fontSize", size).put("fontFamily", 5)
                .put("textAlign", "left").put("verticalAlign", "top").put("containerId", JSONObject.NULL).put("lineHeight", LINE_HEIGHT)
                .put("autoResize", true);
            Figure f = new Figure(o);
            f.setText(text);
            return f;
        } catch (JSONException e) { return null; }
    }

    /** For an arrow: the id of the element its start (or end) is bound to, or null. */
    String boundTo(boolean start) {
        JSONObject b = e.optJSONObject(start ? "startBinding" : "endBinding");
        return b == null ? null : b.optString("elementId", null);
    }

    /** Whether an arrow may bind to it (Excalidraw's bindable kinds). */
    boolean bindable() {
        switch (type()) { case "rectangle": case "ellipse": case "diamond": case "text": case "image": return true; default: return false; }
    }

    /** An arrow's start (or end) point, in scene units (an unturned arrow; null otherwise). */
    float[] end(boolean start) {
        JSONArray pts = e.optJSONArray("points");
        if (pts == null || pts.length() < 2 || angle() != 0) return null;
        JSONArray p = pts.optJSONArray(start ? 0 : pts.length() - 1);
        return p == null ? null : new float[] { x() + (float) p.optDouble(0), y() + (float) p.optDouble(1) };
    }

    /** Bound to `target` at its start (or end), and `target` told so (its `boundElements`), as Excalidraw keeps it. */
    void bind(boolean start, Figure target) {
        try {
            e.put(start ? "startBinding" : "endBinding", new JSONObject().put("elementId", target.id).put("focus", 0).put("gap", 4));
            listedOn(target, "arrow");
        } catch (JSONException ex) { /* ids and numbers */ }
    }

    /** Listed in `target`'s `boundElements` as a `type` ("arrow", "text": a label) bound to it, once. */
    void listedOn(Figure target, String type) throws JSONException {
        JSONArray bound = target.e.optJSONArray("boundElements");
        if (bound == null) { bound = new JSONArray(); target.e.put("boundElements", bound); }
        for (int i = 0; i < bound.length(); i++) if (id.equals(bound.optJSONObject(i) != null ? bound.optJSONObject(i).optString("id") : null)) return;
        bound.put(new JSONObject().put("id", id).put("type", type));
    }

    /** An arrow's bound start (or end) following its shape: mapped as the shape was (p' = A + sR(p − A) + d); the other
     *  points stay where they are. */
    void followEnd(boolean start, float dx, float dy, float ax, float ay, float s, float a) {
        float[] w = end(start);
        if (w == null) return;
        Geometry.transform(w, 0, 2, ax, ay, s, a);
        w[0] += dx; w[1] += dy;
        JSONArray pts = e.optJSONArray("points");
        try {
            if (start) { // the element's x, y is its first point: the others shift back by as much
                float sx = w[0] - x(), sy = w[1] - y();
                for (int i = 1; i < pts.length(); i++) {
                    JSONArray q = pts.optJSONArray(i);
                    if (q != null) q.put(0, Geometry.r2((float) q.optDouble(0) - sx)).put(1, Geometry.r2((float) q.optDouble(1) - sy));
                }
                e.put("x", Geometry.r2(w[0])).put("y", Geometry.r2(w[1]));
            } else {
                pts.optJSONArray(pts.length() - 1).put(0, Geometry.r2(w[0] - x())).put(1, Geometry.r2(w[1] - y()));
            }
            float minX = 0, minY = 0, maxX = 0, maxY = 0;
            for (int i = 0; i < pts.length(); i++) {
                JSONArray q = pts.optJSONArray(i);
                if (q == null) continue;
                minX = Math.min(minX, (float) q.optDouble(0)); maxX = Math.max(maxX, (float) q.optDouble(0));
                minY = Math.min(minY, (float) q.optDouble(1)); maxY = Math.max(maxY, (float) q.optDouble(1));
            }
            e.put("width", Geometry.r2(maxX - minX)).put("height", Geometry.r2(maxY - minY));
        } catch (JSONException ex) { /* numbers */ }
        measure();
    }

    /** A picture element showing the scene's file `fileId`, `w` × `h` with its top left at (x, y). */
    static Figure picture(String fileId, float x, float y, float w, float h, String id, String frame) {
        try {
            return new Figure(base(null, "image", id, x, y, w, h, frame).put("fileId", fileId).put("status", "saved")
                .put("scale", new JSONArray().put(1).put(1)).put("crop", JSONObject.NULL));
        } catch (JSONException e) { return null; }
    }

    /** Page `page` of the vault's PDF `path`, linked and never copied (PageSource draws it on the fly): an image
     *  element with no file, `customData.atlasPage = {file, page}` saying which page; the web draws it with pdf.js. */
    static Figure linkedPage(String path, int page, float x, float y, float w, float h, String id, String frame) {
        Figure f = picture(org.atlas.capture.PageSource.fileId(path, page), x, y, w, h, id, frame);
        if (f == null) return null;
        try { f.e.put("customData", new JSONObject().put("atlasPage", new JSONObject().put("file", path).put("page", page))); } catch (JSONException e) { return null; }
        return f;
    }

    /** A copy with `text` instead (the same id: it replaces this one, which undo puts back). */
    Figure edited(String text) {
        try {
            Figure f = new Figure(new JSONObject(e.toString()));
            f.setText(text);
            return f;
        } catch (JSONException ex) { return null; }
    }

    /** Excalidraw's hand-written font (Excalifont, the app's res/font), set once by NotepadView; null: sans. */
    static Typeface hand;

    /** The face for Excalidraw's `fontFamily`: 1 Virgil and 5 Excalifont hand-written, 3 and 8 code, the rest sans. */
    static Typeface typeface(int family) {
        if (family == 3 || family == 8) return Typeface.MONOSPACE;
        if ((family == 1 || family == 5) && hand != null) return hand;
        return Typeface.SANS_SERIF;
    }

    /** Its text and its box measured again, as the Painter draws it (Excalidraw measures again when it opens it). */
    private void setText(String t) throws JSONException {
        float size = (float) e.optDouble("fontSize", 20);
        Paint p = new Paint();
        p.setTextSize(size);
        p.setTypeface(typeface(e.optInt("fontFamily", 5)));
        String[] lines = t.split("\n", -1);
        float w = 0;
        for (String l : lines) w = Math.max(w, p.measureText(l));
        e.put("text", t).put("originalText", t).put("width", Geometry.r2(w)).put("height", Geometry.r2(lines.length * size * LINE_HEIGHT));
        measure();
    }

    private static JSONArray pt(float x, float y) throws JSONException { return new JSONArray().put(Geometry.r2(x)).put(Geometry.r2(y)); }
}
