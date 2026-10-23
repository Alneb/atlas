package org.atlas.notepad;

import android.graphics.Color;
import android.graphics.PointF;
import android.graphics.RectF;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.PageSource;
import org.atlas.capture.Props;
import org.atlas.capture.Look;
import org.atlas.capture.NativePlugin;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** A drawing written with the pen, as Boox Notes does it: knote2's pens
 *  from openink in colours, Onyx's quick ink under the pen, a stroke held still at its end snapping to a shape, the
 *  stroke or area eraser, the lasso (move, duplicate, recolour, delete), pages with paper (lines, grid, dots), fingers
 *  to move and zoom, two- and three-finger taps to undo and redo, a tap on a linked element opening its note. The
 *  file stays an Excalidraw scene (Scene); every save also brings the drawing's companion note up to date.
 *  This class is the screen around the canvas (Pad): the toolbar, its menus, the selection's bar. */
final class NotepadView extends LinearLayout implements NativePlugin.Back {
    /** The tools of the island (Chrome), each with its icon and what it does. */
    enum Tool {
        PEN("pen", "Pen — tap again to hide or show its pens, colours and widths"),
        ERASER("eraser", "Eraser — tap again for whole strokes, part of strokes, clear the page"),
        LASSO("lasso", "Lasso: circle strokes to move, resize, turn, copy, recolour or delete them"),
        SHAPE("shapes", "Shapes — drag to draw one; tap again for line, arrow, rectangle, ellipse, diamond, triangle, XY axes"),
        TEXT("text", "Text — tap the page to write, tap a text to change it; tap again for its size");
        final String icon, what;
        Tool(String icon, String what) { this.icon = icon; this.what = what; }
    }

    /** What the shapes tool draws (Excalidraw's own element types; the triangle a closed line). */
    enum Shape {
        LINE("Line", "line"), ARROW("Arrow", "arrow"), RECTANGLE("Rectangle", "rectangle"), ELLIPSE("Ellipse", "ellipse"),
        DIAMOND("Diamond", "diamond"), TRIANGLE("Triangle", "triangle"),
        /** XY axes filling the box dragged: the first quadrant (origin at its bottom left), or all four (origin in the middle). */
        AXES("Axes, positive", "axes"), AXES_FULL("Axes, ±", "axes_full");
        final String label, icon;
        Shape(String label, String icon) { this.label = label; this.icon = icon; }
        boolean axes() { return this == AXES || this == AXES_FULL; }
    }

    /** Boox Notes' colours on a Kaleido screen, the first ones greys for a black-and-white panel. Excalidraw's own
     *  values where it has the colour, so the desktop's palette shows them as chosen. */
    static final String[] COLORS = { "#000000", "#495057", "#adb5bd", "#e03131", "#1971c2", "#2f9e44", "#f08c00", "#9c36b5" };
    static final String[] COLOR_NAMES = { "Black", "Dark grey", "Light grey", "Red", "Blue", "Green", "Orange", "Purple" };

    final Host host;
    final String path;
    final Look look;
    final float density;
    final Scene scene = new Scene();
    final Deque<Step> undo = new ArrayDeque<>(), redo = new ArrayDeque<>();
    final Pad pad;

    Tool tool = Tool.PEN;
    int pen;
    float widthTimes = 1f;
    String color = COLORS[0];
    Shape shape = Shape.RECTANGLE;
    /** The text tool's size, one of Figure.FONT_SIZES. */
    int textSize = Figure.FONT_SIZES[1];
    /** A stroke held still at its end snaps to a shape (the setting `snap`). */
    final boolean snap;
    /** The user's snaps, kept to train recognisers (Dataset). */
    final Dataset dataset;
    /** Which recogniser snaps it (the setting `shapes`): openink's (the default), or Atlas's earlier one. */
    final boolean openinkShapes;
    /** A scribble over strokes erases them (the setting `scribble`). */
    final boolean scribble;
    /** The eraser takes whole strokes, or only where it passes (Boox Notes' two erasers). */
    boolean eraseArea;
    /** Boox Notes' ruler over the page, or null (the pen menu shows and hides it). */
    Ruler ruler;
    /** The selection made with the lasso. */
    final List<Item> chosen = new ArrayList<>();
    /** Copy / Cut: the items as copied and the corner of the page they were on, so Paste puts them at the same place
     *  on the page in view. Static: it outlives the screen, so it pastes into another drawing too (Boox Notes'). */
    private static final List<Item> clipboard = new ArrayList<>();
    private static final PointF clipOrigin = new PointF();

    /** The pen menu's width steps (1.25× apart), Settings' thin / normal / thick / very thick. */
    static final float[] WIDTH_STEPS = { 0.64f, 1f, 1.56f, 2.44f };
    /** The favourite pens, a dot each on the tool island. */
    final Favourites favourites;
    /** The controls floating over the page (Excalidraw's islands and properties panel). */
    Chrome chrome;
    private PopupWindow popup;

    /** The PDF this drawing writes over (a PDF opened to write on: `x.pdf` → `x.pdf.excalidraw`), or null. */
    final String pdf;

    NotepadView(Host host, String path) { this(host, path, null); }

    /** `pdf`: a PDF opened to write on, `path` its drawing beside it; its pages come in the first time. */
    NotepadView(Host host, String path, String pdf) {
        super(host.activity());
        this.host = host;
        this.path = path;
        this.pdf = pdf;
        this.look = host.look();
        this.density = getResources().getDisplayMetrics().density;
        setOrientation(VERTICAL);
        setBackgroundColor(Color.WHITE);
        org.json.JSONObject settings = host.settings();
        pen = Math.max(0, java.util.Arrays.asList(Host.PENS).indexOf(settings.optString("pen", "fountain")));
        favourites = new Favourites(host.activity());
        toolbarDefaults(settings);
        Favourites.Pen last = settings.optBoolean("remember_pen", true) ? favourites.last() : null; // the pen in hand when Notepad last closed, over the defaults
        if (last != null && last.pen >= 0 && last.pen < Host.PENS.length) { pen = last.pen; widthTimes = last.width; color = last.color; }
        snap = settings.optBoolean("snap", true);
        dataset = new Dataset(host);
        if (Figure.hand == null) Figure.hand = host.font("excalifont");
        openinkShapes = !"atlas".equals(settings.optString("shapes", "openink"));
        scribble = settings.optBoolean("scribble", true);
        pageMode = settings.optBoolean("page_mode", true);
        holdScreen();
        try { scene.perRow = Math.max(1, Math.min(6, Integer.parseInt(settings.optString("per_row", "4").trim()))); } catch (NumberFormatException e) { /* the default */ }
        scene.paper = Page.Paper.of(settings.optString("paper", "blank"));
        boolean existed = host.exists(path);
        scene.load(existed ? host.readText(path) : null, host, density);
        joinLive();
        lastShown = LastPages.of(host, path); // read as the drawing is, here
        boolean fresh = scene.pages.isEmpty() && scene.items.isEmpty();
        if (fresh && pdf != null) post(() -> insertWholePdf(pdf.substring(pdf.lastIndexOf('/') + 1), pdf)); // the PDF's pages are the notebook's
        // a new notebook asks its pages' format (draw-new.ts on the desktop); a saved drawing with nothing in it is an
        // infinite canvas chosen so, left without pages
        else if (fresh && !existed) post(this::askFormat);

        // the page fills the screen; the controls float over it (Chrome)
        stage = new FrameLayout(host.activity());
        pad = new Pad(this);
        stage.addView(pad, new FrameLayout.LayoutParams(-1, -1));
        chrome = new Chrome(this, stage);
        addView(stage, new LayoutParams(-1, 0, 1f));
        drawBar();
    }

    // ---- the toolbar ---------------------------------------------------------------------------------------------

    /** A tap on a tool: it is taken in hand; a second tap on the tool in hand hides or shows its options. */
    void pick(Tool t) {
        if (tool == t) chrome.setPanel(!chrome.panelOpen);
        else { tool = t; if (t != Tool.LASSO) select(new ArrayList<>()); }
        drawBar();
    }

