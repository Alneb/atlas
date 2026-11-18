package org.atlas.capture;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

/** The capture box as a screen of its own (CaptureBox): a share, the shortcut, the icon, the notification, and the box
 *  moved in from floating when it needs an activity (the camera, a permission, signing in). The app under it pauses;
 *  CaptureOverlay floats the box without that. */
public final class CaptureActivity extends Activity implements CaptureBox.Frame {
    private CaptureBox box;

    @Override
    protected void onCreate(Bundle state) {
        // light or dark as the vault's look says (the page's theme, kept by Look), not the phone's: the box's own
        // colours follow the vault, and the platform's parts must too, or they come out in the other theme
        Look look = new Look(this);
        int style = look.eink ? 0 : getResources().getIdentifier(look.dark ? "CaptureDark" : "CaptureLight", "style", getPackageName());
        if (style != 0) setTheme(style);
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        box = new CaptureBox(this, this);
        setContentView(box.open(getIntent()));
        box.then(getIntent().getStringExtra("then"));
        Shell.onBack(this, this::onBackPressed);
    }

    @Override public Activity activity() { return this; }
    @Override public void close() { finish(); }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        box.again(i);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) { box.permitted(code); }

    @Override
    public boolean onKeyDown(int code, android.view.KeyEvent e) { return box.key(code, e) || super.onKeyDown(code, e); }

    @Override
    protected void onResume() {
        super.onResume();
        box.resumed();
    }

    /** The clipboard can be read only once the window has the focus (Android 10+). */
    @Override
    public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) box.focused();
    }

    @Override
    protected void onActivityResult(int request, int code, Intent data) {
        super.onActivityResult(request, code, data);
        box.result(request, code);
    }

    @Override
    protected void onPause() {
        super.onPause();
        box.leaving();
    }

    @Override
    public void onBackPressed() {
        if (!box.back()) super.onBackPressed();
    }
}
