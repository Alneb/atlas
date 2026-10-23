package org.atlas.notepad;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import org.atlas.capture.Host;
import org.atlas.capture.PenInput;

import java.util.ArrayList;
import java.util.List;

/** The canvas: the drawing at `k` = density × zoom from scene point (ox, oy), what the pen does with the tool in hand,
 *  and the fingers — two move and zoom the page, one swiped from a side turns it, a short tap of two undoes and of three redoes (Boox Notes'
 *  gestures), a tap on a linked element opens its note. The finished drawing is kept in a bitmap; the stroke being
 *  written, the lasso and the selection are drawn over it. */
final class Pad extends View {
    /** Boox Notes' hold: the pen still within a few pixels for half a second (boox_5c_re SHAPE-RECOGNITION.md). */
    /** The pause that asks for a shape: longer than knote2's 500 ms, which snapped pauses in writing. */
    private static final long HOLD_MS = 650;
    private static final float HOLD_PX = 2;

    private final NotepadView n;
    private final Painter painter = new Painter();
    /** The other devices' names beside their pens (unscaled, screen pixels). */
    private final Paint peer = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint live = new Paint(Paint.ANTI_ALIAS_FLAG), frame = new Paint(Paint.ANTI_ALIAS_FLAG), paper = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint names = new Paint(Paint.ANTI_ALIAS_FLAG), lassoPaint = new Paint(Paint.ANTI_ALIAS_FLAG), chosenPaint = new Paint(Paint.ANTI_ALIAS_FLAG),
        handlePaint = new Paint(Paint.ANTI_ALIAS_FLAG), rulerBody = new Paint(), rulerLine = new Paint(Paint.ANTI_ALIAS_FLAG);
    /** The ruler's edge (−1 / +1) the stroke being written lies on, or 0. */
    private int rulerEdge;
    /** What a finger on the ruler does: moves it, or (on its knob) turns it. */
    private enum RulerHold { NONE, MOVE, TURN }
    private RulerHold rulerHold = RulerHold.NONE;
    private float rulerFrom;
    private final Host.QuickInk quick;
    private final ScaleGestureDetector pinch;
    private Bitmap done;
    private boolean stale = true;
    float ox, oy, zoom = 1f;

    // the pen
    private boolean stylusDown, erasing, dragging;
    private final List<float[]> current = new ArrayList<>();
    private long downAt;
    private float lastX, lastY;
    private Step erasingStep;
    /** The shape the stroke being written snapped to, once the pen held still. */
    private Figure snapped;
    /** The recogniser's answer behind `snapped`, for the training record (Dataset). */
    private float[] snapWire;
    /** The stroke before, when the snap read it with this one (an arrow's shaft): the snap replaces both. */
    private Stroke snapWith;
    /** The last stroke kept and when its pen lifted (event time, ms): a shaft for a head drawn next. */
    private Stroke lastStroke;
    private long lastUpAt;

    /** The stroke just before, if it may belong with this one: lifted under two seconds before this began, still in the
     *  scene, and near (its box within a fifth of the larger size of this one's). */
    private Stroke shaftBefore(float[] xyt) {
        if (lastStroke == null || downAt - lastUpAt > 2000 || !n.scene.items.contains(lastStroke)) return null; // 2 s: a head drawn after a look
        RectF mine = new RectF(xyt[0], xyt[1], xyt[0], xyt[1]);
        for (int i = 0; i + 2 < xyt.length; i += 3) mine.union(xyt[i], xyt[i + 1]);
        float reach = Math.max(mine.width(), mine.height()) * 0.2f + n.look.dp(8) / k();
        RectF near = new RectF(lastStroke.box);
        near.inset(-reach, -reach);
        return RectF.intersects(near, mine) ? lastStroke : null;
    }

    /** The stroke before (its times shifted to this one's clock), a NaN triple, then this one: the wire for two strokes. */
    private float[] withBefore(Stroke before, float[] xyt) {
        int m = before.samples.length / Stroke.SAMPLE;
        float[] out = new float[m * 3 + 3 + xyt.length];
        float shift = before.downAt - downAt; // negative: it began earlier
        for (int i = 0; i < m; i++) { out[3 * i] = before.samples[i * Stroke.SAMPLE]; out[3 * i + 1] = before.samples[i * Stroke.SAMPLE + 1]; out[3 * i + 2] = before.samples[i * Stroke.SAMPLE + 5] + shift; }
        out[3 * m] = out[3 * m + 1] = out[3 * m + 2] = Float.NaN;
        System.arraycopy(xyt, 0, out, 3 * m + 3, xyt.length);
        return out;
    }
    /** The shapes tool's axes being dragged (several elements: Figure.axes), shown as they will be kept. */
    private java.util.List<Figure> axesDrawn = new java.util.ArrayList<>();
    private float holdX, holdY;
    private final Runnable hold = this::held;
    // the lasso and moving the selection
    private final Path lasso = new Path();
    private final List<Float> lassoPts = new ArrayList<>();
    private float dragX, dragY, dragDx, dragDy;
    /** The selection's handles: the corner square resizes it, the knob above it turns it. */
    private enum Handle { NONE, SIZE, TURN }
    private Handle grab = Handle.NONE;
    /** While a handle is held: the point it works about, the diagonal (SIZE) or the start angle (TURN) it is
     *  measured from, and what it has done so far. */
    private float ax, ay, ex, ey, from, scaled = 1, turned;
    /** How far above the selection the turning knob sits, in dp. */
    private static final float TURN_LIFT = 28;
    // the fingers
    private boolean fingers;
    /** The finger gesture is a palm (palm rejection): it moves nothing. */
    private boolean palm;
    /** The app's reading of the pen (when it was last near, a palm: PenInput); where a finger gesture started the
     *  page, to put it back when the gesture turns out to be a palm. */
    private final PenInput penIn;
    private float panFromX, panFromY;
    private float fx, fy, tapX, tapY;
    /** Screen pixels panned since the last full e-ink refresh. */
    private float movedSinceRefresh;
    private long tapAt;
    private int tapFingers;
    private boolean tapMoved;

