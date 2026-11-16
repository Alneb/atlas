package org.atlas.capture;

import android.os.SystemClock;
import android.util.Log;

/**
 * The capture box's timings in logcat, tag `AtlasCapture`: from the gesture (the tile, the button, a share) to the box
 * drawn, typing-ready (the keyboard up), the core loaded, what was shared in, the screen's picture written, and saved.
 * Read them with `adb logcat -s AtlasCapture`; DeviceLog carries the app's logcat into the vault's device log too.
 * One line per step: `<way> +<ms since the gesture> <step>`. The gesture's time travels in the intent ([EXTRA]);
 * a share has none (the other app's tap is not seen), so it counts from the box's own start, and says when the
 * process itself was started cold for it.
 */
final class CaptureClock {
    static final String TAG = "AtlasCapture";
    /** `SystemClock.uptimeMillis()` at the gesture, put in the box's intent by whoever saw it. */
    static final String EXTRA = "org.atlas.capture.t0";

    private final long t0;
    private final String way;

    private CaptureClock(long t0, String way) { this.t0 = t0; this.way = way; }

    static long now() { return SystemClock.uptimeMillis(); }

    /** The clock of a box opened by `i`: from the gesture when the intent carries it, else from now. */
    static CaptureClock of(android.content.Intent i) {
        long at = i == null ? 0 : i.getLongExtra(EXTRA, 0);
        String way = i == null || i.getAction() == null ? "open" : i.getAction().replace("android.intent.action.", "").toLowerCase(java.util.Locale.ROOT);
        CaptureClock c = new CaptureClock(at > 0 ? at : now(), way);
        if (at <= 0 && android.os.Build.VERSION.SDK_INT >= 24) {
            long cold = now() - android.os.Process.getStartUptimeMillis();
            if (cold < 5000) c.mark("process started " + cold + " ms before the box (a cold start)");
        }
        return c;
    }

    void mark(String step) { Log.i(TAG, way + " +" + (now() - t0) + " ms " + step); }

    /** A step that is not one box's (the service taking the screen): from `t0`. */
    static void mark(long t0, String step) { Log.i(TAG, "screen +" + (now() - t0) + " ms " + step); }
}
