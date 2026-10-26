package org.atlas.capture;

import android.content.Context;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** A vault's files and API for the native screens (Host, Settings), by vault: a vault on an Atlas server, or a folder on
 *  the phone through the core running in this app (Local) — the same calls (/api/tree, /api/raw, /api/file, /api/config…)
 *  either way, so a screen never knows which, and the core's rules (leases, companion notes) apply to both. */
abstract class VaultFiles {
    abstract boolean exists(String path);
    abstract boolean isDir(String path);
    /** A folder's entries (names, folders ending in "/"), sorted, hidden ones left out. */
    abstract List<String> list(String dir);
    /** Milliseconds since 1970, 0 when unknown. */
    abstract long modified(String path);
    abstract InputStream read(String path) throws IOException;
    /** For java.util.zip.ZipFile and the like, which want a file: the file itself, or a copy fetched into the cache. */
    abstract File local(String path) throws IOException;
    /** The file whole, never half of it. */
    abstract void write(String path, byte[] bytes) throws IOException;
    /** A drawing was written: its companion note follows. Null, or why it could not. */
    abstract String drawingSaved(String path, String scene);
    /** `path` to the vault's trash, recoverable, never a hard delete (the core's files::trash: `.atlas/trash/<stamp>/`
     *  on the phone, which has no desktop Trash) → where it went. */
    abstract String trash(String path) throws IOException;
    /** `from` renamed or moved to `to` (folders made; an existing `to` is refused). */
    abstract void move(String from, String to) throws IOException;

    /** The server answered and said no (an HTTP error): unlike no answer at all, waiting will not help. */
    static final class Refused extends IOException { Refused(String why) { super(why); } }

    static VaultFiles of(Context c, String vault) { return new OnServer(c, vault); }

    /** Whether plugin `id` runs in a vault whose plugins are `all` (plugins() below). A plugin built into the app runs
     *  in every vault, installed there or not, whatever the vault's copy of it says (an older or broken plugin.toml);
     *  only the vault's config.toml (`[plugins] off`, the row's `off`) stops it.
     *  Any other plugin: as the vault says. */
    /** Why a server's plugin does not run in this app (its `platforms` entry for Android says `no`; a server older than
     *  `platforms` only has `phone`), or null: what phone.rs's `why` says for a vault on the device. */
    static String androidWhy(JSONObject p) {
        JSONArray platforms = p.optJSONArray("platforms");
        for (int i = 0; platforms != null && i < platforms.length(); i++) {
            JSONObject c = platforms.optJSONObject(i);
            if (c == null || !"android".equals(c.optString("platform"))) continue;
            if (!"no".equals(c.optString("support"))) return null;
            String title = p.isNull("title") ? p.optString("id") : p.optString("title", p.optString("id"));
            return title + " does not run on Android" + (c.isNull("why") ? "" : ": " + c.optString("why"));
        }
        return p.optBoolean("phone") ? null : "not made for the phone app";
    }

    static boolean on(JSONArray all, String id) {
        boolean builtIn = NativePlugins.byId(id) != null;
        for (int i = 0; i < all.length(); i++) {
            JSONObject p = all.optJSONObject(i);
            if (id.equals(p.optString("id"))) return builtIn ? !p.optBoolean("off") : p.optBoolean("on");
        }
        return builtIn;
    }

