package org.atlas.capture;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** What a native plugin may do (docs/refactor/REFACTOR-native-plugins.md), and nothing more: the vault's files by
 *  vault path — a folder on the phone or a vault on Atlas's server, the same calls (VaultFiles) — its own settings, the
 *  e-ink refresh, pictures, going back to the app. */
public final class Host {
    private final Activity activity;
    private final String vault;
    private final VaultFiles files;
    private final String plugin;
    private final Look look;

    Host(Activity a, String vault, String plugin, Look look) { this.activity = a; this.vault = vault; this.files = VaultFiles.of(a, vault); this.plugin = plugin; this.look = look; }

    public Activity activity() { return activity; }

    public boolean exists(String path) { return files.exists(path); }

    public boolean isDir(String path) { return files.isDir(path); }

    /** A folder's entries (names, folders ending in "/"), sorted, hidden ones left out. */
    public List<String> list(String dir) { return files.list(dir); }

    public long modified(String path) { return files.modified(path); }

    public InputStream read(String path) throws IOException { return files.read(path); }

    /** For java.util.zip.ZipFile and the like, which want a file (a server's: a copy in the cache). */
    public File local(String path) throws IOException { return files.local(path); }

    public String readText(String path) {
        try (InputStream in = read(path)) {
            return new String(Bytes.all(in), StandardCharsets.UTF_8);
        } catch (IOException e) { return null; }
    }

    /** Writes a file whole (never half of it). */
    public void write(String path, byte[] bytes) throws IOException { files.write(path, bytes); }

    /** A drawing (`.excalidraw`) was written: its companion note follows (`x.md` beside it, as on the desktop). Says
     *  why when it could not, never throws: the drawing is saved either way. */
    /** `path` to the vault's trash (recoverable) → where it went. */
    public String trash(String path) throws IOException { return files.trash(path); }

    /** `from` renamed or moved to `to`. */
    public void move(String from, String to) throws IOException { files.move(from, to); }

    public void drawingSaved(String path, String scene) {
        String why = files.drawingSaved(path, scene);
        if (why != null) toast("The drawing's note was not updated: " + why);
    }

    /** This plugin's settings in this vault, the same values its web side reads (the defaults filled in), or {}. The
     *  app's own screens (Natives.CORE) read theirs from the core's settings: the notepad's are `[draw]`. */
    public JSONObject settings() {
        if (Natives.core(plugin)) {
            try { JSONObject d = VaultFiles.config(activity, vault).getJSONObject("config").optJSONObject("draw"); if (d != null) return d; }
            catch (Exception e) { /* the defaults */ }
            return new JSONObject();
        }
        try {
            JSONObject p = VaultFiles.plugin(VaultFiles.plugins(activity, vault), plugin); // the carried defaults too
            JSONObject s = p == null ? null : p.optJSONObject("settings");
            if (s != null) return s; // a plugin with no settings yet: never null to the plugin
        } catch (Exception e) { /* none */ }
        return new JSONObject();
    }

    /** The note of PDF `pdf`, made when it has none: a Library paper's own reading note, else one of the same shape
     *  beside it (reading_note::for_pdf). Its vault path. Never on the UI thread. */
    /** `path`'s live room on the vault's server (LiveSocket), as this device ("Boox" on an Onyx, else "phone"); null for a
     *  vault on this device. Close it with the file. */
    public LiveSocket live(String path, LiveSocket.Listener on) {
        String me = android.os.Build.MANUFACTURER != null && android.os.Build.MANUFACTURER.toLowerCase(java.util.Locale.ROOT).contains("onyx") ? "Boox" : "phone";
        return LiveSocket.join(activity, vault, path, me, on);
    }

    public String companionNote(String file) throws IOException { return VaultFiles.companionNote(activity, vault, file); }

    /** File `name` of this plugin's shared/ folder, carried in the app (its web side uses the same file), or null. */
    public String sharedFile(String name) { return NativePlugins.shared(plugin, name); }

    /** This plugin's settings changed (key → value), saved where the vault keeps them, as Settings saves them: null,
     *  or why not. Never on the UI thread (a server's vault answers over the network). */
    public String saveSettings(JSONObject values) { return VaultFiles.saveSettings(activity, vault, plugin, values); }

    public boolean eink() { return look.eink; }

    /** A font the app carries (res/font/<name>.ttf: "excalifont", Excalidraw's hand-written one), or null. */
    public android.graphics.Typeface font(String name) {
        int id = activity.getResources().getIdentifier(name, "font", activity.getPackageName());
        try { return id == 0 ? null : activity.getResources().getFont(id); } catch (RuntimeException e) { return null; }
    }

