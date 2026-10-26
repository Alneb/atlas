package org.atlas.capture;

import android.content.Context;

import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/** The core running inside this app for a folder vault (crates/atlas-android/src/serve.rs): its address and the key it
 *  is locked with, started on first use and kept for the app's life. The app's native screens reach a folder vault
 *  through it, as they reach a server's vault through that server — one API, as the desktop's page talks to its own
 *  core (docs/design/DESIGN-android.md, "One way to a vault"). Never on the UI thread: the first call starts the core. */
final class Local {
    private Local() {}

    static final class Endpoint {
        final String base, key;
        Endpoint(String base, String key) { this.base = base; this.key = key; }
    }

    private static final Map<String, Endpoint> known = new HashMap<>();

    static synchronized Endpoint of(Context c, String vault) throws IOException {
        Endpoint e = known.get(vault);
        if (e != null) return e;
        String r;
        try { r = Core.serve(vault, c.getFilesDir().getPath(), Helpers.environment(c)); }
        catch (UnsatisfiedLinkError x) { throw new IOException("this app has no core of its own: open the vault in Atlas"); }
        try {
            JSONObject o = new JSONObject(r);
            if (o.has("error")) throw new IOException(o.getString("error"));
            e = new Endpoint("http://127.0.0.1:" + o.getInt("port"), o.isNull("key") ? "" : o.optString("key"));
        } catch (org.json.JSONException x) { throw new IOException(x.getMessage()); }
        known.put(vault, e);
        return e;
    }
}