    /** Plugin `id` as `all` lists it, with its form: a plugin built into the app that the vault has no folder for (or
     *  lists without fields) gets the fields and defaults of the manifest the app carries, and `carried: true` — its
     *  folder is written on the first save (saveSettings). Null for a plugin neither listed nor built in. */
    static JSONObject plugin(JSONArray all, String id) {
        JSONObject listed = null;
        for (int i = 0; i < all.length(); i++) if (id.equals(all.optJSONObject(i).optString("id"))) listed = all.optJSONObject(i);
        String manifest = NativePlugins.manifest(id);
        if (manifest == null) return listed; // not built in: as the vault lists it
        // built in: this app's version runs here, so its form is the app's — the vault's values over its defaults (a
        // vault with an older copy of the manifest lacked the newer settings)
        try {
            JSONObject form = new JSONObject(Core.pluginForm(manifest));
            if (form.has("error")) return listed;
            JSONObject values = form.optJSONObject("settings") != null ? form.optJSONObject("settings") : new JSONObject();
            JSONObject had = listed == null ? null : listed.optJSONObject("settings");
            if (had != null) for (java.util.Iterator<String> k = had.keys(); k.hasNext(); ) { String key = k.next(); values.put(key, had.get(key)); }
            JSONObject p = new JSONObject().put("id", id).put("on", listed == null || !listed.optBoolean("off")).put("off", listed != null && listed.optBoolean("off")).put("carried", listed == null)
                .put("fields", form.optJSONArray("fields")).put("settings", values);
            if (listed != null && listed.has("title")) p.put("title", listed.optString("title"));
            if (listed != null && listed.has("description")) p.put("description", listed.opt("description"));
            return p;
        } catch (Exception | UnsatisfiedLinkError e) { return listed; }
    }

    /** The vault's plugins as `[{id, on, settings}]` (settings with the defaults filled in), or [] when it cannot say.
     *  Never on the UI thread (AtlasActivity keeps its answer). */
    static JSONArray plugins(Context c, String vault) {
        OnServer s = new OnServer(c, vault);
        JSONArray out = new JSONArray();
        try {
            JSONArray all = new JSONArray(new String(s.get("/api/plugins?platform=android"), StandardCharsets.UTF_8));
            JSONObject cfg = new JSONObject(new String(s.get("/api/config"), StandardCharsets.UTF_8)).optJSONObject("config");
            JSONArray offList = cfg == null || cfg.optJSONObject("plugins") == null ? null : cfg.optJSONObject("plugins").optJSONArray("off");
            Set<String> off = new HashSet<>();
            for (int i = 0; offList != null && i < offList.length(); i++) off.add(offList.optString(i));
            for (int i = 0; i < all.length(); i++) {
                JSONObject p = all.getJSONObject(i);
                String id = p.optString("id");
                // a plugin built into this app runs here, natively, whatever the server makes of its manifest (an older
                // server refusing a newer one turned Notepad off: drawings fell back to Excalidraw); only `off` stops it
                boolean builtIn = NativePlugins.byId(id) != null;
                // the core's one rule (plugins::blocked, its requires included) as Android sees it; an older server says
                // only the plugin's own platforms
                boolean told = p.has("blocked");
                String blocked = told && !p.isNull("blocked") ? p.optString("blocked") : null;
                String why = builtIn || off.contains(id) ? null : told ? blocked : androidWhy(p);
                boolean on = builtIn ? !off.contains(id) : told ? blocked == null : !off.contains(id) && p.isNull("error") && why == null;
                out.put(new JSONObject().put("id", id).put("off", off.contains(id)).put("why", why == null ? JSONObject.NULL : why).put("title", p.isNull("title") ? id : p.optString("title", id)).put("description", SettingsPages.text(p, "description")).put("phone", p.optBoolean("phone")).put("on", on).put("settings", p.optJSONObject("settings") != null ? p.optJSONObject("settings") : new JSONObject())
                    .put("fields", p.optJSONArray("fields") != null ? p.optJSONArray("fields") : new JSONArray()));
                off.remove(id);
            }
            for (String id : off) out.put(new JSONObject().put("id", id).put("on", false).put("off", true).put("settings", new JSONObject())); // as phone.rs: switched off, not installed
        } catch (Exception e) { /* the server did not answer: no plugin then */ }
        return out;
    }

