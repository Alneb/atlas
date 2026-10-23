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
import org.atlas.capture.PenBar;
import org.atlas.capture.ReaderBars;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/** Reading a PDF (DESIGN-native-book-reader.md, memory project_paper_core.md): a page at a time, drawn on the fly
 *  (PageSource), zoomed with two fingers or a double tap. The pen writes on it — the pen, the highlighter, the eraser,
 *  typed notes (PenBar) — into its companion drawing `x.pdf.excalidraw` (InkStore.pdf), Notepad's, so the reader and
 *  Notepad show the same ink. The chrome is the readers' (ReaderBars): where you are, a slider, Pages (bookmarks,
 *  pages written on, go to a page), Pen, Notes, Notepad, Settings. Where you are is kept in the book's note. */
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

    PdfView(BooksScreen screen, String path) {
        super(screen.getContext());
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
        ink = host.pageInk(this::pageRect, (x, y) -> tapped(x));
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
        pagesTab = bars.tab("contents", "Pages", this::pagesPanel);
        bars.tab("pen", "Pen", this::penTools);
        notesTab = bars.tab("notes", "Notes", this::notesPanel);
        // the Notepad reads the drawing once the reader's last ink is in it (opened at once, it read the copy before)
        bars.tab("pages", "Notepad", () -> { save(); ink.flush(() -> host.openPlugin("notepad", path + ".excalidraw")); });
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
        post(() -> {
            if (s.length == 0) { where.setText(""); host.toast(name() + " cannot be read"); return; }
            sizes = s;
            entry = e;
            options = o;
            bookmarks = e.optJSONArray("bookmarks") != null ? e.optJSONArray("bookmarks") : new JSONArray();
            ink.open(InkStore.pdf(host, path, s));
            bars.slider.setMax(Math.max(0, s.length - 1));
            show(Math.max(1, Math.min(s.length, e.optInt("spine", 0) + 1)));
        });
    }

    private void show(int p) {
        page = Math.max(1, Math.min(sizes.length, p));
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
        background(() -> { try { Shelf.update(host, path, (e, r) -> e.put("bookmarks", keep)); } catch (Exception e) { post(() -> host.toast("The bookmark was not saved: " + e.getMessage())); } });
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

    // ---- touches ---------------------------------------------------------------------------------------------------

    private static final long DOUBLE_TAP_MS = 300;
    private Runnable pendingTap;

    /** A single tap at x: the bars away, else (fitted) a side turns the page and the middle shows the bars. */
    private void tapped(float tx) {
        if (bars.shown()) { bars.show(false); return; }
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
        if (bars.dispatch(e) || penBar.over(e.getX(), e.getY())) return super.dispatchTouchEvent(e);
        if (ink.take(e)) return true; // the pen: ink, a note, or its tap handed back (tapped); a palm moves nothing
        pinch.onTouchEvent(e);
        if (ink.writing() && ink.penNear() && !pinch.isInProgress()) return true; // the hand that writes: no turn, no menu
        int act = e.getActionMasked();
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
                final float tx = e.getX();
                pendingTap = () -> tapped(tx);
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
        private final Paint pic = new Paint(Paint.FILTER_BITMAP_FLAG), edge = new Paint();

        Sheet(Context c) {
            super(c);
            edge.setStyle(Paint.Style.STROKE);
            edge.setColor(Color.BLACK);
        }

        @Override protected void onDraw(Canvas c) {
            RectF r = pageRect();
            if (r == null) return;
            final int shown = page;
            Bitmap b = PageSource.page(host, path, shown, r.width(), () -> { if (page == shown) invalidate(); });
            if (b != null) c.drawBitmap(b, null, r, pic);
            else c.drawRect(r, edge);
        }
    }
}
