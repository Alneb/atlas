package org.atlas.notepad;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/** Draws the drawing's items as Excalidraw shows them, in scene units on a canvas already scaled: strokes from their
 *  openink ink, figures (boxes, ellipses, diamonds, lines, arrows, text, pictures) from their elements — clean, as
 *  Excalidraw's "architect" style, since e-ink shows sketchy lines as noise. Colours are the element's; on an e-ink
 *  screen without colour they come out as greys by the panel itself. */
final class Painter {
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), line = new Paint(Paint.ANTI_ALIAS_FLAG), text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint pic = new Paint(Paint.FILTER_BITMAP_FLAG);
    /** The scene's `files` (pictures as data URLs), and the pictures decoded from it. */
    private JSONObject files = new JSONObject();
    private final Map<String, Bitmap> decoded = new HashMap<>();

    Painter() {
        fill.setStyle(Paint.Style.FILL);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
    }

    void files(JSONObject f) { files = f == null ? new JSONObject() : f; decoded.clear(); }

    /** Where a linked page's picture comes from (PageSource), or none: those pages show as their outline. */
    interface Linked { Bitmap page(String file, int page, float px); }
    private Linked linked;
    void linked(Linked l) { linked = l; }

    static boolean isColor(String s) { return s != null && s.matches("#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})"); }

    /** "#rgb" / "#rrggbb" / "#rrggbbaa" (Excalidraw's) → ARGB; `or` for "transparent" and anything else. */
    static int color(String s, int or) {
        if (!isColor(s)) return or;
        String h = s.substring(1);
        if (h.length() == 3) h = "" + h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        long v = Long.parseLong(h, 16);
        return h.length() == 8 ? (int) (((v & 0xff) << 24) | (v >> 8)) : (int) (0xff000000L | v);
    }

    void stroke(Canvas c, Stroke s) {
        fill.setColor(color(s.color, Color.BLACK));
        if (s.fill != null) {
            if (s.translucent) { c.saveLayerAlpha(s.box, 128); c.drawPath(s.fill, fill); c.restore(); }
            else c.drawPath(s.fill, fill);
        } else if (s.charcoal != null) {
            c.drawBitmap(s.charcoal, null, s.charcoalBox, fill); // ALPHA_8: drawn in the paint's colour, unfiltered
        } else if (s.dabs != null) {
            int base = fill.getAlpha();
            for (int i = 0; i + 4 < s.dabs.length; i += 5) {
                fill.setAlpha(Math.round(base * Math.max(0, Math.min(1, s.dabs[i + 4]))));
                c.drawCircle(s.dabs[i], s.dabs[i + 1], s.dabs[i + 2] / 2, fill);
            }
        }
    }

    void figure(Canvas c, Figure f) {
        JSONObject e = f.e;
        int alpha = Math.round(255 * Math.max(0, Math.min(100, e.optInt("opacity", 100))) / 100f);
        float w = f.w(), h = f.h(), x = f.x(), y = f.y();
        int save = c.save();
        if (f.angle() != 0) { float[] pv = f.pivot(); c.rotate((float) Math.toDegrees(f.angle()), pv[0], pv[1]); }
        line.setColor(color(e.optString("strokeColor"), Color.BLACK));
        line.setAlpha(alpha * Color.alpha(line.getColor()) / 255);
        line.setStrokeWidth(Math.max(0.5f, (float) e.optDouble("strokeWidth", 1)));
        String style = e.optString("strokeStyle", "solid");
        float sw = line.getStrokeWidth();
        line.setPathEffect("dashed".equals(style) ? new DashPathEffect(new float[] { 8 * sw, 6 * sw }, 0) : "dotted".equals(style) ? new DashPathEffect(new float[] { sw, 4 * sw }, 0) : null);
        int bg = color(e.optString("backgroundColor"), 0);
        fill.setColor(bg);
        fill.setAlpha(Color.alpha(bg) * alpha / 255 * ("solid".equals(e.optString("fillStyle", "solid")) ? 255 : 110) / 255); // hachure as a light tint
        switch (f.type()) {
            case "rectangle": {
                RectF r = new RectF(x, y, x + w, y + h);
                float rad = e.isNull("roundness") ? 0 : Math.min(32, Math.min(Math.abs(w), Math.abs(h)) / 4);
                if (Color.alpha(bg) > 0) c.drawRoundRect(r, rad, rad, fill);
                c.drawRoundRect(r, rad, rad, line);
                break;
            }
            case "ellipse": {
                RectF r = new RectF(x, y, x + w, y + h);
                if (Color.alpha(bg) > 0) c.drawOval(r, fill);
                c.drawOval(r, line);
                break;
            }
            case "diamond": {
                Path p = new Path();
                p.moveTo(x + w / 2, y); p.lineTo(x + w, y + h / 2); p.lineTo(x + w / 2, y + h); p.lineTo(x, y + h / 2); p.close();
                if (Color.alpha(bg) > 0) c.drawPath(p, fill);
                c.drawPath(p, line);
                break;
            }
            case "line":
            case "arrow":
                polyline(c, e, x, y, bg);
                break;
            case "text":
                text(c, e, x, y, w);
                break;
            case "image":
                picture(c, e, x, y, w, h);
                break;
            default: // an embed, a web page, a kind Notepad does not know: its box, so it is seen and can be moved
                line.setPathEffect(new DashPathEffect(new float[] { 6, 4 }, 0));
                c.drawRect(x, y, x + w, y + h, line);
        }
        line.setPathEffect(null);
        c.restoreToCount(save);
    }

    private void polyline(Canvas c, JSONObject e, float x, float y, int bg) {
        JSONArray pts = e.optJSONArray("points");
        if (pts == null || pts.length() < 2) return;
        Path p = new Path();
        int n = pts.length();
        float[] xy = new float[n * 2];
        for (int i = 0; i < n; i++) { JSONArray q = pts.optJSONArray(i); xy[2 * i] = x + (q == null ? 0 : (float) q.optDouble(0)); xy[2 * i + 1] = y + (q == null ? 0 : (float) q.optDouble(1)); }
        p.moveTo(xy[0], xy[1]);
        boolean round = !e.isNull("roundness") && n > 2;
        for (int i = 1; i < n; i++) {
            if (round && i < n - 1) p.quadTo(xy[2 * i], xy[2 * i + 1], (xy[2 * i] + xy[2 * i + 2]) / 2, (xy[2 * i + 1] + xy[2 * i + 3]) / 2); // smoothed through the midpoints
            else p.lineTo(xy[2 * i], xy[2 * i + 1]);
        }
        if (Color.alpha(bg) > 0 && xy[0] == xy[2 * n - 2] && xy[1] == xy[2 * n - 1]) c.drawPath(p, fill);
        c.drawPath(p, line);
        if ("arrow".equals(e.optString("type"))) {
            head(c, e.optString("endArrowhead", "arrow"), xy[2 * n - 4], xy[2 * n - 3], xy[2 * n - 2], xy[2 * n - 1]);
            if (!e.isNull("startArrowhead")) head(c, e.optString("startArrowhead"), xy[2], xy[3], xy[0], xy[1]);
        }
    }

    /** An arrowhead at (bx, by), pointing from (ax, ay). */
    private void head(Canvas c, String kind, float ax, float ay, float bx, float by) {
        if (kind == null || kind.isEmpty() || "null".equals(kind)) return;
        double a = Math.atan2(by - ay, bx - ax), len = Math.max(10, line.getStrokeWidth() * 6);
        float x1 = (float) (bx - len * Math.cos(a - 0.45)), y1 = (float) (by - len * Math.sin(a - 0.45));
        float x2 = (float) (bx - len * Math.cos(a + 0.45)), y2 = (float) (by - len * Math.sin(a + 0.45));
        if ("triangle".equals(kind)) {
            Path p = new Path();
            p.moveTo(bx, by); p.lineTo(x1, y1); p.lineTo(x2, y2); p.close();
            int keep = fill.getColor();
            fill.setColor(line.getColor());
            c.drawPath(p, fill);
            fill.setColor(keep);
        } else if ("dot".equals(kind) || "circle".equals(kind)) {
            c.drawCircle(bx, by, (float) len / 4, line);
        } else if ("bar".equals(kind)) {
            float px = (float) (len / 2 * -Math.sin(a)), py = (float) (len / 2 * Math.cos(a));
            c.drawLine(bx - px, by - py, bx + px, by + py, line);
        } else {
            c.drawLine(bx, by, x1, y1, line);
            c.drawLine(bx, by, x2, y2, line);
        }
    }

    private void text(Canvas c, JSONObject e, float x, float y, float w) {
        float size = (float) e.optDouble("fontSize", 20);
        text.setTextSize(size);
        text.setColor(line.getColor());
        int fam = e.optInt("fontFamily", 5);
        text.setTypeface(Figure.typeface(fam)); // Excalifont, as Excalidraw draws it (was sans: "really ugly")
        String align = e.optString("textAlign", "left");
        text.setTextAlign("center".equals(align) ? Paint.Align.CENTER : "right".equals(align) ? Paint.Align.RIGHT : Paint.Align.LEFT);
        float tx = "center".equals(align) ? x + w / 2 : "right".equals(align) ? x + w : x;
        float lh = size * (float) e.optDouble("lineHeight", 1.25);
        String[] lines = e.optString("text").split("\n", -1);
        for (int i = 0; i < lines.length; i++) c.drawText(lines[i], tx, y + lh * i + size * 0.95f, text);
    }

    private void picture(Canvas c, JSONObject e, float x, float y, float w, float h) {
        JSONObject custom = e.optJSONObject("customData"), at = custom == null ? null : custom.optJSONObject("atlasPage");
        Bitmap b = at != null && linked != null ? linked.page(at.optString("file"), at.optInt("page", 1), w * scaleOf(c)) : bitmap(e.optString("fileId"));
        if (b == null) { line.setPathEffect(new DashPathEffect(new float[] { 6, 4 }, 0)); c.drawRect(x, y, x + w, y + h, line); return; }
        JSONArray scale = e.optJSONArray("scale");
        int save = c.save();
        if (scale != null && (scale.optDouble(0, 1) < 0 || scale.optDouble(1, 1) < 0)) c.scale((float) scale.optDouble(0, 1), (float) scale.optDouble(1, 1), x + w / 2, y + h / 2);
        c.drawBitmap(b, null, new RectF(x, y, x + w, y + h), pic);
        c.restoreToCount(save);
    }

    /** The canvas's scale (scene units → px): a linked page is rendered at the size it is drawn. */
    @SuppressWarnings("deprecation")
    private static float scaleOf(Canvas c) {
        float[] v = new float[9];
        c.getMatrix().getValues(v);
        return Math.max(0.05f, (float) Math.hypot(v[0], v[3]));
    }

    /** A picture of the scene's `files`, decoded once (a data URL's base64). */
    private Bitmap bitmap(String id) {
        if (id == null || id.isEmpty()) return null;
        if (decoded.containsKey(id)) return decoded.get(id);
        Bitmap b = null;
        JSONObject f = files.optJSONObject(id);
        String url = f != null ? f.optString("dataURL") : "";
        int comma = url.indexOf(',');
        if (comma > 0 && url.substring(0, comma).endsWith(";base64")) {
            try {
                byte[] bytes = Base64.decode(url.substring(comma + 1), Base64.DEFAULT);
                b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            } catch (IllegalArgumentException | OutOfMemoryError ex) { b = null; }
        }
        decoded.put(id, b);
        return b;
    }
}
