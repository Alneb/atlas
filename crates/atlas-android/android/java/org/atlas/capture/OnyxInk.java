package org.atlas.capture;

import android.util.Log;
import android.view.View;

import java.lang.reflect.Method;

/** Onyx's instant ink, the way its pen SDK's SurfaceFlinger path does it (SFTouchRender; traced in ~/Projects/boox_5c_re,
 *  firmware 4.2.1, docs/ONYX-EPD-PEN.md). With the handwriting pen state on inside a region, Onyx's SurfaceFlinger reads
 *  the pen's own input device and draws the stroke into the e-ink panel itself — before Android's input pipeline, so the
 *  line is under the pen at once. The app gets the same stroke as MotionEvents (PenView) and draws its lasting copy;
 *  `enablePost(1)` then lets the app's picture be shown over Onyx's quick ink.
 *  The SDK's sequence: openRawDrawing = style 0, state 1 (START), region (view coordinates: Onyx adds the view's place on
 *  screen, so only after layout), single-region mode, width; setRawDrawingEnabled(true) = state 2 (RENDER ON — without it
 *  nothing is drawn), brush on, eraser off. Changing the picture by hand: state 3, redraw + post, state 2. Close: style 0,
 *  enablePost(1), state 3, state 0. All static on android.onyx.ViewUpdateHelper, by reflection; failures are logged
 *  (tag AtlasInk) and turn it off, the canvas still draws. */
final class OnyxInk extends Ink {
    private static final String TAG = "AtlasInk";
    private static final int QUIT = 0, START = 1, RENDER = 2, PAUSE = 3; // setScreenHandWritingPenState
    private final View view;
    private final Method penState, enablePost, strokeWidth, strokeStyle, regionLimit;
    private final Method regionMode, regionExclude, brush, eraser, getPenState, validPenState, strokeParams; // null when this firmware lacks them
    private boolean broken, on;
    private int[] area; // null: the whole view
    private int[] excluded = new int[0]; // flat l,t,r,b: never drawn there (SF ends a quick stroke that touches one)
    private float widthPx;
    private int style; // Onyx's stroke style for the quick line (boox_5c_re docs/SF-INSTANT-INK.md §2): 0 one width, 1 fountain, 2 marker, 3 brush, 6 charcoal, 7 square
    private int paramsStyle = -1;
    private float[] params; // that style's painter parameters, null: Onyx's own

    OnyxInk(View view) throws ReflectiveOperationException {
        this.view = view;
        Class<?> h = Class.forName("android.onyx.ViewUpdateHelper");
        penState = h.getMethod("setScreenHandWritingPenState", int.class);
        enablePost = h.getMethod("enablePost", int.class);
        strokeWidth = h.getMethod("setStrokeWidth", float.class);
        strokeStyle = h.getMethod("setStrokeStyle", int.class);
        regionLimit = h.getMethod("setScreenHandWritingRegionLimit", View.class, int[].class);
        regionMode = optional(h, "setScreenHandWritingRegionMode", int.class);
        regionExclude = optional(h, "setScreenHandWritingRegionExclude", View.class, int[].class);
        brush = optional(h, "setBrushRawDrawingEnabled", boolean.class);
        eraser = optional(h, "setEraserRawDrawingEnabled", boolean.class, int.class);
        getPenState = optional(h, "getPenState");
        validPenState = optional(h, "isValidPenState");
        strokeParams = optional(h, "setStrokeParameters", int.class, float[].class);
    }

    private static Method optional(Class<?> h, String name, Class<?>... args) {
        try { return h.getMethod(name, args); } catch (NoSuchMethodException e) { Log.i(TAG, "no " + name); return null; }
    }

    private Object call(Method m, Object... args) {
        if (broken || m == null) return null;
        try { return m.invoke(null, args); }
        catch (ReflectiveOperationException | RuntimeException e) { broken = true; Log.w(TAG, m.getName() + " failed: instant ink off", e); return null; }
    }