    /** Whether the app draws for e-ink (a Boox, or the Boox app anywhere — so the emulator shows its screens), for
     *  `NativePlugin.opens`, which has no Context: the activity asking has made its Look by then. */
    public static boolean einkScreen() { return Look.einkApp; }

    /** Clears the ghosts on e-ink, calmly — no flash (Look.calmRefresh): a plugin's automatic refreshes. */
    public void einkRefresh() { if (look.eink) Look.calmRefresh(activity.getWindow().getDecorView()); }

    /** The full, flashing refresh (Look.fullRefresh): only when the user asks for a clean screen. */
    public void einkClear() { if (look.eink) Look.fullRefresh(activity.getWindow().getDecorView()); }

    public Bitmap decode(byte[] bytes, int maxW, int maxH) { return Images.decode(bytes, maxW, maxH); }

    public Look look() { return look; }

    /** What `pickPicture` hands back: the picture's bytes and type ("image/png"…), on the UI thread. */
    public interface Picture { void picked(byte[] bytes, String type); }

    private static final int PICK_PICTURE = 7101, TAKE_PHOTO = 7102;
    private Picture pendingPicture;

    /** The system's picker for a picture (the gallery, the files, a cloud drive); `done` gets it, or is not called
     *  when nothing is chosen. Read off the UI thread: a photo can be megabytes. */
    public void pickPicture(Picture done) {
        pendingPicture = done;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
        try { activity.startActivityForResult(Intent.createChooser(pick, "Insert a picture"), PICK_PICTURE); }
        catch (android.content.ActivityNotFoundException e) { pendingPicture = null; toast("No app here can pick a picture"); }
    }

