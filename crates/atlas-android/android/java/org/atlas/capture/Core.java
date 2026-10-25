package org.atlas.capture;

/** The Rust half (crates/atlas-android/src/glue.rs): what a capture means, the desktop box's own code. Strings in and out; JSON for structures. */
final class Core {
    static { System.loadLibrary("atlas_android"); }
    private Core() {}
    /** Starts reading the vault's note names and tags (completions use them once there). */
    static native void prepare(String vault);
    /** The completions at the caret (UTF-16): [{label, detail, icon, insert, from, to, more, newLine}]. */
    static native String suggest(String vault, String text, int caret);
    /** What the text becomes once saved: "a to-do, due Friday". */
    static native String describe(String text);
    /** Writes the capture: {path, line} or {error}. */
    static native String save(String vault, String text);
    /** Copies a file beside today's log note: {path, embed} or {error}. */
    static native String attach(String vault, String name, String source);
    /** Vault folders under root: [{name, path, kind}]. */
    static native String findVaults(String root);
    /** A JPEG XL picture (no Android decoder reads one): [width, height, ARGB…], or null (crates/atlas-android/src/image.rs). */
    static native int[] decodeJxl(byte[] bytes);
    /** The vault's plugins for the native sides: [{id, on, settings}] (phone.rs). */
    static native String plugins(String vault);
    /** Plugin `id`'s settings from the app's form, saved as the server saves them: `{}` or `{error}`. */
    static native String pluginSettingsSave(String vault, String id, String values);
    static native String pluginOn(String vault, String id, boolean on);
    /** A built-in plugin's form from the manifest the app carries: {fields, settings} or {error}. */
    static native String pluginForm(String manifest);
    /** The vault's settings as GET /api/config gives them: {config, schema} or {error}. */
    static native String config(String vault);
    /** phone::companion_note: a file's one note, found (none made) — `{path, created}` or `{error}`. */
    static native String companionNote(String vault, String file);
    /** A PDF's marks from its note's pdf-marks block: {note, marks} or {error} (core pdf_marks.rs). */
    static native String pdfMarks(String vault, String pdf);
    /** ops: a JSON array of {op:"put",mark} | {op:"remove",id}; the marks after, or {error}. */
    static native String changePdfMarks(String vault, String pdf, String ops);
    /** "Export with marks": `x (marked).pdf` beside the PDF (core pdf_export.rs); what was written, or `{error}`. */
    static native String exportPdfMarks(String vault, String pdf);
    /** PDFium (crates/atlas-android/src/pdfium.rs), through Pdfium.java: "" once libpdfium.so at `lib` is loaded, else why. */
    static native String pdfiumInit(String lib);
    /** Each page's width, height in points, pair after pair. Throws IllegalArgumentException with why. */
    static native float[] pdfiumPages(String pdf);
    /** Page n (1-based) drawn w × h, RGBA bytes (an ARGB_8888 bitmap's), turned `turns` quarters more. */
    static native byte[] pdfiumRender(String pdf, int n, int w, int h, int turns);
    /** Page n's characters: code point, left, bottom, right, top (points, y up), five floats each. */
    static native float[] pdfiumChars(String pdf, int n);
    /** Page n's matches of `query` (case ignored): per match, its box count k, then k boxes of four floats. */
    static native float[] pdfiumFind(String pdf, int n, String query);
    /** Page n's links: [{box, page} | {box, url}] or {error}. */
    static native String pdfiumLinks(String pdf, int n);
    /** The vault's settings (the whole config, JSON) saved as PUT /api/config does: {} or {error}. */
    static native String configSave(String vault, String config);
    /** The full app's core: Atlas's server for the vault, inside the app (crates/atlas-android/src/serve.rs) → {port, open} or {error}; `open` a one-time address (the core is locked to this app);
     *  `env`: what the plugin helpers it starts need (Helpers.environment). */
    static native String serve(String vault, String home, String env);
    /** The app's own interface file at `path` as `[mime, 0, bytes…]` (full app only), or null. */
    static native byte[] uiFile(String path, String prefix);
    /** A folder vault's mirror (a server vault's address, "" unlinks) and this app's sign-in for it, given to the in-app
     *  core after serve(): files stay read and written in the folder; the core reaches the server for the live rooms
     *  and the leases (docs/design/DESIGN-mirror-v2.md). */
    static native String mirror(String vault, String mirror, String cookies);
    /** `{version, api, ui}` of the interface the app carries (full app only). */
    static native String version();
    /** After a native screen saved drawing `rel` (vault path) with `scene` (its JSON): its companion note brought up to
     *  date (atlas_core::drawing_note, the desktop's own) → {note: path or null} or {error}. */
    static native String drawingSaved(String vault, String rel, String scene);
    /** The Boox pens (crates/atlas-android/src/ink.rs, openink's engine): a stroke's ink — left, top, right, bottom (NaN:
     *  empty), then polygons `n, x0, y0, …` or dabs `x, y, size, angle, alpha` — from its samples `x, y, pressure, tiltX,
     *  tiltY, tMs` and the pen's config `float[6]`. Throws IllegalArgumentException with why on bad input. */
    /** The shape a stroke (`x0, y0, x1, y1, …`) was meant as (crates/atlas-android/src/shape.rs): `[0]` none; `[1, x1, y1,
     *  x2, y2]` a line; `[2 | 3, cx, cy, w, h, angle]` a rectangle / an ellipse; `[4, x1, y1, x2, y2, x3, y3]` a triangle. */
    static native float[] penShape(float[] xyt, boolean openink);
    static native float[] penInk(int pen, float[] config, float[] samples);
    /** A pen's knote2 config at this dpi, resolved: width, pressureSensitivity, smoothLevel, velocitySensitivity, tilt, tiltScale. */
    static native float[] penDefaults(int pen, float dpi);
    /** Onyx's instant ink for a pen at a config (screen px): style, width, exact, n, params[n], settled config. */
    static native float[] penLive(int pen, float[] config);
    /** A charcoal stroke dithered like Onyx's (16 header bytes: left, top, width, height as LE ints; then 0/255 alphas). */
    static native byte[] penCharcoal(int pen, float[] config, float[] samples);
    /** 0 filled polygons, 1 the same at the marker's translucency, 2 dabs. */
    static native int penOutput(int pen);
}
