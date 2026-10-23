package org.atlas.capture;

/**
 * The Boox's stylus read from evdev by the app's native library (src/pen_reader.rs; docs/design/DESIGN-boox-pen-openink.md):
 * events arrive on the reader's own thread, in raw device units, the pressure linear (raw/4095) as Boox Notes' engine
 * reads it. Adapted from boox_5c_re's org.openink.pen.PenReader (MIT).
 */
final class PenReader {
    static final int HOVER_ENTER = 0, HOVER = 1, DOWN = 2, MOVE = 3, UP = 4, HOVER_LEAVE = 5, FORCED_UP = 6;

    interface Listener {
        void onPen(int action, int tool, int x, int y, float pressure, int tiltX, int tiltY, boolean sideButton, long timeUs);
    }

    static { System.loadLibrary("atlas_android"); }

    private long handle;

    private PenReader(long handle) { this.handle = handle; }

    /** @throws java.io.IOException when no stylus is found (not a Boox), naming each device skipped and why */
    static PenReader start(Listener listener) throws java.io.IOException { return new PenReader(nativeStart(listener)); }

    synchronized String info() { return handle == 0 ? "closed" : nativeInfo(handle); }

    synchronized void close() {
        if (handle == 0) return;
        long h = handle;
        handle = 0;
        nativeStop(h);
    }

    private static native long nativeStart(Listener listener) throws java.io.IOException;
    private static native String nativeInfo(long handle);
    private static native void nativeStop(long handle);
}
