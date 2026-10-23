package org.atlas.plugins.notepad;

import android.graphics.Canvas;
import android.graphics.Path;
import android.graphics.RectF;

import org.atlas.capture.Host;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** A pen stroke drawn by openink (Host.penInk): its samples (x, y, pressure, tiltX, tiltY, tMs), its pen and config,
 *  its colour; its ink made from them, so it is a pure function of what the file keeps. Saved as an Excalidraw
 *  `freedraw` (points + pressures, which every Excalidraw draws) with `customData.openink` = { pen, config, tilt, t }
 *  (which a Boox redraws exactly) and `customData.atlasPen`, the web notepad's closest pen. */
final class Stroke extends Item {
    static final int SAMPLE = 6;
    /** When its pen came down (event time, ms; 0 for a stroke read from the file): the clock its samples' t counts from. */
    long downAt;
    /** openink's highlighter (Host.PENS[3]). */
    static final int HIGHLIGHTER = 3;
    /** How many strokeWidths across the web draws this stroke: perfect-freehand's size 4.25 × strokeWidth (a radius),
     *  sine easing, and the web pen's thinning (ui/src/lib/draw-ink.ts INK: fountain .6, ballpoint and highlighter 0),
     *  at the stroke's mean pressure — ≈ 7 for a fountain at the Boox's usual 0.85–0.95, 6 for the others. So the web
     *  draws a Boox stroke as wide as openink does (was a flat 4.25: ~1.7 × too thick). */
    float outline() {
        double thinning = pen == 0 || pen == HIGHLIGHTER ? 0 : 0.6;
        return (float) (2 * 4.25 * Math.sin(Math.PI / 2 * (0.5 - thinning * (0.5 - meanPressure()))));
    }

    float meanPressure() {
        float sum = 0;
        for (int i = 2; i < samples.length; i += SAMPLE) sum += samples[i];
        return samples.length == 0 ? 0.5f : sum / (samples.length / SAMPLE);
    }

    /** The web notepad's pen closest to openink's (its `customData.atlasPen`). */
    static String webPen(int pen) { return pen == 0 ? "ballpoint" : pen == HIGHLIGHTER ? "highlighter" : "fountain"; }

    int pen;
    float[] cfg, samples;
    String color = "#000000";
    String link;
    /** The element as read, when it came from the file: what is not Notepad's (groups, locks…) is kept. */
    JSONObject source;
    Path fill;     // the filled pens' ink
    float[] dabs;  // the pencil's and charcoal's: x, y, size, angle, alpha
    android.graphics.Bitmap charcoal; // the charcoal's dithered look (ALPHA_8, engine px), drawn into charcoalBox
    final RectF charcoalBox = new RectF();
    static final int CHARCOAL = 6;
    boolean translucent;

    /** Its ink from its samples and config. */
    /** Engine pixels a scene unit: openink's formulas (speed thinning, the smoothing step, the least width) are libneo's,
     *  in a 300-dpi panel's pixels, and a scene unit is 1/96 inch. Fed scene units, the ink depended on the zoom it was
     *  written at and speed hardly thinned it (boox_5c_re STROKE.md). Fixed, so a stroke renders alike everywhere. */
    static final float PX = 300f / 96f;