    void drawBar() {
        favourites.setLast(holding());
        chrome.draw();
        pad.ink();
    }

    /** The toolbar as Settings sets it to start (plugin.toml: width, color, eraser, shape, text_size); unknown values keep the built-in ones. */
    private void toolbarDefaults(org.json.JSONObject settings) {
        int w = java.util.Arrays.asList("thin", "normal", "thick", "very thick").indexOf(settings.optString("width", "normal"));
        if (w >= 0) widthTimes = WIDTH_STEPS[w];
        int c = java.util.Arrays.asList(COLOR_NAMES).indexOf(capitalised(settings.optString("color", "black")));
        if (c >= 0) color = COLORS[c];
        eraseArea = "part of strokes".equals(settings.optString("eraser", "whole strokes"));
        for (Shape sh : Shape.values()) if (sh.icon.equals(settings.optString("shape", "rectangle"))) shape = sh;
        int t = java.util.Arrays.asList(TEXT_SIZE_NAMES).indexOf(capitalised(settings.optString("text_size", "medium")));
        if (t >= 0) textSize = Figure.FONT_SIZES[t];
    }

    private static String capitalised(String s) { return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1); }

    /** The pen in hand, as a favourite would keep it. */
    Favourites.Pen holding() { return new Favourites.Pen(pen, widthTimes, color); }

    boolean isFavourite() { return favourites.has(holding()); }

    /** The pen in hand kept as a favourite, or let go when it is one. */
    void toggleFavourite() {
        Favourites.Pen now = holding();
        for (Favourites.Pen f : new ArrayList<>(favourites.list)) if (f.same(now)) { favourites.remove(f); return; }
        favourites.add(now);
    }

    /** A favourite taken up: its pen, width and colour in hand. */
    void takeUp(Favourites.Pen f) { pen = f.pen; widthTimes = f.width; color = f.color; tool = Tool.PEN; select(new ArrayList<>()); }

    /** Boox Notes' ruler over the middle of the view, level; or put away. */
    void toggleRuler() {
        if (ruler != null) { ruler = null; return; }
        float k = pad.k();
        ruler = new Ruler(pad.ox + pad.getWidth() / 2f / k, pad.oy + pad.getHeight() / 2f / k);
        tool = Tool.PEN;
    }

    static String penName(int p) { String n = Host.PENS[p]; return Character.toUpperCase(n.charAt(0)) + n.substring(1); }

    static String colorName(String c) {
        for (int i = 0; i < COLORS.length; i++) if (COLORS[i].equalsIgnoreCase(c)) return COLOR_NAMES[i];
        return c;
    }

    // ---- menus: a card of rows under the button ------------------------------------------------------------------

    private LinearLayout menu() {
        if (popup != null) popup.dismiss();
        LinearLayout card = look.card(host.activity());
        card.setMinimumWidth(look.dp(180));
        popup = new PopupWindow(card, ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, true);
        popup.setElevation(look.elevation(8));
        popup.setOnDismissListener(() -> { popup = null; pad.ink(); }); // a menu leaves little ghost: no full refresh (they came too often)
        return card;
    }

    /** The menu filled: shown under the button that opened it. */
    private void show(View anchor) {
        if (popup == null) return;
        // no row of this menu is checked: none keeps the room for a check
        ViewGroup card = (ViewGroup) popup.getContentView();
        boolean checks = false;
        for (int i = 0; i < card.getChildCount(); i++) checks |= "checked".equals(card.getChildAt(i).getTag());
        if (!checks) for (int i = 0; i < card.getChildCount(); i++) {
            View r = card.getChildAt(i);
            if ("indented".equals(r.getTag())) r.setPaddingRelative(look.dp(12), 0, look.dp(12), 0);
        }
        chrome.font(popup.getContentView()); // Excalidraw's UI font, as on the islands
        popup.showAsDropDown(anchor, 0, look.dp(4));
    }

    /** A row of a menu; `on` marks the current choice. */
    private void item(LinearLayout card, String label, boolean on, Runnable tap) {
        LinearLayout r = look.row(host.activity(), on ? "check" : null, label, null);
        r.setTag(on ? "checked" : "indented");
        if (!on) r.setPaddingRelative(look.dp(12 + 19 + 14), 0, look.dp(12), 0);
        r.setOnClickListener(v -> { if (popup != null) popup.dismiss(); tap.run(); drawBar(); });
        card.addView(r);
    }

    private static final String[] TEXT_SIZE_NAMES = { "Small", "Medium", "Large", "Very large" };


    /** The text tool's tap at (x, y): the text there to change, or a new one written there (Boox Notes' text box,
     *  Excalidraw's text element). Typed in a dialog, the system keyboard up. */
    void writeText(float x, float y, float reach) {
        Figure was = null;
        for (int i = scene.items.size() - 1; i >= 0 && was == null; i--) {
            Item it = scene.items.get(i);
            if (it instanceof Figure && ((Figure) it).freeText() && it.touches(x, y, reach)) was = (Figure) it;
        }
        final Figure old = was;
        EditText field = new EditText(host.activity());
        field.setText(old == null ? "" : old.e.optString("text"));
        field.setSelection(field.length());
        field.setMinLines(2);
        field.setGravity(Gravity.TOP | Gravity.START);
        LinearLayout form = new LinearLayout(host.activity());
        form.setPadding(look.dp(20), look.dp(8), look.dp(20), 0);
        form.addView(field, new LayoutParams(-1, -2));
        android.app.AlertDialog d = new android.app.AlertDialog.Builder(host.activity()).setTitle(old == null ? "New text" : "Change the text").setView(form)
            .setPositiveButton("Done", (dl, w) -> keepText(old, field.getText().toString(), x, y))
            .setNegativeButton("Cancel", null).create();
        if (d.getWindow() != null) d.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        d.setOnDismissListener(dl -> { pad.repaintAfterEdit(); host.einkRefresh(); });
        d.show();
        field.requestFocus();
    }

    /** The text kept: a new element, the old one replaced (undo puts it back), or, emptied, the old one gone. */
    private void keepText(Figure old, String typed, float x, float y) {
        String t = typed.replaceAll("\\s+$", "");
        if (old != null && t.equals(old.e.optString("text"))) return; // unchanged: no step to undo
        Step st = new Step();
        if (old != null) st.remove(scene, old);
        if (!t.isEmpty()) {
            // a new one with its first line's middle where the pen tapped
            Figure f = old != null ? old.edited(t) : Figure.text(t, x, y - textSize * Figure.LINE_HEIGHT / 2, textSize, scene.ids.next("text"), color, pad.frameOf(x, y));
            if (f != null) st.add(scene, f);
        }
        done(st);
    }

    /** The picture button: straight to the picker, or — where there is a camera — a choice of picker or photo. */
    void pictureMenu(View anchor) {
        LinearLayout card = menu();
        card.addView(look.heading(host.activity(), "Insert"));
        item(card, "A picture (gallery, the vault's)…", false, this::insertVaultPicture);
        if (host.hasCamera()) item(card, "A photo, taken now", false, () -> host.takePhoto(this::insertPicture));
        item(card, "A link to a note or file…", false, this::insertLink);
        item(card, "A PDF: a page, or all of it…", false, this::insertPdfPage);
        show(anchor);
    }

    /** Obsidian's link: `[[Name]]` for a note, `[[file.ext]]` for anything else (a PDF, a picture, a recording) — a
     *  text element that carries it as its link, so a tap opens it, here and on the desktop. */
    private void insertLink() {
        askVaultFile("Link to a note or file", "A note's or a file's name", f -> true, this::linkTo, () -> host.pickPicture(this::insertPicture));
    }

    /** A picture: the phone's gallery first, then the vault's pictures as thumbnails; one of the vault's is linked. */
    private void insertVaultPicture() {
        askVaultFile("Insert a picture", "A picture's name", f -> f.toLowerCase(java.util.Locale.ROOT).matches(".*\\.(png|jpe?g|webp|gif)$"),
            this::linkTo, () -> host.pickPicture(this::insertPicture));
    }

    /** The vault file `name` (as a link names it) put in: a PDF as its first page, a picture as itself — both linked —
     *  anything else as its `[[link]]` in text. */
    private void linkTo(String name) {
        String target = "[[" + name + "]]", low = name.toLowerCase(java.util.Locale.ROOT);
        // a picture or a PDF shows itself (the PDF its first page), linked: what it is, not only its name
        if (low.endsWith(".pdf")) { renderPdfPage(name, 1, target); return; }
        if (low.matches(".*\\.(png|jpe?g|webp|gif)$")) {
            String p = vaultPathOf.getOrDefault(name, name);
            new Thread(() -> {
                byte[] bytes = null;
                try (java.io.InputStream in = host.read(p)) { bytes = org.atlas.capture.Bytes.all(in); } catch (Exception e) { /* below */ }
                byte[] got = bytes;
                host.activity().runOnUiThread(() -> { if (got != null) insertPicture(got, low.endsWith(".png") ? "image/png" : "image/jpeg", target); else host.toast("Not read: " + name); });
            }, "link-picture").start();
            return;
        }
        float k = pad.k(), cx = pad.ox + pad.getWidth() / 2f / k, cy = pad.oy + pad.getHeight() / 2f / k;
        Figure t = Figure.text(target, cx, cy, Figure.FONT_SIZES[1], scene.ids.next("text"), color, pad.frameOf(cx, cy));
        if (t == null) return;
        t.setLink(target);
        Step st = new Step();
        st.add(scene, t);
        done(st);
        pad.repaintAfterEdit();
    }

    /** A PDF's page drawn into the drawing as a picture linked to `[[file.pdf#page=N]]` (Obsidian's link to a page):
     *  read it on paper, tap it to open the PDF there. Rendered by Android's PdfRenderer from the vault's file (a
     *  server's: the copy fetched into the cache). */
    private void insertPdfPage() {
        askVaultFile("A page of a PDF", "The PDF's name", f -> f.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf"), name -> {
            android.widget.EditText page = new android.widget.EditText(host.activity());
            page.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
            page.setText("1");
            page.setSelectAllOnFocus(true);
            new android.app.AlertDialog.Builder(host.activity()).setTitle("Which page of " + name + "?").setView(page)
                .setPositiveButton("This page", (d, w) -> {
                    int n;
                    try { n = Math.max(1, Integer.parseInt(page.getText().toString().trim())); } catch (NumberFormatException e) { n = 1; }
                    renderPdfPage(name, n);
                })
                .setNeutralButton("The whole PDF", (d, w) -> insertWholePdf(name, vaultPathOf.getOrDefault(name, name)))
                .setNegativeButton("Cancel", null).show();
        });
    }

    private void renderPdfPage(String name, int pageNo) { renderPdfPage(name, pageNo, "[[" + name + "#page=" + pageNo + "]]"); }

    /** A PDF's page put in as a link to it (memory project_paper_core.md): an image element with no file, drawn on the
     *  fly from the PDF (PageSource) — the drawing never holds a copy of the page. */
    private void renderPdfPage(String name, int pageNo, String link) {
        String path = vaultPathOf.getOrDefault(name, name);
        new Thread(() -> {
            float[][] sizes = PageSource.sizes(host, path);
            host.activity().runOnUiThread(() -> {
                if (sizes.length == 0) { host.toast("The PDF could not be read: " + name); return; }
                int n = Math.max(1, Math.min(pageNo, sizes.length));
                float k = pad.k(), cx = pad.ox + pad.getWidth() / 2f / k, cy = pad.oy + pad.getHeight() / 2f / k;
                float w = Page.W / 2, h = w * sizes[n - 1][1] / Math.max(1, sizes[n - 1][0]);
                Figure f = Figure.linkedPage(path, n, cx - w / 2, cy - h / 2, w, h, scene.ids.next("picture"), pad.frameOf(cx, cy));
                if (f == null) return;
                f.setLink(link);
                placed(f);
            });
        }, "pdf-page").start();
    }

    /** At most this many pages of a PDF come in at once (a page is a link, not a picture: only a guard). */
    private static final int PDF_PAGES_MAX = 2000;

    /** The whole PDF: a new page of the notebook for each of its pages, the
     *  PDF page filling it, linked to `[[file.pdf#page=N]]`, so it can be written over. One step: one undo takes it back. */
    private void insertWholePdf(String name, String path) {
        host.toast("Reading " + name + "…");
        new Thread(() -> {
            float[][] sizes = PageSource.sizes(host, path); // the pages' shapes only: each is drawn from the PDF on the fly
            List<float[]> pages = new ArrayList<>(java.util.Arrays.asList(sizes).subList(0, Math.min(sizes.length, PDF_PAGES_MAX)));
            int had = sizes.length;
            host.activity().runOnUiThread(() -> {
                if (pages.isEmpty()) { host.toast("The PDF could not be read: " + name); return; }
                Step st = new Step();
                Page first = null;
                for (int i = 0; i < pages.size(); i++) {
                    Page p = scene.nextPage();
                    // the notebook page takes the PDF page's shape (A4's width kept), so the paper fills it edge to edge
                    float[] sz = pages.get(i);
                    if (sz[0] > 0 && sz[1] > 0) p.r.bottom = p.r.top + Page.W * sz[1] / sz[0];
                    st.addPage(scene, p);
                    if (first == null) first = p;
                    Figure f = linkedIn(path, i + 1, pages.get(i), p);
                    if (f == null) continue;
                    f.setLink("[[" + name + "#page=" + (i + 1) + "]]");
                    f.lock(); // the page is paper: never erased or lassoed away
                    st.add(scene, f);
                }
                done(st);
                toPage(scene.pages.indexOf(first));
                pad.repaintAfterEdit();
                if (had > pages.size()) host.toast("The first " + pages.size() + " of " + had + " pages");
            });
        }, "pdf-whole").start();
    }

    /** PDF page `n` of `path` (its size in points) linked and fitted to notebook page `p` (its proportions kept). */
    private Figure linkedIn(String path, int n, float[] size, Page p) {
        float s = Math.min(p.r.width() / Math.max(1, size[0]), p.r.height() / Math.max(1, size[1]));
        float w = size[0] * s, h = size[1] * s;
        return Figure.linkedPage(path, n, p.r.centerX() - w / 2, p.r.centerY() - h / 2, w, h, scene.ids.next("picture"), p.id);
    }

    /** The picture's bytes kept in the drawing as Excalidraw keeps them (a data URL under its SHA-1); its file id, or null. */
    private String storePicture(byte[] bytes, String mime) {
        String fileId = sha1(bytes);
        long now = System.currentTimeMillis();
        try {
            scene.addFile(fileId, new org.json.JSONObject().put("id", fileId).put("mimeType", mime).put("created", now).put("lastRetrieved", now)
                .put("dataURL", "data:" + mime + ";base64," + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)));
        } catch (JSONException e) { return null; }
        return fileId;
    }

    /** Vault paths by the name a link uses (filled by askVaultFile's walk): a PDF's page is read from its path. */
    private final java.util.Map<String, String> vaultPathOf = new java.util.HashMap<>();

    /** The vault's files to browse or search (FilePicker; `which`: the paths to offer); `chosen` gets the link name: a
     *  note without `.md`, any other file with its extension. */
    private void askVaultFile(String title, String hint, java.util.function.Predicate<String> which, java.util.function.Consumer<String> chosen) {
        askVaultFile(title, hint, which, chosen, null);
    }

    /** As above, with the phone's gallery offered first (`gallery`: what picking from it does). */
    private void askVaultFile(String title, String hint, java.util.function.Predicate<String> which, java.util.function.Consumer<String> chosen, Runnable gallery) {
        FilePicker.show(host, title, hint, which, this::vaultFiles, p -> {
            String base = p.substring(p.lastIndexOf('/') + 1), name = base.endsWith(".md") ? base.substring(0, base.length() - 3) : base;
            synchronized (vaultPathOf) { vaultPathOf.put(name, p); }
            chosen.accept(name);
        }, gallery);
    }

    /** The vault's files by path (hidden ones left out; at most 5000, so a big vault still answers). Off the UI thread. */
    private List<String> vaultFiles() {
        List<String> out = new ArrayList<>();
        Deque<String> dirs = new ArrayDeque<>();
        dirs.add("");
        while (!dirs.isEmpty() && out.size() < 5000) {
            String d = dirs.poll();
            for (String e : host.list(d)) {
                if (e.endsWith("/")) dirs.add(d + e);
                else out.add(d + e);
            }
        }
        return out;
    }

    /** A picture picked: made at most 1600 px on its long side (Excalidraw keeps it in the file as a data URL, so a
     *  photo straight off a camera would weigh megabytes), put in the middle of the view at most half a page wide,
     *  and chosen so it can be moved and sized at once. */
    private void insertPicture(byte[] bytes, String type) { insertPicture(bytes, type, null); }

    /** …with `link` on it (a PDF page's `[[file.pdf#page=N]]`), or none. */
    private void insertPicture(byte[] bytes, String type, String link) {
        android.graphics.Bitmap b = host.decode(bytes, 1600, 1600);
        if (b == null) { host.toast("Not a picture this app can read"); return; }
        // WebP keeps transparency; a PDF page rendered here is WebP already (not encoded twice)
        String fileId = storePicture(DrawingSize.MIME.equals(type) ? bytes : DrawingSize.webp(b), DrawingSize.MIME);
        if (fileId == null) return;
        float k = pad.k(), cx = pad.ox + pad.getWidth() / 2f / k, cy = pad.oy + pad.getHeight() / 2f / k;
        float w = Math.min(Page.W / 2, b.getWidth()), h = w * b.getHeight() / Math.max(1, b.getWidth());
        b.recycle(); // up to 1600² ARGB, only its size needed from here
        Figure f = Figure.picture(fileId, cx - w / 2, cy - h / 2, w, h, scene.ids.next("picture"), pad.frameOf(cx, cy));
        if (f == null) return;
        if (link != null) f.setLink(link);
        placed(f);
    }

    /** A new picture in, one step, picked with the lasso to move or size at once. */
    private void placed(Figure f) {
        Step st = new Step();
        st.add(scene, f);
        done(st);
        tool = Tool.LASSO;
        select(java.util.Collections.singletonList(f));
        pad.repaintAfterEdit();
    }

    /** Hex SHA-1: a picture's file id, as Excalidraw names its files (the same picture twice is one file). */
    private static String sha1(byte[] bytes) {
        try {
            StringBuilder s = new StringBuilder();
            for (byte x : java.security.MessageDigest.getInstance("SHA-1").digest(bytes)) s.append(String.format("%02x", x));
            return s.toString();
        } catch (java.security.NoSuchAlgorithmException e) { return Long.toHexString(System.nanoTime()); }
    }


    void colorChosen(String c) {
        if (!chosen.isEmpty()) { done(Step.recolor(scene, chosen, c)); return; }
        color = c;
        if (tool != Tool.PEN && tool != Tool.SHAPE && tool != Tool.TEXT) tool = Tool.PEN;
        drawBar();
    }

    /** The formats a new notebook offers: the desktop's (ui/src/lib/draw-new.ts), sizes at 96 dpi; no size = no pages. */
    private static final String[] FORMATS = { "Screen pages (this screen's shape, edge to edge)", "A4 pages", "A4 pages, landscape", "A5 pages", "Letter pages", "Infinite canvas, no pages" };

    /** A new, empty notebook: its first page in the format picked (dismissed: the screen's shape); the infinite canvas has none. */
    private void askFormat() {
        float[][] sizes = { screenPage(), { Page.W, Page.H }, { Page.H, Page.W }, { 559, 794 }, { 816, 1056 }, null };
        final boolean[] picked = { false };
        new android.app.AlertDialog.Builder(host.activity()).setTitle("New notebook")
            .setItems(FORMATS, (d, i) -> { picked[0] = true; firstPage(sizes[i]); })
            .setOnDismissListener(d -> { if (!picked[0]) firstPage(sizes[0]); })
            .show();
    }

    /** A page of the whole screen's shape (the bars hidden: systemBars), A4's width at 96 dpi: page mode then fills the
     *  screen with it edge to edge. */
    private float[] screenPage() {
        android.graphics.Rect b = new android.graphics.Rect();
        if (android.os.Build.VERSION.SDK_INT >= 30) b = host.activity().getWindowManager().getCurrentWindowMetrics().getBounds();
        else { android.util.DisplayMetrics m = new android.util.DisplayMetrics(); host.activity().getWindowManager().getDefaultDisplay().getRealMetrics(m); b.set(0, 0, m.widthPixels, m.heightPixels); }
        if (b.width() <= 0 || b.height() <= 0) return new float[] { Page.W, Page.H };
        float w = b.width() <= b.height() ? Page.W : Page.H;
        return new float[] { w, Math.round(w * b.height() / (float) b.width()) };
    }

    private void firstPage(float[] size) {
        if (size == null || !scene.pages.isEmpty()) return;
        scene.pageW = size[0];
        scene.pageH = size[1];
        Page p = scene.addPage();
        toPage(scene.pages.indexOf(p));
        pad.repaintAfterEdit();
    }

    private void newPage() {
        Step st = new Step();
        Page p = scene.nextPage();
        st.addPage(scene, p);
        done(st);
        toPage(scene.pages.indexOf(p));
    }

    /** A page and what is on it, in one undoable step (the menu and the overview). */
    void deletePage(Page p) {
        Step st = new Step();
        for (Item it : scene.itemsOn(p)) st.remove(scene, it);
        st.removePage(scene, p);
        done(st);
        host.toast("Page deleted — undo brings it back");
        pad.repaintAfterEdit();
    }

    /** The papers as small previews of themselves (Page.drawPaper on a tile), wrapping; the page's own framed. */
    private View paperPicker(Page page) {
        org.atlas.capture.Look l = look;
        android.widget.GridLayout g = new android.widget.GridLayout(host.activity());
        g.setColumnCount(4);
        g.setPadding(l.dp(8), 0, l.dp(8), l.dp(8));
        android.graphics.Paint ruling = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        ruling.setColor(0xff9a9a9a);
        for (Page.Paper paper : Page.Paper.values()) {
            LinearLayout cell = new LinearLayout(host.activity());
            cell.setOrientation(VERTICAL);
            cell.setGravity(Gravity.CENTER_HORIZONTAL);
            cell.setPadding(l.dp(4), l.dp(4), l.dp(4), l.dp(4));
            int w = l.dp(52), h = l.dp(64);
            android.graphics.Bitmap b = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888);
            b.eraseColor(android.graphics.Color.WHITE);
            android.graphics.Canvas c = new android.graphics.Canvas(b);
            float s = w / (Page.RULE * 6f); // six of the paper's rules across the tile
            c.scale(s, s);
            new Page("preview", new RectF(0, 0, w / s, h / s), null, paper, null).drawPaper(c, ruling, s);
            ImageView tile = new ImageView(host.activity());
            tile.setImageBitmap(b);
            tile.setBackground(l.round(0, 6, paper == page.paper ? (l.eink ? l.text : l.accent) : l.borderStrong));
            tile.setPadding(l.dp(paper == page.paper ? 3 : 1), l.dp(paper == page.paper ? 3 : 1), l.dp(paper == page.paper ? 3 : 1), l.dp(paper == page.paper ? 3 : 1));
            cell.addView(tile, new LayoutParams(w + l.dp(6), h + l.dp(6)));
            TextView name = l.label(host.activity(), paper.label, 11.5f, l.text);
            name.setGravity(Gravity.CENTER);
            cell.addView(name, new LayoutParams(w + l.dp(10), -2));
            cell.setContentDescription(paper.label + (paper == page.paper ? ", this page's" : ""));
            cell.setOnClickListener(v -> { page.paper = paper; scene.changed(page); saveSoon(); if (popup != null) popup.dismiss(); pad.ink(); });
            g.addView(cell);
        }
        return g;
    }


    void pageMenu(View anchor) {
        LinearLayout card = menu();
        card.addView(look.heading(host.activity(), "Pages"));
        item(card, "New page", false, this::newPage);
        if (!scene.pages.isEmpty()) item(card, "All pages…", false, () -> new PageOverview(this).show());
        if (!clipboard.isEmpty()) item(card, "Paste " + clipboard.size() + (clipboard.size() == 1 ? " item" : " items") + " here", false, this::paste);
        int i = currentPage();
        if (i >= 0) {
            Page p = scene.pages.get(i);
            item(card, "Delete page " + (i + 1), false, () -> deletePage(p));
            card.addView(look.heading(host.activity(), "Paper of page " + (i + 1)));
            card.addView(paperPicker(p)); // what each paper looks like, not seven words
        }
        if (scene.pages.size() > 1) item(card, "Arrange the pages in a grid (" + scene.perRow + " a row)", false, () -> {
            Step st = Step.arranged(scene);
            if (st == null) { host.toast("They are in the grid already"); return; }
            done(st);
            pad.repaintAfterEdit();
            toPage(Math.max(0, currentPage()));
        });
        show(anchor);
    }

    /** The drawing as a file: a button of its own on the bar. */
    /** The menu island's (Excalidraw's hamburger): close, this file, the screen. */
    void mainMenu(View anchor) {
        LinearLayout card = menu();
        item(card, "Close the drawing", false, this::close);
        fileItems(card);
        screenItems(card);
        show(anchor);
    }

    private void fileItems(LinearLayout card) {
        int i = currentPage();
        card.addView(look.heading(host.activity(), "This file"));
        item(card, "Copy a link to this drawing", false, () -> copyLink("[[" + path + "]]"));
        if (i >= 0) item(card, "Copy a link to this page", false, () -> copyLink("[[" + path + "#" + pageRef(scene.pages.get(i), i) + "]]"));
        item(card, "Properties (tags, project, topics)…", false, this::properties);
        item(card, "Move or rename…", false, this::moveFile);
        item(card, "Delete (to the trash)…", false, this::trashFile);
        card.addView(look.heading(host.activity(), "Export, beside the drawing"));
        // off the UI thread: a long PDF's every page is rendered again
        item(card, pdf != null ? "The PDF with your notes, merged (a new PDF)" : "The drawing as PDF", false, () -> {
            host.toast("Exporting…");
            new Thread(() -> { String done = new Exporter(this).pdf(); post(() -> exported(done)); }, "export").start();
        });
        item(card, scene.pages.isEmpty() ? "The drawing as PNG" : "This page as PNG", false, () -> exported(new Exporter(this).png(Math.max(0, currentPage()))));
        item(card, "Open in Excalidraw (all its tools)", false, () -> { save(); host.openInWeb(path); host.activity().finish(); });
        if (pdf != null) item(card, "The PDF in the reader", false, () -> { save(); host.openPlugin("books", pdf); }); // the same ink, read
    }

    /** The screen's four ways, the one in use marked, and full screen. */
    private void screenItems(LinearLayout card) {
        card.addView(look.heading(host.activity(), "Screen"));
        android.app.Activity a = host.activity();
        int now = rotation(a);
        String[] names = { "Portrait", "Landscape", "Portrait, upside down", "Landscape, the other way" };
        for (int r = 0; r < 4; r++) { final int turn = r; item(card, names[r], r == now, () -> a.setRequestedOrientation(orientationFor(turn, a))); }
        item(card, "Full screen (the page alone; the corner button or Back brings the controls back)", false, () -> setBare(Bare.FULL_SCREEN));
        item(card, "Full immersion (no controls, Back ignored; hold the top-right corner to leave)", false, () -> setBare(Bare.IMMERSED));
    }

    /** What is on the screen besides the page: the controls; nothing (full screen: the corner button and Back bring them
     *  back); nothing at all (full immersion: Back ignored, a hold on the top-right corner). */
    enum Bare { NONE, FULL_SCREEN, IMMERSED }

    void setBare(Bare b) {
        chrome.setBare(b, stage); // the islands only: the system's bars stay hidden, so the page never changes size
        if (b == Bare.IMMERSED) host.toast("Full immersion: hold the top-right corner to leave");
        host.einkRefresh();
    }

    private void exported(String path) { if (path != null) host.toast("Saved " + path); }

    // ---- the file itself -----------------------------------------------------------------

    /** How a link names page `i`: its own name, else "Page N" (draw-pages.ts frameRef reads both). */
    private static String pageRef(Page p, int i) { return p.name != null && !p.name.trim().isEmpty() ? p.name.trim() : "Page " + (i + 1); }

    private void copyLink(String link) {
        android.content.ClipboardManager cb = (android.content.ClipboardManager) host.activity().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
        if (cb != null) cb.setPrimaryClip(android.content.ClipData.newPlainText("link", link));
        host.toast("Copied " + link);
    }

    /** The drawing's companion note (`x.excalidraw` → `x.md`, atlas_core::drawing_note), when it is Atlas's own (it
     *  carries the marker): it goes where the drawing goes. Null when there is none, or it is someone else's note. */
    private String companion(String drawing) {
        if (!drawing.endsWith(".excalidraw")) return null;
        String note = drawing.substring(0, drawing.length() - ".excalidraw".length()) + ".md";
        String text = host.exists(note) ? host.readText(note) : null;
        return text != null && text.contains("<!-- atlas:drawing") ? note : null;
    }

    /** The drawing's properties — its note's tags, project and topics — which the Library's Drawings filter by (the
     *  user, 2026-10-19: "the notepad then needs to be able to edit the propeties of excalidraw to add them"). Project
     *  and topics are links to notes, as the desktop writes them; tags are words. */
    private void properties() {
        save();
        // read after the save, on its thread (a vault on a server: the network), the form shown back here
        SAVES.execute(() -> {
            String note = companion(path);
            String text = note == null ? null : host.readText(note);
            post(() -> {
                if (note == null || text == null) { host.toast("Its note comes with its first save: draw something first"); return; }
                propertiesForm(note, text);
            });
        });
    }

    private void propertiesForm(String note, String text) {
        android.app.Activity a = host.activity();
        LinearLayout form = new LinearLayout(a);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(look.dp(20), look.dp(8), look.dp(20), 0);
        EditText tags = propField(form, "Tags", String.join(", ", plainNames(Props.list(text, "tags"))), "qft, exam");
        EditText project = propField(form, "Project", String.join(", ", plainNames(Props.list(text, "project"))), "a note's name: Thesis");
        EditText topics = propField(form, "Topics", String.join(", ", plainNames(Props.list(text, "topics"))), "QFT, Lectures");
        new android.app.AlertDialog.Builder(a).setTitle("Properties").setView(form)
            .setPositiveButton("Save", (d, w) -> {
                List<String> tg = typed(tags, false), pj = typed(project, true), tp = typed(topics, true);
                SAVES.execute(() -> {
                    String t = host.readText(note); // again: a save may have written it meanwhile
                    if (t == null) { host.toast("Not saved: the note is gone"); return; }
                    t = Props.setList(Props.setList(Props.setList(t, "tags", tg), "project", pj), "topics", tp);
                    try { host.write(note, t.getBytes(java.nio.charset.StandardCharsets.UTF_8)); host.toast("Properties saved"); }
                    catch (java.io.IOException e) { host.toast("Not saved: " + e.getMessage()); }
                });
            })
            .setNegativeButton("Cancel", null).show();
    }

    private EditText propField(LinearLayout form, String label, String value, String hint) {
        form.addView(look.label(host.activity(), label, 13, look.muted));
        EditText f = new EditText(host.activity());
        f.setSingleLine(true);
        f.setText(value);
        f.setHint(hint);
        form.addView(f);
        return f;
    }

    /** `[[Thesis|the thesis]]`, `#qft` → what a person types: `Thesis`, `qft`. */
    private static List<String> plainNames(List<String> items) {
        List<String> out = new ArrayList<>();
        for (String x : items) {
            String n = x.replaceAll("^\\[\\[|\\]\\]$", "").replaceFirst("\\|.*$", "").replaceFirst("^#", "").trim();
            if (!n.isEmpty()) out.add(n);
        }
        return out;
    }

    /** A field's comma-separated words; as `[[links]]` for the properties that name notes. */
    private static List<String> typed(EditText f, boolean links) {
        List<String> out = new ArrayList<>();
        for (String n : plainNames(java.util.Arrays.asList(f.getText().toString().split(",")))) out.add(links ? "[[" + n + "]]" : n);
        return out;
    }

    private void moveFile() {
        EditText field = new EditText(host.activity());
        field.setSingleLine(true);
        field.setText(path);
        int slash = path.lastIndexOf('/') + 1, dot = path.endsWith(".excalidraw") ? path.length() - ".excalidraw".length() : path.length();
        field.setSelection(slash, Math.max(slash, dot)); // the name, ready to type over
        new android.app.AlertDialog.Builder(host.activity()).setTitle("Move or rename (a path in the vault)").setView(field)
            .setPositiveButton("Move", (d, w) -> {
                String to = field.getText().toString().trim().replaceAll("^/+", "");
                if (!to.endsWith(".excalidraw")) to += ".excalidraw";
                if (to.equals(path)) return;
                save();
                String dest = to;
                SAVES.execute(() -> { // after the save, on its thread: a vault on a server is the network
                    String note = companion(path);
                    try {
                        host.move(path, dest);
                        // a server's core takes the note along itself (drawing_note.rs `moved`); a folder's, here
                        if (note != null && host.exists(note)) try { host.move(note, dest.substring(0, dest.length() - ".excalidraw".length()) + ".md"); } catch (java.io.IOException e) { host.toast("The note stayed: " + e.getMessage()); }
                    } catch (java.io.IOException | RuntimeException e) { host.toast("Not moved: " + e.getMessage()); return; }
                    host.toast("Moved to " + dest);
                    post(() -> { host.openPlugin("notepad", dest); host.activity().finish(); }); // the drawing again, at its new place
                });
            })
            .setNegativeButton("Cancel", null).show();
    }

    private void trashFile() {
        new android.app.AlertDialog.Builder(host.activity()).setTitle("Delete " + path.substring(path.lastIndexOf('/') + 1) + "?")
            .setMessage("It goes to the vault's trash (recoverable), with its note.")
            .setPositiveButton("Delete", (d, w) -> {
                save();
                // after the save, on its thread: on a vault on a server the trash is the network, never the screen's thread
                SAVES.execute(() -> {
                    String note = companion(path);
                    try {
                        String where = host.trash(path);
                        if (note != null) try { host.trash(note); } catch (java.io.IOException ignored) { /* the drawing went: enough */ }
                        host.toast("Moved to " + where);
                    } catch (java.io.IOException | RuntimeException e) { host.toast("Not deleted: " + e.getMessage()); return; }
                    post(() -> { scene.saved(); host.activity().finish(); }); // nothing left to save on the way out
                });
            })
            .setNegativeButton("Cancel", null).show();
    }

    // ---- editing -------------------------------------------------------------------------------------------------

    /** A finished change: undoable, saved soon. */
    /** A stroke just written (Pad, at pen-up): kept like any step, but the page is not drawn again — the pad adds the
     *  one stroke to its picture — and the toolbar is drawn only when its Undo / Redo change. Every pen-up redrawing
     *  the whole page and the islands stalled the pen as a page filled. */
    void wrote(Step st) {
        if (st == null || st.empty()) return;
        boolean bar = undo.isEmpty() || !redo.isEmpty();
        undo.push(st);
        redo.clear();
        saveSoon();
        if (bar) { favourites.setLast(holding()); chrome.draw(); }
    }

    void done(Step st) {
        if (st == null || st.empty()) return;
        chosen.removeIf(it -> !scene.items.contains(it)); // erased (eraser end, a page deleted) while chosen
        undo.push(st);
        redo.clear();
        saveSoon();
        drawBar();
    }

    private void step(Deque<Step> from, Deque<Step> to) {
        Step st = from.poll();
        if (st == null) return;
        if (from == undo) st.undo(scene); else st.redo(scene);
        if (st.snapRecord != null) dataset.keep(st.snapRecord, from == undo ? "undone" : "redone"); // the user's word on the snap
        to.push(st);
        select(new ArrayList<>());
        saveSoon();
        pad.repaintAfterEdit();
    }

    void undoOnce() { step(undo, redo); }
    void redoOnce() { step(redo, undo); }

    void select(List<Item> items) {
        chosen.clear();
        chosen.addAll(items);
        drawBar();
    }

    /** The box around the selection, in scene units (empty when nothing is chosen). */
    RectF chosenBox() {
        RectF r = new RectF();
        for (Item it : chosen) if (r.isEmpty()) r.set(it.box); else r.union(it.box);
        return r;
    }

    void duplicate() {
        Step st = new Step();
        List<Item> copies = Scene.copied(chosen, scene.ids, 24, 24);
        for (Item c : copies) st.add(scene, c);
        done(st);
        select(copies); // the copies chosen, ready to be dragged
    }

    /** Copy (and Cut): the selection into the clipboard, with the corner of the page it is on. */
    void copyChosen(boolean cut) {
        if (chosen.isEmpty()) return;
        clipboard.clear();
        for (Item it : chosen) { Item c = it.copy(it.id, 0, 0); if (c != null) clipboard.add(c); }
        RectF box = chosenBox();
        Page from = scene.pageAt(box.centerX(), box.centerY());
        clipOrigin.set(from != null ? from.r.left : 0, from != null ? from.r.top : 0);
        if (cut) deleteChosen();
        host.toast((cut ? "Cut " : "Copied ") + clipboard.size() + (clipboard.size() == 1 ? " item" : " items") + " — Pages → Paste");
    }

    /** Paste: the clipboard onto the page in view, where it stood on its own page (nudged when that is where it is),
     *  chosen so it can be dragged. */
    private void paste() {
        int i = currentPage();
        Page to = i >= 0 ? scene.pages.get(i) : null;
        float dx = (to != null ? to.r.left : 0) - clipOrigin.x, dy = (to != null ? to.r.top : 0) - clipOrigin.y;
        Set<String> here = new HashSet<>();
        for (Item it : scene.items) here.add(it.id);
        boolean onItself = false;
        for (Item it : clipboard) onItself |= here.contains(it.id);
        if (onItself && dx == 0 && dy == 0) { dx = 24; dy = 24; }
        Step st = new Step();
        List<Item> pasted = Scene.copied(clipboard, scene.ids, dx, dy);
        for (Item c : pasted) {
            c.setFrame(to != null ? to.id : null);
            st.add(scene, c);
        }
        done(st);
        select(pasted);
        pad.repaintAfterEdit();
    }

    /** The lasso's Link: a note's name typed, the selection linked to `[[it]]` (Obsidian's Excalidraw plugin's
     *  element link; the companion note lists it, so the note gets the drawing in its backlinks); emptied, unlinked. */
    void linkChosen() {
        if (chosen.isEmpty()) return;
        String had = chosen.get(0).link();
        android.widget.AutoCompleteTextView field = new android.widget.AutoCompleteTextView(host.activity());
        field.setThreshold(1);
        android.widget.ArrayAdapter<String> names = new android.widget.ArrayAdapter<>(host.activity(), android.R.layout.simple_dropdown_item_1line, new ArrayList<>());
        field.setAdapter(names);
        new Thread(() -> { // the vault's notes, offered as the name is typed
            List<String> found = noteNames();
            host.activity().runOnUiThread(() -> names.addAll(found));
        }, "note-names").start();
        field.setSingleLine(true);
        field.setHint("The note's name, e.g. Project ideas");
        field.setText(had == null ? "" : had.replaceAll("^\\[\\[|\\]\\]$", ""));
        field.setSelection(field.length());
        LinearLayout form = new LinearLayout(host.activity());
        form.setPadding(look.dp(20), look.dp(8), look.dp(20), 0);
        form.addView(field, new LayoutParams(-1, -2));
        List<Item> items = scene.withBound(new ArrayList<>(chosen));
        android.app.AlertDialog d = new android.app.AlertDialog.Builder(host.activity()).setTitle("Link to a note").setView(form)
            .setPositiveButton("Link", (dl, w) -> {
                String name = field.getText().toString().trim().replaceAll("^\\[\\[|\\]\\]$", "");
                done(Step.relink(scene, items, name.isEmpty() ? null : "[[" + name + "]]"));
                pad.repaintAfterEdit();
            })
            .setNegativeButton("Cancel", null).create();
        if (d.getWindow() != null) d.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        d.show();
        field.requestFocus();
    }

    /** The vault's notes by name (no `.md`), for Link's suggestions: a walk of its folders, hidden ones skipped, at
     *  most 5000 (a big vault still answers at once). Off the UI thread. */
    private List<String> noteNames() {
        java.util.TreeSet<String> out = new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (String p : vaultFiles()) if (p.endsWith(".md")) out.add(p.substring(p.lastIndexOf('/') + 1, p.length() - 3));
        return new ArrayList<>(out);
    }


    /** At open: the screen held as it is, upside down included (turned only by the button above). */
    private void holdScreen() {
        android.app.Activity a = host.activity();
        a.setRequestedOrientation(orientationFor(rotation(a), a));
    }

    /** The display's quarter turns from the device's natural way (Surface.ROTATION_0..270 as 0..3). */
    private static int rotation(android.app.Activity a) {
        return a.getWindowManager().getDefaultDisplay().getRotation();
    }

    /** The fixed orientation that shows quarter turn `r`; a device whose natural way is landscape is a turn ahead. */
    private static int orientationFor(int r, android.app.Activity a) {
        int[] byTurn = {
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT,
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE,
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT,
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE,
        };
        boolean wide = a.getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        boolean naturalWide = wide == (rotation(a) % 2 == 0);
        return byTurn[(r + (naturalWide ? 1 : 0)) % 4];
    }

    /** The system's bars shown, or hidden (a swipe from the edge shows them a moment). Hidden as long as the notepad is
     *  open, whatever the controls; shown again when it closes. */
    private void systemBars(boolean show) {
        boolean on = !show;
        android.view.Window w = host.activity().getWindow();
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController c = w.getInsetsController();
            if (c == null) return;
            if (on) { c.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); c.hide(android.view.WindowInsets.Type.systemBars()); }
            else c.show(android.view.WindowInsets.Type.systemBars());
        } else {
            w.getDecorView().setSystemUiVisibility(on ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION : 0);
        }
    }

    void deleteChosen() {
        Step st = new Step();
        for (Item it : new ArrayList<>(chosen)) st.remove(scene, it);
        select(new ArrayList<>());
        done(st);
        pad.repaintAfterEdit();
    }

    void clearPage() {
        int i = currentPage();
        if (i < 0) return;
        Step st = new Step();
        for (Item it : scene.itemsOn(scene.pages.get(i))) if (!it.locked()) st.remove(scene, it); // the PDF's page stays
        done(st);
        pad.repaintAfterEdit();
    }

    // ---- pages ---------------------------------------------------------------------------------------------------

    /** The page under the view's middle (draw-pages.ts pageAt). */
    int currentPage() { return pad == null ? -1 : currentPageBefore(pad.getWidth(), pad.getHeight()); }

    /** The page under the middle of a view `w` × `h` px at the current zoom and place (the size before a turn). */
    int currentPageBefore(int w, int h) {
        if (scene.pages.isEmpty() || pad == null) return -1;
        float k = pad.k(), cx = pad.ox + w / 2f / k, cy = pad.oy + h / 2f / k;
        int best = 0;
        double dist = Double.MAX_VALUE;
        for (int i = 0; i < scene.pages.size(); i++) {
            RectF p = scene.pages.get(i).r;
            double d = Math.hypot(Math.max(Math.max(p.left - cx, 0), cx - p.right), Math.max(Math.max(p.top - cy, 0), cy - p.bottom));
            if (d < dist) { dist = d; best = i; }
        }
        return best;
    }

    /** The page a link named (`#Page 2`, a page's own name, `#^frame=<id>`), shown at open instead of the last. */
    String startAt;

    /** The page this drawing was last shown at (LastPages), read when it loads. */
    String lastShown;

    /** The page to open at: the one `startAt` names (draw-pages.ts frameRef's rules), else the one it was last shown
     *  at, else the last. */
    int startPage() {
        int last = scene.pages.size() - 1;
        if (startAt == null && lastShown != null) for (int i = 0; i < scene.pages.size(); i++) if (scene.pages.get(i).id.equals(lastShown)) return i;
        if (startAt == null) return last;
        String r = startAt.trim();
        for (int i = 0; i < scene.pages.size(); i++) {
            Page p = scene.pages.get(i);
            if (r.startsWith("^frame=") ? p.id.equals(r.substring(7)) : p.name != null && p.name.trim().equalsIgnoreCase(r)) return i;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?i)^page\\s+(\\d+)$").matcher(r);
        if (m.matches()) { int n = Integer.parseInt(m.group(1)) - 1; if (n >= 0 && n <= last) return n; }
        return last;
    }

    /** Page `want` whole on screen, centred; one clean refresh, as Boox Notes turns a page. */
    /** All the pages at once (the page number's tap). */
    void overview() { if (!scene.pages.isEmpty()) new PageOverview(this).show(); }

    /** The next page; on the last, a new one. */
    /** The zoom that shows page `p` whole in a pad of w × h, under the islands, with a hair of margin. */
    private float fitZoom(RectF p, int w, int h) {
        return Math.min(w / (p.width() * 1.04f), Math.max(1, h - chrome.topInset()) / (p.height() * 1.04f)) / density;
    }

    /** Whether page `i` is shown fitted (as toPage left it) in a pad of w × h: one zoomed by hand is left as it is. */
    boolean fitted(int i, int w, int h) {
        return i >= 0 && (pageMode || Math.abs(pad.zoom / fitZoom(scene.pages.get(i).r, w, h) - 1) < 0.03f);
    }

    void nextPage() { int at = currentPage(); if (at >= scene.pages.size() - 1) newPage(); else toPage(at + 1); }

    /** Page mode (the setting `page_mode`, on unless switched off): a notebook shows one page,
     *  filling the screen, the islands over it; the fingers zoom into it but never out of it or past its edges, and a
     *  swipe from a side or the arrows turn it. Off: the canvas pans and zooms freely. */
    boolean pageMode;
    /** The page shown (page mode keeps the view on it); -1 before the first. */
    int shown = -1;

    /** Page mode: the view kept on the page shown — zoomed out at most until the page fills the screen, never past its
     *  edges (a page narrower than the screen centred). After every pinch and pan. */
    void clampToPage() {
        if (!pageMode || scene.pages.isEmpty() || pad.getWidth() == 0) return;
        RectF p = scene.pages.get(Math.max(0, Math.min(scene.pages.size() - 1, shown))).r;
        pad.zoom = Math.max(pad.zoom, fillZoom(p, pad.getWidth(), pad.getHeight()));
        float k = pad.k(), vw = pad.getWidth() / k, vh = pad.getHeight() / k;
        pad.ox = vw >= p.width() ? p.left - (vw - p.width()) / 2 : Math.max(p.left, Math.min(p.right - vw, pad.ox));
        pad.oy = vh >= p.height() ? p.top - (vh - p.height()) / 2 : Math.max(p.top, Math.min(p.bottom - vh, pad.oy));
    }

    /** The zoom at which page `p` fills a pad of w × h (whole, touching two sides). */
    private float fillZoom(RectF p, int w, int h) {
        return Math.min(w / p.width(), h / p.height()) / density;
    }

    void toPage(int want) {
        if (scene.pages.isEmpty() || pad.getWidth() == 0) { pad.post(() -> { if (pad.getWidth() > 0 && !scene.pages.isEmpty()) toPage(want); }); return; }
        int i = Math.max(0, Math.min(scene.pages.size() - 1, want));
        shown = i;
        RectF p = scene.pages.get(i).r;
        if (pageMode) { pad.zoom = 0; clampToPage(); host.einkRefresh(); drawBar(); return; } // the whole screen, centred
        // the whole page in the room under the islands, centred both ways
        float top = chrome.topInset(), roomW = pad.getWidth(), roomH = Math.max(1, pad.getHeight() - top);
        pad.zoom = fitZoom(p, pad.getWidth(), pad.getHeight());
        float k = pad.k();
        pad.ox = p.left - (roomW / k - p.width()) / 2;
        pad.oy = p.top - (top + (roomH - p.height() * k) / 2) / k;
        host.einkRefresh();
        drawBar();
    }

    // ---- live: the other devices with this drawing open (a vault on a server: LiveSocket; the web side draw-live.ts) ----

    private org.atlas.capture.LiveSocket live;
    /** The page and the islands over it (full immersion adds its corner here). */
    private FrameLayout stage;
    /** The others' pens: where (scene units) and whether down, by device; their names. */
    final java.util.Map<Integer, float[]> pointers = new java.util.HashMap<>();
    final java.util.Map<Integer, String> peerNames = new java.util.HashMap<>();
    private final Runnable sendLive = this::sendLive;
    private long lastPointer, lastDrawnPointer;

    private void joinLive() {
        scene.onLiveChange = () -> { removeCallbacks(sendLive); postDelayed(sendLive, 150); };
        live = host.live(path, new org.atlas.capture.LiveSocket.Listener() {
            @Override public void joined(int peer, String name) {
                peerNames.put(peer, name);
                try { live.send(new JSONObject().put("t", "els").put("els", scene.allElements()).put("name", "Boox")); } catch (JSONException e) { /* next change */ }
            }
            @Override public void left(int peer) { pointers.remove(peer); peerNames.remove(peer); if (pad != null) pad.invalidate(); }
            @Override public void message(int from, JSONObject m) {
                String name = m.optString("name", "");
                if (!name.isEmpty()) peerNames.put(from, name);
                if ("els".equals(m.optString("t"))) { if (scene.applyRemote(m.optJSONArray("els")) && pad != null) pad.ink(); }
                else if ("ptr".equals(m.optString("t"))) {
                    pointers.put(from, new float[] { (float) m.optDouble("x"), (float) m.optDouble("y"), "down".equals(m.optString("button")) ? 1 : 0 });
                    long now = android.os.SystemClock.uptimeMillis();
                    if (pad != null && now - lastDrawnPointer > (look.eink ? 300 : 30)) { lastDrawnPointer = now; pad.invalidate(); } // e-ink: fewer refreshes
                }
            }
        });
    }

    private void sendLive() {
        if (live == null) return;
        try {
            org.json.JSONArray els = scene.takeLive();
            if (els.length() > 0) live.send(new JSONObject().put("t", "els").put("els", els).put("name", "Boox"));
        } catch (JSONException e) { /* the next change sends it */ }
    }

    private long lastDraft;
    private boolean drafted;

    /** The stroke being written, to the others as it grows (`{t: "draft"}`: draw-live.ts shows it in place until the
     *  finished stroke comes):
     *  ~12 times a second while someone watches; null when it ends. `pts`: scene x, y, pressure. */
    void liveDraft(List<float[]> pts, float width) {
        if (live == null || live.others() == 0) return;
        long now = android.os.SystemClock.uptimeMillis();
        try {
            if (pts == null || pts.size() < 2) {
                if (drafted) { drafted = false; live.send(new JSONObject().put("t", "draft").put("el", JSONObject.NULL).put("name", "Boox")); }
                return;
            }
            if (now - lastDraft < 80) return;
            lastDraft = now;
            float x0 = pts.get(0)[0], y0 = pts.get(0)[1], minX = 0, minY = 0, maxX = 0, maxY = 0;
            org.json.JSONArray points = new org.json.JSONArray(), pressures = new org.json.JSONArray();
            for (float[] p : pts) {
                float dx = p[0] - x0, dy = p[1] - y0;
                minX = Math.min(minX, dx); minY = Math.min(minY, dy); maxX = Math.max(maxX, dx); maxY = Math.max(maxY, dy);
                points.put(new org.json.JSONArray().put(Geometry.r2(dx)).put(Geometry.r2(dy)));
                pressures.put(Geometry.r2(p[2]));
            }
            JSONObject el = new JSONObject().put("id", "boox-draft").put("type", "freedraw").put("x", Geometry.r2(x0)).put("y", Geometry.r2(y0))
                .put("width", Geometry.r2(maxX - minX)).put("height", Geometry.r2(maxY - minY)).put("angle", 0).put("strokeColor", color)
                .put("backgroundColor", "transparent").put("fillStyle", "solid").put("strokeWidth", Geometry.r2(width)).put("strokeStyle", "solid")
                .put("roughness", 0).put("opacity", 100).put("points", points).put("pressures", pressures).put("simulatePressure", false)
                .put("version", 1).put("versionNonce", 1).put("isDeleted", false).put("locked", true).put("groupIds", new org.json.JSONArray())
                .put("frameId", JSONObject.NULL).put("boundElements", JSONObject.NULL).put("link", JSONObject.NULL).put("seed", 1)
                .put("customData", new JSONObject().put("atlasPen", "fountain"));
            live.send(new JSONObject().put("t", "draft").put("el", el).put("name", "Boox"));
            drafted = true;
        } catch (JSONException e) { /* the next one */ }
    }

    /** This pen, for the others' screens (scene units), ~20 times a second; down/up always. */
    void livePointer(float x, float y, boolean down) {
        if (live == null || live.others() == 0) return;
        long now = android.os.SystemClock.uptimeMillis();
        if (now - lastPointer < 50 && down) return;
        lastPointer = now;
        try { live.send(new JSONObject().put("t", "ptr").put("x", x).put("y", y).put("tool", "pointer").put("button", down ? "down" : "up").put("name", "Boox")); }
        catch (JSONException e) { /* the next one */ }
    }

    // ---- saving --------------------------------------------------------------------------------------------------

    private final Runnable saveNow = this::save;

    void saveSoon() { removeCallbacks(saveNow); postDelayed(saveNow, 800); }

    /** Into the file as it is now, then its companion note (`x.md`), as a desktop save does. */
    /** Saves one after another, off the screen's thread: on a vault on a server each read and write is the network (on
     *  the main thread the notepad froze, then Android killed it, 2026-10-19). The scene is touched on the main thread
     *  only; a write that cannot reach the server is kept and sent later (PendingWrites). */
    private static final java.util.concurrent.ExecutorService SAVES = java.util.concurrent.Executors.newSingleThreadExecutor();

    private void save() {
        int at = currentPage();
        String page = at >= 0 && at < scene.pages.size() ? scene.pages.get(at).id : null;
        // what changed, taken here (the scene is the screen's); read, merged and written on the saving thread
        Scene.Changes changes;
        try { changes = scene.unsaved() ? scene.takeChanges() : null; } catch (JSONException e) { host.toast("Not saved: " + e.getMessage()); return; }
        SAVES.execute(() -> {
            if (page != null) LastPages.remember(host, path, page);
            if (changes == null) return;
            try {
                String disk = host.exists(path) ? host.readText(path) : null;
                String text = Scene.merge(disk, changes);
                host.write(path, text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                host.drawingSaved(path, text);
            } catch (JSONException | java.io.IOException | RuntimeException e) {
                post(() -> host.toast("Not saved: " + e.getMessage()));
            }
        });
    }

    private void close() {
        save();
        host.activity().finish();
    }

    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); systemBars(false); }

    @Override protected void onDetachedFromWindow() { systemBars(true); removeCallbacks(saveNow); removeCallbacks(sendLive); sendLive(); if (live != null) live.close(); save(); if (popup != null) popup.dismiss(); super.onDetachedFromWindow(); }

    /** Back: a menu closes first, then the selection, then the drawing (saved). */
    @Override public boolean back() {
        if (chrome.bare == Bare.IMMERSED) return true; // full immersion: Back does nothing (the corner is the way out)
        if (chrome.bare == Bare.FULL_SCREEN) { setBare(Bare.NONE); return true; } // full screen: Back brings the controls back
        if (popup != null) { popup.dismiss(); return true; }
        if (!chosen.isEmpty()) { select(new ArrayList<>()); return true; }
        save();
        return false;
    }
}
