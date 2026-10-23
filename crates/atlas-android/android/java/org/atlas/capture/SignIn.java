package org.atlas.capture;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Signing in to an Atlas server whatever stands in front of it (docs/guides/ANDROID.md, "Signing in"). Nothing names a product: the server's answer says it all —
 * JSON 401 is Atlas's own sign-in; a redirect to another host, or a page where JSON was expected, is a sign-in in front.
 * Either way the way in is Atlas's `/auth/app`: through the front's page (in the app's WebView, its cookies kept) and
 * Atlas's question, it hands the app a device token (no OIDC).
 */
final class SignIn {
    enum Front { OPEN, ATLAS, PROXY, DOWN }

    /** What answered: `front`, the sign-in's host, and why when it is down. */
    static final class Probe {
        Front front;
        String host, why;
    }

    private SignIn() {}

    /** The server's name for this app (server.rs `APPS`): the token comes back to this package's own address. */
    static String app(Context c) {
        switch (Edition.of(c)) {
            case BOOX: return "boox";
            case ATLAS: return "atlas";
            default: return "capture";
        }
    }

    /** For the in-app sign-in, which catches the token's redirect itself whatever app it names: only the scope matters,
     *  so a server from before an app's name (`boox`) still lets it in. */
    static String scopeApp(Context c) { return Edition.of(c).full() ? "atlas" : "capture"; }

    /** A token's way back (`<scheme>://signed-in?token=…`) to any of the three apps. */
    static boolean isReturn(Uri u) {
        return u.getScheme() != null && u.getScheme().startsWith("org.atlas.") && "signed-in".equals(u.getHost());
    }

    static String device() { return Build.MANUFACTURER + " " + Build.MODEL; }

    /** Off the main thread. `with`: the headers this phone would send (to see whether they pass now). */
    static Probe probe(Context c, String server, boolean with) {
        Probe p = new Probe();
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(base(server) + "/api/auth/me").openConnection();
            h.setInstanceFollowRedirects(false);
            h.setConnectTimeout(8000);
            h.setReadTimeout(10000);
            h.setRequestProperty("x-atlas", "1");
            if (with) Server.headers(c, server, h);
            int code = h.getResponseCode();
            String type = String.valueOf(h.getContentType());
            String loc = h.getHeaderField("Location");
            String serverHost = Uri.parse(server).getHost();
            if (code >= 300 && code < 400 && loc != null) {
                String to = Uri.parse(new URL(new URL(server), loc).toString()).getHost();
                p.front = to != null && !to.equals(serverHost) ? Front.PROXY : Front.ATLAS;
                p.host = to;
            } else if (type.contains("json")) {
                p.front = code == 200 ? Front.OPEN : Front.ATLAS;
            } else {
                p.front = Front.PROXY; // a sign-in page served in place
                p.host = serverHost;
            }
        } catch (Exception e) {
            p.front = Front.DOWN;
            p.why = String.valueOf(e.getMessage());
        } finally {
            if (h != null) h.disconnect(); // its body is never read: the socket would stay held
        }
        return p;
    }

    /** Atlas's own step in the browser (a server with only Atlas's password): `/auth/app` asks, then hands this app a token. */
    static void atlasInBrowser(Activity a, String server) {
        a.getSharedPreferences("atlas", Context.MODE_PRIVATE).edit().putString("signin:server", server).apply();
        // the browser is the user's pick, not only the default: a security key needs one that hands WebAuthn to Android's
        // passkey service (Authnkey…) — a recent Chromium (Vanadium, Cromite, Chrome); the Boox's default Firefox build does not
        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(appUrl(a, server))).addCategory(Intent.CATEGORY_BROWSABLE);
        a.startActivity(Intent.createChooser(view, "Sign in with which browser? (a security key needs a recent Chromium)"));
    }

    static String appUrl(Context c, String server) { return appUrl(server, app(c)); }

    static String appUrl(String server, String app) {
        try {
            return base(server) + "/auth/app?app=" + app + "&name=" + URLEncoder.encode(device(), "UTF-8").replace("+", "%20");
        } catch (Exception e) {
            return base(server) + "/auth/app?app=" + app;
        }
    }

    static String base(String server) { return server.replaceAll("/+$", ""); }
}