    /** Plugin `id`'s settings changed in the app's own form (`values`: key → value), saved where the vault keeps them
     *  (its plugin.toml, as the server and the desktop save them): null, or why not. Never on the UI thread. */
    static String saveSettings(Context c, String vault, String id, JSONObject values) {
        try {
            // a built-in plugin's first setting: its folder in the vault first (the settings are checked against it)
            String manifest = NativePlugins.manifest(id), at = ".atlas/plugins/" + id + "/plugin.toml";
            VaultFiles files = of(c, vault);
            if (manifest != null) {
                // the app's manifest in the vault: written when missing, and over an older copy (whose fields would
                // refuse the newer settings) — that copy's own values ([settings]) carried over as they are, for the
                // core to move into their settings file on this save
                String there = files.exists(at) ? textOf(files, at) : null;
                String want = there == null ? manifest : manifest.stripTrailing() + ownSettings(there);
                if (there == null || !there.equals(want)) files.write(at, want.getBytes(StandardCharsets.UTF_8));
            }
            new OnServer(c, vault).send("PUT", "/api/plugins/" + id + "/settings", "application/json", values.toString().getBytes(StandardCharsets.UTF_8));
            return null;
        } catch (Exception e) { return String.valueOf(e.getMessage()); }
    }

    /** The one note of file `file` (companion.rs: a paper's PDF has the paper's note, else `<name>.md` beside it), only
     *  found — here or on the vault's server alike. Its path. Never on the UI thread. */
    static String companionNote(Context c, String vault, String pdf) throws IOException {
        try { return companion(c, vault, new JSONObject().put("path", pdf).put("find", true)); }
        catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
    }

