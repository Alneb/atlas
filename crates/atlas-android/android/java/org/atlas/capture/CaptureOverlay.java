package org.atlas.capture;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

/** The capture box floating over the app you were in, which keeps running: a video plays on, a game is not paused, a
 *  page keeps its place. An activity on top would pause it; a window of the accessibility service (ScreenService, the
 *  button, the gesture, the volume keys, the tile) needs no further permission. Anything only an activity can do moves
 *  the box into CaptureActivity (CaptureBox.activity). A switch in Settings → Capture; off, the box is an activity. */
final class CaptureOverlay implements CaptureBox.Frame {
    /** The kind of window: the box's own dialogs must be of it too (CaptureBox.above). */
    static final int TYPE = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
    private static final String KEY = "captureFloats";
    private static CaptureOverlay shown;

    private final WindowManager wm;
    private final CaptureBox box;
    private final View window;
    /** The app under the box: another app coming up (home, a switch) closes it. */
    final String under;

    static boolean on(Context c) { return Build.VERSION.SDK_INT >= 30 && c.getSharedPreferences("atlas", Context.MODE_PRIVATE).getBoolean(KEY, true); }
    static void set(Context c, boolean on) { c.getSharedPreferences("atlas", Context.MODE_PRIVATE).edit().putBoolean(KEY, on).apply(); }

    /** Floats the box from the service; false when it cannot (off, an older Android), and the activity opens instead. */
    static boolean open(ScreenService s, Intent i) {
        if (!on(s)) return false;
        if (shown != null) { shown.box.again(i); return true; }
        try {
            shown = new CaptureOverlay(s, i);
            return true;
        } catch (RuntimeException e) { // a window refused: the activity, as before
            shown = null;
            return false;
        }
    }

    /** From the service's window events: an app other than the one under it came up. */
    static void appCameUp(String pkg, Context c) {
        CaptureOverlay o = shown;
        if (o == null || pkg == null || pkg.equals(o.under) || pkg.equals(c.getPackageName()) || pkg.equals("com.android.systemui") || isKeyboard(c, pkg)) return;
        o.close();
    }

    private static boolean isKeyboard(Context c, String pkg) {
        String ime = android.provider.Settings.Secure.getString(c.getContentResolver(), android.provider.Settings.Secure.DEFAULT_INPUT_METHOD);
        return ime != null && ime.startsWith(pkg + "/");
    }

    private CaptureOverlay(ScreenService s, Intent i) {
        wm = s.getSystemService(WindowManager.class);
        under = i.getStringExtra("pkg");
        // the activity's theme (styles.xml "Capture"), day or night with the phone
        Context themed = new android.view.ContextThemeWrapper(s, android.R.style.Theme_DeviceDefault_DayNight);
        box = new CaptureBox(themed, this);
        FrameLayout w = new FrameLayout(themed) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent e) {
                if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                    if (e.getAction() == KeyEvent.ACTION_UP && !box.back()) close();
                    return true;
                }
                if (e.getAction() == KeyEvent.ACTION_DOWN && box.key(e.getKeyCode(), e)) return true;
                return super.dispatchKeyEvent(e);
            }

            @Override
            public void onWindowFocusChanged(boolean focused) {
                super.onWindowFocusChanged(focused);
                if (focused) box.focused(); // the clipboard, the keyboard
            }
        };
        w.addView(box.open(i), new FrameLayout.LayoutParams(-1, -1));
        window = w;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(-1, -1, TYPE,
            WindowManager.LayoutParams.FLAG_DIM_BEHIND | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
        lp.dimAmount = 0.45f;
        lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE;
        lp.setFitInsetsTypes(0); // the box keeps clear of the bars and the keyboard itself (CaptureBox.open)
        lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        lp.setTitle("Capture");
        wm.addView(window, lp);
    }

    @Override public Activity activity() { return null; }

    @Override
    public void close() {
        if (shown != this) return;
        shown = null;
        box.leaving();
        try { wm.removeView(window); } catch (IllegalArgumentException e) { /* gone already */ }
    }
}