    void render(Host host) {
        float[] ink;
        float[] px = samples.clone(), c = cfg.clone();
        for (int i = 0; i + 1 < px.length; i += SAMPLE) { px[i] *= PX; px[i + 1] *= PX; }
        c[0] *= PX;
        try { ink = host.penInk(pen, c, px); } catch (IllegalArgumentException e) { ink = new float[] { Float.NaN, 0, 0, 0 }; }
        // back to scene units: the bounds, every polygon's points (after its count), or the dabs' x, y, size
        int out0 = Float.isNaN(ink[0]) ? -1 : host.penOutput(pen);
        for (int i = 0; i < 4 && out0 >= 0; i++) ink[i] /= PX;
        if (out0 == 2) { for (int i = 4; i + 2 < ink.length; i += 5) { ink[i] /= PX; ink[i + 1] /= PX; ink[i + 2] /= PX; } }
        else if (out0 >= 0) for (int i = 4; i < ink.length; ) {
            int n = (int) ink[i];
            if (n < 1 || i + 1 + 2 * n > ink.length) break;
            for (int k = 1; k <= 2 * n; k++) ink[i + k] /= PX;
            i += 1 + 2 * n;
        }
        fill = null;
        dabs = null;
        if (Float.isNaN(ink[0])) { box.setEmpty(); return; }
        box.set(ink[0], ink[1], ink[2], ink[3]);
        int out = host.penOutput(pen);
        translucent = out == 1;
        if (out == 2) {
            dabs = Arrays.copyOfRange(ink, 4, ink.length);
            charcoal = pen == CHARCOAL ? charcoalBitmap(host, c, px) : null;
            return;
        }
        Path p = new Path();
        p.setFillType(Path.FillType.WINDING); // the pieces share one orientation: their union
        for (int i = 4; i < ink.length; ) {
            int n = (int) ink[i];
            if (n < 3 || i + 1 + 2 * n > ink.length) break;
            p.moveTo(ink[i + 1], ink[i + 2]);
            for (int k = 1; k < n; k++) p.lineTo(ink[i + 1 + 2 * k], ink[i + 2 + 2 * k]);
            p.close();
            i += 1 + 2 * n;
        }
        fill = p;
    }

