package org.atlas.capture;

import android.accessibilityservice.AccessibilityButtonController;
import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import java.io.File;
import java.io.FileOutputStream;

/**
 * Takes "the screen I was on" for the box (Android 11+): the only way an app may take a screenshot without asking each time is an
 * accessibility service the user turned on. At the same moment it reads what the app shows (Page → Onscreen): a browser's
 * page, a YouTube video, a Spotify song, a Letterboxd film, a Wikipedia article; nothing at any other time. Also answers the accessibility button / gesture,
 * and floats the box over the app (CaptureOverlay), whose windows coming up are the only events it looks at.
 */
public final class ScreenService extends AccessibilityService {
    private static ScreenService on;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onServiceConnected() {
        on = this;
        if (Build.VERSION.SDK_INT >= 26) {
            getAccessibilityButtonController().registerAccessibilityButtonCallback(new AccessibilityButtonController.AccessibilityButtonCallback() {
                @Override
                public void onClicked(AccessibilityButtonController c) { shoot(false); }
            });
        }
    }

    @Override
    public boolean onUnbind(Intent i) {
        on = null;
        return super.onUnbind(i);
    }

    /** From the tile: false when the service is off (the tile then opens the box without the screen). */
    static boolean shootThenOpen() {
        if (on == null || Build.VERSION.SDK_INT < 30) return false;
        on.shoot(true);
        return true;
    }

    static boolean isOn() { return on != null; }

    /** The gesture: the box opens as soon as the screen's pixels and the page are in hand; the picture's file is
     *  written after (Screens). `fromShade`: the tile, whose shade must close first or the picture is of the shade. */
    private void shoot(boolean fromShade) {
        final long t0 = CaptureClock.now();
        CaptureBox.warm(); // the core's library loads while the screen is taken, not when the box first asks
        if (Build.VERSION.SDK_INT >= 31) performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE); // a no-op when it is not down
        if (Build.VERSION.SDK_INT < 30) { open(null, page(), t0); return; }
        // the shade's closing animation first, so the picture (and the page) is the app under it; the button, the
        // gesture and the volume keys come with no shade over the app: at once
        if (fromShade) ui.postDelayed(() -> shootNow(t0), 350); else shootNow(t0);
    }

    /** The page on screen; never fails the capture. */
    private Page page() {
        try { return Page.read(this, getRootInActiveWindow()); } catch (Exception e) { return null; }
    }

    /** The screenshot and the page read at the same time (the page on a thread of its own: its views come one by one
     *  from the app); the box opens when both are in, the picture written in the background meanwhile. */
    private void shootNow(long t0) {
        final Page[] page = new Page[1];
        final String[] screen = new String[1];
        final int[] left = {2}; // the page, the screenshot: on the main thread only
        Runnable both = () -> { if (--left[0] == 0) open(screen[0], page[0], t0); };
        new Thread(() -> {
            Page p = page();
            ui.post(() -> { page[0] = p; CaptureClock.mark(t0, "page read"); both.run(); });
        }, "capture-page").start();
        takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
            @Override
            public void onSuccess(ScreenshotResult r) {
                CaptureClock.mark(t0, "screen taken");
                File dir = new File(getCacheDir(), "screens");
                dir.mkdirs();
                File f = new File(dir, "Screen " + new java.text.SimpleDateFormat("yyyy-MM-dd HHmmss", java.util.Locale.ROOT).format(new java.util.Date()) + ".png");
                screen[0] = f.getPath();
                new Thread(() -> write(r, f, t0), "capture-screen").start();
                both.run();
            }

            @Override
            public void onFailure(int code) { CaptureClock.mark(t0, "screen refused (" + code + ")"); both.run(); }
        });
    }

    /** The screenshot's pixels to `f` (whole or not at all: `.part`, then renamed) and a thumbnail from memory. */
    private static void write(ScreenshotResult r, File f, long t0) {
        boolean ok = false;
        Bitmap thumb = null;
        try {
            Bitmap hw = Bitmap.wrapHardwareBuffer(r.getHardwareBuffer(), r.getColorSpace());
            Bitmap b = hw.copy(Bitmap.Config.ARGB_8888, false);
            r.getHardwareBuffer().close();
            int h = 240; // the box's tile is 72 dp: crisp at 3x, as Piece.thumb decodes them
            thumb = Bitmap.createScaledBitmap(b, Math.max(1, b.getWidth() * h / Math.max(1, b.getHeight())), h, true);
            File part = new File(f.getPath() + ".part");
            try (FileOutputStream out = new FileOutputStream(part)) { b.compress(Bitmap.CompressFormat.PNG, 100, out); }
            b.recycle();
            ok = part.renameTo(f);
        } catch (Exception e) { /* the box goes on without the screen */ }
        CaptureClock.mark(t0, ok ? "screen written" : "screen not written");
        Screens.written(f.getPath(), ok, thumb);
    }

    private void open(String screen, Page page, long t0) {
        Intent i = new Intent(this, CaptureActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(CaptureClock.EXTRA, t0);
        if (screen != null) i.putExtra("screen", screen);
        Onscreen.Found f = page == null ? null : page.found;
        if (f != null && f.url != null) i.putExtra("link", f.markdown());
        if (f != null && f.guess != null) i.putExtra("seen", f.guess);
        // a known app showing no address: the box looks it up (its media session, else the site) without holding up the screen
        if (f != null && f.url == null && f.site != null) i.putExtra("site", f.site.name()).putExtra("query", f.query).putExtra("year", f.year);
        if (page != null) i.putExtra("pkg", page.pkg);
        if (page != null && page.app != null && !page.app.contentEquals(getApplicationInfo().loadLabel(getPackageManager()))) i.putExtra("app", page.app);
        if (!CaptureOverlay.open(this, i)) startActivity(i); // floating over the app, which keeps running; else a screen of its own
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        // only while the box floats: another app coming up (home, a switch) takes it away, the draft kept
        if (e.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && e.getPackageName() != null) CaptureOverlay.appCameUp(e.getPackageName().toString(), this);
    }

    @Override
    public void onInterrupt() {}
}
