package org.atlas.capture;

import android.content.Context;
import android.view.MotionEvent;
import android.view.View;
import org.json.JSONArray;

/**
 * The pen over a drawing in the page, read natively: a transparent view over Excalidraw's ink region, there exactly while Onyx's instant
 * ink is (AtlasActivity.applyInk). It takes the pen as Notepad does — every sample Android batched between frames, with
 * its pressure — and hands each finished stroke to the page (`atlasShell.penStroke`, pen-target.ts), where the drawing
 * makes it an element; the page never sees that pen. Fingers and the eraser end go through to the page (pan, zoom,
 * Excalidraw's eraser), except right after the pen: a hand resting while writing moves nothing (Notepad's palm rule).
 */
final class PenCatcher extends View {
    /** A finished stroke: `[[x, y, pressure, t], …]` in the page's CSS pixels, t in ms since the pen went down; `growing`
     *  the stroke so far (null: it ended), while `drafts` is on. */
    interface Stroke { void done(String json); default void growing(String jsonOrNull) {} default void began() {} }

    /** The stroke so far goes to the page as it is drawn, for the other devices watching (pen-target.ts wantPenDrafts), so a
     *  drawing is seen in real time, not only once the pen lifts: at most every DRAFT_MS. */
    volatile boolean drafts;
    private static final long DRAFT_MS = 80;
    private long draftedAt;

    private final Stroke out;
    private final float density;
    private final PenInput penIn;
    private JSONArray samples;
    private boolean palm;
    /** Where this view's (0, 0) is in the page, in view pixels (its place over the WebView). */
    float left, top;

    PenCatcher(Context c, Stroke out) {
        super(c);
        this.out = out;
        this.density = c.getResources().getDisplayMetrics().density;
        this.penIn = new PenInput(c);
        PenPressure.start(); // the stylus read from evdev, on a Boox
    }

    private static boolean pen(MotionEvent e) { return e.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS; }

    @Override public boolean onHoverEvent(MotionEvent e) {
        penIn.saw(e);
        return false;
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        int act = e.getActionMasked();
        boolean button = (e.getButtonState() & MotionEvent.BUTTON_STYLUS_PRIMARY) != 0;
        if (e.getToolType(0) == MotionEvent.TOOL_TYPE_ERASER) return false; // the eraser end: always the page's
        if (!pen(e) || button) {
            // a finger (or the eraser end, the pen's button): the page's — unless the pen was just here (a palm)
            if (act == MotionEvent.ACTION_DOWN) palm = !button && penIn.penJustNear(e);
            return palm;
        }
        penIn.saw(e);
        switch (act) {
            case MotionEvent.ACTION_DOWN:
                out.began();
                samples = new JSONArray();
                downAt = e.getEventTime();
                add(e.getX(), e.getY(), e.getPressure(), e.getEventTime());
                return true;
            case MotionEvent.ACTION_MOVE:
                if (samples == null) return true;
                for (int h = 0; h < e.getHistorySize(); h++) add(e.getHistoricalX(h), e.getHistoricalY(h), e.getHistoricalPressure(h), e.getHistoricalEventTime(h));
                add(e.getX(), e.getY(), e.getPressure(), e.getEventTime());
                if (drafts && e.getEventTime() - draftedAt >= DRAFT_MS) { draftedAt = e.getEventTime(); out.growing(samples.toString()); }
                return true;
            case MotionEvent.ACTION_UP:
                if (samples != null) {
                    add(e.getX(), e.getY(), e.getPressure(), e.getEventTime());
                    if (samples.length() >= 2) out.done(samples.toString());
                    if (drafts) out.growing(null);
                }
                samples = null;
                return true;
            case MotionEvent.ACTION_CANCEL:
                if (samples != null && drafts) out.growing(null);
                samples = null; // a cancelled stroke is not kept (as the page drops a cancelled one)
                return true;
            default:
                return true;
        }
    }

    private long downAt;

    private void add(float x, float y, float p, long when) {
        try {
            samples.put(new JSONArray().put(Math.round((left + x) / density * 100) / 100.0).put(Math.round((top + y) / density * 100) / 100.0)
                .put(Math.round(PenPressure.at(when, p) * 1000) / 1000.0).put(when - downAt)); // the device's own pressure (PenPressure); t: the hold that asks for a shape
        } catch (org.json.JSONException e) { /* a number */ }
    }
}