    /** Laid out and in front: the quick ink inside the canvas only (a fresh array: Onyx changes it in place). */
    @Override void start() {
        if (broken) return;
        // asked before layout (a drawing opening): again once laid out, not at the next change the page happens to send
        if (!view.isLaidOut() || view.getWidth() == 0 || view.getHeight() == 0 || !view.isAttachedToWindow()) { view.postDelayed(this::retry, 100); return; }
        call(strokeStyle, style); // the page's pen, drawn by the painter whose config its settled stroke uses
        if (params != null && paramsStyle == style) call(strokeParams, style, params.clone());
        if (!on) call(penState, START);
        call(regionLimit, view, area != null ? area.clone() : new int[] { 0, 0, view.getWidth(), view.getHeight() });
        call(regionMode, 0); // one region
        // a rect off the view clears the earlier ones (an empty array's effect on SF is unknown)
        call(regionExclude, view, excluded.length > 0 ? excluded.clone() : new int[] { -2, -2, -1, -1 });
        call(strokeWidth, widthPx > 0 ? widthPx : 3f * view.getResources().getDisplayMetrics().density);
        call(penState, RENDER);
        call(brush, true);
        call(eraser, false, 5);
        on = true;
        Log.i(TAG, "instant ink on: state " + call(getPenState) + ", valid " + call(validPenState) + ", " + view.getWidth() + "x" + view.getHeight());
    }

    private void retry() { if (area != null && !on) start(); } // still wanted (an area), not stopped meanwhile

    /** The pen down: a post waiting from the last stroke is let go — posting ends Onyx's handwriting mode, which would
     *  hide the stroke now being written (boox_5c_re: surfaceflinger's handleEnablePost stops handwriting). Onyx draws
     *  the line from the pen itself. */
    @Override void down(float x, float y, float pressure) { view.removeCallbacks(post); }
    @Override void to(float x, float y, float pressure) {}

    /** The pen up: the app's picture shown over the quick ink once the writing pauses — POST_MS after the last pen-up,
     *  as Onyx's own SDK does (RawInputReader: 500 ms, cancelled by the next pen-down), so a written word gets one
     *  repaint, never one landing mid-word. */
    @Override void up() {
        view.removeCallbacks(post);
        view.postDelayed(post, POST_MS);
    }
    static final long POST_MS = 500;
    private final Runnable post = () -> call(OnyxInk.this.enablePost, 1);

    /** The picture changed by hand: shown while the quick ink is paused. */
    /** The picture changed by hand (undo, redo, an erase, a toolbar's change): shown once the view has drawn it — its
     *  next frame, then `afterMs` — never before (asked at once, Onyx showed the picture from before the change and,
     *  with posts paced to pauses in the writing, nothing asked again: "the redo and undo buttons dont work on the
     *  boox", 2026-10-20). */
    @Override void repaint(long afterMs) {
        if (!on) return;
        call(penState, PAUSE);
        Runnable show = () -> { call(enablePost, 1); if (on) call(penState, RENDER); };
        view.postOnAnimation(() -> view.postDelayed(show, Math.max(16, afterMs)));
    }

    /** A part of the view (the page's drawing, without its toolbar): the region moves with it, empty turns it off. */
    @Override void area(int left, int top, int right, int bottom, float widthPx, int style) {
        this.widthPx = widthPx;
        this.style = style;
        if (right <= left || bottom <= top) { area = null; stop(); return; }
        area = new int[] { left, top, right, bottom };
        start();
    }

    @Override void params(int style, float[] params) {
        this.paramsStyle = style;
        this.params = params == null || params.length == 0 ? null : params.clone();
    }
    @Override void exclude(int[] rects) { excluded = rects == null ? new int[0] : rects.clone(); }

    @Override void stop() {
        if (!on) return;
        call(strokeStyle, 0);
        call(enablePost, 1);
        call(penState, PAUSE);
        call(penState, QUIT);
        on = false;
    }
}
