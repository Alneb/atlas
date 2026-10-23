package org.atlas.capture;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

/**
 * Where the browser comes back to the app after a sign-in (`<package>://signed-in?token=…&gate=…` from the server's
 * `/auth/app`): keeps Atlas's token and, behind a gate (Authelia…), the gate's session the browser got with the
 * security key — so the app passes the gate as the browser does. Then shows the app again.
 */
public final class SignedInActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri u = getIntent().getData();
        String server = getSharedPreferences("atlas", MODE_PRIVATE).getString("signin:server", "");
        if (u == null || server.isEmpty()) { finish(); return; }
        Vaults vaults = new Vaults(this);
        if ("signed-in".equals(u.getHost()) && u.getQueryParameter("token") != null) {
            vaults.useServer(server, u.getQueryParameter("token"));
            String gate = u.getQueryParameter("gate"); // the gate's session cookies, when there is a gate in front
            if (gate != null && !gate.isEmpty()) { vaults.keepGate(server, gate); Server.plantGate(server, gate); }
            done("Signed in to " + Vaults.name(server));
            Server.verify(this, server); // does this phone now get through? said in a moment
        } else {
            done("Not signed in: " + u.getQueryParameter("error"));
        }
    }

    private void done(String say) {
        Toast.makeText(this, say, Toast.LENGTH_LONG).show();
        Intent i = new Intent(this, Edition.of(this).full() ? AtlasActivity.class : SettingsActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra(AtlasActivity.RELOAD, true);
        startActivity(i);
        finish();
    }
}
