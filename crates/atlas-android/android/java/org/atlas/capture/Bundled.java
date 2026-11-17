package org.atlas.capture;

import android.content.Context;
import android.content.res.AssetManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** The plugins this app carries (docs/guides/ANDROID.md, "Plugins bundled in the app"): every phone-ready plugin's
 *  folder, packed by build-apk.sh (scripts/dev/bundle-plugins.mjs) as the APK's `plugins/<id>/…` assets. A folder vault
 *  opened here gets them through the core's own install path (Core.bundledPlugins → plugin_install::sync_bundled): an
 *  older copy updated, a retired plugin replaced, one changed in the vault left; never a raw copy over the vault. The
 *  core reads plugins from folders, so the assets are unpacked once per installed APK into the app's own files. */
final class Bundled {
    private Bundled() {}

    private static final String ASSETS = "plugins";

    /** The ids the APK carries, sorted ([] for an app built without them). Cheap: the asset table only. */
    static List<String> ids(Context c) {
        try {
            String[] got = c.getAssets().list(ASSETS);
            List<String> out = new ArrayList<>(got == null ? List.of() : Arrays.asList(got));
            java.util.Collections.sort(out);
            return out;
        } catch (IOException e) { return new ArrayList<>(); }
    }

    /** Carried plugin `id`'s plugin.toml, or null. */
    static String manifest(Context c, String id) {
        try (InputStream in = c.getAssets().open(ASSETS + "/" + id + "/plugin.toml")) {
            return new String(Bytes.all(in), StandardCharsets.UTF_8);
        } catch (IOException e) { return null; }
    }

    /** The carried plugins as folders the core can install from: files/bundled-plugins/<id>/, unpacked again when this
     *  APK is not the one that unpacked them (its install time). Never on the UI thread. */
    static synchronized File dir(Context c) throws IOException {
        File out = new File(c.getFilesDir(), "bundled-plugins"), stamp = new File(out, ".stamp");
        String want;
        try { want = String.valueOf(c.getPackageManager().getPackageInfo(c.getPackageName(), 0).lastUpdateTime); }
        catch (Exception e) { want = "?"; }
        if (stamp.isFile() && want.equals(new String(java.nio.file.Files.readAllBytes(stamp.toPath()), StandardCharsets.UTF_8))) return out;
        // into a fresh folder, then moved into place: a half-unpacked plugin is never installed from
        File work = new File(c.getFilesDir(), "bundled-plugins.new");
        Helpers.delete(work);
        AssetManager am = c.getAssets();
        for (String id : ids(c)) unpack(am, ASSETS + "/" + id, new File(work, id));
        try (OutputStream o = new FileOutputStream(new File(work, ".stamp"))) { o.write(want.getBytes(StandardCharsets.UTF_8)); }
        Helpers.delete(out);
        if (!work.renameTo(out)) throw new IOException("could not move the carried plugins into " + out);
        android.util.Log.i("AtlasPlugins", "unpacked " + ids(c).size() + " carried plugins into " + out);
        return out;
    }

    /** Asset `path` (a folder lists its entries; a file lists none) copied to `to`. */
    private static void unpack(AssetManager am, String path, File to) throws IOException {
        String[] kids = am.list(path);
        if (kids != null && kids.length > 0) {
            for (String k : kids) unpack(am, path + "/" + k, new File(to, k));
            return;
        }
        File parent = to.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("cannot make " + parent);
        try (InputStream in = am.open(path); OutputStream o = new FileOutputStream(to)) {
            byte[] buf = new byte[1 << 16];
            for (int n; (n = in.read(buf)) > 0; ) o.write(buf, 0, n);
        }
    }

    /** Folder vault `vault` brought up to the carried plugins, on opening it: what to say in a toast, or null when nothing
     *  changed. Never on the UI thread. Failures are logged, never thrown: the vault opens anyway. */
    static String sync(Context c, String vault) {
        if (ids(c).isEmpty()) return null;
        try {
            JSONObject r = new JSONObject(Core.bundledPlugins(vault, dir(c).getPath()));
            if (r.has("error")) { android.util.Log.e("AtlasPlugins", "bringing in the carried plugins: " + r.optString("error")); return null; }
            android.util.Log.i("AtlasPlugins", vault + ": " + r);
            // a copy left because it was changed here stays so at every opening: said once per vault, plugin and reason
            android.content.SharedPreferences prefs = c.getSharedPreferences("atlas", Context.MODE_PRIVATE);
            JSONArray kept = r.optJSONArray("left"), fresh = new JSONArray();
            for (int i = 0; kept != null && i < kept.length(); i++) {
                JSONObject l = kept.optJSONObject(i);
                String key = "bundled-left:" + vault + ":" + l.optString("id") + ":" + l.optString("why");
                if (prefs.getBoolean(key, false)) continue;
                prefs.edit().putBoolean(key, true).apply();
                fresh.put(l);
            }
            r.put("left", fresh);
            return message(r);
        } catch (Exception | UnsatisfiedLinkError e) {
            android.util.Log.e("AtlasPlugins", "bringing in the carried plugins: " + e);
            return null;
        }
    }

    /** Carried plugin `id` added to folder vault `vault` (Settings): null, or why not. Never on the UI thread. */
    static String add(Context c, String vault, String id) {
        try {
            JSONObject r = new JSONObject(Core.bundledAdd(vault, dir(c).getPath(), id));
            return r.has("error") ? r.optString("error") : null;
        } catch (Exception | UnsatisfiedLinkError e) { return String.valueOf(e.getMessage()); }
    }

    /** The report in one line: "Plugins updated: Books 0.15.0, Audiobookshelf (in place of catalog-audiobookshelf) ·
     *  left as changed in this vault: Manga", or null when there is nothing to say. */
    static String message(JSONObject r) {
        List<String> done = new ArrayList<>(), left = new ArrayList<>();
        JSONArray up = r.optJSONArray("updated"), rep = r.optJSONArray("replaced"), kept = r.optJSONArray("left");
        for (int i = 0; up != null && i < up.length(); i++) {
            JSONObject u = up.optJSONObject(i);
            done.add(u.optString("title") + (u.isNull("to") ? "" : " " + u.optString("to")));
        }
        for (int i = 0; rep != null && i < rep.length(); i++) {
            JSONObject u = rep.optJSONObject(i);
            JSONArray was = u.optJSONArray("replaces");
            List<String> ids = new ArrayList<>();
            for (int j = 0; was != null && j < was.length(); j++) ids.add(was.optString(j));
            done.add(u.optString("title") + " (in place of " + String.join(", ", ids) + ")");
        }
        for (int i = 0; kept != null && i < kept.length(); i++) left.add(kept.optJSONObject(i).optString("title"));
        if (done.isEmpty() && left.isEmpty()) return null;
        String said = done.isEmpty() ? "" : "Plugins updated: " + String.join(", ", done);
        if (!left.isEmpty()) said += (said.isEmpty() ? "" : " · ") + "not updated (changed in this vault): " + String.join(", ", left);
        return said;
    }
}
