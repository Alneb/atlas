package org.atlas.capture;

import android.content.Context;
import android.view.MotionEvent;

/** The pen as the app reads it, for every screen that takes it — Notepad's page, the pen over a web drawing
 *  (PenCatcher), ink over a picture (PageInk) — so they all answer alike. One per view: it
 *  remembers when the pen was last near (hovering or touching), which is what tells a palm from a finger. */
public final class PenInput {
    /** Within this long of the pen, a finger is the hand writing. */
    public static final long PEN_NEAR_MS = 700;
    /** A contact wider than this is a palm, whenever it comes. */
    public static final float PALM_MM = 15;

    private final float palmPx;
    private long penSeenAt = -1_000_000;

    public PenInput(Context c) { palmPx = PALM_MM / 25.4f * c.getResources().getDisplayMetrics().xdpi; }

    /** The pen's tip or its eraser end (the first pointer). */
    public static boolean pen(MotionEvent e) { int t = e.getToolType(0); return t == MotionEvent.TOOL_TYPE_STYLUS || t == MotionEvent.TOOL_TYPE_ERASER; }

    /** The pen erasing: its eraser end, or its button held. */
    /** The pen's pressure as the Boox's own engine reads it — linear, raw/4095 — from what Android gives the app:
     *  Onyx's curve (surfaceflinger's "pen model 0x153", boox_5c_re openink-stroke sf.rs `SfPressure::map`:
     *  `n < .15 ? 4n : min(1, (n − .135)^.2 + .17)`) undone. Measured in the user's strokes the curved value had a
     *  median of .92 and a quarter at 1.0, so a soft and a firm stroke looked alike (2026-10-20); linear its median is
     *  ≈ .56. A curved 1.0 stays 1.0 (≈ .53 and above cannot be told apart from MotionEvents). */
    public static float linear(float curved) {
        if (!(curved > 0)) return 0;
        if (curved < 0.6f) return curved / 4f;
        double n = Math.pow(Math.min(1, curved) - 0.17, 5) + 0.135;
        return (float) Math.max(0.15, Math.min(1, n));
    }

    public static boolean erasing(MotionEvent e) {
        return e.getToolType(0) == MotionEvent.TOOL_TYPE_ERASER || (pen(e) && (e.getButtonState() & MotionEvent.BUTTON_STYLUS_PRIMARY) != 0);
    }

    /** Every event the view sees, touches and hovers alike: notes when the pen was near. Returns `e`'s being the pen. */
    public boolean saw(MotionEvent e) {
        boolean p = pen(e);
        if (p) penSeenAt = e.getEventTime();
        return p;
    }

    /** Whether a finger gesture is a palm: the pen near a moment ago or among the pointers, or a contact wider than
     *  a fingertip. */
    public boolean palm(MotionEvent e) {
        if (e.getEventTime() - penSeenAt < PEN_NEAR_MS) return true;
        for (int i = 0; i < e.getPointerCount(); i++) {
            int t = e.getToolType(i);
            if (t == MotionEvent.TOOL_TYPE_STYLUS || t == MotionEvent.TOOL_TYPE_ERASER || e.getTouchMajor(i) > palmPx) return true;
        }
        return false;
    }

    /** Whether the pen was near within PEN_NEAR_MS of `e` (only the timing: PenCatcher's palm rule). */
    public boolean penJustNear(MotionEvent e) { return e.getEventTime() - penSeenAt < PEN_NEAR_MS; }
}