    /** The note of `file`, made by the core when missing — the vault's template rules, the file's block — as on every
     *  device; `properties` (may be null) go into a new note. Its path. Never on the UI thread. */
    static String ensureCompanionNote(Context c, String vault, String file, String title, JSONObject properties) throws IOException {
        try {
            JSONObject req = new JSONObject().put("path", file).put("find", false).put("title", title);
            if (properties != null) req.put("properties", properties);
            return companion(c, vault, req);
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
    }

    /** `POST /api/companion` with `req`, to the vault's server or the core here: the note's path. */
    private static String companion(Context c, String vault, JSONObject req) throws IOException {
        try {
            JSONObject r = new JSONObject(new String(new OnServer(c, vault).send("POST", "/api/companion", "application/json", req.toString().getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8));
            if (r.has("error") || !r.has("path")) throw new IOException(r.optString("error", "no note"));
            return r.getString("path");
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
    }

    /** A PDF's marks from its note's pdf-marks block (core pdf_marks.rs), `{note, marks}`, here or on the vault's server
     *  alike. Never on the UI thread. Throws with why. */
    static JSONObject pdfMarks(Context c, String vault, String pdf) throws IOException {
        try {
            String q = "/api/pdf-marks?pdf=" + java.net.URLEncoder.encode(pdf, "UTF-8");
            JSONObject r = new JSONObject(new String(new OnServer(c, vault).get(q), StandardCharsets.UTF_8));
            if (r.has("error")) throw new IOException(r.optString("error"));
            return r;
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
    }

    /** `ops` (`[{op: "put", mark} | {op: "remove", id}]`) applied to a PDF's note, made with its first mark: the marks
     *  after. Never on the UI thread. Throws with why. */
    static JSONObject changePdfMarks(Context c, String vault, String pdf, org.json.JSONArray ops) throws IOException {
        try {
            String q = "/api/pdf-marks?pdf=" + java.net.URLEncoder.encode(pdf, "UTF-8");
            JSONObject r = new JSONObject(new String(new OnServer(c, vault).send("POST", q, "application/json", ops.toString().getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8));
            if (r.has("error")) throw new IOException(r.optString("error"));
            return r;
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
    }

    /** A copy of the PDF with its marks inside as real annotations, `x (marked).pdf` beside it (core pdf_export.rs), here
     *  or on the vault's server: `{path, annotations, bookmarks, skipped, rewritten}`. Never on the UI thread. */
    static JSONObject exportPdfMarks(Context c, String vault, String pdf) throws IOException {
        try {
            String q = "/api/pdf-export?pdf=" + java.net.URLEncoder.encode(pdf, "UTF-8");
            JSONObject r = new JSONObject(new String(new OnServer(c, vault).send("POST", q, "application/json", new byte[0]), StandardCharsets.UTF_8));
            if (r.has("error")) throw new IOException(r.optString("error"));
            return r;
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
    }

    /** The vault's settings with their schema, `{config, schema, defaults, path}` (GET /api/config). Never on the UI
     *  thread. Throws with why. */
    static JSONObject config(Context c, String vault) throws IOException {
        try {
            JSONObject r = new JSONObject(new String(new OnServer(c, vault).get("/api/config"), StandardCharsets.UTF_8));
            if (r.has("error") || r.optJSONObject("config") == null) throw new IOException(r.optString("error", "no config"));
            return r;
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
    }

    /** One setting changed (`path`: its dotted place, "ui.font_size"; `value`: JSON's), read fresh then written whole —
     *  so a change made elsewhere meanwhile is kept. An error, or null. */
    static String setConfig(Context c, String vault, String path, Object value) {
        try {
            JSONObject cfg = config(c, vault).getJSONObject("config"), at = cfg;
            String[] parts = path.split("\\.");
            for (int i = 0; i < parts.length - 1; i++) {
                JSONObject next = at.optJSONObject(parts[i]);
                if (next == null) { next = new JSONObject(); at.put(parts[i], next); }
                at = next;
            }
            at.put(parts[parts.length - 1], value);
            new OnServer(c, vault).send("PUT", "/api/config", "application/json", cfg.toString().getBytes(StandardCharsets.UTF_8));
            return null;
        } catch (Exception e) { return String.valueOf(e.getMessage()); }
    }

    /** A manifest's own `[settings]` table, verbatim (with a blank line before it), or "". */
    static String ownSettings(String toml) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?ms)^\\s*\\[settings\\]\\s*$.*?(?=^\\s*\\[|\\z)").matcher(toml);
        return m.find() ? "\n\n" + m.group().strip() + "\n" : "\n";
    }

    private static String textOf(VaultFiles f, String path) {
        try (InputStream in = f.read(path)) { return new String(Bytes.all(in), StandardCharsets.UTF_8); } catch (IOException e) { return null; }
    }

    /** Plugin `id` switched on or off in this vault (`plugins.off` in its config): its config read, changed and
     *  written back, as the desktop's Settings does; an error, or null. Never on the UI thread. */
    static String setOn(Context c, String vault, String id, boolean on) {
        try {
            OnServer s = new OnServer(c, vault);
            // GET answers {config, schema, defaults, path}; PUT takes the config alone. Sending the whole answer back
            // made a server rebuild its config from the defaults (only `plugins` kept): never without `config`.
            JSONObject cfg = new JSONObject(new String(s.get("/api/config"), StandardCharsets.UTF_8)).optJSONObject("config");
            if (cfg == null) return "the core did not give the vault's config";
            JSONObject plugins = cfg.optJSONObject("plugins") != null ? cfg.optJSONObject("plugins") : new JSONObject();
            org.json.JSONArray off = new org.json.JSONArray();
            org.json.JSONArray had = plugins.optJSONArray("off");
            for (int i = 0; had != null && i < had.length(); i++) if (!id.equals(had.optString(i))) off.put(had.optString(i));
            if (!on) off.put(id);
            cfg.put("plugins", plugins.put("off", off));
            s.send("PUT", "/api/config", "application/json", cfg.toString().getBytes(StandardCharsets.UTF_8));
            return null;
        } catch (Exception e) { return String.valueOf(e.getMessage()); }
    }

    /** A vault through its core's API: a server's, signed in as the app is (Server.headers), or — for a folder on the
     *  phone — the core running in this app (Local), with the key it is locked with. Calls made on the UI thread (a
     *  plugin's save) run on a worker and are waited for: Android forbids the network there, and a plugin's calls are
     *  short. */
    static final class OnServer extends VaultFiles {
        private static final ExecutorService NET = Executors.newCachedThreadPool();
        private final Context c;
        /** The vault: a server's address, or a folder's path (PendingWrites keeps a write under it). */
        private final String base;
        /** The folder, for a vault on the phone; null for a server's. */
        private final File folder;
        private final File cache;

        OnServer(Context c, String vault) {
            this.c = c.getApplicationContext();
            this.base = vault.replaceAll("/+$", "");
            this.folder = Server.is(vault) ? null : new File(base);
            this.cache = new File(c.getCacheDir(), "server-files");
        }

        private interface Call<T> { T run() throws IOException; }

        private static <T> T off(Call<T> call) throws IOException {
            if (Looper.myLooper() != Looper.getMainLooper()) return call.run();
            try { return NET.submit(call::run).get(30, TimeUnit.SECONDS); }
            catch (java.util.concurrent.ExecutionException e) { throw e.getCause() instanceof IOException ? (IOException) e.getCause() : new IOException(e.getCause()); }
            catch (Exception e) { throw new IOException("the server did not answer in time"); }
        }

        static String q(String s) {
            try { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (java.io.UnsupportedEncodingException e) { throw new IllegalStateException(e); } // the Charset form is API 33
        }

        private HttpURLConnection open(String method, String path) throws IOException {
            Local.Endpoint here = folder == null ? null : Local.of(c, base);
            HttpURLConnection h = (HttpURLConnection) new URL((here == null ? base : here.base) + path).openConnection();
            h.setRequestMethod(method);
            h.setConnectTimeout(8000);
            h.setReadTimeout(30000);
            h.setInstanceFollowRedirects(false); // a redirect is a sign-in in front: an error here, never followed
            h.setRequestProperty("x-atlas", "1");
            if (here == null) Server.headers(c, base, h);
            else if (!here.key.isEmpty()) h.setRequestProperty("x-atlas-token", here.key);
            return h;
        }

        private static byte[] answer(HttpURLConnection h) throws IOException {
            int code = h.getResponseCode();
            if (code >= 300) {
                InputStream e = h.getErrorStream();
                String why = e == null ? "" : new String(Bytes.all(e), StandardCharsets.UTF_8);
                throw new Refused("the server answered " + code + (code >= 300 && code < 400 ? " (sign in again in Settings)" : why.isEmpty() ? "" : ": " + why));
            }
            try (InputStream in = h.getInputStream()) { return Bytes.all(in); }
        }

        byte[] get(String path) throws IOException {
            return off(() -> { HttpURLConnection h = open("GET", path); try { return answer(h); } finally { h.disconnect(); } });
        }

        byte[] send(String method, String path, String type, byte[] body) throws IOException {
            return off(() -> {
                HttpURLConnection h = open(method, path);
                try {
                    h.setDoOutput(true);
                    h.setRequestProperty("Content-Type", type);
                    try (OutputStream o = h.getOutputStream()) { o.write(body); }
                    return answer(h);
                } finally { h.disconnect(); }
            });
        }

        private static String parent(String path) { int i = path.lastIndexOf('/'); return i < 0 ? "" : path.substring(0, i); }

        /** The entry for `path` in its folder's listing, or null. */
        private JSONObject entry(String path) {
            String p = path.replaceAll("^/+|/+$", "");
            if (p.isEmpty()) return new JSONObject();
            try {
                JSONArray a = new JSONArray(new String(get("/api/tree?path=" + q(parent(p))), StandardCharsets.UTF_8));
                for (int i = 0; i < a.length(); i++) if (p.equals(a.getJSONObject(i).optString("path"))) return a.getJSONObject(i);
            } catch (Exception e) { /* not there */ }
            return null;
        }

        @Override boolean exists(String path) { return PendingWrites.waitingFor(c, base, path) != null || entry(path) != null; }

        @Override boolean isDir(String path) { JSONObject e = entry(path); return e != null && (e.length() == 0 || "dir".equals(e.optString("kind"))); }

        @Override List<String> list(String dir) {
            List<String> out = new ArrayList<>();
            try {
                JSONArray a = new JSONArray(new String(get("/api/tree?path=" + q(dir.replaceAll("/+$", ""))), StandardCharsets.UTF_8));
                for (int i = 0; i < a.length(); i++) {
                    JSONObject e = a.getJSONObject(i);
                    String name = e.optString("name");
                    if (!name.startsWith(".")) out.add(name + ("dir".equals(e.optString("kind")) ? "/" : ""));
                }
            } catch (Exception e) { /* none */ }
            Collections.sort(out, String.CASE_INSENSITIVE_ORDER);
            return out;
        }

        @Override long modified(String path) { JSONObject e = entry(path); return e == null ? 0 : e.optLong("modified", 0) * 1000; }

        @Override InputStream read(String path) throws IOException {
            byte[] kept = PendingWrites.waitingFor(c, base, path); // written offline, not sent yet: the newest
            return new ByteArrayInputStream(kept != null ? kept : get("/api/raw?path=" + q(path)));
        }

        /** A folder vault's file itself (nothing copied: a book is large); a server's fetched into the app's cache (kept
         *  while unchanged on the server: a chapter is read many times). */
        @Override File local(String path) throws IOException {
            if (folder != null) {
                File f = new File(folder, path).getCanonicalFile();
                if (!f.getPath().startsWith(folder.getCanonicalPath())) throw new IOException("outside the vault: " + path);
                return f;
            }
            File f = new File(cache, Integer.toHexString(path.hashCode()) + "-" + new File(path).getName());
            byte[] kept = PendingWrites.waitingFor(c, base, path);
            if (kept != null) {
                if (!cache.isDirectory() && !cache.mkdirs()) throw new IOException("no cache folder");
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(kept); }
                return f;
            }
            long at = modified(path);
            if (f.isFile() && at != 0 && f.lastModified() == at) return f;
            if (!cache.isDirectory() && !cache.mkdirs()) throw new IOException("no cache folder");
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(get("/api/raw?path=" + q(path))); }
            if (at != 0) f.setLastModified(at);
            return f;
        }

        /** A drawing as text through /api/file, so the server writes its companion note as the desktop's save does;
         *  anything else as bytes through /api/raw. */
        /** Sent now; with no answer (offline, the server down) kept on the device and sent later (PendingWrites) — the
         *  save succeeds for the one saving, as a capture does. A refusal (an HTTP error) is kept too — never lost (the
         *  user: "http errors should not delete the queued files") — and thrown, so the one saving says so. */
        @Override void write(String path, byte[] bytes) throws IOException {
            try {
                writeNow(path, bytes);
                PendingWrites.drop(c, base, path); // an older offline save of it must not follow
            } catch (Refused r) {
                PendingWrites.keep(c, base, path, bytes);
                throw new Refused(r.getMessage() + " — kept on this device, sent again later");
            } catch (IOException offline) {
                PendingWrites.keep(c, base, path, bytes);
            }
        }

        void writeNow(String path, byte[] bytes) throws IOException {
            if (path.endsWith(".excalidraw")) {
                try {
                    String body = new JSONObject().put("path", path).put("text", new String(bytes, StandardCharsets.UTF_8)).toString();
                    send("PUT", "/api/file", "application/json", body.getBytes(StandardCharsets.UTF_8));
                } catch (org.json.JSONException e) { throw new IOException(e); }
            } else {
                send("PUT", "/api/raw?path=" + q(path), "application/octet-stream", bytes);
            }
        }

        /** The server wrote the note with the drawing (write above). */
        @Override String drawingSaved(String path, String scene) { return null; }

        @Override String trash(String path) throws IOException {
            byte[] r = off(() -> send("POST", "/api/fs/trash?path=" + q(path), "application/json", new byte[0]));
            try { return new org.json.JSONObject(new String(r, StandardCharsets.UTF_8)).optString("to", "the trash"); } catch (org.json.JSONException e) { return "the trash"; }
        }

        @Override void move(String from, String to) throws IOException {
            String body;
            try { body = new org.json.JSONObject().put("from", from).put("to", to).toString(); } catch (org.json.JSONException e) { throw new IOException(e); }
            off(() -> send("POST", "/api/fs/move", "application/json", body.getBytes(StandardCharsets.UTF_8)));
        }
    }
}
