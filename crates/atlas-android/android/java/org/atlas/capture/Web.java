package org.atlas.capture;

import android.content.Context;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * The user's services beside their vaults (Suwayomi, Audiobookshelf, a files server), reached from native code with the
 * same sign-in as the vault:
 * a sign-in in front (Authelia) gives its session to its whole domain, so a request carries the app's cookies for that
 * address (the in-app sign-in keeps them in the WebView's store) and the session of every signed-in server of the same
 * domain (a browser sign-in, kept per server). When the sign-in still answers, {@link SignInNeeded}: the plugin offers
 * {@link #signIn}. On the VPN, with no sign-in in front, a request is just a request.
 */
public final class Web {
    private Web() {}

    /** A sign-in stands in front of `url` and this app has no session for it yet. */
    public static final class SignInNeeded extends IOException {
        public final String url;
        SignInNeeded(String url) { super("sign in to " + host(url) + " first"); this.url = url; }
    }

    /** GET → the body. */
    public static byte[] get(Context c, String url) throws IOException { return send(c, url, "GET", null, null); }

    /** POST `body` of `type` → the answer's body (a GraphQL query: `application/json`). */
    public static byte[] post(Context c, String url, String type, byte[] body) throws IOException { return send(c, url, "POST", type, body); }

    private static byte[] send(Context c, String url, String method, String type, byte[] body) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            h.setRequestMethod(method);
            h.setConnectTimeout(10_000);
            h.setReadTimeout(60_000);
            h.setInstanceFollowRedirects(false); // a redirect to another host is the sign-in in front: said, not followed
            String cookie = cookies(c, url);
            if (!cookie.isEmpty()) h.setRequestProperty("Cookie", cookie);
            if (body != null) {
                h.setDoOutput(true);
                h.setRequestProperty("Content-Type", type);
                try (OutputStream o = h.getOutputStream()) { o.write(body); }
            }
            int code = h.getResponseCode();
            if (code >= 300 && code < 400) {
                String to = h.getHeaderField("Location");
                if (to != null && !host(new URL(new URL(url), to).toString()).equals(host(url))) throw new SignInNeeded(url);
                return send(c, new URL(new URL(url), to).toString(), method, type, body); // the same service elsewhere
            }
            if (code == 401) throw new SignInNeeded(url);
            if (code >= 400) throw new IOException(host(url) + " answered " + code);
            try (InputStream in = h.getInputStream()) { return Bytes.all(in); }
        } finally {
            h.disconnect();
        }
    }

    /** The app's cookies for `url`, and the sessions of the signed-in servers sharing its domain. */
    static String cookies(Context c, String url) {
        StringBuilder out = new StringBuilder();
        String web = android.webkit.CookieManager.getInstance().getCookie(url);
        if (web != null && !web.isEmpty()) out.append(web);
        Vaults v = new Vaults(c);
        String domain = domain(host(url));
        for (String server : v.list()) {
            if (!Server.is(server) || !domain.equals(domain(host(server)))) continue;
            String gate = v.gate(server);
            if (!gate.isEmpty() && out.indexOf(gate) < 0) out.append(out.length() > 0 ? "; " : "").append(gate);
        }
        return out.toString();
    }

    /** Signs in to `url`'s sign-in in front, in the app (the vault's own way: its WebView keeps the cookies for the
     *  domain); `done` once the service itself answers. */
    public static void signIn(android.app.Activity a, String url, Runnable done) {
        SignInWebActivity.service(a, url, done);
    }

    static String host(String url) {
        try { return new URL(url).getHost().toLowerCase(java.util.Locale.ROOT); } catch (Exception e) { return ""; }
    }

    /** `manga.example.org` → `example.org`: where a sign-in in front sets its session (its last two labels). */
    static String domain(String host) {
        String[] p = host.split("\\.");
        return p.length <= 2 ? host : p[p.length - 2] + "." + p[p.length - 1];
    }

    /** `{query, variables}` for a GraphQL service, as bytes. */
    public static byte[] graphql(String query, Map<String, Object> variables) {
        try {
            org.json.JSONObject o = new org.json.JSONObject().put("query", query).put("variables", new org.json.JSONObject(variables));
            return o.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        } catch (org.json.JSONException e) { throw new IllegalArgumentException(e); }
    }
}
