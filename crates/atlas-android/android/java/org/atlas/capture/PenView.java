package org.atlas.capture;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** A pen canvas (docs/design/DESIGN-pen-eink-reader.md, "The pen"): strokes with the pen's own pressure, every sample
 *  the hardware gives (MotionEvent's historical points), the pen's eraser end (or its button) erasing whole strokes,
 *  and, once a stylus has touched it, fingers ignored (palm rejection). On a Boox the ink under the pen is drawn by
 *  Onyx's screen itself (Ink), so it shows with no e-ink lag; the canvas draws the lasting stroke. Saved as an Excalidraw
 *  scene of `freedraw` elements — the same mapping as the Rnote plugin (plugins/beta/rnote), so every Atlas opens it. */
final class PenView extends View {
    /** One stroke: points in CSS pixels (px / density, as Excalidraw on the desktop measures), pressure 0–1. */
    private static final class Stroke {
        final List<float[]> pts = new ArrayList<>(); // {x, y, pressure}
        final RectF box = new RectF();
        void add(float x, float y, float p) {
            if (pts.isEmpty()) box.set(x, y, x, y); else box.union(x, y);
            pts.add(new float[] { x, y, p });
        }
    }

    /** Excalidraw draws a freedraw line `strokeWidth × 4.25` wide at mid pressure; WIDTH is the full width at full pressure. */
    private static final float WIDTH = 2.6f, FREEDRAW_SCALE = 0.6f / 4.25f;

    private final List<Stroke> strokes = new ArrayList<>();
    private Stroke current;
    private boolean erasing, stylusSeen;
    private boolean eraserMode; // the Eraser button: every tool erases
    private float lastX = Float.NaN, lastY;
    private final float density;
    private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
    private Bitmap done; // the finished strokes, drawn once: a new sample redraws only its own segment
    private final Ink fast;
    /** Told after each stroke or erase (the box shows "Done" only when there is something). */
    Runnable onChange = () -> {};

    PenView(Context c, boolean eink) {
        super(c);
        density = c.getResources().getDisplayMetrics().density;
        ink.setColor(Color.BLACK);
        ink.setStyle(Paint.Style.STROKE);
        ink.setStrokeCap(Paint.Cap.ROUND);
        setBackgroundColor(Color.WHITE);
        fast = eink ? Ink.onyx(this) : Ink.NONE;
    }

    boolean isEmpty() { return strokes.isEmpty(); }

    /** The Eraser button (a pen without an eraser end, a finger): every touch erases. Onyx's quick ink is closed
     *  meanwhile, or it would draw the eraser's path as ink. */
    void eraser(boolean on) {
        eraserMode = on;
        if (on) fast.stop(); else post(this::startInk);
    }

    boolean eraser() { return eraserMode; }

    /** Over a picture (a screenshot marked up): no paper of its own, the picture shows through. */
    void overPicture() { setBackgroundColor(Color.TRANSPARENT); }

    private void startInk() { if (!eraserMode) fast.start(); }

    void undo() { if (!strokes.isEmpty()) { strokes.remove(strokes.size() - 1); redrawAll(); onChange.run(); } }

    void clear() { strokes.clear(); redrawAll(); onChange.run(); }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) { redrawAll(); post(this::startInk); } // laid out: the region follows

    @Override
    protected void onAttachedToWindow() { super.onAttachedToWindow(); post(this::startInk); } // after layout: where the view is

    /** Onyx's ink is the focused window's: back in front (a dialog closed, the app resumed), it is opened again. */
    @Override
    public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) post(this::startInk); }

    @Override
    protected void onDetachedFromWindow() { fast.stop(); super.onDetachedFromWindow(); }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        int tool = e.getToolType(0);
        boolean stylus = tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER;
        if (stylus) stylusSeen = true;
        else if (stylusSeen) return false; // a palm or a finger while writing with the pen
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                erasing = eraserMode || tool == MotionEvent.TOOL_TYPE_ERASER || (e.getButtonState() & MotionEvent.BUTTON_STYLUS_PRIMARY) != 0;
                if (erasing) { lastX = Float.NaN; erase(e.getX(), e.getY()); return true; }
                current = new Stroke();
                sample(e.getX(), e.getY(), e.getPressure());
                fast.down(e.getX(), e.getY(), e.getPressure());
                return true;
            case MotionEvent.ACTION_MOVE:
                for (int h = 0; h < e.getHistorySize(); h++) move(e.getHistoricalX(h), e.getHistoricalY(h), e.getHistoricalPressure(h));
                move(e.getX(), e.getY(), e.getPressure());
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (current != null) {
                    if (current.pts.size() > 1 || e.getActionMasked() == MotionEvent.ACTION_UP) strokes.add(current);
                    current = null;
                    fast.up();
                    onChange.run();
                }
                erasing = false;
                return true;
            default:
                return true;
        }
    }

    private void move(float x, float y, float p) {
        if (erasing) { erase(x, y); return; }
        if (current == null) return;
        fast.to(x, y, p);
        sample(x, y, p);
    }

    /** A new sample: drawn onto the finished-strokes bitmap at once (its segment only), kept in CSS pixels. */
    private void sample(float x, float y, float p) {
        float pressure = p <= 0 ? 0.5f : Math.min(1f, p);
        if (!current.pts.isEmpty() && done != null) {
            float[] a = current.pts.get(current.pts.size() - 1);
            segment(new Canvas(done), a[0] * density, a[1] * density, a[2], x, y, pressure);
            float r = WIDTH * density * 2;
            invalidate((int) (Math.min(a[0] * density, x) - r), (int) (Math.min(a[1] * density, y) - r), (int) (Math.max(a[0] * density, x) + r), (int) (Math.max(a[1] * density, y) + r));
        }
        current.add(x / density, y / density, pressure);
    }

    private void segment(Canvas c, float x0, float y0, float p0, float x1, float y1, float p1) {
        ink.setStrokeWidth(WIDTH * density * (0.35f + 0.65f * (p0 + p1) / 2));
        c.drawLine(x0, y0, x1, y1, ink);
    }

    /** The eraser takes away every stroke it passes over (Excalidraw's own eraser does the same): along the line from
     *  its last sample, so a quick swipe misses nothing between two far-apart samples. */
    private void erase(float x, float y) {
        float fromX = lastX, fromY = lastY;
        lastX = x; lastY = y;
        float step = 6 * density;
        int n = Float.isNaN(fromX) ? 0 : (int) (Math.hypot(x - fromX, y - fromY) / step);
        for (int i = 1; i <= n; i++) eraseAt(fromX + (x - fromX) * i / (n + 1), fromY + (y - fromY) * i / (n + 1));
        eraseAt(x, y);
    }

    private void eraseAt(float x, float y) {
        float cx = x / density, cy = y / density, r = 8;
        boolean gone = strokes.removeIf(s -> {
            RectF near = new RectF(s.box);
            near.inset(-r, -r);
            if (!near.contains(cx, cy)) return false;
            // the line between samples, not only the samples: a quick stroke's lie far apart (seen on the Boox: an
            // eraser crossing it between two missed it)
            if (s.pts.size() == 1) return Math.hypot(s.pts.get(0)[0] - cx, s.pts.get(0)[1] - cy) < r;
            for (int i = 1; i < s.pts.size(); i++) if (toSegment(cx, cy, s.pts.get(i - 1), s.pts.get(i)) < r) return true;
            return false;
        });
        if (gone) { redrawAll(); onChange.run(); }
    }

    /** How far (x, y) is from the segment a–b. */
    private static double toSegment(float x, float y, float[] a, float[] b) {
        float dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        float t = l2 == 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
        return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
    }

    private void redrawAll() {
        if (getWidth() == 0 || getHeight() == 0) return;
        if (done == null || done.getWidth() != getWidth() || done.getHeight() != getHeight()) done = Bitmap.createBitmap(getWidth(), getHeight(), Bitmap.Config.ARGB_8888);
        done.eraseColor(Color.TRANSPARENT);
        Canvas c = new Canvas(done);
        for (Stroke s : strokes) {
            for (int i = 1; i < s.pts.size(); i++) {
                float[] a = s.pts.get(i - 1), b = s.pts.get(i);
                segment(c, a[0] * density, a[1] * density, a[2], b[0] * density, b[1] * density, b[2]);
            }
        }
        fast.repaint();
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) { if (done != null) c.drawBitmap(done, 0, 0, null); }

    /** The ink as drawn, on a transparent ground, the view's size (null before layout): laid over a picture drawn on. */
    Bitmap ink() { return done; }

    /** What was drawn, small, for the capture box's chip. */
    Bitmap thumbnail(int height) {
        if (done == null) return null;
        Bitmap b = Bitmap.createBitmap(getWidth(), getHeight(), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(Color.WHITE);
        c.drawBitmap(done, 0, 0, null);
        float k = height / (float) getHeight();
        return Bitmap.createScaledBitmap(b, Math.max(1, Math.round(getWidth() * k)), height, true);
    }

    /** The drawing as an Excalidraw scene: one `freedraw` per stroke, its points relative to it, the pen's pressures. */
    String toExcalidraw() throws JSONException {
        JSONArray els = new JSONArray();
        int i = 0;
        for (Stroke s : strokes) {
            float[] o = s.pts.get(0);
            JSONArray pts = new JSONArray(), pr = new JSONArray();
            for (float[] q : s.pts) {
                // 0.1 px and 0.01, as every drawing writer (docs/design/DESIGN-drawing-size.md)
                pts.put(new JSONArray().put(Math.round((q[0] - o[0]) * 10) / 10.0).put(Math.round((q[1] - o[1]) * 10) / 10.0));
                pr.put(Math.round(q[2] * 100) / 100.0);
            }
            long seed = (long) (i + 1) * 2654435761L % 2147483647L;
            els.put(new JSONObject()
                .put("id", "pen-" + i).put("type", "freedraw").put("x", r2(o[0])).put("y", r2(o[1]))
                .put("width", r2(s.box.width())).put("height", r2(s.box.height())).put("angle", 0)
                .put("strokeColor", "#000000").put("backgroundColor", "transparent").put("fillStyle", "solid")
                .put("strokeWidth", r2(WIDTH * FREEDRAW_SCALE)).put("strokeStyle", "solid").put("roughness", 0).put("opacity", 100)
                .put("groupIds", new JSONArray()).put("frameId", JSONObject.NULL).put("roundness", JSONObject.NULL)
                .put("seed", seed).put("version", 1).put("versionNonce", seed).put("isDeleted", false)
                .put("boundElements", JSONObject.NULL).put("updated", 1).put("link", JSONObject.NULL).put("locked", false)
                .put("points", pts).put("pressures", pr).put("simulatePressure", false).put("lastCommittedPoint", JSONObject.NULL));
            i++;
        }
        return new JSONObject().put("type", "excalidraw").put("version", 2).put("source", "atlas (pen)")
            .put("elements", els).put("appState", new JSONObject().put("viewBackgroundColor", "#ffffff")).put("files", new JSONObject())
            .toString();
    }

    private static double r2(float v) { return Math.round(v * 100) / 100.0; }
}
