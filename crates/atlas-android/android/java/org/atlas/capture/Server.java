package org.atlas.capture;

import android.content.Context;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.file.Files;
import org.json.JSONObject;

/** An Atlas server as the destination (docs/guides/SERVER.md): a vault's address (`https://host/v/notes`) and a device token, `capture` scope. */
final class Server {
    private Server() {}

    static boolean is(String dest) { return dest.startsWith("https://") || dest.startsWith("http://"); }

    private static Context app;

    /** The app's context, for what the core calls back (Notices); null before init. */
    static Context app() { return app; }

    /** Once, from the app: the sign-ins live in its preferences. */
    static void init(Context c) {
        app = c.getApplicationContext();
        // a server's address is looked up again soon, and a failed lookup never kept: after a network change (Wi-Fi ↔ data, a VPN) it is found anew
        java.security.Security.setProperty("networkaddress.cache.ttl", "20");
        java.security.Security.setProperty("networkaddress.cache.negative.ttl", "0");
    }

    /**
     * What this phone sends a server: Atlas's token in `x-atlas-token` (and as `Authorization: Bearer` for a server from
     * before that header), the gate's session (a browser sign-in) and the WebView sign-in's cookies, the optional header.
     */
    static void headers(Context c, String server, HttpURLConnection h) {
        for (java.util.Map.Entry<String, String> e : headerMap(c, server).entrySet()) h.setRequestProperty(e.getKey(), e.getValue());
    }

    /** The same headers as a map: for a connection that is not an HttpURLConnection (LiveSocket's WebSocket). */
    static java.util.Map<String, String> headerMap(Context c, String server) {
        java.util.Map<String, String> h = new java.util.LinkedHashMap<>();
        Vaults v = new Vaults(c);
        String token = v.token(server);
        if (!token.isEmpty()) h.put("x-atlas-token", token);
        String cookie = v.gate(server); // the gate's session from a browser sign-in, then the WebView's own cookies
        if (v.cookies(server)) {
            String web = android.webkit.CookieManager.getInstance().getCookie(server);
            if (web != null) cookie = cookie.isEmpty() ? web : cookie + "; " + web;
        }
        if (!cookie.isEmpty()) h.put("Cookie", cookie);
        // Bearer only with no gate in front: a sign-in in front (Authelia) reads `Authorization` as its own credentials and
        // refuses the request whatever its session cookie says
        else if (!token.isEmpty()) h.put("Authorization", "Bearer " + token); // a server from before x-atlas-token
        String extra = v.header(server);
        int colon = extra.indexOf(':');
        if (colon > 0) h.put(extra.substring(0, colon).trim(), extra.substring(colon + 1).trim());
        return h;
    }

