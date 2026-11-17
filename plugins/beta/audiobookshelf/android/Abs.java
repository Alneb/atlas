package org.atlas.plugins.audiobookshelf;

import android.content.Context;
import android.content.SharedPreferences;

import org.atlas.capture.Host;
import org.atlas.capture.Json;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Audiobookshelf's API for the native screens, the same calls as the page's abs.js: every request through the vault's
 * core (`Host.fetch`, `atlas.fetch`'s path) with the token as the plugin's secret header — filled in by the core, never
 * held here —, the covers kept in the plugin's cache where the page keeps them, a book played through the app's player
 * (`Host.play`) with the key the helper's `progress` reads, so where you are reaches the server as from the page.
 * Never on the UI thread. Answers are read with the shell's plain Json into Cards / Book (tested on the JVM).
 */
final class Abs {
    static final String COVERS = ".atlas/cache/plugins/audiobookshelf/covers/";
    private final Host host;
    private List<Object> libraries;

    Abs(Host host) { this.host = host; }

    /** The server's address from the settings ("" when none). */
    String base() { return host.settings().optString("server", "").trim().replaceAll("/+$", ""); }

    boolean on() { return !base().isEmpty(); }

    /** Seconds the skip buttons go (the plugin's `skip`, 30 by default). */
    int skip() { int s = host.settings().optInt("skip", 30); return s > 0 ? s : 30; }

    private static JSONObject auth() {
        try { return new JSONObject().put("Authorization", new JSONObject().put("secret", "token").put("prefix", "Bearer ")); }
        catch (JSONException e) { throw new IllegalStateException(e); }
    }

    static String q(String s) {
        try { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (java.io.UnsupportedEncodingException e) { throw new IllegalStateException(e); }
    }

    /** One request: its answer's text (abs.js `call`: the same errors). `body` null: none. */
    String call(String method, String path, JSONObject body) throws IOException {
        if (!on()) throw new IOException("no Audiobookshelf address yet (Settings → Plugins → Audiobookshelf)");
        try {
            JSONObject headers = auth().put("accept", "application/json");
            JSONObject req = new JSONObject().put("url", base() + path).put("method", method).put("headers", headers);
            if (body != null) { headers.put("content-type", "application/json"); req.put("body", body.toString()); }
            JSONObject r = host.fetch(req);
            if (r.has("signin") && !r.isNull("signin")) throw new IOException("sign in to " + base().replaceFirst("^https?://", "") + " first (in the app's page)");
            if (!r.optBoolean("ok")) {
                int status = r.optInt("status");
                throw new IOException("Audiobookshelf answered " + status + (status == 401 ? ": the API token (Settings → Plugins → Audiobookshelf)" : ""));
            }
            return r.optString("text", "");
        } catch (JSONException e) { throw new IOException(e.getMessage()); }
    }

    Object get(String path) throws IOException {
        String t = call("GET", path, null);
        try { return Json.parse(t); } catch (IllegalArgumentException e) { throw new IOException("Audiobookshelf answered something else: " + e.getMessage()); }
    }

    /** The server's libraries ({id, name, mediaType}), asked once per screen stack. */
    synchronized List<Object> libraries() throws IOException {
        if (libraries == null) libraries = Json.arr(get("/api/libraries"), "libraries");
        return libraries;
    }

    /** The book libraries (`mediaType` book or none). */
    List<Object> bookLibraries() throws IOException {
        List<Object> out = new ArrayList<>();
        for (Object l : libraries()) if (!"podcast".equals(Json.str(l, "mediaType", "book"))) out.add(l);
        return out;
    }

    Object me() throws IOException { return get("/api/me"); }

    static String lib(Object l) { return q(Json.str(l, "id", "")); }

    /** Every item of a library, a page at a time to its total. */
    List<Cards.Card> items(Object l, java.util.Map<String, Object> progress) throws IOException {
        List<Cards.Card> out = new ArrayList<>();
        final int page = 500;
        for (int p = 0; ; p++) {
            long[] total = { 0 };
            List<Cards.Card> got = Cards.itemsOf(get("/api/libraries/" + lib(l) + "/items?limit=" + page + "&page=" + p), progress, total);
            out.addAll(got);
            if (got.isEmpty() || (long) (p + 1) * page >= total[0]) return out;
        }
    }

    Object item(String id) throws IOException { return get("/api/items/" + q(id) + "?expanded=1"); }

    void addBookmark(String item, double time, String title) throws IOException {
        try { call("POST", "/api/me/item/" + q(item) + "/bookmark", new JSONObject().put("time", Math.floor(time)).put("title", title)); }
        catch (JSONException e) { throw new IOException(e.getMessage()); }
    }

    void removeBookmark(String item, double time) throws IOException {
        call("DELETE", "/api/me/item/" + q(item) + "/bookmark/" + q(time == Math.floor(time) ? String.valueOf((long) time) : String.valueOf(time)), null);
    }

    /** The item's cover bytes: kept in the plugin's cache (the page's place for them), else fetched into it; null: none. */
    byte[] cover(String id) {
        if (id == null || id.isEmpty()) return null;
        byte[] kept = read(COVERS + id);
        if (kept != null || !on()) return kept;
        try {
            JSONObject r = host.fetch(new JSONObject().put("url", base() + "/api/items/" + q(id) + "/cover").put("headers", auth()).put("save_to", "covers/" + id));
            return r.optBoolean("ok") && r.has("saved") && !r.isNull("saved") ? read(r.getString("saved")) : null;
        } catch (Exception e) { return null; }
    }

    private byte[] read(String path) {
        try (InputStream in = host.read(path)) { return org.atlas.capture.Bytes.all(in); } catch (Exception e) { return null; }
    }

    /** This device's id for the server's sessions (its listening stats per device): made once, kept by the app. */
    static String device(Context c) {
        SharedPreferences p = c.getSharedPreferences("audiobookshelf", Context.MODE_PRIVATE);
        String id = p.getString("device", null);
        if (id == null) { id = "atlas-" + Long.toString(Math.abs(new java.security.SecureRandom().nextLong()), 36); p.edit().putString("device", id).apply(); }
        return id;
    }

    /** The speed last chosen on this device (abs.js keeps the page's own). */
    static double speed(Context c) { return Double.longBitsToDouble(c.getSharedPreferences("audiobookshelf", Context.MODE_PRIVATE).getLong("speed", Double.doubleToLongBits(1))); }

    static void speed(Context c, double s) { c.getSharedPreferences("audiobookshelf", Context.MODE_PRIVATE).edit().putLong("speed", Double.doubleToLongBits(s)).apply(); }

    /** The body a play session is opened with (abs.js `playBody`): this device, the files played as they are. */
    static JSONObject playBody(String device) throws JSONException {
        JSONArray types = new JSONArray();
        for (String t : new String[] { "audio/mpeg", "audio/mp4", "audio/x-m4b", "audio/aac", "audio/ogg", "audio/flac", "audio/wav", "audio/webm" }) types.put(t);
        return new JSONObject().put("deviceInfo", new JSONObject().put("clientName", "Atlas").put("deviceId", device)).put("mediaPlayer", "html5")
            .put("forceDirectPlay", true).put("forceTranscode", false).put("supportedMimeTypes", types);
    }

    /** A play session opened for the book (or `episode`), handed to the app's player at `from` (NaN: where the server
     *  says you are), its cover `cover` (may be null). The player's key is the page's: the helper syncs from it. */
    void play(String item, String episode, double from, byte[] cover) throws IOException {
        try {
            Context c = host.activity();
            String dev = device(c);
            String path = "/api/items/" + q(item) + "/play" + (episode == null || episode.isEmpty() ? "" : "/" + q(episode));
            Book.Session s = Book.session(Json.parse(call("POST", path, playBody(dev))), episode != null && !episode.isEmpty());
            if (s.tracks.isEmpty()) throw new IOException("the server gave no audio for this book");
            JSONArray tracks = new JSONArray(), chapters = new JSONArray();
            for (Book.Track t : s.tracks) tracks.put(new JSONObject().put("src", host.media(base() + t.contentUrl, auth())).put("start", t.start).put("duration", t.duration));
            for (Book.Chapter ch : s.chapters) chapters.put(new JSONObject().put("start", ch.start).put("end", ch.end).put("title", ch.title));
            JSONObject key = new JSONObject().put("item", item).put("session", s.id).put("device", dev);
            if (episode != null && !episode.isEmpty()) key.put("episode", episode);
            JSONObject it = new JSONObject().put("key", key).put("title", s.title).put("author", s.author).put("tracks", tracks).put("chapters", chapters)
                .put("at", Double.isNaN(from) ? s.at : from).put("speed", speed(c))
                .put("open", episode == null || episode.isEmpty() ? item : item + "/" + episode); // the page's pane argument (shelf.js argOf)
            if (cover != null) it.put("cover", "data:image/jpeg;base64," + android.util.Base64.encodeToString(cover, android.util.Base64.NO_WRAP));
            host.play(it);
        } catch (JSONException | IllegalArgumentException e) { throw new IOException(e.getMessage()); }
    }
}
