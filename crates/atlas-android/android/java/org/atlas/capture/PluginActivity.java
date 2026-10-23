package org.atlas.capture;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;

/** A native plugin's screen (docs/refactor/REFACTOR-native-plugins.md): the app's look and bars around the plugin's
 *  view, Back as anywhere else. One activity for every plugin: the plugin is named by the Intent. */
public final class PluginActivity extends Activity {
    private static final String ID = "org.atlas.plugin", PATH = "org.atlas.path", VAULT = "org.atlas.vault";

    static void start(Activity from, String id, String path) {
        from.startActivity(new Intent(from, PluginActivity.class).putExtra(ID, id).putExtra(PATH, path));
    }

    /** In `vault` rather than the one in use (a file another app opened: OpenWithActivity's own folder). */
    static void start(Activity from, String id, String path, String vault) {
        from.startActivity(new Intent(from, PluginActivity.class).putExtra(ID, id).putExtra(PATH, path).putExtra(VAULT, vault));
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Look look = new Look(this);
        Shell.edgeToEdge(this, look);
        String id = getIntent().getStringExtra(ID), path = getIntent().getStringExtra(PATH), asked = getIntent().getStringExtra(VAULT);
        String vault = asked != null ? asked : new Vaults(this).current();
        NativePlugin plugin = Natives.byId(id);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(look.bg);
        Shell.padForBars(root);
        View content;
        if (plugin == null || vault == null) {
            TextView t = look.label(this, plugin == null ? "This app has no plugin " + id + "." : "Choose a vault first.", 15, look.muted);
            t.setPadding(look.dp(24), look.dp(24), look.dp(24), look.dp(24));
            content = t;
        } else {
            host = new Host(this, vault, plugin.id(), look);
            content = plugin.view(host, path == null ? "" : path);
        }
        root.addView(content, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        this.content = content;
    }

    private View content;
    private Host host;

    @Override
    protected void onActivityResult(int request, int code, Intent data) {
        super.onActivityResult(request, code, data);
        if (host != null) host.result(request, code, data);
    }

    @Override
    public void onBackPressed() {
        if (content instanceof NativePlugin.Back && ((NativePlugin.Back) content).back()) return;
        super.onBackPressed();
    }
}
