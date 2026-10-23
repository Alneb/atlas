package org.atlas.capture;

import android.view.View;

/** The ink under the pen drawn by the screen itself, before the app redraws (docs/design/DESIGN-pen-eink-reader.md,
 *  "The pen"): on a Boox, Onyx's SurfaceFlinger draws the stroke straight into the e-ink panel in its fast handwriting
 *  mode (traced in boox_5c_re, docs/ONYX-EPD-PEN.md), so the line follows the pen with no e-ink lag; the
 *  app's own stroke replaces it on pen-up. Elsewhere nothing: the canvas alone is fast enough on an LCD. */
abstract class Ink {
    abstract void start();
    abstract void down(float x, float y, float pressure);
    abstract void to(float x, float y, float pressure);
    abstract void up();
    /** After the app redrew (a stroke ended, an undo, an erase): the screen shows the app's picture again. */
    final void repaint() { repaint(0); }
    /** The same once `afterMs` have passed: a WebView draws its stroke a frame or more after the pen lifts. */
    abstract void repaint(long afterMs);
    abstract void stop();
    /** Only inside this part of the view (view pixels, right/bottom exclusive), the quick line `widthPx` wide; an empty
     *  area turns it off. Default: the whole view. */
    void area(int left, int top, int right, int bottom, float widthPx, int style) {}
    /** The painter parameters for `style`, sent with the next `start`. */
    void params(int style, float[] params) {}
    /** Parts of the view the quick ink never draws in (flat l,t,r,b view pixels: controls floating over the page), sent
     *  with the next `start`; empty: none. */
    void exclude(int[] rects) {}

    static final Ink NONE = new Ink() {
        void start() {} void down(float x, float y, float p) {} void to(float x, float y, float p) {} void up() {} void repaint(long ms) {} void stop() {}
    };

    /** Onyx's instant ink for this view, or NONE when the framework does not have it. */
    static Ink onyx(View v) {
        try { return new OnyxInk(v); }
        catch (ReflectiveOperationException | LinkageError e) { android.util.Log.i("AtlasInk", "no Onyx instant ink: " + e); return NONE; }
    }
}
