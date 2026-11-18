package org.atlas.capture;

import android.content.Context;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * The device's way past a gate, from the core's one store (crates/atlas-android/src/signins.rs → service_signin.rs):
 * the bypass key kept for a host — typed in "A token or a header…" or kept from the desktop's Settings → Sign-ins on
 * this phone's own core — sent by every native request: a server vault's (Server.headerMap), a service's (Web).
 * The cookies stay where they were (the WebView's and the gate's per server, Server/Web): only what is not a cookie
 * comes from here. Off the main thread (a small file read).
 */
final class Signins {
    private Signins() {}

    /** The headers kept for `url` other than cookies (a gate's bypass key), empty when none or with no core in this app. */
    static Map<String, String> keys(Context c, String url) {
        Map<String, String> out = new LinkedHashMap<>();
        try {
            JSONObject h = new JSONObject(Core.siteHeaders(c.getFilesDir().getPath(), url)).optJSONObject("headers");
            if (h != null) for (java.util.Iterator<String> it = h.keys(); it.hasNext(); ) {
                String k = it.next();
                if (!k.equalsIgnoreCase("Cookie")) out.put(k, h.optString(k));
            }
        } catch (UnsatisfiedLinkError | Exception e) { /* none kept, or no core here: nothing to add */ }
        return out;
    }

    /** `Name: value` kept as the bypass key of `server`'s host; null when kept, else why not (the core's checks). */
    static String keep(Context c, String server, String line) {
        try {
            JSONObject r = new JSONObject(Core.keepHeader(c.getFilesDir().getPath(), server, line));
            return r.optBoolean("ok") ? null : r.optString("error", "not kept");
        } catch (UnsatisfiedLinkError e) {
            return "this app has no core of its own to keep it in";
        } catch (Exception e) {
            return String.valueOf(e.getMessage());
        }
    }

    /** Atlas's device token from `server` with the gate's key kept for its host: {token, null} or {null, why}. Blocking. */
    static String[] tokenByKey(Context c, String server) {
        try {
            JSONObject r = new JSONObject(Core.tokenByKey(c.getFilesDir().getPath(), server, SignIn.app(c), SignIn.device()));
            String token = r.optString("token", "");
            return token.isEmpty() ? new String[] {null, r.optString("error", "no token")} : new String[] {token, null};
        } catch (UnsatisfiedLinkError e) {
            return new String[] {null, "this app has no core of its own"};
        } catch (Exception e) {
            return new String[] {null, String.valueOf(e.getMessage())};
        }
    }

    /** The header name of the key kept for `server`'s host, "" when none. */
    static String kept(Context c, String server) {
        try { return new JSONObject(Core.keptHeader(c.getFilesDir().getPath(), server)).optString("header", "").replace("null", ""); }
        catch (UnsatisfiedLinkError | Exception e) { return ""; }
    }

    /** The per-server `header:` preference of before, moved into the one store once (each server with one), then removed. */
    static void migrate(Context c) {
        Vaults v = new Vaults(c);
        for (String server : v.list()) {
            String old = v.legacyHeader(server);
            if (old.isEmpty()) continue;
            String why = server.startsWith("https://") ? keep(c, server, old) : null; // it was sent over https only
            if (why == null) v.dropLegacyHeader(server);
            else android.util.Log.w("AtlasSignIn", server + ": the header kept for it could not be moved into the sign-ins: " + why);
        }
    }
}