    /** Whether this device has a camera app to take a photo with (a Boox Note has none). */
    public boolean hasCamera() {
        return new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).resolveActivity(activity.getPackageManager()) != null;
    }

    /** The camera app, its full-size photo written into PhotoProvider's file; `done` gets it, or is not called when
     *  none was taken. */
    public void takePhoto(Picture done) {
        pendingPicture = done;
        PhotoProvider.file(activity).delete();
        Intent shoot = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, PhotoProvider.uri(activity))
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { activity.startActivityForResult(shoot, TAKE_PHOTO); }
        catch (android.content.ActivityNotFoundException | SecurityException e) { pendingPicture = null; toast("No camera here"); }
    }

    /** PluginActivity's activity results, for the pickers above. */
    void result(int request, int code, Intent data) {
        if (request != PICK_PICTURE && request != TAKE_PHOTO) return;
        Picture done = pendingPicture;
        pendingPicture = null;
        if (request == TAKE_PHOTO) {
            File photo = PhotoProvider.file(activity);
            if (done == null || code != Activity.RESULT_OK || !photo.isFile() || photo.length() == 0) return;
            new Thread(() -> {
                try {
                    byte[] bytes = java.nio.file.Files.readAllBytes(photo.toPath());
                    photo.delete();
                    activity.runOnUiThread(() -> done.picked(bytes, "image/jpeg"));
                } catch (IOException e) { activity.runOnUiThread(() -> toast("Could not read the photo: " + e.getMessage())); }
            }, "take-photo").start();
            return;
        }
        if (done == null || code != Activity.RESULT_OK || data == null || data.getData() == null) return;
        android.net.Uri uri = data.getData();
        new Thread(() -> {
            try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IOException("nothing to read");
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[1 << 16];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                String type = activity.getContentResolver().getType(uri);
                byte[] bytes = out.toByteArray();
                activity.runOnUiThread(() -> done.picked(bytes, type == null ? "image/jpeg" : type));
            } catch (IOException | SecurityException e) {
                activity.runOnUiThread(() -> toast("Could not read the picture: " + e.getMessage()));
            }
        }, "pick-picture").start();
    }

    public void toast(String s) { activity.runOnUiThread(() -> Toast.makeText(activity, s, Toast.LENGTH_LONG).show()); } // from any thread (an export)

    // ---- the pen: openink's pens (Core.penInk) and the screen's own quick ink under the pen (Ink) ----

    /** The pens, in openink's order (the codes `penInk` takes). */
    public static final String[] PENS = { "ballpoint", "fountain", "brush", "marker", "square", "pencil", "charcoal" };
    /** A stroke's ink (Core.penInk): bounds, then polygons or dabs (`penOutput`). */
    public float[] penInk(int pen, float[] config, float[] samples) { return Core.penInk(pen, config, samples); }
    /** A pen's knote2 config at this screen's dpi, resolved. */
    public float[] penDefaults(int pen) { return Core.penDefaults(pen, activity.getResources().getDisplayMetrics().xdpi); }
    /** What Onyx's quick ink is told so it draws this pen as the settled stroke will be (boox_5c_re
     *  docs/SF-INSTANT-INK.md): `[style, width, exact, n, params…, settled config…]`. */
    public float[] penLive(int pen, float[] config) { return Core.penLive(pen, config); }
    /** Core.penCharcoal: the charcoal's on/off-pixel look, as Onyx's charcoal V2 draws it. */
    public byte[] penCharcoal(int pen, float[] config, float[] samples) { return Core.penCharcoal(pen, config, samples); }
    /** 0 filled polygons, 1 translucent (the marker), 2 dabs. */
    public int penOutput(int pen) { return Core.penOutput(pen); }
    /** The shape a stroke was meant as (Core.penShape): `x, y, t (ms)` per point in; held still at its end, Boox Notes
     *  snaps it. Atlas's recogniser (shape.rs), or openink's (shape_openink.rs); the answer in shape.rs's wire format. */
    public float[] penShape(float[] xyt, boolean openink) { return Core.penShape(xyt, openink); }

    /** The screen's own ink under the pen, before the view redraws: Onyx's instant ink on a Boox, nothing elsewhere. */
    public interface QuickInk {
        /** Only inside this part of the view (view px), the quick line `widthPx` wide; an empty area turns it off.
         *  `style`: Onyx's stroke style, 0 one width, 1 following pressure, 2 marker. */
        void area(int left, int top, int right, int bottom, float widthPx, int style);
        /** The painter's own parameters for `style` (SET_STROKE_PARAMETERS), e.g. the fountain's pressure response and
         *  smoothing; set before `area`. */
        void params(int style, float[] params);
        /** Parts of the view it never draws in (flat l,t,r,b view px: controls floating over the page); set before `area`. */
        void exclude(int[] rects);
        /** The pen went down: a pending show of the view's picture is let go (it would end Onyx's handwriting mode). */
        void down();
        /** The view's own stroke is drawn: shown over the quick line once the writing pauses (OnyxInk `up`). */
        void up();
        /** The view's picture changed by hand (undo, erase): shown, once `afterMs` have passed. */
        void repaint(long afterMs);
        void stop();
    }

    /** Ink over a picture shown in `image` (PageInk): lay it over the image, hand it every touch first (`take`), say
     *  which file's ink it shows (`inkOf`) and which page (`page`). A pen tap comes back to `taps`. */
    public PageInk pageInk(android.widget.ImageView image, PageInk.Taps taps) {
        PageInk[] k = new PageInk[1];
        k[0] = new PageInk(activity, this, () -> PageInk.of(image, k[0]).shown(), taps);
        return k[0];
    }

    /** The same over a page the plugin draws itself (a PDF's): `frame` says where it is on the ink's view. */
    public PageInk pageInk(PageInk.Frame frame, PageInk.Taps taps) { return new PageInk(activity, this, frame, taps); }

    public QuickInk quickInk(android.view.View v) {
        Ink ink = look.eink ? Ink.onyx(v) : Ink.NONE;
        return new QuickInk() {
            public void area(int l, int t, int r, int b, float w, int style) { ink.area(l, t, r, b, w, style); }
            public void params(int style, float[] p) { ink.params(style, p); }
            public void exclude(int[] rects) { ink.exclude(rects); }
            public void down() { ink.down(0, 0, 0); }
            public void up() { ink.up(); }
            public void repaint(long ms) { ink.repaint(ms); }
            public void stop() { ink.stop(); }
        };
    }

    /** Back to the app on a `[[note]]` link found in vault file `from` (resolved there as the desktop does). */
    public void openLink(String link, String from) {
        activity.startActivity(new Intent(activity, AtlasActivity.class).putExtra(AtlasActivity.LINK, link).putExtra(AtlasActivity.LINK_FROM, from)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    /** Back to the app on a drawing, in its web editor this once (Excalidraw's every tool) rather than its native plugin. */
    /** Another native plugin of this app on `path`, in place of this screen (Notepad ↔ Books on a PDF: one paper). */
    public void openPlugin(String id, String path) {
        PluginActivity.start(activity, id, path);
        activity.finish();
    }

    public void openInWeb(String path) {
        activity.startActivity(new Intent(activity, AtlasActivity.class).putExtra(AtlasActivity.OPEN, path).putExtra(AtlasActivity.WEB, true)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    /** Back to the app on a vault path (a note, a drawing). */
    public void open(String path) {
        activity.startActivity(new Intent(activity, AtlasActivity.class).putExtra(AtlasActivity.OPEN, path).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }
}
