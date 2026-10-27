package org.atlas.plugins.books;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.InkStore;
import org.atlas.capture.Look;
import org.atlas.capture.NativePlugin;
import org.atlas.capture.PageInk;
import org.atlas.capture.PageSource;
import org.atlas.capture.PdfText;
import org.atlas.capture.Pdfium;
import org.atlas.capture.PenBar;
import org.atlas.capture.ReaderBars;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/** Reading a PDF (DESIGN-native-book-reader.md, memory project_paper_core.md): a page at a time, drawn on the fly
 *  (PageSource), zoomed with two fingers or a double tap. The pen writes on it — the pen, the highlighter, the eraser,
 *  typed notes (PenBar) — into the PDF's note, its pdf-marks block (InkStore.marks, core pdf_marks.rs), where the
 *  desktop's reader keeps its marks too. The chrome is the readers' (ReaderBars): where you are, a slider, Pages (bookmarks,
 *  pages written on, go to a page), Pen, Notes, Settings. Where you are is kept in the book's note. */
@SuppressLint("ViewConstructor")
final class PdfView extends FrameLayout implements NativePlugin.Back {
    private final BooksScreen screen;
    private final Host host;
    private final Look look;
    private final String path;
    private final Sheet sheet;
    private final TextView where;
    private final ReaderBars bars;
    private final PageInk ink;
    private PenBar penBar; // made after the tabs that open it
    private final View bookmarkMark;
    private float[][] sizes = new float[0][];
    private JSONObject options = new JSONObject(), entry = new JSONObject();
    private JSONArray bookmarks = new JSONArray();
    private int page = 1, turns;
    /** Zoom (1 = the page fitted) and the page's offset from its fitted place, in screen px. A turn fits the page again. */
    private float zoom = 1, panX, panY;
    private final android.view.ScaleGestureDetector pinch;
    private View pagesTab, notesTab, settingsTab;

    /** The page a link asked for (0: where the book was left). */
    private final int startAt;