    /** Whether this phone now gets past what stands in front of `server` (off the main thread): said in a toast and the log
     *  (tag AtlasSignIn) right after a sign-in, so a way in that does not work says so at once, with the cookies' names. */
    static void verify(Context ctx, String server) {
        Context a = ctx.getApplicationContext(); // the sign-in's screen is gone by the time the answer comes
        new Thread(() -> {
            SignIn.Probe p = SignIn.probe(a, server, true);
            Vaults v = new Vaults(a);
            String names = cookieNames(v.gate(server)) + (v.cookies(server) ? " + WebView " + cookieNames(String.valueOf(android.webkit.CookieManager.getInstance().getCookie(server))) : "");
            String say = p.front == SignIn.Front.OPEN ? "Signed in: the server lets this phone in"
                : p.front == SignIn.Front.PROXY ? "The sign-in in front (" + p.host + ") still sends this phone to sign in — cookies: " + names
                : p.front == SignIn.Front.ATLAS ? "Past the sign-in in front, but Atlas refused the token"
                : "The server did not answer: " + p.why;
            android.util.Log.i("AtlasSignIn", server + ": " + p.front + " · " + say);
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> android.widget.Toast.makeText(a, say, android.widget.Toast.LENGTH_LONG).show());
        }).start();
    }

    /** The server's address looked up anew (Java keeps a found one 20 s, a failed one never: init), then whether it answers. */
    static void lookUp(Context ctx, String server) {
        Context a = ctx.getApplicationContext();
        new Thread(() -> {
            String say;
            try {
                String host = new java.net.URL(server).getHost();
                java.net.InetAddress[] all = java.net.InetAddress.getAllByName(host);
                say = host + " → " + all[0].getHostAddress();
            } catch (Exception e) { say = "Not found: " + e.getMessage(); }
            final String said = say;
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> android.widget.Toast.makeText(a, said, android.widget.Toast.LENGTH_LONG).show());
            verify(a, server);
        }).start();
    }

    private static String cookieNames(String cookies) {
        StringBuilder b = new StringBuilder();
        for (String kv : cookies.split(";")) { String k = kv.split("=", 2)[0].trim(); if (!k.isEmpty() && !k.equals("null")) b.append(b.length() > 0 ? "," : "").append(k); }
        return b.length() == 0 ? "none" : b.toString();
    }

    /** The gate's session put in the WebView's cookies too (the full app's server pages pass the gate). `Path=/`: without
     *  it Android scopes the cookie to the vault address's folder (`/v/`), and the page's scripts at `/assets/` went to the
     *  sign-in instead (the phone's report, 2026-10-17: the page loaded, every script redirected to auth.…, never ready). */
    static void plantGate(String server, String cookies) {
        if (cookies == null || cookies.isEmpty()) return;
        android.webkit.CookieManager m = android.webkit.CookieManager.getInstance();
        String site = android.net.Uri.parse(server).getScheme() + "://" + android.net.Uri.parse(server).getHost() + "/";
        for (String kv : cookies.split(";")) if (kv.contains("=")) m.setCookie(site, kv.trim() + "; Path=/; Secure");
        m.flush();
    }

    /** POST with this phone's sign-in and Atlas's header → the answer as JSON, or {error}; `retry: true` on an error that
     *  passes by itself or by signing in again (no connection, a sign-in in front) — the capture then waits (Outbox). */
    static JSONObject post(String base, String token, String path, String type, byte[] body) {
        HttpURLConnection c = null;
        boolean wrote = false;
        try {
            c = (HttpURLConnection) new URL(base.replaceAll("/+$", "") + path).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(8000);
            c.setReadTimeout(20000);
            c.setDoOutput(true);
            c.setInstanceFollowRedirects(false); // a redirect is a sign-in in front, never followed with the data
            if (app != null) headers(app, base, c); else c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("x-atlas", "1");
            c.setRequestProperty("Content-Type", type);
            try (OutputStream o = c.getOutputStream()) { o.write(body); }
            wrote = true;
            int code = c.getResponseCode();
            InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
            String text = in == null ? "" : new String(Bytes.all(in), "UTF-8");
            if (code >= 300 && code < 400) return retry("a sign-in is in front of the server: Settings → the server → sign in");
            if (code == 401 || code == 403) return retry("the server refused this phone (" + code + "): Settings → the server → sign in");
            if (code == 504) return maybe("the server took too long (504)");
            if (code == 502 || code == 503) return retry("the server is not answering (" + code + ")");
            if (code >= 400) return new JSONObject().put("error", "the server answered " + code + (text.isEmpty() ? "" : ": " + text));
            return text.startsWith("{") ? new JSONObject(text) : retry("a sign-in page answered instead of Atlas: Settings → the server → sign in");
        } catch (java.io.IOException e) {
            // sent, then no answer: the server may have done it — never done again elsewhere (a capture twice: two
            // writers of the day's log)
            if (wrote) return maybe("the server did not answer after the capture was sent (" + e.getMessage() + ")");
            return retry("no connection to the server (" + e.getMessage() + ")");
        } catch (Exception e) {
            try { return new JSONObject().put("error", String.valueOf(e.getMessage())); } catch (Exception x) { return new JSONObject(); }
        } finally {
            if (c != null) c.disconnect(); // its streams closed with it
        }
    }

    /** Sent but not answered: `maybe` — the server may have it, so it is not retried anywhere else. */
    private static JSONObject maybe(String why) {
        try { return new JSONObject().put("error", why + ": look in the vault before sending it again").put("maybe", true); } catch (Exception e) { return new JSONObject(); }
    }

    private static JSONObject retry(String why) {
        try { return new JSONObject().put("error", why).put("retry", true); } catch (Exception e) { return new JSONObject(); }
    }

    static JSONObject capture(String base, String token, String text) {
        try {
            return post(base, token, "/api/capture", "application/json", new JSONObject().put("text", text).toString().getBytes("UTF-8"));
        } catch (Exception e) { return new JSONObject(); }
    }

    /** → {path, embed} like Core.attach. */
    static JSONObject attach(String base, String token, File f) {
        try {
            String q = "/api/attach?note=&name=" + URLEncoder.encode(f.getName(), "UTF-8").replace("+", "%20");
            return post(base, token, q, "application/octet-stream", Files.readAllBytes(f.toPath()));
        } catch (Exception e) { return new JSONObject(); }
    }
}