    Pad(NotepadView n) {
        super(n.host.activity());
        this.n = n;
        penIn = new PenInput(n.host.activity());
        painter.files(n.scene.files);
        painter.linked((file, page, px) -> org.atlas.capture.PageSource.page(n.host, file, page, px, this::ink)); // linked PDF pages, drawn on the fly
        live.setStyle(Paint.Style.STROKE);
        live.setStrokeCap(Paint.Cap.ROUND);
        live.setStrokeJoin(Paint.Join.ROUND);
        frame.setStyle(Paint.Style.STROKE);
        frame.setColor(n.look.eink ? 0xff8a8a8a : 0xffc8c8c8);
        paper.setStyle(Paint.Style.STROKE);
        paper.setColor(n.look.eink ? 0xffb4b4b4 : 0xffd9dde3);
        names.setColor(n.look.eink ? 0xff555555 : 0xff8b919c);
        lassoPaint.setStyle(Paint.Style.STROKE);
        lassoPaint.setColor(n.look.eink ? Color.BLACK : n.look.accent);
        lassoPaint.setStrokeWidth(n.look.dp(1.5f));
        lassoPaint.setPathEffect(new DashPathEffect(new float[] { n.look.dp(6), n.look.dp(4) }, 0));
        chosenPaint.set(lassoPaint);
        handlePaint.setStyle(Paint.Style.FILL);
        handlePaint.setColor(lassoPaint.getColor());
        rulerBody.setColor(n.look.eink ? 0x1a000000 : (n.look.accent & 0x00ffffff) | 0x26000000);
        rulerLine.setStyle(Paint.Style.STROKE);
        rulerLine.setColor(n.look.eink ? Color.BLACK : 0xff495057);
        quick = n.host.quickInk(this);
        org.atlas.capture.PenPressure.start(); // the stylus read from evdev, on a Boox
        pinch = new ScaleGestureDetector(n.host.activity(), new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector d) {
                float k = k(), sx = ox + d.getFocusX() / k, sy = oy + d.getFocusY() / k; // the scene point under the fingers stays there
                zoom = Math.max(0.2f, Math.min(6f, zoom * d.getScaleFactor()));
                ox = sx - d.getFocusX() / k();
                oy = sy - d.getFocusY() / k();
                n.clampToPage();
                if (Math.abs(d.getScaleFactor() - 1) > 0.02f) tapMoved = true; // a real pinch, not two resting fingers
                movedSinceRefresh += Math.abs(d.getScaleFactor() - 1) * 2 * Math.max(getWidth(), getHeight()); // a zoom redraws it all
                ink();
                return true;
            }
        });
    }

    float k() { return n.density * zoom; }

    /** Everything drawn again (the view moved, an item changed): on the next frame. */
    void ink() { stale = true; quickArea(); invalidate(); }

    /** After an edit made by hand (undo, erase, delete): drawn again and shown over the quick ink. */
    void repaintAfterEdit() { ink(); quick.repaint(0); }

    /** Whether Onyx's quick ink is drawing the pen now: when not, this view draws the stroke as it is written (else, on
     *  e-ink, it showed only at pen-up — "strokes drawn later"). */
    private boolean quickOn;

    /** The pen's quick ink only where it writes: with the pen in hand, nothing moving, no shape snapped, not erasing
     *  (the eraser end drew a black line where it erased), and never under the controls floating over the page. */
    void quickArea() {
        if (getWidth() == 0) return;
        float[] cfg = n.host.penDefaults(n.pen);
        cfg[0] = Math.max(1, cfg[0] * n.widthTimes); // screen px: a pen writes as wide at any zoom (see penWidth)
        // Onyx's painter for this pen, told the width and parameters its settled stroke is drawn with (penLive)
        float[] live = n.host.penLive(n.pen, cfg);
        // A resting palm (a finger down that has not moved the page) keeps the quick ink: Onyx draws it from the pen
        // only, and turning it off there lost every stroke written with the hand on the glass until it settled.
        boolean panning = fingers && (tapMoved || pinch.isInProgress() || rulerHold != RulerHold.NONE);
        quickOn = !(n.tool != NotepadView.Tool.PEN || panning || snapped != null || dragging || rulerEdge != 0 || erasing) && hasWindowFocus(); // a ruled stroke: the raw line would show
        float[] want = quickOn ? new float[] { getWidth(), getHeight(), live[1], live[0] } : new float[4];
        int[] off = quickOn && n.chrome != null ? n.chrome.keepOut() : new int[0];
        if (java.util.Arrays.equals(want, quickSet) && java.util.Arrays.equals(off, quickOff)) return; // unchanged: setting it again wiped Onyx's not-yet-redrawn quick strokes ("strokes disappear, then appear when settled")
        quickSet = want;
        quickOff = off;
        if (quickOn) { quick.params((int) live[0], java.util.Arrays.copyOfRange(live, 4, 4 + (int) live[3])); quick.exclude(off); }
        quick.area(0, 0, (int) want[0], (int) want[1], want[2], (int) want[3]);
    }

    /** What the quick ink was last set to (width, height, pen width, kind; all 0 when off), and kept out of. */
    private float[] quickSet;
    private int[] quickOff = new int[0];

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        done = w > 0 && h > 0 ? Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888) : null;
        if (ow == 0 && !n.scene.pages.isEmpty()) n.toPage(n.startPage()); // a notebook opens at its last page, or the one a link named
        else if (ow > 0 && !n.scene.pages.isEmpty() && (w != ow || h != oh)) {
            // turned: the page it showed, fitted again; taller or shorter (full screen, the system's bars): only a fitted page
            int at = n.currentPageBefore(ow, oh);
            if (w != ow || n.fitted(at, ow, oh)) n.toPage(at);
        }
        ink();
    }

    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) quickArea(); else { quickOn = false; quickSet = new float[4]; quick.area(0, 0, 0, 0, 0, 0); } }

    @Override protected void onDetachedFromWindow() { removeCallbacks(hold); quick.stop(); super.onDetachedFromWindow(); }

    // ---- drawing -------------------------------------------------------------------------------------------------

    /** A linked item's mark at its top right (a tap there opens the link): a small, light arrow out of a corner, no
     *  ring or fill. */
    private void linkMark(Canvas c, RectF box, float k) {
        float r = n.look.dp(4.5f) / k, x = box.right - r * 1.2f, y = box.top + r * 1.2f; // inside the corner, over nothing else
        linkPaint.setStyle(Paint.Style.STROKE);
        linkPaint.setStrokeWidth(n.look.dp(1f) / k);
        linkPaint.setColor(n.look.eink ? 0xff9a9a9a : (n.look.accent & 0x00ffffff) | 0x99000000);
        c.drawLine(x - r * 0.6f, y + r * 0.6f, x + r * 0.6f, y - r * 0.6f, linkPaint);
        c.drawLine(x + r * 0.6f, y - r * 0.6f, x - r * 0.1f, y - r * 0.6f, linkPaint);
        c.drawLine(x + r * 0.6f, y - r * 0.6f, x + r * 0.6f, y + r * 0.1f, linkPaint);
    }

    private final Paint linkPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private void paintAll() {
        if (done == null) return;
        done.eraseColor(Color.WHITE);
        Canvas c = new Canvas(done);
        float k = k();
        c.save();
        c.scale(k, k);
        c.translate(-ox, -oy);
        RectF seen = new RectF(ox, oy, ox + getWidth() / k, oy + getHeight() / k);
        frame.setStrokeWidth(1.5f / k);
        names.setTextSize(12 * n.density / k);
        for (Page p : n.scene.pages) {
            if (!RectF.intersects(p.r, seen)) continue;
            p.drawPaper(c, paper, k);
            c.drawRect(p.r, frame);
            if (p.name != null && !p.name.matches("Page \\d+")) c.drawText(p.name, p.r.left, p.r.top - 6 / k, names); // a page given its own name
        }
        for (int pass = 0; pass < 2; pass++) // the highlighter first, under the writing; then the rest in their order
            for (Item it : n.scene.items) if (it.under() == (pass == 0) && (RectF.intersects(it.box, seen) || it.box.isEmpty())) it.draw(c, painter);
        // as Excalidraw marks a link; a PDF's page is the paper itself: no mark on it (a tap on it still opens the PDF there)
        for (Item it : n.scene.items) if (it.link() != null && !it.locked() && RectF.intersects(it.box, seen)) linkMark(c, it.box, k);
        c.restore();
        stale = false;
    }

    @Override protected void onDraw(Canvas c) {
        if (stale) paintAll();
        if (done != null) c.drawBitmap(done, 0, 0, null);
        float k = k();
        if (snapped != null || !axesDrawn.isEmpty()) {
            c.save(); c.scale(k, k); c.translate(-ox, -oy);
            if (snapped != null) snapped.draw(c, painter);
            for (Figure f : axesDrawn) f.draw(c, painter);
            c.restore();
        } else if (current.size() > 1 && (!n.look.eink || !quickOn)) { // the stroke being written, plainly, until its ink is made at pen-up
            live.setColor(Painter.color(n.color, Color.BLACK));
            live.setStrokeWidth(Math.max(1, n.host.penDefaults(n.pen)[0] * n.widthTimes * 0.6f)); // screen px, as penWidth
            for (int i = 1; i < current.size(); i++) {
                float[] a = current.get(i - 1), b = current.get(i);
                c.drawLine((a[0] - ox) * k, (a[1] - oy) * k, (b[0] - ox) * k, (b[1] - oy) * k, live);
            }
        }
        if (!lasso.isEmpty()) { c.save(); c.scale(k, k); c.translate(-ox, -oy); lassoPaint.setStrokeWidth(n.look.dp(1.5f) / k); c.drawPath(lasso, lassoPaint); c.restore(); }
        if (!n.chosen.isEmpty()) {
            RectF r = n.chosenBox();
            float pad = n.look.dp(8);
            c.drawRect((r.left - ox) * k - pad, (r.top - oy) * k - pad, (r.right - ox) * k + pad, (r.bottom - oy) * k + pad, chosenPaint);
            float h = n.look.dp(7), sx = (r.right - ox) * k + pad, sy = (r.bottom - oy) * k + pad;
            c.drawRect(sx - h, sy - h, sx + h, sy + h, handlePaint);
            float tx = (r.centerX() - ox) * k, top = (r.top - oy) * k - pad, ty = top - n.look.dp(TURN_LIFT);
            c.drawLine(tx, top, tx, ty, chosenPaint);
            c.drawCircle(tx, ty, h, handlePaint);
        }
        if (n.ruler != null) { c.save(); c.scale(k, k); c.translate(-ox, -oy); n.ruler.draw(c, rulerBody, rulerLine, k); c.restore(); }
        // the other devices' pens (live, NotepadView.joinLive): a dot where each is, filled while it writes, and its name
        for (java.util.Map.Entry<Integer, float[]> p : n.pointers.entrySet()) {
            float px = (p.getValue()[0] - ox) * k, py = (p.getValue()[1] - oy) * k;
            chosenPaint.setStyle(p.getValue()[2] > 0 ? Paint.Style.FILL : Paint.Style.STROKE);
            c.drawCircle(px, py, n.look.dp(5), chosenPaint);
            String who = n.peerNames.get(p.getKey());
            if (who != null) { peer.setTextSize(n.look.dp(12)); c.drawText(who, px + n.look.dp(8), py - n.look.dp(6), peer); }
        }
        chosenPaint.setStyle(Paint.Style.STROKE);
    }

    // ---- the pen -------------------------------------------------------------------------------------------------

    @Override public boolean onTouchEvent(MotionEvent e) {
        int t = e.getToolType(0);
        boolean pen = penIn.saw(e);
        if (pen) n.livePointer(ox + e.getX() / k(), oy + e.getY() / k(), e.getActionMasked() != MotionEvent.ACTION_UP && e.getActionMasked() != MotionEvent.ACTION_CANCEL);
        if (!pen) return fingersMove(e); // fingers move and zoom the page; the pen writes
        if (fingers) return true;
        // a pen that landed while a finger was down came as a second pointer, with no down of its own: ignore it to its up
        if (!stylusDown && e.getActionMasked() != MotionEvent.ACTION_DOWN) return true;
        float k = k(), x = ox + e.getX() / k, y = oy + e.getY() / k;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                stylusDown = true;
                quick.down(); // no show of the picture while writing (OnyxInk `down`)
                downAt = e.getEventTime();
                erasing = n.tool == NotepadView.Tool.ERASER || PenInput.erasing(e);
                lastX = x;
                lastY = y;
                if (erasing) { erasingStep = new Step(); quickArea(); eraseAlong(x, y, x, y); return true; } // quick ink off while erasing
                if (n.tool == NotepadView.Tool.LASSO) { lassoDown(x, y); return true; }
                if (n.tool == NotepadView.Tool.SHAPE) { shapeDown(x, y); return true; }
                if (n.tool == NotepadView.Tool.TEXT) return true;
                if (!current.isEmpty()) finish(); // the last stroke's lift never came (an input overflow): kept, not dropped
                current.clear();
                snapped = null;
                rulerEdge = n.ruler != null ? n.ruler.edgeNear(x, y, n.look.dp(24) / k) : 0;
                if (rulerEdge != 0) quickArea();
                holdX = e.getX();
                holdY = e.getY();
                postDelayed(hold, HOLD_MS);
                sample(e, -1);
                return true;
            case MotionEvent.ACTION_MOVE:
                for (int h = 0; h < e.getHistorySize(); h++) sample(e, h);
                sample(e, -1);
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                stylusDown = false;
                removeCallbacks(hold);
                if (erasing) {
                    erasing = false;
                    quickArea(); // the pen writes again
                    n.done(erasingStep);
                    erasingStep = null;
                    quick.repaint(0);
                    return true;
                }
                if (n.tool == NotepadView.Tool.LASSO) { lassoUp(); return true; }
                if (n.tool == NotepadView.Tool.SHAPE) { shapeUp(); return true; }
                if (n.tool == NotepadView.Tool.TEXT) { if (e.getActionMasked() == MotionEvent.ACTION_UP) n.writeText(x, y, n.look.dp(8) / k); return true; }
                if (e.getActionMasked() == MotionEvent.ACTION_UP) sample(e, -1);
                finish();
                if (rulerEdge != 0) { rulerEdge = 0; quickArea(); }
                return true;
            default:
                return true;
        }
    }

    /** One sample of the pen (h: the historical index, -1 the event's own), in scene units. */
    private void sample(MotionEvent e, int h) {
        float k = k();
        float sx = h < 0 ? e.getX() : e.getHistoricalX(h), sy = h < 0 ? e.getY() : e.getHistoricalY(h);
        float x = ox + sx / k, y = oy + sy / k;
        if (rulerEdge != 0 && !erasing) { float[] q = n.ruler.onEdge(rulerEdge, x, y); x = q[0]; y = q[1]; } // laid onto the ruler
        if (erasing) { eraseAlong(lastX, lastY, x, y); lastX = x; lastY = y; return; }
        if (n.tool == NotepadView.Tool.LASSO) { lassoMove(x, y); return; }
        if (n.tool == NotepadView.Tool.SHAPE) { if (h < 0) shapeMove(x, y); return; }
        if (n.tool == NotepadView.Tool.TEXT) return;
        if (snapped != null) return; // a snapped shape ignores the pen until it lifts
        // the hold: knote2's, the pen within ±2 screen pixels for the half second (it was ±4 dp, ~9 px on a Boox: a pause
        // in writing snapped letters to shapes); a larger move starts it again
        if (Math.abs(sx - holdX) > HOLD_PX || Math.abs(sy - holdY) > HOLD_PX) {
            holdX = sx;
            holdY = sy;
            removeCallbacks(hold);
            postDelayed(hold, HOLD_MS);
        }
        // the device's own pressure (evdev, linear, as Boox's engine reads it), else the MotionEvent's uncurved
        float p = org.atlas.capture.PenPressure.at(h < 0 ? e.getEventTime() : e.getHistoricalEventTime(h), h < 0 ? e.getPressure() : e.getHistoricalPressure(h));
        // tilt: the pen's angle from upright, split along its direction (degrees), as openink takes it
        float tilt = (float) Math.toDegrees(h < 0 ? e.getAxisValue(MotionEvent.AXIS_TILT) : e.getHistoricalAxisValue(MotionEvent.AXIS_TILT, h));
        float dir = h < 0 ? e.getAxisValue(MotionEvent.AXIS_ORIENTATION) : e.getHistoricalAxisValue(MotionEvent.AXIS_ORIENTATION, h);
        long t = (h < 0 ? e.getEventTime() : e.getHistoricalEventTime(h)) - downAt;
        // no pressure (the lift's own sample): the last one, not a made-up half press that fattened the stroke's end
        float pressure = p > 0 ? Math.min(1f, p) : current.isEmpty() ? 0.5f : current.get(current.size() - 1)[2];
        current.add(new float[] { x, y, pressure, (float) (tilt * Math.sin(dir)), (float) (-tilt * Math.cos(dir)), t });
        if (!n.look.eink || !quickOn) invalidate(); // on a Boox the quick ink shows it, when on; else this view draws it
        if (h < 0 && n.tool == NotepadView.Tool.PEN) n.liveDraft(current, penWidth(Stroke.sceneDefaults(n.host, n.pen, n.density)[0]) / 7f); // the others see it grow
    }

    /** The smallest stroke (its box's larger side, on screen) that may snap to a shape. */
    private static final float SNAP_MIN_DP = 40;

    /** The larger side of the box around the stroke so far, in scene units. */
    private float extent() {
        float x0 = Float.MAX_VALUE, y0 = Float.MAX_VALUE, x1 = -Float.MAX_VALUE, y1 = -Float.MAX_VALUE;
        for (float[] c : current) { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); }
        return Math.max(x1 - x0, y1 - y0);
    }

    /** The pen held still: the stroke so far snaps to a shape when one fits (Boox Notes' shape recognition). */
    private void held() {
        if (!n.snap || !stylusDown || erasing || rulerEdge != 0 || n.tool != NotepadView.Tool.PEN || current.size() < 6 || snapped != null) return;
        float[] xyt = new float[current.size() * 3]; // openink's recogniser reads the pace too (t, ms)
        for (int i = 0; i < current.size(); i++) { float[] c = current.get(i); xyt[3 * i] = c[0]; xyt[3 * i + 1] = c[1]; xyt[3 * i + 2] = c[5]; }
        // letter-sized: writing, not a shape — unless it is a head beside the shaft just drawn
        if (extent() * k() < n.look.dp(SNAP_MIN_DP) && shaftBefore(xyt) == null) return;
        float[] shape;
        snapWith = null;
        try {
            shape = null;
            Stroke before = shaftBefore(xyt);
            if (before != null) { // an arrow's head drawn apart from its shaft: read together (geometry, then openink), kept only as an arrow
                float[] both = withBefore(before, xyt), s2 = n.host.penShape(both, true);
                if (s2.length > 4 && s2[0] == 5 && (s2[2] != 0 || s2[3] != 0)) { shape = s2; snapWith = before; }
            }
            if (shape == null) shape = n.host.penShape(xyt, n.openinkShapes);
        } catch (RuntimeException | UnsatisfiedLinkError e) { return; }
        snapWire = shape;
        Figure f = Figure.snapped(shape, n.scene.ids.next("shape"), n.color, shapeWidth(), frameOf(xyt[0], xyt[1]));
        if (f == null) return;
        snapped = f;
        quickArea();
        invalidate();
        quick.repaint(0); // the quick line gives way to the shape
    }

    /** Pen-up: the shape it snapped to, or the stroke's real ink made by its pen; kept, saved — or, a scribble over
     *  strokes, those strokes erased. */
    private void finish() {
        if (current.isEmpty()) return;
        n.liveDraft(null, 0); // the others' draft ends here, whatever the stroke becomes (a scribble erases)
        if (snapped == null && n.scribble && scribbledAway()) return;
        Stroke s = new Stroke();
        s.id = n.scene.ids.next("pen");
        s.pen = n.pen;
        s.color = n.color;
        s.cfg = Stroke.sceneDefaults(n.host, n.pen, n.density);
        s.cfg[0] = penWidth(s.cfg[0]);
        s.samples = new float[current.size() * Stroke.SAMPLE];
        for (int i = 0; i < current.size(); i++) System.arraycopy(current.get(i), 0, s.samples, i * Stroke.SAMPLE, Stroke.SAMPLE);
        s.frame = frameOf(s.samples[0], s.samples[1]);
        s.render(n.host);
        s.downAt = downAt;
        Step st = new Step();
        st.add(n.scene, s);
        if (snapped == null) n.wrote(st); else n.done(st);
        lastStroke = snapped == null ? s : null;
        lastUpAt = android.os.SystemClock.uptimeMillis();
        if (snapped != null) {
            // the shape in a step of its own over the stroke: Undo takes the snap back to the stroke as drawn (it
            // removed the shape outright before), and says so to the training record
            Step snap = new Step();
            if (snapWith != null && n.scene.items.contains(snapWith)) snap.remove(n.scene, snapWith); // the shaft read with it
            snapWith = null;
            snap.remove(n.scene, s);
            snap.add(n.scene, snapped);
            snap.snapRecord = n.dataset.snap(s.samples, Stroke.SAMPLE, n.openinkShapes ? "openink" : "atlas", snapWire == null ? new float[0] : snapWire, Host.PENS[n.pen]);
            n.dataset.keep(snap.snapRecord, "kept");
            snapped = null;
            n.done(snap);
        }
        current.clear();
        if (lastStroke != null && !lastStroke.under()) drawOne(lastStroke); else ink(); // a highlighter goes under: the whole page
        quick.up();
    }

    /** One new item drawn onto the page's picture as it is (the rest untouched): a pen-up costs one stroke, not the
     *  whole page. The whole page when the picture is stale anyway. */
    private void drawOne(Item it) {
        if (done == null || stale) { ink(); return; }
        Canvas c = new Canvas(done);
        float k = k();
        c.save();
        c.scale(k, k);
        c.translate(-ox, -oy);
        it.draw(c, painter);
        c.restore();
        invalidate();
    }

    /** Whether the stroke just written is a scribble (Boox Notes' scribble-to-erase): it doubles back at least six
     *  times and is at least five times as long as its box is wide — handwriting, even "mmmm", stays near three — and
     *  it crosses ink. Then what it crosses is erased (one undo step) and the scribble is not kept. */
    private boolean scribbledAway() {
        int m = current.size();
        if (m < 12) return false;
        float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE, length = 0;
        for (int i = 0; i < m; i++) {
            float[] p = current.get(i);
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
            if (i > 0) length += (float) Math.hypot(p[0] - current.get(i - 1)[0], p[1] - current.get(i - 1)[1]);
        }
        float side = Math.max(maxX - minX, maxY - minY);
        if (side <= 0 || length < 5 * side) return false;
        // the turns along the longer side: the direction there flips, past a little jitter
        boolean alongX = maxX - minX >= maxY - minY;
        int turns = 0, dir = 0;
        float last = current.get(0)[alongX ? 0 : 1], jitter = side * 0.08f;
        for (int i = 1; i < m; i++) {
            float v = current.get(i)[alongX ? 0 : 1];
            if (Math.abs(v - last) < jitter) continue;
            int d = v > last ? 1 : -1;
            if (dir != 0 && d != dir) turns++;
            dir = d;
            last = v;
        }
        if (turns < 6) return false;
        float r = 4 / k();
        RectF reach = new RectF(minX - r, minY - r, maxX + r, maxY + r);
        Step st = new Step();
        for (Item it : new ArrayList<>(n.scene.items)) {
            if (!(it instanceof Stroke) || !RectF.intersects(it.box, reach)) continue;
            for (int i = 1; i < m; i++) {
                float[] a = current.get(i - 1), b = current.get(i);
                if (((Stroke) it).crossedBy(a[0], a[1], b[0], b[1], r)) { st.remove(n.scene, it); break; }
            }
        }
        if (st.empty()) return false; // a scribble over nothing is a drawing: kept
        current.clear();
        n.done(st);
        ink();
        quick.up();
        quick.repaint(0); // the scribble's quick ink goes with what it erased
        return true;
    }

    /** A shape's line width: about the pen's in hand. */
    private float shapeWidth() { return penWidth(Stroke.sceneDefaults(n.host, n.pen, n.density)[0]) * 0.6f; }

    /** The pen's width in scene units at this zoom: the same on the screen whatever the zoom, so a stroke written zoomed in
     *  is finer on the page. */
    private float penWidth(float sceneAtZoom1) { return sceneAtZoom1 * n.widthTimes / zoom; }

    // ---- the shapes tool -------------------------------------------------------------------------------------------

    private float shapeX, shapeY;
    private String shapeId;

    private void shapeDown(float x, float y) {
        shapeX = x; shapeY = y;
        shapeId = n.scene.ids.next("shape");
        snapped = null;
    }

    /** The shape from where the pen came down to where it is, shown as it will be kept. */
    private void shapeMove(float x, float y) {
        if (n.shape.axes()) {
            axesDrawn = Figure.axes(n.shape == NotepadView.Shape.AXES_FULL, shapeX, shapeY, x, y, n.scene.ids, n.color, shapeWidth(), frameOf(shapeX, shapeY));
            invalidate();
            return;
        }
        snapped = Figure.drawn(n.shape, shapeX, shapeY, x, y, shapeId, n.color, shapeWidth(), frameOf(shapeX, shapeY));
        invalidate();
    }

    /** Pen-up: the shape kept, unless it is too small to be meant (a tap). */
    private void shapeUp() {
        if (!axesDrawn.isEmpty()) { // the axes, one step
            Step st = new Step();
            for (Figure a : axesDrawn) st.add(n.scene, a);
            axesDrawn = new java.util.ArrayList<>();
            n.done(st);
            ink();
            return;
        }
        Figure f = snapped;
        snapped = null;
        if (f != null && Math.max(f.box.width(), f.box.height()) * k() > n.look.dp(6)) {
            if (n.shape == NotepadView.Shape.ARROW) n.scene.bindArrow(f, n.look.dp(8) / k()); // before it is in the scene: not onto itself
            Step st = new Step();
            st.add(n.scene, f);
            n.done(st);
        }
        ink();
    }

    String frameOf(float x, float y) {
        Page p = n.scene.pageAt(x, y);
        return p == null ? null : p.id;
    }

    /** Erases along the pen's path: whole items, or (the area eraser) only the parts of strokes it passes. */
    private void eraseAlong(float x0, float y0, float x1, float y1) {
        float r = 12 / k();
        boolean any = false;
        for (Item it : new ArrayList<>(n.scene.items)) {
            if (it.locked()) continue; // a PDF's page: paper, not ink
            if (it instanceof Stroke) {
                Stroke s = (Stroke) it;
                if (!s.crossedBy(x0, y0, x1, y1, r)) continue;
                if (n.eraseArea) {
                    List<Stroke> rest = s.rest(x0, y0, x1, y1, r, n.scene.ids);
                    erasingStep.remove(n.scene, s);
                    for (Stroke piece : rest) { piece.render(n.host); erasingStep.add(n.scene, piece); }
                } else erasingStep.remove(n.scene, s);
                any = true;
            } else if (it.crossedBy(x0, y0, x1, y1, r)) {
                erasingStep.remove(n.scene, it);
                any = true;
            }
        }
        if (any) ink();
    }

    // ---- the lasso -----------------------------------------------------------------------------------------------

    private void lassoDown(float x, float y) {
        if (grab(x, y)) return;
        n.select(new ArrayList<>());
        lasso.reset();
        lassoPts.clear();
        lasso.moveTo(x, y);
        lassoPts.add(x); lassoPts.add(y);
    }

    private void lassoMove(float x, float y) {
        if (dragging) { drag(x, y); return; }
        lasso.lineTo(x, y);
        lassoPts.add(x); lassoPts.add(y);
        invalidate();
    }

    private void lassoUp() {
        if (dragging) { endDrag(); return; }
        int m = lassoPts.size() / 2;
        float[] poly = new float[m * 2];
        for (int i = 0; i < poly.length; i++) poly[i] = lassoPts.get(i);
        List<Item> in = new ArrayList<>();
        if (m >= 3) {
            for (Item it : n.scene.items) {
                if (it.locked()) continue;
                float[] a = it.anchors();
                int inside = 0, all = a.length / 2;
                for (int i = 0; i < all; i++) if (Geometry.inside(poly, m, a[2 * i], a[2 * i + 1])) inside++;
                if (all > 0 && inside * 10 >= all * 6) in.add(it); // most of it inside: taken
            }
        }
        lasso.reset();
        lassoPts.clear();
        n.select(n.scene.withBound(in));
        invalidate();
    }

    /** The pen or a finger down on the selection: on a handle it resizes or turns it, inside it moves it. Whether it
     *  took hold. */
    private boolean grab(float x, float y) {
        if (n.chosen.isEmpty()) return false;
        RectF box = n.chosenBox();
        float k = k(), pad = n.look.dp(8) / k, reach = n.look.dp(18) / k;
        ex = box.width(); ey = box.height();
        grab = Handle.NONE;
        if (ex * ex + ey * ey > 1 && Math.hypot(x - (box.right + pad), y - (box.bottom + pad)) < reach) {
            grab = Handle.SIZE; // about the opposite corner, measured along the diagonal
            ax = box.left; ay = box.top;
            from = Math.max(1e-3f, (x - ax) * ex + (y - ay) * ey);
        } else if (Math.hypot(x - box.centerX(), y - (box.top - pad - n.look.dp(TURN_LIFT) / k)) < reach) {
            grab = Handle.TURN; // about the centre
            ax = box.centerX(); ay = box.centerY();
            from = (float) Math.atan2(y - ay, x - ax);
        } else if (!(x > box.left - pad && x < box.right + pad && y > box.top - pad && y < box.bottom + pad)) {
            return false;
        }
        dragging = true;
        dragX = x; dragY = y; dragDx = 0; dragDy = 0;
        scaled = 1; turned = 0;
        return true;
    }

    /** A held handle followed to (x, y): the selection made that size, or turned to that angle (snapping to 15°). */
    private void reshape(float x, float y) {
        float s = 1, a = 0;
        if (grab == Handle.SIZE) {
            s = Math.max(0.05f, ((x - ax) * ex + (y - ay) * ey) / from) / scaled;
        } else {
            float want = (float) Math.atan2(y - ay, x - ax) - from, step = (float) (Math.PI / 12);
            float near = Math.round(want / step) * step;
            a = (Math.abs(want - near) < 0.06f ? near : want) - turned;
        }
        for (Item it : n.chosen) it.transform(ax, ay, s, a, n.host);
        n.scene.follow(n.chosen, 0, 0, ax, ay, s, a);
        scaled *= s;
        turned += a;
        ink();
    }

    private void drag(float x, float y) {
        if (grab != Handle.NONE) { reshape(x, y); return; }
        float dx = x - dragX, dy = y - dragY;
        dragX = x; dragY = y;
        dragDx += dx; dragDy += dy;
        for (Item it : n.chosen) it.moveBy(dx, dy);
        n.scene.follow(n.chosen, dx, dy, 0, 0, 1, 0); // arrows bound to it keep hold
        ink();
    }

    private void endDrag() {
        dragging = false;
        if (grab != Handle.NONE) {
            grab = Handle.NONE;
            if (scaled != 1 || turned != 0) {
                for (Item it : n.chosen) n.scene.changed(it);
                n.done(Step.transformed(n.chosen, ax, ay, scaled, turned));
            }
            quickArea();
            return;
        }
        if (dragDx == 0 && dragDy == 0) return;
        for (Item it : n.chosen) n.scene.changed(it);
        n.done(Step.moved(n.chosen, dragDx, dragDy));
        quickArea();
    }

    // ---- the fingers ---------------------------------------------------------------------------------------------

    /** The pen hovering near the glass: what follows from a "finger" is the hand that holds it. */
    @Override public boolean onHoverEvent(MotionEvent e) {
        penIn.saw(e);
        return super.onHoverEvent(e);
    }

    private boolean fingersMove(MotionEvent e) {
        if (stylusDown) return true; // a palm while writing
        int act = e.getActionMasked();
        if (act == MotionEvent.ACTION_DOWN) { palm = false; panFromX = ox; panFromY = oy; }
        if (!palm && penIn.palm(e)) {
            palm = true;
            if (ox != panFromX || oy != panFromY) { ox = panFromX; oy = panFromY; ink(); } // the palm's pan undone
            if (dragging) endDrag();
            rulerHold = RulerHold.NONE;
        }
        if (palm) {
            fingers = false; // never "fingers": the pen must still write while the palm rests
            if (act == MotionEvent.ACTION_UP || act == MotionEvent.ACTION_CANCEL) { palm = false; quickArea(); }
            return true; // a palm moves nothing and taps nothing
        }
        pinch.onTouchEvent(e);
        float k = k();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                fingers = true;
                fx = e.getX(); fy = e.getY();
                tapX = fx; tapY = fy; tapAt = e.getEventTime(); tapFingers = 1; tapMoved = false;
                float x = ox + fx / k, y = oy + fy / k;
                rulerHold = RulerHold.NONE;
                if (n.ruler != null) {
                    float[] knob = n.ruler.knob();
                    if (Math.hypot(x - knob[0], y - knob[1]) < n.look.dp(24) / k) { rulerHold = RulerHold.TURN; rulerFrom = (float) Math.atan2(y - n.ruler.cy, x - n.ruler.cx) - n.ruler.angle; }
                    else if (n.ruler.inside(x, y)) rulerHold = RulerHold.MOVE;
                }
                if (rulerHold == RulerHold.NONE) grab(x, y);
                quickArea();
                return true;
            }
            case MotionEvent.ACTION_POINTER_DOWN: {
                float[] m = middle(e, -1);
                fx = m[0]; fy = m[1];
                tapFingers = Math.max(tapFingers, e.getPointerCount());
                rulerHold = RulerHold.NONE; // two fingers: the page zooms
                if (dragging) endDrag();
                return true;
            }
            case MotionEvent.ACTION_MOVE:
                if (Math.hypot(e.getX() - tapX, e.getY() - tapY) > n.look.dp(12)) tapMoved = true;
                if (dragging && e.getPointerCount() == 1) { drag(ox + e.getX() / k, oy + e.getY() / k); return true; }
                if (rulerHold != RulerHold.NONE && e.getPointerCount() == 1) { holdRuler(e.getX(), e.getY()); return true; }
                // Two fingers move the page (their middle) while the pinch zooms it; one finger never pans.
                if (e.getPointerCount() >= 2) {
                    float[] m = middle(e, -1);
                    ox -= (m[0] - fx) / k;
                    oy -= (m[1] - fy) / k;
                    n.clampToPage();
                    movedSinceRefresh += Math.hypot(m[0] - fx, m[1] - fy);
                    ink();
                    fx = m[0]; fy = m[1];
                }
                return true;
            case MotionEvent.ACTION_POINTER_UP: {
                float[] m = middle(e, e.getActionIndex()); // the fingers left on the glass go on panning from here
                fx = m[0]; fy = m[1];
                return true;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                fingers = false;
                boolean wasDragging = dragging || rulerHold != RulerHold.NONE;
                rulerHold = RulerHold.NONE;
                if (dragging) endDrag();
                boolean tap = e.getActionMasked() == MotionEvent.ACTION_UP && !tapMoved && e.getEventTime() - tapAt < 350;
                if (tap) tapped();
                else if (e.getActionMasked() == MotionEvent.ACTION_UP && tapFingers == 1 && !wasDragging) edgeSwipe(e.getX(), e.getY());
                quickArea();
                n.drawBar();
                // a full refresh only once the page has moved about a screen since the last (each small pan flashed it)
                if (!tap && movedSinceRefresh > Math.max(getWidth(), getHeight())) { movedSinceRefresh = 0; n.host.einkRefresh(); }
                return true;
            default:
                return true;
        }
    }

    /** The middle of the fingers on the glass, leaving out pointer `skip` (one lifting; -1: none). */
    private static float[] middle(MotionEvent e, int skip) {
        float x = 0, y = 0;
        int n = 0;
        for (int i = 0; i < e.getPointerCount(); i++) if (i != skip) { x += e.getX(i); y += e.getY(i); n++; }
        return n == 0 ? new float[] { e.getX(), e.getY() } : new float[] { x / n, y / n };
    }

    /** One finger swiped from near a side, as in a reader: towards the middle from the right (or upwards) is the next
     *  page, from the left (or downwards) the one before. Elsewhere one finger moves nothing. */
    private void edgeSwipe(float x, float y) {
        float edge = Math.max(getWidth(), getHeight()) * EDGE;
        boolean nearEdge = tapX < edge || tapX > getWidth() - edge || tapY < edge || tapY > getHeight() - edge;
        float dx = x - tapX, dy = y - tapY, min = n.look.dp(48);
        if (!nearEdge || Math.max(Math.abs(dx), Math.abs(dy)) < min || n.scene.pages.isEmpty()) return;
        boolean next = Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy < 0;
        int at = n.currentPage();
        if (next) { if (at < n.scene.pages.size() - 1) n.toPage(at + 1); }
        else if (at > 0) n.toPage(at - 1);
    }

    /** How far in from a side a page-turning swipe starts: 15 % of the screen. */
    private static final float EDGE = 0.15f;

    /** A finger on the ruler at screen (sx, sy): it moved along with it, or turned to it about its middle. */
    private void holdRuler(float sx, float sy) {
        float k = k();
        if (rulerHold == RulerHold.MOVE) { n.ruler.cx += (sx - fx) / k; n.ruler.cy += (sy - fy) / k; }
        else n.ruler.angle = (float) Math.atan2(oy + sy / k - n.ruler.cy, ox + sx / k - n.ruler.cx) - rulerFrom;
        fx = sx; fy = sy;
        invalidate();
    }

    /** A short tap: two fingers undo, three redo; one opens the note an element links to, or puts the lasso's
     *  selection down. */
    private void tapped() {
        if (tapFingers == 2) { n.undoOnce(); return; }
        if (tapFingers >= 3) { n.redoOnce(); return; }
        float k = k(), x = ox + tapX / k, y = oy + tapY / k;
        Item linked = n.scene.linkAt(x, y, n.look.dp(10) / k);
        if (linked != null) { n.host.openLink(linked.link(), n.path); return; }
        if (!n.chosen.isEmpty() && !n.chosenBox().contains(x, y)) n.select(new ArrayList<>());
    }
}