    PdfView(BooksScreen screen, String path, int startAt) {
        super(screen.getContext());
        this.startAt = startAt;
        this.screen = screen;
        this.host = screen.host;
        this.look = host.look();
        this.path = path;
        Context c = getContext();
        setFocusable(true);
        setFocusableInTouchMode(true);
        setBackgroundColor(host.eink() ? Color.WHITE : 0xff3a3a3a);
        sheet = new Sheet(c);
        addView(sheet, new LayoutParams(-1, -1));
        ink = host.pageInk(this::pageRect, (x, y) -> tapped(x, y));
        ink.selector(penSelect); // the pen bar's Select tool: words chosen with the pen
        addView(ink, new LayoutParams(-1, -1));
        where = look.label(c, "", 12, host.eink() ? 0xff444444 : 0xffdddddd);
        where.setGravity(Gravity.CENTER);
        LayoutParams wp = new LayoutParams(-1, -2, Gravity.BOTTOM);
        wp.bottomMargin = look.dp(2);
        addView(where, wp);

        // a bookmarked page: a small ribbon at the top right
        bookmarkMark = new View(c);
        bookmarkMark.setBackground(look.icon(c, "bookmark", look.eink ? 0xff000000 : look.accent));
        bookmarkMark.setVisibility(GONE);
        LayoutParams bp = new LayoutParams(look.dp(22), look.dp(22), Gravity.TOP | Gravity.END);
        bp.topMargin = look.dp(6);
        bp.rightMargin = look.dp(10);
        addView(bookmarkMark, bp);

        bars = new ReaderBars(host, this, () -> host.activity().onBackPressed());
        bars.title(name());
        bars.action("bookmark", "Bookmark this page", this::toggleBookmark);
        bars.action("note", "The book's note", () -> background(() -> { String n = Shelf.noteOf(host, path); post(() -> host.openInWeb(n)); }));
        bars.action("duplicate", "Export a copy with the marks inside", this::exportWithMarks);
        bars.action("search", "Find in this PDF", this::askFind);
        pagesTab = bars.tab("contents", "Pages", this::pagesPanel);
        bars.tab("pen", "Pen", this::penTools);
        notesTab = bars.tab("notes", "Notes", this::notesPanel);
        settingsTab = bars.tab("settings", "Settings", this::settingsPanel);
        bars.slider.setContentDescription("Page");
        bars.slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) { if (user) bars.info("Page " + (p + 1) + " of " + sizes.length, ""); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { show(s.getProgress() + 1); }
        });
        penBar = new PenBar(host, this, ink);

        pinch = new android.view.ScaleGestureDetector(c, new android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(android.view.ScaleGestureDetector d) {
                zoomAbout(zoom * d.getScaleFactor(), d.getFocusX(), d.getFocusY());
                return true;
            }
        });

        where.setText("Opening…");
        screen.io.execute(this::load);
    }

    /** Zoom to `z` (1–5) keeping the page point under (fx, fy) there. */
    private void zoomAbout(float z, float fx, float fy) {
        z = Math.max(1f, Math.min(5f, z));
        float cx = getWidth() / 2f + panX, cy = getHeight() / 2f + panY; // the page's middle on screen
        panX += (fx - cx) * (1 - z / zoom);
        panY += (fy - cy) * (1 - z / zoom);
        zoom = z;
        if (zoom == 1f) { panX = 0; panY = 0; }
        clampPan();
        redraw();
    }

    private void redraw() { sheet.invalidate(); ink.invalidate(); ink.area(); }

    /** Page `q` fitted to the view: its width on screen, px. */
    private float fitted(int q) {
        float[] s = sizes[q - 1];
        return s[0] * Math.min(getWidth() / s[0], getHeight() / s[1]);
    }

    /** Where the page is on screen (zoomed and moved), or null before it is read. */
    private RectF pageRect() {
        if (sizes.length == 0 || getWidth() == 0) return null;
        float[] s = sizes[page - 1];
        float k = Math.min(getWidth() / s[0], getHeight() / s[1]) * zoom;
        float w = s[0] * k, h = s[1] * k, x = (getWidth() - w) / 2 + panX, y = (getHeight() - h) / 2 + panY;
        return new RectF(x, y, x + w, y + h);
    }

    /** The zoomed page may not leave the screen empty on a side. */
    private void clampPan() {
        if (sizes.length == 0) return;
        float[] s = sizes[page - 1];
        float k = Math.min(getWidth() / s[0], getHeight() / s[1]) * zoom;
        float mx = Math.max(0, (s[0] * k - getWidth()) / 2), my = Math.max(0, (s[1] * k - getHeight()) / 2);
        panX = Math.max(-mx, Math.min(mx, panX));
        panY = Math.max(-my, Math.min(my, panY));
    }

    private String name() { return path.substring(path.lastIndexOf('/') + 1).replaceFirst("(?i)\\.pdf$", ""); }

    private void load() {
        float[][] s = PageSource.sizes(host, path);
        JSONObject e = Shelf.entryOf(host, path);
        JSONObject o = Shelf.options(host.settings(), e);
        java.util.Map<Integer, String> noted;
        try { noted = InkStore.bookmarks(host, path); } catch (Exception x) { noted = new java.util.HashMap<>(); } // the note's (the desktop's too)
        final java.util.Map<Integer, String> fromNote = noted;
        post(() -> {
            if (s.length == 0) { where.setText(""); host.toast(name() + " cannot be read"); return; }
            sizes = s;
            entry = e;
            options = o;
            bookmarks = e.optJSONArray("bookmarks") != null ? e.optJSONArray("bookmarks") : new JSONArray();
            for (int n : new java.util.TreeSet<>(fromNote.keySet())) if (bookmarked(n) < 0) {
                try { bookmarks.put(new JSONObject().put("spine", n - 1).put("at", 0).put("label", "Page " + n)); } catch (Exception x) { /* an object */ }
            }
            ink.open(InkStore.marks(host, path, s)); // the PDF's note: the desktop's marks and these are one store
            bars.slider.setMax(Math.max(0, s.length - 1));
            show(Math.max(1, Math.min(s.length, startAt > 0 ? startAt : e.optInt("spine", 0) + 1)));
        });
    }

    private void show(int p) {
        page = Math.max(1, Math.min(sizes.length, p));
        loadLinks(page);
        zoom = 1; panX = 0; panY = 0;
        // the pages either side rendered ahead, so a turn shows at once
        if (getWidth() > 0) for (int q = page - 1; q <= page + 1; q++) if (q >= 1 && q <= sizes.length) PageSource.prefetch(host, path, q, q, fitted(q));
        bars.slider.setProgress(page - 1);
        where.setText(page + " / " + sizes.length);
        int pct = sizes.length > 1 ? Math.round(100f * (page - 1) / (sizes.length - 1)) : 100;
        bars.where("Page " + page + " of " + sizes.length);
        bars.info("Page " + page + " of " + sizes.length, pct + " %" + (sizes.length - page > 0 ? " · " + (sizes.length - page) + " to go" : " · the end"));
        bookmarkMark.setVisibility(bookmarked(page) >= 0 ? VISIBLE : GONE);
        ink.page(page);
        redraw();
        if (host.eink()) {
            int every = options.optInt("flash_every", 6);
            if (every > 0 && ++turns % every == 0) postDelayed(host::einkClear, 60); else postDelayed(host::einkRefresh, 60);
        }
        removeCallbacks(saveLater);
        postDelayed(saveLater, 700);
    }

    private final Runnable saveLater = this::save;

    private void save() {
        if (sizes.length == 0) return;
        final int p = page;
        final double prog = sizes.length > 1 ? (p - 1) / (double) (sizes.length - 1) : 1;
        background(() -> { try { Shelf.saveAt(host, path, p - 1, 0, prog); } catch (Exception e) { /* kept next time */ } });
    }

    private void background(Runnable r) {
        try { screen.io.execute(r); } catch (java.util.concurrent.RejectedExecutionException e) { new Thread(r, "books").start(); }
    }

    private void turn(int d) {
        if (sizes.length == 0) return;
        if (page + d < 1 || page + d > sizes.length) { host.toast(d < 0 ? "This is the first page." : "That was the last page."); return; }
        show(page + d);
    }

    // ---- bookmarks -------------------------------------------------------------------------------------------------

    private int bookmarked(int p) {
        for (int i = 0; i < bookmarks.length(); i++) if (bookmarks.optJSONObject(i) != null && bookmarks.optJSONObject(i).optInt("spine", -1) == p - 1) return i;
        return -1;
    }

    private void toggleBookmark() {
        int i = bookmarked(page);
        JSONArray next = new JSONArray();
        for (int k = 0; k < bookmarks.length(); k++) if (k != i) next.put(bookmarks.opt(k));
        if (i < 0) try { next.put(new JSONObject().put("spine", page - 1).put("at", 0).put("label", "Page " + page).put("made", java.time.Instant.now().toString())); } catch (Exception e) { return; }
        bookmarks = next;
        bookmarkMark.setVisibility(i < 0 ? VISIBLE : GONE);
        host.toast(i < 0 ? "Page " + page + " bookmarked" : "Bookmark removed");
        final JSONArray keep = next;
        final int at = page;
        final boolean on = i < 0;
        background(() -> {
            try {
                Shelf.update(host, path, (e, r) -> e.put("bookmarks", keep));
                InkStore.bookmark(host, path, at, on); // the note's too: the desktop's reader and Marks list show it
            } catch (Exception e) { post(() -> host.toast("The bookmark was not saved: " + e.getMessage())); }
        });
    }

    /** "Export with marks": the ink written first, then `x (marked).pdf` beside the PDF with every mark of its note as a
     *  real annotation (the core's export, the desktop's), the original untouched. */
    private void exportWithMarks() {
        host.toast("Writing a copy with the marks…");
        ink.flush(() -> background(() -> {
            try {
                JSONObject r = host.exportPdfMarks(path);
                String name = r.optString("path").replaceAll(".*/", "");
                int n = r.optInt("annotations") + r.optInt("bookmarks");
                post(() -> host.toast(name + ": " + n + " mark" + (n == 1 ? "" : "s") + " written in" + (r.optBoolean("rewritten") ? " (a decrypted copy)" : "") + "."));
            } catch (Exception e) { post(() -> host.toast("Not exported: " + e.getMessage())); }
        }));
    }

    // ---- the panels ------------------------------------------------------------------------------------------------

    /** Bookmarks, the pages written on, and "Go to a page". */
    private void pagesPanel() {
        LinearLayout l = bars.column();
        l.addView(bars.row("Go to a page…", null, false, 0, this::askPage));
        if (bookmarks.length() > 0) l.addView(look.heading(getContext(), "Bookmarks"));
        for (int i = 0; i < bookmarks.length(); i++) {
            JSONObject b = bookmarks.optJSONObject(i);
            if (b == null) continue;
            int p = b.optInt("spine") + 1;
            l.addView(bars.row(b.optString("label", "Page " + p), null, p == page, 0, () -> { bars.show(false); show(p); }));
        }
        List<Integer> inked = ink.inked();
        if (!inked.isEmpty()) l.addView(look.heading(getContext(), "Written on"));
        for (int p : inked) {
            List<InkStore.Note> n = ink.notes(p);
            l.addView(bars.row("Page " + p, n.isEmpty() ? "ink" : n.size() + (n.size() == 1 ? " note" : " notes"), p == page, 0, () -> { bars.show(false); show(p); }));
        }
        bars.panel(pagesTab, "Pages", l);
    }

    private void askPage() {
        EditText in = new EditText(getContext());
        in.setInputType(InputType.TYPE_CLASS_NUMBER);
        in.setHint("1 – " + sizes.length);
        new AlertDialog.Builder(getContext()).setTitle("Go to page").setView(in)
            .setPositiveButton("Go", (d, w) -> {
                try { int p = Integer.parseInt(in.getText().toString().trim()); bars.show(false); show(p); } catch (NumberFormatException e) { /* nothing typed */ }
            }).setNegativeButton("Cancel", null).show();
    }

    /** The typed notes, page by page (a tap goes there). */
    private void notesPanel() {
        LinearLayout l = bars.column();
        boolean any = false;
        for (int p : ink.inked()) for (InkStore.Note n : ink.notes(p)) {
            any = true;
            l.addView(bars.row(n.text.replace('\n', ' '), "page " + p, p == page, 0, () -> { bars.show(false); show(p); }));
        }
        if (!any) l.addView(bars.row("No typed notes yet: Pen → T, then tap where it goes.", null, false, 0, null));
        bars.panel(notesTab, "Notes", l);
    }

    /** The pen tools over the page; the bars out of the way. */
    private void penTools() {
        bars.show(false);
        penBar.show(true);
    }

    private void settingsPanel() {
        LinearLayout l = bars.column();
        l.addView(bars.segments("Taps on the sides", new String[] { "Left goes back", "Left goes on" }, options.optBoolean("invert_taps", false) ? 1 : 0,
            i -> { setOption("invert_taps", i == 1); settingsPanel(); }));
        l.addView(bars.segments("Volume keys", new String[] { "Turn pages", "Volume" }, options.optBoolean("volume_keys", true) ? 0 : 1,
            i -> { setOption("volume_keys", i == 0); settingsPanel(); }));
        if (host.eink()) {
            int[] every = { 1, 3, 6, 12, 0 };
            int now = options.optInt("flash_every", 6), at = 2;
            for (int i = 0; i < every.length; i++) if (every[i] == now) at = i;
            l.addView(bars.segments("Full refresh", new String[] { "Every page", "3", "6", "12", "Never" }, at, i -> { setOption("flash_every", every[i]); settingsPanel(); }));
        }
        bars.closePanel();
        bars.panel(settingsTab, "Settings", l);
    }

    /** A setting for this book, kept in its note (`reader_options`). */
    private void setOption(String key, Object v) {
        try { options.put(key, v); } catch (Exception e) { return; }
        background(() -> {
            try { Shelf.update(host, path, (e, r) -> { JSONObject o = e.optJSONObject("options") != null ? e.optJSONObject("options") : new JSONObject(); o.put(key, v); e.put("options", o); }); }
            catch (Exception e) { post(() -> host.toast("Not saved: " + e.getMessage())); }
        });
    }

    // ---- selecting words (PDFium's text, Pdfium.java): a long press, a drag, then what to do with them -------------

    private static final long HOLD_MS = 450;
    /** The page's text, once read (PDFium); its page; the selection's first and last characters. */
    private PdfText text;
    private int textPage = -1, selFrom = -1, selTo = -1;
    /** a long press is selecting (the finger still down); the bar is owed once the words arrive (lifted before) */
    private boolean selecting, barOwed;
    private LinearLayout selBar;
    private final Runnable hold = () -> startSelect(this.downX, this.downY);

    /** A screen point → page points (y up). */
    private float[] toPage(float x, float y) {
        RectF r = pageRect();
        if (r == null) return null;
        float[] s = sizes[page - 1];
        return new float[] { (x - r.left) / r.width() * s[0], s[1] - (y - r.top) / r.height() * s[1] };
    }

    /** The long press: the word under the finger selected, once the page's text is read. */
    private void startSelect(float x, float y) {
        if (!Pdfium.ready(getContext()) || sizes.length == 0) return;
        final int p = page;
        final float[] at = toPage(x, y);
        if (at == null) return;
        selecting = true; // from now the finger selects, even before the words are read
        barOwed = false;
        background(() -> {
            PdfText t;
            try { t = textPage == p && text != null ? text : Pdfium.text(host.local(path).getAbsolutePath(), p); }
            catch (Exception e) { post(() -> host.toast("No text here: " + e.getMessage())); return; }
            post(() -> {
                if (page != p) { clearSelect(); return; }
                text = t; textPage = p;
                int i = t.at(at[0], at[1], 6);
                if (i < 0) { clearSelect(); host.toast("No words there (a scanned page has no text)"); return; }
                int[] w = t.word(i);
                selFrom = w[0]; selTo = w[1];
                hideSelBar();
                if (barOwed) showSelBar();
                sheet.invalidate();
            });
        });
    }

    /** The finger moving after the long press: the selection's end follows it. */
    private void extendSelect(float x, float y) {
        float[] at = toPage(x, y);
        if (at == null || text == null) return;
        int i = text.at(at[0], at[1], 30);
        if (i >= 0 && i != selTo) { selTo = i < selFrom ? text.word(i)[0] : text.word(i)[1]; sheet.invalidate(); }
    }

    /** The finger or the pen lifted: the bar with what to do, now or once the words arrive. */
    private void endSelect() { selecting = false; if (selFrom >= 0) showSelBar(); else barOwed = true; }

    /** The pen bar's Select tool: the pen drags over words as a finger does after its long press. */
    private final PageInk.Selector penSelect = new PageInk.Selector() {
        public void down(float x, float y) {
            if (selFrom >= 0) clearSelect();
            if (!Pdfium.ready(getContext())) { host.toast("Selecting words needs PDFium in the app"); return; }
            startSelect(x, y);
        }
        public void move(float x, float y) { if (selecting) extendSelect(x, y); }
        public void up() { if (selecting) endSelect(); }
        public void cancel() { clearSelect(); }
    };

    private void clearSelect() { selFrom = selTo = -1; selecting = barOwed = false; hideSelBar(); sheet.invalidate(); }

    /** A touch on the selection's bar is the bar's (finger or pen): else the page took it and cleared the selection. */
    private boolean overSelBar(MotionEvent e) {
        return selBar != null && e.getX() >= selBar.getLeft() && e.getX() < selBar.getRight() && e.getY() >= selBar.getTop() && e.getY() < selBar.getBottom();
    }

    private void hideSelBar() { if (selBar != null) { removeView(selBar); selBar = null; } }

    /** What to do with the words: marked (as the desktop marks them, into the PDF's note), copied, or let go. */
    private void showSelBar() {
        hideSelBar();
        Context c = getContext();
        selBar = new LinearLayout(c);
        selBar.setOrientation(LinearLayout.HORIZONTAL);
        selBar.setBackground(look.pressable(look.eink ? 0xffffffff : 0xff2b2b2b, 12, look.eink ? 0xff000000 : 0));
        selBar.setPadding(look.dp(6), look.dp(4), look.dp(6), look.dp(4));
        String[][] acts = { { "Highlight", "highlight" }, { "Underline", "underline" }, { "Strike", "strike" }, { "Copy", "" }, { "✕", null } };
        for (String[] a : acts) {
            TextView b = look.button(c, a[0], "highlight".equals(a[1]));
            b.setOnClickListener(v -> { if (a[1] == null) clearSelect(); else if (a[1].isEmpty()) copySelect(); else markSelect(a[1]); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.leftMargin = look.dp(4);
            selBar.addView(b, lp);
        }
        LayoutParams lp = new LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        lp.bottomMargin = look.dp(28);
        addView(selBar, lp);
    }

    private void copySelect() {
        if (text == null || selFrom < 0) return;
        android.content.ClipboardManager cb = (android.content.ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        cb.setPrimaryClip(android.content.ClipData.newPlainText("PDF", text.quote(selFrom, selTo)[0]));
        host.toast("Copied");
        clearSelect();
    }

    private void markSelect(String kind) {
        if (text == null || selFrom < 0) return;
        final List<float[]> quads = text.quads(selFrom, selTo);
        final String[] quote = text.quote(selFrom, selTo);
        final int p = textPage;
        clearSelect();
        String color = "highlight".equals(kind) ? "#FFE066" : "#e03131";
        ink.flush(() -> background(() -> {
            try {
                InkStore.textMark(host, path, p, kind, color, quads, quote);
                post(() -> { ink.open(InkStore.marks(host, path, sizes)); host.toast("Marked: " + quote[0]); });
            } catch (Exception e) { post(() -> host.toast("Not marked: " + e.getMessage())); }
        }));
    }

    // ---- find (PDFium): every page searched from the one shown; the matches shaded, ‹ › to step -----------------------

    /** The matches: page and its line boxes (points); which is shown. */
    private final java.util.List<Object[]> found = new java.util.ArrayList<>();
    private int foundAt = -1;
    private LinearLayout findBar;

    private void askFind() {
        if (!Pdfium.ready(getContext())) { host.toast("Find needs PDFium, which this app does not carry"); return; }
        bars.show(false);
        EditText q = new EditText(getContext());
        q.setSingleLine(true);
        q.setHint("Words to find");
        new AlertDialog.Builder(getContext()).setTitle("Find").setView(q)
            .setPositiveButton("Find", (d, w) -> find(q.getText().toString().trim()))
            .setNegativeButton("Cancel", null).show();
    }

    private void find(String query) {
        if (query.isEmpty()) return;
        final int from = page, n = sizes.length;
        host.toast("Finding “" + query + "”…");
        background(() -> {
            String pdf;
            try { pdf = host.local(path).getAbsolutePath(); } catch (java.io.IOException e) { post(() -> host.toast("Not found: " + e.getMessage())); return; }
            java.util.List<Object[]> got = new java.util.ArrayList<>();
            // from the page shown to the end, then from the start: the first match is the next one in reading order
            for (int k = 0; k < n; k++) {
                int p = (from - 1 + k) % n + 1;
                try { for (float[][] m : Pdfium.find(pdf, p, query)) got.add(new Object[] { p, m }); } catch (Exception ignored) { }
            }
            post(() -> {
                found.clear();
                found.addAll(got);
                if (got.isEmpty()) { host.toast("“" + query + "” is not in this PDF"); hideFind(); return; }
                showFind(0);
            });
        });
    }

    private void showFind(int i) {
        foundAt = (i + found.size()) % found.size();
        int p = (Integer) found.get(foundAt)[0];
        if (p != page) show(p); else sheet.invalidate();
        if (findBar == null) {
            Context c = getContext();
            findBar = new LinearLayout(c);
            findBar.setBackground(look.pressable(look.eink ? 0xffffffff : 0xff2b2b2b, 12, look.eink ? 0xff000000 : 0));
            findBar.setPadding(look.dp(6), look.dp(4), look.dp(6), look.dp(4));
            LayoutParams lp = new LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
            lp.topMargin = look.dp(8);
            addView(findBar, lp);
        }
        findBar.removeAllViews();
        Context c = getContext();
        TextView prev = look.button(c, "‹", false), next = look.button(c, "›", false), close = look.button(c, "✕", false);
        TextView count = look.label(c, (foundAt + 1) + " / " + found.size(), 14, look.eink ? 0xff000000 : 0xffffffff);
        count.setPadding(look.dp(10), 0, look.dp(10), 0);
        prev.setOnClickListener(v -> showFind(foundAt - 1));
        next.setOnClickListener(v -> showFind(foundAt + 1));
        close.setOnClickListener(v -> hideFind());
        for (View v : new View[] { prev, count, next, close }) findBar.addView(v);
        if (host.eink()) post(host::einkRefresh);
    }

    private void hideFind() { found.clear(); foundAt = -1; if (findBar != null) { removeView(findBar); findBar = null; } sheet.invalidate(); }

    // ---- links (PDFium): a tap on one follows it — a page of this PDF, or a web address in the browser --------------

    private org.json.JSONArray links;
    private int linksPage = -1;

    /** Whether the tap at (x, y) was on a link of the page shown (its links read once per page, off the UI thread). */
    /** Page p's links read ahead, as it is shown (Pdfium; none without it). */
    private void loadLinks(int p) {
        if (linksPage == p) return;
        linksPage = p;
        links = null;
        if (Pdfium.ready(getContext())) background(() -> {
            try { org.json.JSONArray got = Pdfium.links(host.local(path).getAbsolutePath(), p); post(() -> { if (linksPage == p) links = got; }); }
            catch (Exception ignored) { }
        });
    }

    private boolean followLink(float x, float y) {
        if (linksPage != page) { loadLinks(page); return false; }
        float[] at = toPage(x, y);
        if (links == null || at == null) return false;
        for (int i = 0; i < links.length(); i++) {
            JSONObject l = links.optJSONObject(i);
            JSONArray b = l == null ? null : l.optJSONArray("box");
            if (b == null || at[0] < b.optDouble(0) || at[0] > b.optDouble(2) || at[1] < b.optDouble(1) || at[1] > b.optDouble(3)) continue;
            if (l.has("page")) { show(l.optInt("page")); return true; }
            String url = l.optString("url");
            if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:")) {
                try { host.activity().startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))); }
                catch (Exception e) { host.toast("No app opens " + url); }
                return true;
            }
        }
        return false;
    }

    // ---- touches ---------------------------------------------------------------------------------------------------

    private static final long DOUBLE_TAP_MS = 300;
    private Runnable pendingTap;

    /** A single tap at x: the bars away, else (fitted) a side turns the page and the middle shows the bars. */
    private void tapped(float tx, float ty) {
        if (bars.shown()) { bars.show(false); return; }
        if (followLink(tx, ty)) return;
        if (zoom > 1f) return; // zoomed: a tap turns nothing (double tap to fit)
        float x = tx / getWidth();
        int dir = x < 0.3f ? -1 : x > 0.7f ? 1 : 0;
        if (options.optBoolean("invert_taps", false)) dir = -dir;
        if (dir == 0) { bars.show(true); if (host.eink()) post(host::einkRefresh); } else turn(dir);
    }

    private float downX, downY, lastX, lastY;
    private long lastTapAt;
    private boolean multi;

    @Override public boolean dispatchTouchEvent(MotionEvent e) {
        if (bars.dispatch(e) || penBar.over(e.getX(), e.getY()) || overSelBar(e)) return super.dispatchTouchEvent(e);
        if (ink.take(e)) return true; // the pen: ink, a note, or its tap handed back (tapped); a palm moves nothing
        pinch.onTouchEvent(e);
        if (ink.writing() && ink.penNear() && !pinch.isInProgress()) return true; // the hand that writes: no turn, no menu
        int act = e.getActionMasked();
        // selecting words: a long press starts it, the finger moving extends it, lifting it offers what to do
        if (selecting) {
            if (act == MotionEvent.ACTION_MOVE) extendSelect(e.getX(), e.getY());
            else if (act == MotionEvent.ACTION_UP) endSelect();
            else if (act == MotionEvent.ACTION_CANCEL) clearSelect();
            return true;
        }
        if (act == MotionEvent.ACTION_DOWN) { removeCallbacks(hold); if (selFrom >= 0) clearSelect(); if (!ink.writing()) postDelayed(hold, HOLD_MS); }
        if (act == MotionEvent.ACTION_POINTER_DOWN || pinch.isInProgress()) removeCallbacks(hold);
        if (act == MotionEvent.ACTION_MOVE && Math.hypot(e.getX() - downX, e.getY() - downY) > look.dp(10) && !selecting) removeCallbacks(hold);
        if (act == MotionEvent.ACTION_UP || act == MotionEvent.ACTION_CANCEL) removeCallbacks(hold);
        if (act == MotionEvent.ACTION_DOWN) { downX = lastX = e.getX(); downY = lastY = e.getY(); multi = false; }
        if (act == MotionEvent.ACTION_POINTER_DOWN) multi = true;
        if (act == MotionEvent.ACTION_MOVE && !pinch.isInProgress() && e.getPointerCount() == 1 && zoom > 1f && !multi) {
            panX += e.getX() - lastX; panY += e.getY() - lastY; // zoomed in: one finger moves the page
            clampPan();
            redraw();
        }
        if (act == MotionEvent.ACTION_MOVE) { lastX = e.getX(); lastY = e.getY(); }
        if (act == MotionEvent.ACTION_UP && !multi) {
            float dx = e.getX() - downX, dy = e.getY() - downY;
            if (zoom == 1f && Math.abs(dx) > look.dp(48) && Math.abs(dx) > 2 * Math.abs(dy)) { turn(dx < 0 ? 1 : -1); return true; }
            if (Math.hypot(dx, dy) < look.dp(12)) {
                long now = e.getEventTime();
                if (now - lastTapAt < DOUBLE_TAP_MS) { // a double tap: zoom in there, or fit again
                    lastTapAt = 0;
                    removeCallbacks(pendingTap);
                    zoomAbout(zoom > 1f ? 1f : 2.5f, e.getX(), e.getY());
                    return true;
                }
                lastTapAt = now;
                final float tx = e.getX(), ty = e.getY();
                pendingTap = () -> tapped(tx, ty);
                postDelayed(pendingTap, DOUBLE_TAP_MS); // a single tap once no second one came
                return true;
            }
        }
        if (act == MotionEvent.ACTION_UP && zoom > 1f && host.eink()) postDelayed(host::einkRefresh, 60); // a clean picture after a pan or a zoom
        return true;
    }

    @Override public boolean back() {
        if (bars.back()) return true;
        if (penBar.shown()) { penBar.show(false); return true; }
        return false;
    }

    @Override public boolean onKeyDown(int code, KeyEvent e) {
        boolean volume = options.optBoolean("volume_keys", true);
        if (volume && code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_PAGE_DOWN || code == KeyEvent.KEYCODE_DPAD_RIGHT) { turn(1); return true; }
        if (volume && code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_PAGE_UP || code == KeyEvent.KEYCODE_DPAD_LEFT) { turn(-1); return true; }
        return super.onKeyDown(code, e);
    }

    @Override protected void onDetachedFromWindow() { removeCallbacks(saveLater); save(); super.onDetachedFromWindow(); }

    /** The page, fitted and zoomed; the ink is PageInk's, over it. */
    private final class Sheet extends View {
        private final Paint pic = new Paint(Paint.FILTER_BITMAP_FLAG), edge = new Paint(), sel = new Paint(), mark = new Paint();

        Sheet(Context c) {
            super(c);
            edge.setStyle(Paint.Style.STROKE);
            edge.setColor(Color.BLACK);
            sel.setColor(host.eink() ? 0x55000000 : 0x5533a0ff);
            mark.setStyle(Paint.Style.STROKE);
            mark.setStrokeWidth(look.dp(2));
            mark.setColor(host.eink() ? 0xff000000 : 0xffff8c00);
        }

        @Override protected void onDraw(Canvas c) {
            RectF r = pageRect();
            if (r == null) return;
            final int shown = page;
            Bitmap b = PageSource.page(host, path, shown, r.width(), () -> { if (page == shown) invalidate(); });
            if (b != null) c.drawBitmap(b, null, r, pic);
            else c.drawRect(r, edge);
            // the match found, framed
            if (foundAt >= 0 && foundAt < found.size() && (Integer) found.get(foundAt)[0] == page) {
                float[] s = sizes[page - 1];
                for (float[] q : (float[][]) found.get(foundAt)[1])
                    c.drawRect(r.left + q[0] / s[0] * r.width() - 2, r.top + (s[1] - q[3]) / s[1] * r.height() - 2, r.left + q[2] / s[0] * r.width() + 2, r.top + (s[1] - q[1]) / s[1] * r.height() + 2, mark);
            }
            // the words being selected: their lines shaded (grey on e-ink)
            if (text != null && selFrom >= 0 && textPage == page) {
                float[] s = sizes[page - 1];
                for (float[] q : text.quads(selFrom, selTo))
                    c.drawRect(r.left + q[0] / s[0] * r.width(), r.top + (s[1] - q[3]) / s[1] * r.height(), r.left + q[2] / s[0] * r.width(), r.top + (s[1] - q[1]) / s[1] * r.height(), sel);
            }
        }
    }
}