    /** Onyx's charcoal look (on/off pixels, boox_5c_re docs/STROKE.md "Charcoal V2"), from the engine-px samples. */
    private android.graphics.Bitmap charcoalBitmap(Host host, float[] c, float[] px) {
        byte[] b;
        try { b = host.penCharcoal(pen, c, px); } catch (IllegalArgumentException e) { return null; }
        if (b == null || b.length < 16) return null;
        java.nio.ByteBuffer hd = java.nio.ByteBuffer.wrap(b, 0, 16).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        int l = hd.getInt(), t = hd.getInt(), w = hd.getInt(), h = hd.getInt();
        if (w <= 0 || h <= 0 || b.length < 16 + w * h) return null;
        android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ALPHA_8);
        bm.copyPixelsFromBuffer(java.nio.ByteBuffer.wrap(b, 16, w * h));
        charcoalBox.set(l / PX, t / PX, (l + w) / PX, (t + h) / PX);
        return bm;
    }

    @Override void draw(Canvas c, Painter p) { p.stroke(c, this); }

    @Override boolean touches(float x, float y, float r) {
        float reach = r + cfg[0] / 2;
        if (x < box.left - reach || x > box.right + reach || y < box.top - reach || y > box.bottom + reach) return false;
        for (int j = 0; j < samples.length; j += SAMPLE) {
            if (Math.hypot(samples[j] - x, samples[j + 1] - y) < reach) return true;
            if (j + SAMPLE < samples.length && Geometry.segmentDistance(x, y, samples[j], samples[j + 1], samples[j + SAMPLE], samples[j + SAMPLE + 1]) < reach) return true; // between far samples
        }
        return false;
    }

    /** The samples within `r` (+ half the width) of the eraser's path from (x0, y0) to (x1, y1) — and both ends of a
     *  piece of the line the path crosses between them: a fast stroke's samples lie far apart, and an eraser passing
     *  between two of them touched neither (strokes the eraser would not take, the lasso would). */
    private boolean[] erased(float x0, float y0, float x1, float y1, float r) {
        float reach = r + cfg[0] / 2;
        boolean[] hit = new boolean[samples.length / SAMPLE];
        for (int i = 0; i < hit.length; i++) {
            float ax = samples[i * SAMPLE], ay = samples[i * SAMPLE + 1];
            if (Geometry.segmentDistance(ax, ay, x0, y0, x1, y1) < reach) hit[i] = true;
            if (i + 1 < hit.length && Geometry.segmentsDistance(ax, ay, samples[(i + 1) * SAMPLE], samples[(i + 1) * SAMPLE + 1], x0, y0, x1, y1) < reach) { hit[i] = true; hit[i + 1] = true; }
        }
        return hit;
    }

    /** Whether the eraser's path touches it at all. */
    @Override boolean crossedBy(float x0, float y0, float x1, float y1, float r) {
        float reach = r + cfg[0] / 2;
        if (Math.max(x0, x1) < box.left - reach || Math.min(x0, x1) > box.right + reach || Math.max(y0, y1) < box.top - reach || Math.min(y0, y1) > box.bottom + reach) return false;
        for (boolean h : erased(x0, y0, x1, y1, r)) if (h) return true;
        return false;
    }

    /** What is left after the area eraser passed (Boox Notes' and Rnote's "split" eraser): the runs of samples it
     *  missed, each at least two samples long, as their own strokes with this pen, config and colour. */
    List<Stroke> rest(float x0, float y0, float x1, float y1, float r, IdMaker ids) {
        boolean[] hit = erased(x0, y0, x1, y1, r);
        List<Stroke> out = new ArrayList<>();
        int start = -1;
        for (int i = 0; i <= hit.length; i++) {
            boolean keep = i < hit.length && !hit[i];
            if (keep && start < 0) start = i;
            if (!keep && start >= 0) {
                if (i - start >= 2) out.add(piece(start, i, ids.next("pen")));
                start = -1;
            }
        }
        return out;
    }

    private Stroke piece(int from, int to, String newId) {
        Stroke s = like(newId);
        s.samples = Arrays.copyOfRange(samples, from * SAMPLE, to * SAMPLE);
        float t0 = s.samples[5];
        for (int j = 5; j < s.samples.length; j += SAMPLE) s.samples[j] -= t0; // its own time from its own pen-down
        return s;
    }

    /** A stroke with this one's pen, config, colour, page and link, and no samples yet. */
    private Stroke like(String newId) {
        Stroke s = new Stroke();
        s.id = newId;
        s.pen = pen;
        s.cfg = cfg.clone();
        s.color = color;
        s.frame = frame;
        s.link = link;
        return s;
    }

    @Override float[] anchors() {
        int n = samples.length / SAMPLE, step = Math.max(1, n / 24);
        float[] a = new float[((n + step - 1) / step) * 2];
        for (int i = 0, k = 0; i < n && k < a.length; i += step, k += 2) { a[k] = samples[i * SAMPLE]; a[k + 1] = samples[i * SAMPLE + 1]; }
        return a;
    }

    @Override void moveBy(float dx, float dy) {
        for (int j = 0; j < samples.length; j += SAMPLE) { samples[j] += dx; samples[j + 1] += dy; }
        if (fill != null) fill.offset(dx, dy);
        if (dabs != null) for (int i = 0; i + 4 < dabs.length; i += 5) { dabs[i] += dx; dabs[i + 1] += dy; }
        box.offset(dx, dy);
        charcoalBox.offset(dx, dy);
    }

    @Override void transform(float ax, float ay, float s, float a, Host host) {
        Geometry.transform(samples, 0, SAMPLE, ax, ay, s, a);
        Geometry.transform(samples, 3, SAMPLE, 0, 0, 1, a); // the pen's tilt turns with the ink
        cfg[0] *= s; // and the line grows with it, as Boox Notes scales ink
        render(host);
    }

    @Override boolean under() { return pen == HIGHLIGHTER; }

    @Override String color() { return color; }
    @Override void setColor(String c) { color = c; }
    @Override String link() { return link; }
    @Override void setLink(String l) { link = l; }

    @Override Item copy(String newId, float dx, float dy) {
        Stroke s = like(newId);
        s.samples = samples.clone();
        s.fill = fill == null ? null : new Path(fill);
        s.dabs = dabs == null ? null : dabs.clone();
        s.charcoal = charcoal; // immutable once made: shared
        s.charcoalBox.set(charcoalBox);
        s.translucent = translucent;
        s.box.set(box);
        s.moveBy(dx, dy);
        return s;
    }

    /** A freedraw as a stroke: its openink samples and config when a Boox wrote it, else its points and pressures with
     *  the closest pen (a stroke from Excalidraw or Atlas's web notepad, approximated). Null when it has no points. */
    static Stroke from(JSONObject e, Host host, float density) {
        JSONArray pts = e.optJSONArray("points");
        if (pts == null || pts.length() == 0) return null;
        JSONArray pr = e.optJSONArray("pressures");
        JSONObject custom = e.optJSONObject("customData");
        JSONObject oi = custom != null ? custom.optJSONObject("openink") : null;
        JSONArray tilt = oi != null ? oi.optJSONArray("tilt") : null, t = oi != null ? oi.optJSONArray("t") : null;
        float x0 = (float) e.optDouble("x"), y0 = (float) e.optDouble("y");
        Stroke s = new Stroke();
        s.id = e.optString("id");
        s.source = e;
        s.frame = e.isNull("frameId") ? null : e.optString("frameId", null);
        s.link = e.isNull("link") ? null : e.optString("link", null);
        s.color = Painter.isColor(e.optString("strokeColor")) ? e.optString("strokeColor") : "#000000";
        s.samples = new float[pts.length() * SAMPLE];
        for (int i = 0; i < pts.length(); i++) {
            JSONArray p = pts.optJSONArray(i);
            JSONArray ti = tilt != null ? tilt.optJSONArray(i) : null;
            if (p == null) continue;
            s.samples[i * SAMPLE] = x0 + (float) p.optDouble(0);
            s.samples[i * SAMPLE + 1] = y0 + (float) p.optDouble(1);
            s.samples[i * SAMPLE + 2] = pr != null && i < pr.length() ? (float) pr.optDouble(i, 0.5) : 0.5f;
            s.samples[i * SAMPLE + 3] = ti != null ? (float) ti.optDouble(0) : 0;
            s.samples[i * SAMPLE + 4] = ti != null ? (float) ti.optDouble(1) : 0;
            s.samples[i * SAMPLE + 5] = t != null ? (float) t.optDouble(i, i * 4.0) : i * 4f; // a pen's ~250 Hz when unknown
        }
        JSONArray cfg = oi != null ? oi.optJSONArray("config") : null;
        if (cfg != null && cfg.length() >= 6) { // 6 (older) or 8: was `== 6`, so every stroke saved with 8 was redrawn with the defaults
            s.pen = Math.max(0, Math.min(Host.PENS.length - 1, oi.optInt("pen", 1)));
            s.cfg = new float[cfg.length() >= 8 ? 8 : 6]; // 6: a drawing from before dpi/minWidth (read as 300 dpi, 0.001)
            for (int i = 0; i < s.cfg.length; i++) s.cfg[i] = (float) cfg.optDouble(i);
        } else {
            String web = custom != null ? custom.optString("atlasPen") : "";
            s.pen = "ballpoint".equals(web) ? 0 : "highlighter".equals(web) ? HIGHLIGHTER : 1;
            s.cfg = sceneDefaults(host, s.pen, density);
            s.cfg[0] = (float) e.optDouble("strokeWidth", 1) * s.outline();
        }
        s.render(host);
        return s;
    }

    /** A pen's knote2 config at this screen, in scene units (the engine works in the units of its samples). */
    static float[] sceneDefaults(Host host, int pen, float density) {
        float[] c = host.penDefaults(pen);
        c[0] /= density;
        return c;
    }

    @Override JSONObject element() throws JSONException {
        float x0 = samples[0], y0 = samples[1];
        JSONArray pts = new JSONArray(), pr = new JSONArray(), tilt = new JSONArray(), t = new JSONArray(), cfgs = new JSONArray();
        float minX = x0, minY = y0, maxX = x0, maxY = y0;
        for (int i = 0; i < samples.length; i += SAMPLE) {
            float x = samples[i], y = samples[i + 1];
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            pts.put(new JSONArray().put(DrawingSize.point(x - x0)).put(DrawingSize.point(y - y0)));
            pr.put(DrawingSize.pressure(samples[i + 2]));
            tilt.put(new JSONArray().put(Geometry.r2(samples[i + 3])).put(Geometry.r2(samples[i + 4])));
            t.put(Geometry.r2(samples[i + 5]));
        }
        for (float c : cfg) cfgs.put(Math.round(c * 10000) / 10000.0);
        JSONObject custom = source != null && source.optJSONObject("customData") != null ? new JSONObject(source.optJSONObject("customData").toString()) : new JSONObject();
        custom.put("atlasPen", webPen(pen)).put("openink", new JSONObject().put("pen", pen).put("config", cfgs).put("tilt", tilt).put("t", t));
        return Figure.base(source, "freedraw", id, x0, y0, maxX - minX, maxY - minY, frame)
            .put("strokeColor", color).put("strokeWidth", Geometry.r2(cfg[0] / outline())).put("opacity", pen == HIGHLIGHTER ? 50 : 100)
            .put("link", link == null ? JSONObject.NULL : link)
            .put("points", pts).put("pressures", pr).put("simulatePressure", false).put("lastCommittedPoint", JSONObject.NULL)
            .put("customData", custom);
    }
}
