package org.atlas.capture;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

/** The window of a normal screen (Settings, the full app): drawn under the system bars, its content kept clear of them. */
final class Shell {
    private Shell() {}

    /** Edge to edge (what target 35 does anyway), the bars' icons dark on a light theme. */
    static void edgeToEdge(Activity a, Look look) {
        a.getWindow().setStatusBarColor(0);
        a.getWindow().setNavigationBarColor(0);
        if (Build.VERSION.SDK_INT >= 30) {
            a.getWindow().getDecorView(); // the window's view made now: before setContentView its insets controller is null (crashed on Android 17)
            a.getWindow().setDecorFitsSystemWindows(false);
            int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            WindowInsetsController c = a.getWindow().getInsetsController();
            c.setSystemBarsAppearance(look.dark ? 0 : light, light);
            bars(a, false);
        } else if (Edition.of(a) == Edition.BOOX) {
            a.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN);
        }
    }

    /** The system bars: `full` (the app's fullscreen) hides both, a swipe from an edge shows them a moment. Otherwise
     *  the Boox hides only the notification bar; a phone keeps it (2026-10-19: "in the normal android app which is not the
     *  boox please do leave the space for the top notigication bar"). The navigation bar stays: Back is a gesture on it. */
    @SuppressWarnings("deprecation")
    static void bars(Activity a, boolean full) {
        boolean boox = Edition.of(a) == Edition.BOOX;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = a.getWindow().getInsetsController();
            if (c == null) return;
            c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            int hide = full ? WindowInsets.Type.systemBars() : boox ? WindowInsets.Type.statusBars() : 0;
            c.show(WindowInsets.Type.systemBars() & ~hide);
            if (hide != 0) c.hide(hide);
            return;
        }
        View d = a.getWindow().getDecorView();
        d.setSystemUiVisibility(full ? View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY : 0);
    }

    /** Pads `v` by the system bars and the keyboard, as they change. */
    static void padForBars(View v) {
        if (Build.VERSION.SDK_INT < 30) { v.setFitsSystemWindows(true); return; }
        v.setOnApplyWindowInsetsListener((x, in) -> {
            android.graphics.Insets i = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            x.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsets.CONSUMED;
        });
    }
}
