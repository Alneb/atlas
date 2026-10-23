package org.atlas.plugins.books;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.Look;
import org.atlas.capture.NativePlugin;
import org.atlas.capture.PageInk;
import org.atlas.capture.PenBar;
import org.atlas.capture.ReaderBars;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reading a reflowable book (DESIGN-native-book-reader.md): only the text and a slim footer; a tap in the middle
 *  brings the chrome (back, the title, Contents, Aa, a slider over the whole book), the sides turn pages, so do swipes
 *  and the volume keys. The text is laid out by a WebView that does nothing else: each chapter is served from the book
 *  (`https://book.local/<entry>`), the book's own scripts stripped and barred (a Content-Security-Policy with one
 *  nonce: ours), the reader's CSS (Typeset) and a small pager put in its head. Everything else is native. */
@SuppressLint("ViewConstructor")
final class ReaderView extends FrameLayout implements NativePlugin.Back {
    private static final String BASE = "https://book.local/";

    private final BooksScreen screen;
    private final Host host;
    private final Look look;
    private final String path;
    private final boolean eink;
    private final WebView web;
    private final TextView footLeft, footRight, chip;
    private final LinearLayout footer;
    private final ReaderBars bars;
    private PenBar penBar; // made after the tabs that open it
    private final EpubInk ink;
    private View contentsTab, notesTab, aaTab;
    private JSONArray bookmarks = new JSONArray();
    private String bookTitle = "";
    private Doc doc;
    private JSONObject yours = new JSONObject(), entry = new JSONObject(), options = new JSONObject();
    private int spine, page, pages = 1, turns, loads;
    private double scrolledAt;
    /** What the chapter being loaded should open at: a share of it (-1: its end), or an anchor. */
    private double wantAt;
    private String wantFrag = "";
    private volatile String css = "", nonce = "";
    /** Where you were before a jump (contents, slider, a link): "Back to p. N" takes you there. */
    private int backSpine = -1;
    private double backAt;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    ReaderView(BooksScreen screen, String path) {
        super(screen.getContext());
        this.screen = screen;
        this.host = screen.host;
        this.look = host.look();
        this.path = path;
        this.eink = host.eink();
        Context c = getContext();
        setFocusable(true);
        setFocusableInTouchMode(true);

        LinearLayout column = new LinearLayout(c);
        column.setOrientation(LinearLayout.VERTICAL);
        web = new WebView(c) {
            // the selection's toolbar (Copy, Share, the phone's dictionaries…) gets Highlight first
            @Override public android.view.ActionMode startActionMode(android.view.ActionMode.Callback cb, int type) {
                return super.startActionMode(new Selecting(cb), type);
            }

            // the pen writes on the page: a reflowed page
            // cannot keep ink in place, so a line drawn along text highlights that text (the web reader's rule,
            // view.js penGesture); a pen tap is still a tap, and anything else is let go
            @Override public boolean dispatchTouchEvent(android.view.MotionEvent e) {
                if (!penWriting(e)) return super.dispatchTouchEvent(e);
                return true;
            }

            @Override public void draw(android.graphics.Canvas cv) {
                super.draw(cv);
                if (!penLine.isEmpty()) { cv.save(); cv.translate(getScrollX(), getScrollY()); cv.drawPath(penLine, penPaint); cv.restore(); }
            }
        };
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(OVER_SCROLL_NEVER);
        web.getSettings().setJavaScriptEnabled(true); // only the reader's pager runs: the CSP bars the book's scripts
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setTextZoom(100); // the reader's size is the size
        web.setWebViewClient(new Pages());
        web.addJavascriptInterface(new Bridge(), "AtlasBook");
        web.setVisibility(INVISIBLE);
        column.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));

        footer = new LinearLayout(c);
        footer.setGravity(Gravity.CENTER_VERTICAL);
        footer.setPadding(look.dp(16), look.dp(2), look.dp(16), look.dp(6));
        footLeft = look.label(c, "", 12, look.faint);
        footLeft.setSingleLine(true);
        footLeft.setEllipsize(TextUtils.TruncateAt.END);
        footer.addView(footLeft, new LinearLayout.LayoutParams(0, -2, 1));
        footRight = look.label(c, "", 12, look.faint);
        footer.addView(footRight);
        column.addView(footer, new LinearLayout.LayoutParams(-1, look.dp(26)));
        addView(column, new LayoutParams(-1, -1));

        // the pinned notes over the page (EpubInk): drawn from where their words are now
        ink = new EpubInk(c, host, path, notePath());
        addView(ink, new LayoutParams(-1, -1));

        // the chrome (ReaderBars): hidden until a tap in the middle or the top band
        bars = new ReaderBars(host, this, () -> host.activity().onBackPressed());
        bars.action("bookmark", "Bookmark this page", this::toggleBookmark);
        bars.action("note", "The book's note", () -> host.openInWeb(notePath()));
        bars.action("search", "Search the book", this::searchPanel);
        contentsTab = bars.tab("contents", "Contents", this::contents);
        bars.tab("pen", "Pen", () -> { bars.show(false); penBar.show(true); });
        aaTab = bars.tab("type_size", "Aa", () -> new TypeSheet(this, bars).show(aaTab));
        notesTab = bars.tab("notes", "Notes", this::notesPanel);
        bars.slider.setMax(1000);
        bars.slider.setContentDescription("Where you are in the book");
        bars.slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) { if (user) bars.info(footLeft.getText().toString(), Math.round(p / 10.0) + " %"); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { jumpTo(s.getProgress() / 1000.0); }
        });
        penBar = new PenBar(host, this, ink);

        chip = look.label(c, "", 14, look.accentFg);
        chip.setPadding(look.dp(16), look.dp(10), look.dp(16), look.dp(10));
        chip.setBackground(look.round(look.accent, 20, 0));
        chip.setVisibility(GONE);
        chip.setOnClickListener(v -> { int s = backSpine; double a = backAt; backSpine = -1; chip.setVisibility(GONE); open(s, a, ""); });
        LayoutParams cp = new LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        cp.bottomMargin = look.dp(40);
        addView(chip, cp);

        footLeft.setText("Opening…");
        screen.io.execute(this::load);
    }

    // ---- the book --------------------------------------------------------------------------------------------------

    /** On the reading thread: the book, your settings, where you were. */
    private void load() {
        try {
            Doc d = Formats.open(host.local(path), path);
            JSONObject s = host.settings();
            JSONObject e = Shelf.entryOf(host, path);
            String note = host.exists(notePath()) ? host.readText(notePath()) : "";
            ink.load();
            post(() -> {
                passages = Highlights.in(note);
                doc = d;
                yours = s;
                entry = e;
                options = Shelf.options(yours, entry);
                bookTitle = d.title().isEmpty() ? name() : d.title();
                bars.title(bookTitle);
                bookmarks = e.optJSONArray("bookmarks") != null ? e.optJSONArray("bookmarks") : new JSONArray();
                styled();
                open(entry.optInt("spine", 0), entry.optDouble("at", 0), "");
            });
        } catch (Exception ex) {
            post(() -> { footLeft.setText(""); host.toast(name() + " cannot be read: " + ex.getMessage()); });
        }
    }

    /** The book's note beside it (`x.epub` → `x.md`): its highlights, quoted (docs/PHILOSOPHY.md §1). */
    private String notePath() { return Shelf.knownNote(path); } // the book's one note (Shelf.noteOf)

    /** The passages the note quotes, marked in every chapter. */
    private org.json.JSONArray passages = new org.json.JSONArray();

    private String name() { return Formats.bare(path.substring(path.lastIndexOf('/') + 1)); }

    /** The page's colours and CSS from the settings (again after the Aa sheet changes them). */
    private void styled() {
        int[] c = Typeset.colors(options, eink);
        setBackgroundColor(c[0]);
        web.setBackgroundColor(c[0]);
        footer.setBackgroundColor(c[0]);
        int faint = (c[1] & 0x00ffffff) | 0x99000000;
        footLeft.setTextColor(faint);
        footRight.setTextColor(faint);
        float d = getResources().getDisplayMetrics().density;
        css = Typeset.css(options, Math.max(200, Math.round(web.getWidth() / d)), eink);
    }

    JSONObject options() { return options; }
    JSONObject yours() { return yours; }
    boolean ownSettings() { return entry.optJSONObject("options") != null; }
    Host host() { return host; }
    boolean eink() { return eink; }

    /** The Aa sheet's settings shown while it is open (kept when it closes: apply). */
    void preview(JSONObject o) {
        double at = fraction();
        options = Shelf.copy(o);
        styled();
        open(spine, at, "");
    }

    /** New settings from the Aa sheet: `forBook` keeps them for this book only (reading.json), else they are yours
     *  (the plugin's settings — the desktop's Settings shows the same). Laid out again where you are. */
    void apply(JSONObject o, boolean forBook) {
        options = o;
        final JSONObject saved = Shelf.copy(o);
        if (forBook) {
            try { entry.put("options", saved); } catch (Exception e) { /* an object */ }
            background(() -> { try { Shelf.update(host, path, (e, r) -> e.put("options", saved)); } catch (Exception ex) { post(() -> host.toast("Not kept: " + ex.getMessage())); } });
        } else {
            entry.remove("options");
            yours = Shelf.copy(o);
            background(() -> {
                try { Shelf.update(host, path, (e, r) -> e.remove("options")); } catch (Exception ex) { /* the book had none */ }
                String why = host.saveSettings(saved);
                if (why != null) post(() -> host.toast("Your settings were not saved: " + why));
            });
        }
        styled();
        open(spine, fraction(), "");
    }

    /** Spine entry `i` at `at` of the way through it (-1: its last page), or at anchor `frag`. */
    void open(int i, double at, String frag) {
        if (doc == null) return;
        spine = Math.max(0, Math.min(doc.spine().size() - 1, i));
        wantAt = at;
        wantFrag = frag == null ? "" : frag;
        nonce = Long.toHexString(Double.doubleToLongBits(Math.random()));
        web.setVisibility(INVISIBLE); // shown once laid out at the right page: no flash of the chapter's start
        ink.clear();
        String label = doc.chapterLabel(spine);
        footLeft.setText(label.isEmpty() ? "Chapter " + (spine + 1) : label);
        web.loadUrl(BASE + encode(doc.spine().get(spine)) + "?n=" + (++loads));
    }

    private static String encode(String entry) {
        StringBuilder b = new StringBuilder();
        for (String p : entry.split("/")) { if (b.length() > 0) b.append('/'); b.append(Uri.encode(p)); }
        return b.toString();
    }

    /** How far through the chapter on screen (0–1). */
    private double fraction() {
        if (!Typeset.paged(options, eink)) return scrolledAt;
        return pages > 1 ? (double) page / (pages - 1) : 0;
    }

    /** How far through the whole book (0–1): the chapters' sizes before, and the share of this one. */
    private double progress(int i, double at) {
        long total = 0, before = 0;
        for (int k = 0; k < doc.sizes().size(); k++) { long s = doc.sizes().get(k); total += s; if (k < i) before += s; }
        if (total == 0) return 0;
        return (before + doc.sizes().get(i) * Math.max(0, Math.min(1, at))) / (double) total;
    }

    /** A share of the whole book → its chapter and the share of that (the slider). */
    private void jumpTo(double p) {
        if (doc == null) return;
        long total = 0;
        for (long s : doc.sizes()) total += s;
        double want = p * total, acc = 0;
        for (int k = 0; k < doc.sizes().size(); k++) {
            long s = doc.sizes().get(k);
            if (acc + s >= want || k == doc.sizes().size() - 1) { remember(); open(k, s == 0 ? 0 : (want - acc) / s, ""); return; }
            acc += s;
        }
    }

    /** Where you are, kept for "Back to p. N" before a jump. */
    private void remember() {
        backSpine = spine;
        backAt = fraction();
    }

    private void shown() {
        boolean paged = Typeset.paged(options, eink);
        double at = fraction(), prog = progress(spine, at);
        footRight.setText((paged ? (page + 1) + " / " + pages + "  ·  " : "") + Math.round(prog * 100) + " %");
        bars.slider.setProgress((int) Math.round(prog * 1000));
        String chapter = doc.chapterLabel(spine).isEmpty() ? "Chapter " + (spine + 1) : doc.chapterLabel(spine);
        bars.where(chapter);
        bars.info(chapter + (paged ? " · page " + (page + 1) + " of " + pages : ""), Math.round(prog * 100) + " %" + (paged && pages - page > 1 ? " · " + (pages - page - 1) + " left in the chapter" : ""));
        placeInk();
        if (backSpine >= 0 && !(backSpine == spine && Math.abs(backAt - at) < 1e-6)) {
            chip.setText("Back to " + (doc.chapterLabel(backSpine).isEmpty() ? "chapter " + (backSpine + 1) : doc.chapterLabel(backSpine)));
            chip.setVisibility(VISIBLE);
            removeCallbacks(hideChip);
            postDelayed(hideChip, 8000);
        }
        removeCallbacks(save);
        postDelayed(save, 700);
    }

    private final Runnable hideChip = this::hideChip;
    private void hideChip() { chip.setVisibility(GONE); backSpine = -1; }

    private final Runnable save = this::save;
    private void save() {
        final int s = spine;
        final double at = fraction(), prog = progress(spine, at);
        background(() -> { try { Shelf.saveAt(host, path, s, at, prog); } catch (Exception e) { post(() -> host.toast("Where you are was not saved: " + e.getMessage())); } });
    }

    // ---- turning ---------------------------------------------------------------------------------------------------

    void turn(int dir) {
        if (doc == null) return;
        if (!Typeset.paged(options, eink)) {
            web.evaluateJavascript("atlasPager.scrollBy(" + dir + ")", r -> {
                if ("\"next\"".equals(r)) next();
                else if ("\"prev\"".equals(r) && spine > 0) open(spine - 1, -1, "");
            });
            return;
        }
        int n = page + dir;
        if (n >= pages) { next(); return; }
        if (n < 0) { if (spine > 0) open(spine - 1, -1, ""); else host.toast("This is the beginning of the book."); return; }
        page = n;
        web.evaluateJavascript("atlasPager.go(" + n + ")", null);
        refreshed();
        shown();
    }

    private void next() {
        if (spine < doc.spine().size() - 1) open(spine + 1, 0, "");
        else host.toast("That was the end of the book.");
    }

    /** On e-ink: a calm refresh each page, a full one every `flash_every` pages (Mihon's "flash on page change"). */
    private void refreshed() {
        if (!eink) return;
        int every = options.optInt("flash_every", 6);
        if (every > 0 && ++turns % every == 0) postDelayed(host::einkClear, 40);
        else postDelayed(host::einkRefresh, 40);
    }

    private long penAt;

    private void tap(float x, float y) {
        // the hand that writes brushing the side zones: no turn while the pen bar is out and the pen was just used
        if (penBar != null && penBar.shown() && android.os.SystemClock.uptimeMillis() - penAt < 1500) return;
        if (bars.shown()) { chrome(false); return; }
        boolean invert = options.optBoolean("invert_taps", false);
        String zones = options.optString("taps", "sides");
        if (y < 0.12f) { chrome(true); return; } // the top band shows the bars whatever the taps
        int dir;
        switch (zones) {
            case "Kindle": dir = x < 0.25f ? -1 : (y < 0.2f ? 0 : 1); break; // the narrow left goes back, the top is the menu
            case "edge": dir = x < 0.15f || x > 0.85f ? 1 : (y > 0.33f && y < 0.66f ? 0 : -1); break;
            case "L-shaped": dir = (x < 0.33f && y < 0.66f) || (y < 0.33f && x < 0.66f) ? -1 : (x > 0.33f && x < 0.66f && y > 0.33f && y < 0.66f ? 0 : 1); break;
            default: dir = x < 0.3f ? -1 : x > 0.7f ? 1 : 0; // the sides turn, the middle is the menu
        }
        if (dir == 0) { chrome(true); return; }
        turn(invert ? -dir : dir);
    }

    void chrome(boolean on) {
        bars.show(on);
        if (eink) post(host::einkRefresh);
        if (on) chip.setVisibility(GONE);
    }

    // ---- contents --------------------------------------------------------------------------------------------------

    private void contents() {
        if (doc == null) return;
        LinearLayout list = bars.column();
        View here = null;
        if (doc.toc().isEmpty()) list.addView(bars.row("This book has no table of contents.", null, false, 0, null));
        for (Epub.Toc t : doc.toc()) {
            int i = doc.spine().indexOf(t.path);
            View r = bars.row(t.label.isEmpty() ? "Chapter " + (i + 1) : t.label, null, i == spine, 18 * Math.min(t.depth, 4),
                i < 0 ? null : () -> { chrome(false); remember(); open(i, 0, t.frag); });
            list.addView(r);
            if (i == spine && here == null) here = r;
        }
        bars.panel(contentsTab, "Contents", list);
        final View mark = here;
        if (mark != null && bars.panelScroll() != null) bars.panelScroll().post(() -> bars.panelScroll().scrollTo(0, Math.max(0, mark.getTop() - look.dp(120))));
    }

    /** Bookmarks, typed notes and highlights: a tap goes there. */
    private void notesPanel() {
        if (doc == null) return;
        LinearLayout l = bars.column();
        Context c = getContext();
        if (bookmarks.length() > 0) l.addView(look.heading(c, "Bookmarks"));
        for (int i = 0; i < bookmarks.length(); i++) {
            JSONObject b = bookmarks.optJSONObject(i);
            if (b == null) continue;
            int s = b.optInt("spine");
            double at = b.optDouble("at");
            l.addView(bars.row(b.optString("label", "Chapter " + (s + 1)), Math.round(progress(s, at) * 100) + " %", false, 0, () -> { chrome(false); remember(); open(s, at, ""); }));
        }
        if (!ink.notes().isEmpty()) l.addView(look.heading(c, "Notes"));
        for (EpubInk.Note n : ink.notes()) {
            String ch = doc.chapterLabel(n.spine).isEmpty() ? "chapter " + (n.spine + 1) : doc.chapterLabel(n.spine);
            l.addView(bars.row(n.text.replace('\n', ' '), ch, false, 0, () -> { chrome(false); remember(); openAtChar(n.spine, n.k); }));
        }
        if (passages.length() > 0) l.addView(look.heading(c, "Highlights"));
        for (int i = 0; i < passages.length(); i++) {
            String q = passages.optString(i);
            l.addView(bars.row("“" + (q.length() > 120 ? q.substring(0, 120) + "…" : q) + "”", null, false, 0, () -> host.openInWeb(notePath())));
        }
        if (l.getChildCount() == 0) l.addView(bars.row("Nothing yet. The pen writes on the page; Pen → T types a note; a line along text highlights it; the ribbon at the top bookmarks.", null, false, 0, null));
        bars.panel(notesTab, "Notes", l);
    }

    /** Chapter `s` opened at the page holding character `k` (a note's place). */
    private void openAtChar(int s, int k) {
        if (s != spine) { wantChar = k; open(s, 0, ""); return; }
        goToChar(k);
    }

    private int wantChar = -1;

    private void goToChar(int k) {
        if (!Typeset.paged(options, eink)) { web.evaluateJavascript("(function(){var p=atlasInk.where([" + k + "]).at[0]; if(p) document.documentElement.scrollTop += p[1] - innerHeight/3;})()", r -> post(this::placeInk)); return; }
        web.evaluateJavascript("(function(){var p=atlasInk.where([" + k + "]).at[0]; return p ? Math.floor((p[0] + document.documentElement.scrollLeft) / innerWidth) : -1;})()", r -> {
            int n;
            try { n = Integer.parseInt(r.trim()); } catch (Exception e) { return; }
            if (n < 0) return;
            page = Math.max(0, Math.min(pages - 1, n));
            web.evaluateJavascript("atlasPager.go(" + page + ")", x -> shown());
        });
    }

    // ---- bookmarks -------------------------------------------------------------------------------------------------

    private int bookmarkHere() {
        double at = fraction();
        for (int i = 0; i < bookmarks.length(); i++) {
            JSONObject b = bookmarks.optJSONObject(i);
            if (b != null && b.optInt("spine", -1) == spine && Math.abs(b.optDouble("at", -1) - at) < 0.5 / Math.max(1, pages)) return i;
        }
        return -1;
    }

    private void toggleBookmark() {
        if (doc == null) return;
        int i = bookmarkHere();
        JSONArray next = new JSONArray();
        for (int k = 0; k < bookmarks.length(); k++) if (k != i) next.put(bookmarks.opt(k));
        String chapter = doc.chapterLabel(spine).isEmpty() ? "Chapter " + (spine + 1) : doc.chapterLabel(spine);
        if (i < 0) try { next.put(new JSONObject().put("spine", spine).put("at", Math.round(fraction() * 10000) / 10000.0).put("label", chapter + (pages > 1 ? ", page " + (page + 1) : "")).put("made", java.time.Instant.now().toString())); } catch (Exception e) { return; }
        bookmarks = next;
        host.toast(i < 0 ? "Bookmarked" : "Bookmark removed");
        final JSONArray keep = next;
        background(() -> { try { Shelf.update(host, path, (e, r) -> e.put("bookmarks", keep)); } catch (Exception e) { post(() -> host.toast("The bookmark was not saved: " + e.getMessage())); } });
    }

    // ---- the pinned notes ------------------------------------------------------------------------------------------

    /** The chapter's notes drawn where their words are on this page. */
    private void placeInk() {
        final int s = spine;
        int[] ks = ink.anchors(s);
        if (ks.length == 0) { ink.clear(); return; }
        StringBuilder a = new StringBuilder();
        for (int k : ks) { if (a.length() > 0) a.append(','); a.append(k); }
        web.evaluateJavascript("window.atlasInk ? JSON.stringify(atlasInk.where([" + a + "])) : null", r -> {
            try { String json = new JSONArray("[" + r + "]").optString(0, null); if (json != null) ink.placedAt(s, json); } catch (Exception e) { /* not laid out */ }
        });
    }

    // ---- links -----------------------------------------------------------------------------------------------------

    private void link(String href) {
        if (href == null || href.isEmpty()) return;
        if (href.matches("(?i)^(https?|mailto):.*")) {
            try { host.activity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(href))); } catch (Exception e) { host.toast("Nothing here opens " + href); }
            return;
        }
        String frag = "";
        int hash = href.indexOf('#');
        if (hash >= 0) { frag = href.substring(hash + 1); href = href.substring(0, hash); }
        String target = href.isEmpty() ? doc.spine().get(spine) : Epub.resolve(doc.spine().get(spine), href);
        int i = doc.spine().indexOf(target);
        if (i < 0) { host.toast("That link leads outside the book's chapters."); return; }
        remember();
        open(i, 0, frag);
    }

    // ---- footnotes -------------------------------------------------------------------------------------------------

    /** A footnote's mark tapped: its text over the page (KOReader's and Apple Books' popup), "Go to the note" for the
     *  place itself. A note in another chapter (the book's notes file) is read from there. */
    private void footnote(String href, String text) {
        if (text != null && !text.isEmpty()) { showNote(href, text); return; }
        final Doc d = doc;
        final int at = spine;
        background(() -> {
            String t = null;
            try {
                int hash = href.indexOf('#');
                String file = hash < 0 ? href : href.substring(0, hash), id = hash < 0 ? "" : href.substring(hash + 1);
                String target = file.isEmpty() ? d.spine().get(at) : Epub.resolve(d.spine().get(at), file);
                if (!id.isEmpty() && d.has(target)) t = textById(Epub.text(d.bytes(target)), java.net.URLDecoder.decode(id, "UTF-8"));
            } catch (Exception e) { /* shown as unreadable below */ }
            final String got = t;
            post(() -> { if (got == null || got.isEmpty()) link(href); else showNote(href, got); });
        });
    }

    private void showNote(String href, String text) {
        new android.app.AlertDialog.Builder(host.activity())
            .setMessage(text.length() > 3000 ? text.substring(0, 3000) + "…" : text)
            .setPositiveButton("Close", null)
            .setNeutralButton("Go to the note", (dl, w) -> link(href))
            .show();
    }

    /** The text of the element with id `id` in `html` (or of the block that holds it, when it is an empty anchor):
     *  a light reading, no parser — enough for a note. */
    static String textById(String html, String id) {
        Matcher m = Pattern.compile("<(\\w+)\\b[^>]*\\bid=[\"']" + Pattern.quote(id) + "[\"'][^>]*>").matcher(html);
        if (!m.find()) return null;
        int from = m.start();
        String tag = m.group(1).toLowerCase(java.util.Locale.ROOT);
        if (tag.equals("a") || tag.equals("span")) { // a marker inside the note's block: the block around it
            int open = Math.max(html.lastIndexOf("<p", from), Math.max(html.lastIndexOf("<li", from), html.lastIndexOf("<aside", from)));
            if (open >= 0) { from = open; Matcher t = Pattern.compile("<(\\w+)").matcher(html); if (t.find(from)) tag = t.group(1).toLowerCase(java.util.Locale.ROOT); }
        }
        int end = html.indexOf("</" + tag, m.end());
        String inner = html.substring(from, end < 0 ? Math.min(html.length(), from + 4000) : end);
        return plain(inner);
    }

    /** HTML to its text: tags out, the common entities read, spaces collapsed. */
    static String plain(String html) {
        String t = html.replaceAll("(?is)<(script|style|head)\\b.*?</\\1>", " ").replaceAll("<[^>]*>", "");
        t = t.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'");
        Matcher m = Pattern.compile("&#(x?)([0-9a-fA-F]+);").matcher(t);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            int cp;
            try { cp = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16); } catch (NumberFormatException e) { cp = '?'; }
            m.appendReplacement(sb, Matcher.quoteReplacement(new String(Character.toChars(cp))));
        }
        t = m.appendTail(sb).toString().replace("&amp;", "&");
        return t.replaceAll("\\s+", " ").trim();
    }

    // ---- search ----------------------------------------------------------------------------------------------------

    private String wantFind;
    private int wantNth;

    /** Search the book: a word or phrase, every place it is in (chapter, a line around it), a tap goes there with it
     *  marked — counted as the page's own marking counts (marks.js occurrences), so the nth found is the nth marked. */
    private void searchPanel() {
        if (doc == null) return;
        Context c = getContext();
        LinearLayout l = bars.column();
        android.widget.EditText q = new android.widget.EditText(c);
        q.setSingleLine(true);
        q.setHint("A word or a phrase");
        q.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
        l.addView(q, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout found = new LinearLayout(c);
        found.setOrientation(LinearLayout.VERTICAL);
        l.addView(found);
        q.setOnEditorActionListener((v, action, ev) -> { search(q.getText().toString(), found); return true; });
        bars.panel(null, "Search", l);
        q.requestFocus();
    }

    private void search(String query, LinearLayout found) {
        String want = query.replaceAll("\\s+", " ").trim().toLowerCase(java.util.Locale.ROOT);
        found.removeAllViews();
        if (want.isEmpty()) return;
        found.addView(bars.hint("Searching…"));
        final Doc d = doc;
        background(() -> {
            java.util.List<Object[]> hits = new java.util.ArrayList<>(); // {spine, nth, snippet}
            for (int i = 0; i < d.spine().size() && hits.size() < 300; i++) {
                String text;
                try { text = plain(Epub.text(d.bytes(d.spine().get(i)))); } catch (Exception e) { continue; }
                String low = text.toLowerCase(java.util.Locale.ROOT);
                int nth = 0;
                for (int k = low.indexOf(want); k >= 0 && hits.size() < 300; k = low.indexOf(want, k + want.length()), nth++) {
                    int a = Math.max(0, k - 50), b = Math.min(text.length(), k + want.length() + 50);
                    hits.add(new Object[] { i, nth, (a > 0 ? "…" : "") + text.substring(a, b) + (b < text.length() ? "…" : "") });
                }
            }
            post(() -> {
                found.removeAllViews();
                found.addView(bars.hint(hits.isEmpty() ? "Not in this book." : hits.size() + (hits.size() >= 300 ? "+" : "") + " found"));
                for (Object[] h : hits) {
                    int s = (Integer) h[0], nth = (Integer) h[1];
                    String ch = d.chapterLabel(s).isEmpty() ? "Chapter " + (s + 1) : d.chapterLabel(s);
                    found.addView(bars.row((String) h[2], ch, false, 0, () -> { chrome(false); remember(); find(s, query, nth); }));
                }
            });
        });
    }

    /** Chapter `s` with the `nth` place of `query` marked and its page shown. */
    private void find(int s, String query, int nth) {
        if (s != spine) { wantFind = query; wantNth = nth; open(s, 0, ""); return; }
        boolean paged = Typeset.paged(options, eink);
        web.evaluateJavascript("(function(){var m=atlasMarks.markFound(document," + JSONObject.quote(query) + "," + nth + "); if(!m) return -1; var r=m.getBoundingClientRect();"
            + (paged ? "return Math.floor((r.left + document.documentElement.scrollLeft) / innerWidth);" : "document.documentElement.scrollTop += r.top - innerHeight/3; return 0;") + "})()", r -> {
            if (!paged) { post(this::placeInk); return; }
            int n;
            try { n = Integer.parseInt(r.trim()); } catch (Exception e) { return; }
            if (n < 0) return;
            page = Math.max(0, Math.min(pages - 1, n));
            web.evaluateJavascript("atlasPager.go(" + page + ")", x -> shown());
        });
    }

    // ---- the pen ---------------------------------------------------------------------------------------------------

    private final android.graphics.Path penLine = new android.graphics.Path();
    private final android.graphics.Paint penPaint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
    { penPaint.setStyle(android.graphics.Paint.Style.STROKE); penPaint.setStrokeWidth(3); penPaint.setStrokeCap(android.graphics.Paint.Cap.ROUND); penPaint.setColor(0xff000000); }
    private float penX0, penY0, penMinX, penMaxX, penMinY, penMaxY, penSumY;
    private int penCount;
    private boolean penOn, penErasing;
    private final java.util.List<Float> penPts = new java.util.ArrayList<>();

    /** A pen event over the page: true when it is taken here, false for the page's own (a tap turns or shows the
     *  bars). The tool in hand (PenBar): the pen writes a note pinned to the words under it — a straight line along
     *  text highlights it instead (the web reader's rule, view.js penGesture); the highlighter marks the text it
     *  covers; the eraser takes pinned ink away; T types a note where you tap. A pen tap on a note's mark opens it. */
    private boolean penWriting(android.view.MotionEvent e) {
        int tool = e.getToolType(0);
        if (tool != android.view.MotionEvent.TOOL_TYPE_STYLUS && tool != android.view.MotionEvent.TOOL_TYPE_ERASER) return false;
        penAt = android.os.SystemClock.uptimeMillis();
        float x = e.getX(), y = e.getY();
        PageInk.Tool t = ink.tool();
        // with the pen bar out, the pen only writes: pages turn with a finger; without it, a pen tap is a tap as a finger's
        boolean writing = penBar != null && penBar.shown();
        switch (e.getActionMasked()) {
            case android.view.MotionEvent.ACTION_DOWN:
                penOn = false; penX0 = x; penY0 = y; penLine.rewind(); penLine.moveTo(x, y);
                penMinX = penMaxX = x; penMinY = penMaxY = y; penSumY = y; penCount = 1;
                penPts.clear(); penPts.add(x); penPts.add(y);
                penErasing = tool == android.view.MotionEvent.TOOL_TYPE_ERASER || (e.getButtonState() & android.view.MotionEvent.BUTTON_STYLUS_PRIMARY) != 0 || t == PageInk.Tool.ERASER;
                boolean marker = !penErasing && t == PageInk.Tool.HIGHLIGHTER;
                penPaint.setColor(penErasing ? 0x66000000 : marker ? ((ink.color() & 0xffffff) == 0 ? 0x669e9e9e : (ink.color() & 0xffffff) | 0x66000000) : ink.color());
                penPaint.setStrokeWidth(penErasing ? 2 * getResources().getDisplayMetrics().density : marker ? 14 * getResources().getDisplayMetrics().density : ink.penPx());
                return writing || t == PageInk.Tool.TEXT; // T: the tap is the note's, never a page turn
            case android.view.MotionEvent.ACTION_MOVE:
                for (int h = 0; h <= e.getHistorySize(); h++) {
                    float hx = h < e.getHistorySize() ? e.getHistoricalX(h) : x, hy = h < e.getHistorySize() ? e.getHistoricalY(h) : y;
                    penLine.lineTo(hx, hy);
                    penPts.add(hx); penPts.add(hy);
                    penMinX = Math.min(penMinX, hx); penMaxX = Math.max(penMaxX, hx); penMinY = Math.min(penMinY, hy); penMaxY = Math.max(penMaxY, hy);
                    penSumY += hy; penCount++;
                }
                if (t == PageInk.Tool.TEXT) return true;
                if (!penOn && (writing || Math.hypot(x - penX0, y - penY0) > look.dp(10))) {
                    penOn = true; // writing: the page's touch is called off (no scroll, no selection)
                    android.view.MotionEvent cancel = android.view.MotionEvent.obtain(e);
                    cancel.setAction(android.view.MotionEvent.ACTION_CANCEL);
                    web.onTouchEvent(cancel);
                    cancel.recycle();
                }
                if (penOn && penErasing) { ink.erase(toArray(penPts)); if (penPts.size() > 4) penPts.subList(0, penPts.size() - 2).clear(); }
                if (penOn) web.invalidate();
                return penOn || writing;
            case android.view.MotionEvent.ACTION_UP:
            case android.view.MotionEvent.ACTION_CANCEL:
                boolean up = e.getActionMasked() == android.view.MotionEvent.ACTION_UP;
                if (!penOn) {
                    penLine.rewind();
                    EpubInk.Note n = up ? ink.noteAt(x, y) : null;
                    if (n != null) { cancelPage(e); ink.edit(n); return true; }
                    if (up && t == PageInk.Tool.TEXT) { noteAt(x, y); return true; }
                    return writing || t == PageInk.Tool.TEXT;
                }
                penOn = false;
                float d = getResources().getDisplayMetrics().density;
                float w = penMaxX - penMinX, hgt = penMaxY - penMinY;
                if (!up) { penLine.rewind(); web.invalidate(); return true; }
                if (penErasing) ink.erase(toArray(penPts));
                else if (t == PageInk.Tool.HIGHLIGHTER) select(penX0 / d, penY0 / d, x / d, y / d);
                else if (w >= look.dp(24) && hgt <= w * 0.35f) { float my = penSumY / penCount; select(penMinX / d, my / d, penMaxX / d, my / d); }
                else pin(toArray(penPts));
                postDelayed(() -> { penLine.rewind(); web.invalidate(); if (eink) host.einkRefresh(); }, penErasing ? 0 : 350); // the line gives way to the mark
                return true;
            default:
                return penOn || t == PageInk.Tool.TEXT;
        }
    }

    private static float[] toArray(java.util.List<Float> l) { float[] a = new float[l.size()]; for (int i = 0; i < a.length; i++) a[i] = l.get(i); return a; }

    private void cancelPage(android.view.MotionEvent e) {
        android.view.MotionEvent cancel = android.view.MotionEvent.obtain(e);
        cancel.setAction(android.view.MotionEvent.ACTION_CANCEL);
        web.onTouchEvent(cancel);
        cancel.recycle();
    }

    /** The text between two points (CSS px) selected, then highlighted. */
    private void select(float x0, float y0, float x1, float y1) {
        String js = "(function(x0,y0,x1,y1){var a=document.caretRangeFromPoint(x0,y0),b=document.caretRangeFromPoint(x1,y1);if(!a||!b)return false;"
            + "var r=document.createRange();r.setStart(a.startContainer,a.startOffset);r.setEnd(b.startContainer,b.startOffset);"
            + "if(r.collapsed){r.setStart(b.startContainer,b.startOffset);r.setEnd(a.startContainer,a.startOffset);}"
            + "var s=window.getSelection();s.removeAllRanges();s.addRange(r);return String(s).trim().length>0;})("
            + x0 + "," + y0 + "," + x1 + "," + y1 + ")";
        web.evaluateJavascript(js, r -> { if ("true".equals(r)) highlightSelection(); });
    }

    /** Where the words under (x, y) (view px) are: {k, em, at: [x, y, h], quote} in CSS px, to `got` (null: none). */
    private void anchor(float x, float y, java.util.function.Consumer<JSONObject> got) {
        float d = getResources().getDisplayMetrics().density;
        web.evaluateJavascript("(function(){var k=atlasInk.at(" + x / d + "," + y / d + "); if(k<0) return null; var w=atlasInk.where([k]);"
            + " return JSON.stringify({k:k, em:w.em, at:w.at[0], quote:atlasInk.quote(k)});})()", r -> {
            JSONObject o = null;
            try { String json = new JSONArray("[" + r + "]").optString(0, null); if (json != null && !"null".equals(json)) o = new JSONObject(json); } catch (Exception e) { /* none */ }
            got.accept(o);
        });
    }

    /** Pen ink (view px) pinned to the first words under its top left. */
    private void pin(float[] pts) {
        if (pts.length < 4) return;
        anchor(penMinX, penMinY, o -> {
            if (o == null || o.optJSONArray("at") == null) { host.toast("Ink needs words near it to stay with"); return; }
            float d = getResources().getDisplayMetrics().density;
            JSONArray at = o.optJSONArray("at");
            ink.stroke(o.optInt("k"), (float) at.optDouble(0) * d, (float) at.optDouble(1) * d, (float) o.optDouble("em", 16) * d, pts, false);
        });
    }

    /** A typed note at the words under (x, y) (view px). */
    private void noteAt(float x, float y) {
        anchor(x, y, o -> {
            if (o == null) { host.toast("Tap on the text the note is about"); return; }
            String where = doc.chapterLabel(spine).isEmpty() ? "chapter " + (spine + 1) : doc.chapterLabel(spine);
            float d = getResources().getDisplayMetrics().density;
            JSONArray at = o.optJSONArray("at");
            ink.newNote(o.optInt("k"), o.optString("quote"), where, at == null ? null : new float[] { (float) at.optDouble(0) * d, (float) at.optDouble(1) * d, (float) at.optDouble(2, 16) * d });
        });
    }

    // ---- highlights ------------------------------------------------------------------------------------------------

    /** The selection's toolbar with Highlight first; everything else as the WebView offers it. */
    private final class Selecting extends android.view.ActionMode.Callback2 {
        private final android.view.ActionMode.Callback inner;
        Selecting(android.view.ActionMode.Callback inner) { this.inner = inner; }
        @Override public boolean onCreateActionMode(android.view.ActionMode m, android.view.Menu menu) {
            boolean ok = inner.onCreateActionMode(m, menu);
            menu.add(0, HIGHLIGHT, 0, "Highlight").setShowAsAction(android.view.MenuItem.SHOW_AS_ACTION_ALWAYS);
            return ok;
        }
        @Override public boolean onPrepareActionMode(android.view.ActionMode m, android.view.Menu menu) { return inner.onPrepareActionMode(m, menu); }
        @Override public boolean onActionItemClicked(android.view.ActionMode m, android.view.MenuItem item) {
            if (item.getItemId() != HIGHLIGHT) return inner.onActionItemClicked(m, item);
            highlightSelection();
            m.finish();
            return true;
        }
        @Override public void onDestroyActionMode(android.view.ActionMode m) { inner.onDestroyActionMode(m); }
        @Override public void onGetContentRect(android.view.ActionMode m, View v, android.graphics.Rect out) {
            if (inner instanceof android.view.ActionMode.Callback2) ((android.view.ActionMode.Callback2) inner).onGetContentRect(m, v, out);
            else super.onGetContentRect(m, v, out);
        }
    }

    private static final int HIGHLIGHT = 0x7a71;

    /** The selection kept in the book's note (made the first time with the book's properties) and marked here. */
    private void highlightSelection() {
        web.evaluateJavascript("(function(){ var t = String(window.getSelection()).replace(/\\s+/g, ' ').trim(); if (t && window.atlasMarks) atlasMarks.markPassages(document, [t]); window.getSelection().removeAllRanges(); return t; })()", r -> {
            String text;
            try { text = new org.json.JSONArray("[" + r + "]").optString(0, ""); } catch (Exception e) { text = ""; }
            if (text.isEmpty()) return;
            passages.put(text);
            final String quote = text, where = (doc.chapterLabel(spine).isEmpty() ? "" : doc.chapterLabel(spine) + ", ") + "chapter " + (spine + 1);
            final String bookName = path.substring(path.lastIndexOf('/') + 1), title = doc.title(), author = doc.author();
            background(() -> {
                try {
                    String md = host.exists(notePath()) ? host.readText(notePath()) : Highlights.newNote(bookName, title, author);
                    host.write(notePath(), (md.replaceAll("\\n*$", "\n") + Highlights.block(quote, where)).getBytes(StandardCharsets.UTF_8));
                    post(() -> host.toast("Kept in the book's note"));
                } catch (Exception e) { post(() -> host.toast("Not kept: " + e.getMessage())); }
            });
        });
    }

    // ---- the page (the WebView's side) -----------------------------------------------------------------------------

    /** Serves the book's entries, the chapter with the reader's head in it; nothing from outside the book. */
    private final class Pages extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; } // links: the pager's click

        @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (!"book.local".equals(u.getHost()) || doc == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not in the book", null, new ByteArrayInputStream(new byte[0]));
            String entry = u.getPath() == null ? "" : u.getPath().replaceFirst("^/", "");
            try {
                if (!doc.has(entry)) return new WebResourceResponse("text/plain", "utf-8", 404, "Not in the book", null, new ByteArrayInputStream(new byte[0]));
                String type = doc.type(entry);
                if (doc.spine().contains(entry) && (type.contains("html") || type.contains("xml"))) {
                    byte[] page = chapter(Epub.text(doc.bytes(entry)), type).getBytes(StandardCharsets.UTF_8);
                    return new WebResourceResponse(type.contains("xhtml") || type.endsWith("+xml") ? "application/xhtml+xml" : "text/html", "utf-8", new ByteArrayInputStream(page));
                }
                return new WebResourceResponse(type, null, doc.open(entry));
            } catch (Exception e) {
                return new WebResourceResponse("text/plain", "utf-8", 500, "Unreadable", null, new ByteArrayInputStream(new byte[0]));
            }
        }
    }

    private static final Pattern SCRIPT = Pattern.compile("<script\\b[^>]*?(/>|>.*?</script\\s*>)", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern HEAD = Pattern.compile("<head\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTML = Pattern.compile("<html\\b[^>]*>", Pattern.CASE_INSENSITIVE);

    /** The chapter with its scripts out and the reader's head in (written as XML: most chapters are XHTML). */
    private String chapter(String html, String type) {
        html = SCRIPT.matcher(html).replaceAll("");
        boolean paged = Typeset.paged(options, eink);
        String head = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src https://book.local data: blob:; script-src 'nonce-" + nonce
            + "'; style-src https://book.local 'unsafe-inline'; img-src https://book.local data: blob:; font-src https://book.local data:\"/>"
            + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no\"/>"
            + "<style id=\"atlas-type\">/*<![CDATA[*/\n" + css + "\n/*]]>*/</style>"
            + "<script nonce=\"" + nonce + "\">//<![CDATA[\n" + marks() + "\nwindow.atlasPassages = " + passages + ";\n" + PAGER.replace("%PAGED%", String.valueOf(paged)) + "\n" + INK_JS + "\n//]]></script>";
        Matcher m = HEAD.matcher(html);
        if (m.find()) return html.substring(0, m.end()) + head + html.substring(m.end());
        m = HTML.matcher(html);
        if (m.find()) return html.substring(0, m.end()) + "<head>" + head + "</head>" + html.substring(m.end());
        return "<html><head>" + head + "</head><body>" + html + "</body></html>";
    }

    /** Marking passages: the web reader's own file (books/shared/marks.js), carried in the app. */
    private String marks;

    /** Read once, after the constructor has set `host` (a field initializer ran before it: a crash on every open). */
    private String marks() {
        if (marks == null) { String m = host().sharedFile("marks.js"); marks = m == null ? "" : m; }
        return marks;
    }

    /** The pager, in the chapter: pages as columns of the view's width, taps and swipes and links handed to the app. */
    private static final String PAGER = String.join("\n",
        "(function(){",
        "var P = %PAGED%;",
        "function W(){ return window.innerWidth; }",
        "function root(){ return document.documentElement; }",
        "function pages(){ return P ? Math.max(1, Math.round(root().scrollWidth / W())) : 1; }",
        "function page(){ return P ? Math.round(root().scrollLeft / W()) : 0; }",
        "window.atlasPager = {",
        "  go: function(n){ root().scrollLeft = n * W(); return page(); },",
        "  pages: pages,",
        "  toFrag: function(id){ var e = document.getElementById(id); if (!e) return -1; if (P) return Math.floor((e.getBoundingClientRect().left + root().scrollLeft) / W()); e.scrollIntoView(); return 0; },",
        "  scrollTo: function(f){ var r = root(); r.scrollTop = f * Math.max(0, r.scrollHeight - innerHeight); },",
        "  scrollBy: function(d){ var r = root(); if (d > 0 && r.scrollTop + innerHeight >= r.scrollHeight - 2) return 'next'; if (d < 0 && r.scrollTop <= 0) return 'prev'; r.scrollTop += d * innerHeight * 0.9; return 'ok'; },",
        "  fraction: function(){ var r = root(); return r.scrollHeight > innerHeight ? r.scrollTop / (r.scrollHeight - innerHeight) : 0; }",
        "};",
        // a footnote's mark (EPUB 3's noteref, DPUB's doc-noteref, or a short number / star in superscript): its text shown over the page
        "function isNote(a){ var t = (a.getAttribute('epub:type') || a.getAttribute('epub_type') || '') + ' ' + (a.getAttribute('role') || ''); if (/noteref/.test(t)) return true;",
        "  var s = (a.textContent || '').trim(); return /^[\\[(]?([0-9]{1,3}|[*\u2020\u2021]{1,3}|[a-z])[\\])]?$/i.test(s) && !!(a.closest('sup') || a.querySelector('sup') || /^[\\[(]/.test(s)); }",
        "function noteText(h){ var i = h.indexOf('#'); if (i < 0) return null; var f = h.slice(0, i); if (f && location.pathname.split('/').pop() !== f.split('/').pop()) return null;",
        "  var el = document.getElementById(decodeURIComponent(h.slice(i + 1))); if (!el) return null; var box = el.closest('aside, li, p, dd, div') || el;",
        "  return (box.textContent || '').replace(/\\s+/g, ' ').trim(); }",
        "function ready(){ try { if (window.atlasMarks && window.atlasPassages) atlasMarks.markPassages(document, atlasPassages); } catch (e) {} AtlasBook.ready(pages()); }",
        "window.addEventListener('load', function(){ (document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){ requestAnimationFrame(ready); }); });",
        "document.addEventListener('click', function(e){",
        "  var a = e.target.closest ? e.target.closest('a[href]') : null;",
        "  if (a) { e.preventDefault(); var h = a.getAttribute('href'); if (isNote(a)) AtlasBook.note(h, noteText(h) || ''); else AtlasBook.link(h); return; }",
        "  var s = window.getSelection(); if (s && String(s).length) return;",
        "  AtlasBook.tap(e.clientX / W(), e.clientY / innerHeight);",
        "}, true);",
        "var x0 = 0, y0 = 0, t0 = 0;",
        "document.addEventListener('touchstart', function(e){ var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); }, { passive: true });",
        "document.addEventListener('touchend', function(e){ var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;",
        "  if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - t0 < 800 && !String(window.getSelection())) AtlasBook.swipe(dx < 0 ? 1 : -1); }, { passive: true });",
        "if (!P) { var tm = 0; window.addEventListener('scroll', function(){ clearTimeout(tm); tm = setTimeout(function(){ AtlasBook.scrolled(window.atlasPager.fraction()); }, 300); }, { passive: true }); }",
        "})();");

    /** The pinned notes' side (EpubInk): a character's index `k` in the chapter's text (marks.js textMap) under a point,
     *  where characters are now (viewport CSS px: left, top, line height) with the text's em, the words around one. */
    private static final String INK_JS = String.join("\n",
        "window.atlasInk = {",
        "  at: function(x, y){ var r = document.caretRangeFromPoint(x, y); if (!r) return -1; var n = r.startContainer, o = r.startOffset;",
        "    if (n.nodeType !== 3) { var w = document.createTreeWalker(n.childNodes[o] || n, 4); var t = w.nextNode(); if (!t) return -1; n = t; o = 0; }",
        "    var m = atlasMarks.textMap(document), ni = m.nodes.indexOf(n); if (ni < 0) return -1;",
        "    for (var k = 0; k < m.at.length; k++) if (m.at[k][0] > ni || (m.at[k][0] === ni && m.at[k][1] >= o)) return k;",
        "    return m.at.length - 1; },",
        "  where: function(ks){ var m = atlasMarks.textMap(document), em = parseFloat(getComputedStyle(document.body).fontSize) || 16, out = [];",
        "    for (var i = 0; i < ks.length; i++) { var k = ks[i]; if (k < 0 || k >= m.at.length) { out.push(null); continue; }",
        "      var a = m.at[k], node = m.nodes[a[0]], r = document.createRange(); r.setStart(node, a[1]); r.setEnd(node, Math.min(a[1] + 1, node.data.length));",
        "      var b = r.getClientRects()[0] || r.getBoundingClientRect(); out.push([b.left, b.top, b.height || em]); }",
        "    return { em: em, at: out }; },",
        "  quote: function(k){ var t = atlasMarks.textMap(document).text, a = Math.max(0, t.lastIndexOf(' ', Math.max(0, k - 40)) + 1), b = t.indexOf(' ', Math.min(t.length, k + 60));",
        "    return t.slice(a, b < 0 ? t.length : b); }",
        "};");

    /** What the pager calls (on a WebView thread: each goes to the UI thread). */
    private final class Bridge {
        @JavascriptInterface public void ready(int n) { post(() -> laidOut(n)); }
        @JavascriptInterface public void tap(float x, float y) { post(() -> ReaderView.this.tap(x, y)); }
        @JavascriptInterface public void swipe(int dir) { post(() -> turn(dir)); }
        @JavascriptInterface public void link(String href) { post(() -> ReaderView.this.link(href)); }
        @JavascriptInterface public void note(String href, String text) { post(() -> footnote(href, text)); }
        @JavascriptInterface public void scrolled(double f) { post(() -> { scrolledAt = f; shown(); }); }
    }

    /** The chapter is laid out in `n` pages: to the page asked for, then shown. */
    private void laidOut(int n) {
        pages = Math.max(1, n);
        if (wantFind != null) { String q = wantFind; wantFind = null; showAt(0, Typeset.paged(options, eink)); post(() -> find(spine, q, wantNth)); return; }
        if (wantChar >= 0) { int k = wantChar; wantChar = -1; showAt(0, Typeset.paged(options, eink)); post(() -> goToChar(k)); return; }
        boolean paged = Typeset.paged(options, eink);
        if (!wantFrag.isEmpty()) {
            web.evaluateJavascript("atlasPager.toFrag(" + JSONObject.quote(wantFrag) + ")", r -> {
                int p = 0;
                try { p = Math.max(0, Integer.parseInt(r.trim())); } catch (Exception e) { /* the start */ }
                showAt(paged ? Math.min(p, pages - 1) : 0, paged);
            });
            return;
        }
        if (paged) showAt(wantAt < 0 ? pages - 1 : (int) Math.round(Math.max(0, Math.min(1, wantAt)) * (pages - 1)), true);
        else {
            scrolledAt = wantAt < 0 ? 1 : Math.max(0, Math.min(1, wantAt));
            web.evaluateJavascript("atlasPager.scrollTo(" + scrolledAt + ")", r -> showAt(0, false));
        }
    }

    private void showAt(int p, boolean paged) {
        page = p;
        if (paged) web.evaluateJavascript("atlasPager.go(" + p + ")", r -> reveal());
        else reveal();
    }

    private void reveal() {
        web.setVisibility(VISIBLE);
        if (eink) postDelayed(host::einkRefresh, 60);
        shown();
    }

    /** Work off the UI thread: the screen's reading thread, or its own once the screen has closed (the last save). */
    private void background(Runnable r) {
        try { screen.io.execute(r); } catch (java.util.concurrent.RejectedExecutionException e) { new Thread(r, "books").start(); }
    }

    // ---- the frame -------------------------------------------------------------------------------------------------

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        super.onSizeChanged(w, h, ow, oh);
        if (doc != null && ow > 0 && (w != ow || h != oh)) post(() -> { double at = fraction(); styled(); open(spine, at, ""); }); // turned: laid out again
    }

    @Override public boolean back() {
        if (bars.back()) return true;
        if (penBar.shown()) { penBar.show(false); return true; }
        return false;
    }

    @Override public boolean onKeyDown(int code, KeyEvent e) {
        boolean volume = options.optBoolean("volume_keys", true);
        if (volume && code == KeyEvent.KEYCODE_VOLUME_DOWN) { turn(1); return true; }
        if (volume && code == KeyEvent.KEYCODE_VOLUME_UP) { turn(-1); return true; }
        if (code == KeyEvent.KEYCODE_DPAD_RIGHT || code == KeyEvent.KEYCODE_PAGE_DOWN || code == KeyEvent.KEYCODE_SPACE) { turn(1); return true; }
        if (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_PAGE_UP) { turn(-1); return true; }
        return super.onKeyDown(code, e);
    }

    @Override protected void onDetachedFromWindow() {
        removeCallbacks(save);
        if (doc != null) save.run();
        final Doc d = doc;
        if (d != null) background(() -> { try { d.close(); } catch (Exception e) { /* closed */ } });
        web.destroy();
        super.onDetachedFromWindow();
    }

}
