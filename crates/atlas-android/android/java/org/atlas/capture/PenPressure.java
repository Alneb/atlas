package org.atlas.capture;

import android.os.SystemClock;

/**
 * The pen's pressure as the device reports it, for the MotionEvents of the same strokes (docs/design/
 * DESIGN-boox-pen-openink.md): Android gives Onyx's curve of it, cut at 1.0 above ≈ .53 — a soft and a firm stroke
 * looked alike. On a Boox the stylus is read from evdev (PenReader) and each sample kept with when it arrived; a
 * MotionEvent's pressure is the one that arrived nearest before its time. Elsewhere, or before the reader has spoken,
 * the MotionEvent's own, uncurved (PenInput.linear).
 */
public final class PenPressure {
    private PenPressure() {}

    private static final int N = 1024; // ≈ 2 s at the pen's 482 Hz
    private static final long[] at = new long[N];
    private static final float[] value = new float[N];
    private static int next, count;
    private static boolean started;
    private static PenReader reader;

    /** Starts reading the stylus once, on an e-ink device (a Boox); quietly nothing where there is none. */
    public static synchronized void start() {
        if (started) return;
        started = true;
        if (!Look.einkApp) return;
        try {
            reader = PenReader.start((action, tool, x, y, pressure, tx, ty, side, timeUs) -> {
                if (action == PenReader.DOWN || action == PenReader.MOVE || action == PenReader.UP) keep(SystemClock.uptimeMillis(), pressure);
            });
            android.util.Log.i("AtlasPen", "the stylus from evdev: " + reader.info());
        } catch (java.io.IOException | UnsatisfiedLinkError | RuntimeException e) {
            android.util.Log.i("AtlasPen", "no stylus from evdev (MotionEvents' pressure, uncurved): " + e.getMessage());
        }
    }

    private static synchronized void keep(long when, float p) {
        at[next] = when;
        value[next] = p;
        next = (next + 1) % N;
        if (count < N) count++;
    }

    /** The pressure at a MotionEvent's `eventTime` (uptime ms): the device's sample that arrived last before it (within
     *  a few ms after: the reader may be a moment ahead), else `curved` uncurved. */
    public static synchronized float at(long eventTime, float curved) {
        for (int k = 1; k <= count; k++) {
            int i = ((next - k) % N + N) % N;
            if (at[i] <= eventTime + 4) return eventTime - at[i] <= 40 ? value[i] : PenInput.linear(curved);
        }
        return PenInput.linear(curved);
    }
}
