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
 * page, a YouTube video, a Spotify song, a Letterboxd film, a Wikipedia article; nothing at any other time. Also answers the accessibility button / gesture.
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
                public void onClicked(AccessibilityButtonController c) { shoot(); }
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
        on.shoot();
        return true;
    }

    static boolean isOn() { return on != null; }

    private void shoot() {
        if (Build.VERSION.SDK_INT >= 31) performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE);
        if (Build.VERSION.SDK_INT < 30) { open(null, page()); return; }
        // the shade's closing animation first, so the picture (and the page) is the app under it
        ui.postDelayed(() -> shootNow(page()), 350);
    }

    /** The page on screen; never fails the capture. */
    private Page page() {
        try { return Page.read(this, getRootInActiveWindow()); } catch (Exception e) { return null; }
    }

    private void shootNow(Page page) {
        takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
            @Override
            public void onSuccess(ScreenshotResult r) {
                new Thread(() -> {
                    String path = null;
                    try {
                        Bitmap hw = Bitmap.wrapHardwareBuffer(r.getHardwareBuffer(), r.getColorSpace());
                        Bitmap b = hw.copy(Bitmap.Config.ARGB_8888, false);
                        r.getHardwareBuffer().close();
                        File dir = new File(getCacheDir(), "screens");
                        dir.mkdirs();
                        File f = new File(dir, "Screen " + new java.text.SimpleDateFormat("yyyy-MM-dd HHmmss", java.util.Locale.ROOT).format(new java.util.Date()) + ".png");
                        try (FileOutputStream out = new FileOutputStream(f)) { b.compress(Bitmap.CompressFormat.PNG, 100, out); }
                        path = f.getPath();
                    } catch (Exception e) { /* opened without the screen */ }
                    final String p = path;
                    ui.post(() -> open(p, page));
                }).start();
            }

            @Override
            public void onFailure(int code) { open(null, page); }
        });
    }

    private void open(String screen, Page page) {
        Intent i = new Intent(this, CaptureActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (screen != null) i.putExtra("screen", screen);
        Onscreen.Found f = page == null ? null : page.found;
        if (f != null && f.url != null) i.putExtra("link", f.markdown());
        if (f != null && f.guess != null) i.putExtra("seen", f.guess);
        // a known app showing no address: the box looks it up (its media session, else the site) without holding up the screen
        if (f != null && f.url == null && f.site != null) i.putExtra("site", f.site.name()).putExtra("query", f.query).putExtra("year", f.year);
        if (page != null) i.putExtra("pkg", page.pkg);
        if (page != null && page.app != null && !page.app.contentEquals(getApplicationInfo().loadLabel(getPackageManager()))) i.putExtra("app", page.app);
        startActivity(i);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {}

    @Override
    public void onInterrupt() {}
}
