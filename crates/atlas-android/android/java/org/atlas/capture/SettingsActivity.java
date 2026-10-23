package org.atlas.capture;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * What opening the capture app from the launcher shows: its name, then Setup. The capture box itself opens from the tile, the button, a share, or "New capture".
 */
public final class SettingsActivity extends Activity {
    private Setup setup;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Look look = new Look(this);
        Server.init(this);
        Shell.edgeToEdge(this, look);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(look.app);
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(look.dp(20), look.dp(18), look.dp(20), look.dp(4));
        top.addView(look.brand(this, 30), new LinearLayout.LayoutParams(look.dp(30), look.dp(30)));
        TextView name = look.label(this, getApplicationInfo().loadLabel(getPackageManager()).toString(), 22, look.text);
        name.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        name.setPaddingRelative(look.dp(12), 0, 0, 0);
        top.addView(name);
        page.addView(top);
        setup = new Setup(this, look);
        page.addView(setup.view);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(look.readable(this, page));
        scroll.setBackgroundColor(look.app);
        Shell.padForBars(scroll);
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        setup.draw(); // back from the permission or accessibility screens
        new Thread(() -> Outbox.send(this)).start(); // captures kept while a server did not answer
    }
}
