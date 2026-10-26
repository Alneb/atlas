package org.atlas.plugins.manga;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.InkStore;
import org.atlas.capture.NativePlugin;
import org.atlas.capture.PageInk;
import org.atlas.capture.PenBar;
import org.atlas.capture.ReaderBars;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.concurrent.ExecutorService;

/** The reader, Mihon's: reading mode (right to left, left to right, vertical: a page at a time; webtoon: the pages one
 *  under the other), scale, tap zones (thirds: the sides turn, the middle shows the bars; inverted), the volume keys,
 *  background, page number, and on e-ink no animation and a full refresh every N pages (Host.einkRefresh). The bars
 *  (ReaderBars): the chapters from the top bar, at the bottom where you are, a page slider, the chapters before and
 *  after, Pen, Settings (the mode, kept per series). Pages come from Pages (fetched and decoded away from the UI, the
 *  next ones ahead); the next chapter is opened before its end. The pen writes on a page (PenBar, PageInk:
 *  a block per chapter in the series' note, InkStore.pictures); a pen tap is a tap. Plugin settings (plugin.toml) are the defaults,
 *  a series' `reader_options` override them. */
final class ReaderView extends FrameLayout implements NativePlugin.Back {
    private enum Mode { RTL, LTR, VERTICAL, WEBTOON }
    private enum Turn { PREV, NEXT, MENU, NONE }
    /** The settings' words for Mode, in its order. */
    private static final String[] MODES = { "right to left", "left to right", "vertical", "webtoon" };

    private final MangaScreen screen;
    private final Host host;
    private final Library.Series series;
    private final JSONObject reading, options;
    private final Mode mode;
    private final boolean fitWidth;
    private final Pages pages;
    private final ExecutorService opener = Pages.pool(1, "manga-chapter");
    private final Handler ui = new Handler(Looper.getMainLooper());
    /** What a page is decoded for: the screen's size (fit width, webtoon: its width only). Not the view's: it is 0
     *  until laid out, and a page asked for then came out 1 × 1 — blank. */
    private final int pageW, pageH, screenH;
    private final ImageView image;
    private final ScrollView scroller;        // fit width, and webtoon's column
    private final LinearLayout column;        // webtoon: the pages one under the other
    private final TextView pageNumber, status;
    private final ReaderBars bars;
    private PenBar penBar; // made after the tabs that open it
    private final View chaptersButton, settingsTab;
    private final PageInk ink;
    private Chapter chapter, following;
    private int index, page, turns, opening, followingFor = -1;
    private boolean followingAsked, closed;

    ReaderView(MangaScreen screen, Library.Series series, JSONObject reading, int chapterIndex, int startPage) {
        super(screen.getContext());
        Context c = getContext();
        this.screen = screen;
        this.host = screen.host;
        this.series = series;
        this.reading = reading;
        JSONObject o = new JSONObject();
        merge(o, host.settings());
        merge(o, reading.optJSONObject("options")); // a series' own, as in Mihon
        options = o;
        String m = o.optString("mode", MODES[0]);
        mode = m.equals(MODES[1]) ? Mode.LTR : m.equals(MODES[2]) ? Mode.VERTICAL : m.equals(MODES[3]) ? Mode.WEBTOON : Mode.RTL;
        fitWidth = mode == Mode.WEBTOON || o.optString("scale", "fit screen").equals("fit width");
        pages = new Pages(host);
        android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
        pageW = dm.widthPixels;
        screenH = dm.heightPixels;
        pageH = fitWidth ? Pages.ANY : screenH;
        String bg = o.optString("background", "automatic");
        int back = bg.equals("white") ? Color.WHITE : bg.equals("grey") ? 0xff7f7f7f : bg.equals("black") ? Color.BLACK : host.eink() ? Color.WHITE : Color.BLACK;
        int ink2 = back == Color.BLACK ? 0xffdddddd : 0xff222222;
        setBackgroundColor(back);
        setFocusable(true);
        setFocusableInTouchMode(true);

        image = new ImageView(c);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setAdjustViewBounds(true);
        scroller = new ScrollView(c);
        scroller.setFillViewport(true);
        column = new LinearLayout(c);
        column.setOrientation(LinearLayout.VERTICAL);
        if (mode == Mode.WEBTOON) {
            scroller.addView(column, new LayoutParams(-1, -2));
            addView(scroller, new LayoutParams(-1, -1));
            scroller.setOnScrollChangeListener((v, x, y, ox, oy) -> webtoonScrolled(y));
        } else if (fitWidth) {
            scroller.addView(image, new LayoutParams(-1, -2));
            addView(scroller, new LayoutParams(-1, -1));
        } else {
            addView(image, new LayoutParams(-1, -1));
        }
        ink = host.pageInk(image, (x, y) -> act(zone(x / getWidth(), y / getHeight())));
        addView(ink, new LayoutParams(-1, -1));
        if (fitWidth && mode != Mode.WEBTOON) scroller.setOnScrollChangeListener((v, x, y, ox, oy) -> { ink.invalidate(); ink.area(); });

        // what is happening while there is no page: loading it, or why it cannot be shown
        status = host.look().label(c, "", 15, ink2);
        status.setGravity(Gravity.CENTER);
        status.setPadding(host.look().dp(32), 0, host.look().dp(32), 0);
        status.setVisibility(GONE);
        addView(status, new LayoutParams(-1, -2, Gravity.CENTER));

        pageNumber = host.look().label(c, "", 12, ink2);
        pageNumber.setGravity(Gravity.CENTER);
        pageNumber.setVisibility(o.optBoolean("page_number", true) ? VISIBLE : GONE);
        addView(pageNumber, new LayoutParams(-1, -2, Gravity.BOTTOM));

        bars = new ReaderBars(host, this, () -> host.activity().onBackPressed());
        bars.title(series.title);
        bars.slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar s, int p, boolean user) { if (user && chapter != null) pageNumber.setText((p + 1) + " / " + chapter.size()); }
            public void onStartTrackingTouch(SeekBar s) {}
            public void onStopTrackingTouch(SeekBar s) { go(s.getProgress()); } // the page let go on, not each one passed
        });
        if (mode == Mode.RTL) bars.slider.setRotationY(180); // a manga's pages run from the right (progress stays the page)
        chaptersButton = bars.action("contents", "Chapters", this::chaptersPanel);
        bars.tab("back", "Previous chapter", () -> openChapter(index - 1, 0));
        if (mode != Mode.WEBTOON) bars.tab("pen", "Pen", () -> { bars.show(false); penBar.show(true); });
        if (mode != Mode.WEBTOON) bars.tab("eraser", "Clear page", () -> { ink.clearPage(); bars.show(false); });
        settingsTab = bars.tab("settings", "Settings", this::settingsPanel);
        bars.tab("chevron", "Next chapter", () -> openChapter(index + 1, 0));
        penBar = new PenBar(host, this, ink);

        openChapter(chapterIndex, startPage);
    }

    private static void merge(JSONObject into, JSONObject from) {
        if (from == null) return;
        for (Iterator<String> k = from.keys(); k.hasNext(); ) { String key = k.next(); try { into.put(key, from.get(key)); } catch (Exception e) { /* skip */ } }
    }

    /** The middle of the screen says what is happening (null: nothing, the page is there). */
    private void say(String s) {
        status.setText(s == null ? "" : s);
        status.setVisibility(s == null ? GONE : VISIBLE);
    }

    private static String why(Throwable e) { return e.getMessage() == null ? e.toString() : e.getMessage(); }

    // ---- chapters ----

    /** Chapter `i` at page `start` (MAX_VALUE: its last): the one opened ahead, or opened now away from the UI (a .cbz
     *  is read, a server's chapter asks for its pages). */
    private void openChapter(int i, int start) {
        if (i < 0 || i >= series.chapters.size()) { host.toast(i < 0 ? "This is the first chapter." : "That was the last chapter."); return; }
        if (bars.shown()) bars.show(false);
        if (following != null && followingFor == i) { Chapter c = following; following = null; opened(i, start, c); return; }
        String path = series.chapters.get(i);
        int gen = ++opening;
        image.setImageDrawable(null);
        column.removeAllViews();
        say("Opening " + Chapter.titleOf(path) + "…");
        Pages.run(opener, () -> {
            try {
                Chapter c = new Chapter(host, path);
                ui.post(() -> { if (gen == opening && !closed) opened(i, start, c); else c.close(); });
            } catch (Exception e) { ui.post(() -> { if (gen == opening) say("Cannot open " + Chapter.titleOf(path) + ": " + why(e)); }); }
        });
    }

    private void opened(int i, int start, Chapter c) {
        if (chapter != null && chapter != c) chapter.close();
        if (following != null) { following.close(); following = null; } // opened ahead for another place
        followingFor = -1;
        followingAsked = false;
        pages.ahead(null);
        chapter = c;
        index = i;
        // the chapter's ink (read away from the UI by PageInk), in the series' note as a PDF's is in its own; none in
        // webtoon, none for a server's chapter (no vault file it belongs to)
        ink.open(mode == Mode.WEBTOON || Suwayomi.is(c.path) ? null : InkStore.pictures(host, c.path));
        bars.where(c.title);
        bars.slider.setMax(Math.max(0, c.size() - 1));
        if (c.size() == 0) { say(c.title + " has no pages."); return; }
        say(null);
        int p = Math.max(0, Math.min(start, c.size() - 1));
        if (mode == Mode.WEBTOON) webtoon(p); else show(p);
    }

    /** Near the end of a chapter the next one is opened and its first pages fetched: going on costs no wait. */
    private void follow() {
        if (followingAsked || index + 1 >= series.chapters.size()) return;
        followingAsked = true;
        final int i = index + 1;
        final Chapter of = chapter;
        String path = series.chapters.get(i);
        Pages.run(opener, () -> {
            try {
                Chapter c = new Chapter(host, path);
                ui.post(() -> {
                    if (closed || chapter != of) { c.close(); return; }
                    following = c;
                    followingFor = i;
                    pages.ahead(c);
                    pages.load(c, 0, pageW, pageH, null);
                    pages.load(c, 1, pageW, pageH, null);
                });
            } catch (Exception e) { /* opened when it is reached, and said then */ }
        });
    }

    // ---- a page at a time ----

    /** Page `p` on screen (from memory at once, else "loading" until it comes), the next three and the one before
     *  asked for behind it. */
    private void show(int p) {
        page = p;
        pages.focus(chapter, p);
        where(p);
        Library.mark(host, series, chapter.path, p, chapter.size());
        int flash = options.optInt("flash_every", 1);
        boolean flashNow = host.eink() && flash > 0 && ++turns % flash == 0;
        ink.page(p + 1);
        final Chapter ch = chapter;
        if (pages.cached(ch, p, pageW, pageH) == null) { image.setImageDrawable(null); say("Page " + (p + 1) + " of " + ch.size() + "…"); }
        pages.load(ch, p, pageW, pageH, g -> {
            if (ch != chapter || page != p) return;
            if (g.bitmap != null) {
                say(null);
                image.setImageBitmap(g.bitmap);
                scroller.scrollTo(0, 0);
                ink.post(() -> ink.page(p + 1));
                if (flashNow) ui.postDelayed(host::einkRefresh, 60); // after the page is drawn
            } else if (g.error != null) say("Page " + (p + 1) + ": " + g.error + "\n(turn back to it to try again)");
        });
        for (int k = p + 1; k <= p + 3; k++) pages.load(ch, k, pageW, pageH, null);
        pages.load(ch, p - 1, pageW, pageH, null);
        if (p >= ch.size() - 3) follow();
    }

    /** Where you are, on the bars and the page number. */
    private void where(int p) {
        int n = chapter.size();
        bars.slider.setProgress(p);
        pageNumber.setText((p + 1) + " / " + n);
        bars.info(chapter.title, "page " + (p + 1) + " / " + n + " · chapter " + (index + 1) + " / " + series.chapters.size());
        image.setContentDescription("Page " + (p + 1) + " of " + n); // what TalkBack says of the page
    }

    /** The slider let go on page `p`. */
    private void go(int p) {
        if (chapter == null || p < 0 || p >= chapter.size()) return;
        if (mode != Mode.WEBTOON) { show(p); return; }
        View v = column.getChildAt(p);
        if (v != null) scroller.scrollTo(0, v.getTop());
    }

    private void turn(boolean forward) {
        if (chapter == null) return;
        if (mode == Mode.WEBTOON) {
            if (!scroller.canScrollVertically(forward ? 1 : -1)) { // the chapter's end (or start): on to the next
                if (forward) openChapter(index + 1, 0); else if (index > 0) openChapter(index - 1, Integer.MAX_VALUE);
                return;
            }
            int dy = (forward ? 1 : -1) * getHeight() * 9 / 10;
            if (host.eink()) scroller.scrollBy(0, dy); else scroller.smoothScrollBy(0, dy); // no animation on e-ink
            return;
        }
        int p = page + (forward ? 1 : -1);
        if (p >= chapter.size()) openChapter(index + 1, 0);
        else if (p < 0) { if (index > 0) openChapter(index - 1, Integer.MAX_VALUE); }
        else show(p);
    }

    // ---- webtoon: the pages one under the other ----

    /** A place per page (a screen tall until its picture comes), the reading put on page `start`. */
    private void webtoon(int start) {
        column.removeAllViews();
        for (int p = 0; p < chapter.size(); p++) {
            ImageView v = new ImageView(getContext());
            v.setAdjustViewBounds(true);
            v.setScaleType(ImageView.ScaleType.FIT_CENTER);
            v.setMinimumHeight(screenH);
            v.setContentDescription("Page " + (p + 1) + " of " + chapter.size());
            column.addView(v, new LinearLayout.LayoutParams(-1, -2));
        }
        page = -1;
        final Chapter ch = chapter;
        column.post(() -> { if (ch != chapter) return; scroller.scrollTo(0, column.getChildAt(start).getTop()); seen(start); });
    }

    private void webtoonScrolled(int y) {
        int n = column.getChildCount();
        if (n == 0 || chapter == null) return;
        int mid = y + getHeight() / 2, at = 0;
        for (int i = 0; i < n; i++) { if (column.getChildAt(i).getTop() <= mid) at = i; else break; }
        if (at != page) seen(at);
    }

    /** Page `p` is the one read: it and its neighbours filled, pages far from it let go (17 MB each), their height
     *  kept so nothing moves. */
    private void seen(int p) {
        page = p;
        pages.focus(chapter, p);
        where(p);
        Library.mark(host, series, chapter.path, p, chapter.size());
        final Chapter ch = chapter;
        for (int k = 0; k < column.getChildCount(); k++) {
            ImageView v = (ImageView) column.getChildAt(k);
            if (k >= p - 1 && k <= p + 3) { if (v.getDrawable() == null) fill(ch, k, v); }
            else if (Math.abs(k - p) > 5 && v.getDrawable() != null) { v.setMinimumHeight(v.getHeight()); v.setImageDrawable(null); }
        }
        if (p >= ch.size() - 3) follow();
    }

    private void fill(Chapter ch, int k, ImageView v) {
        pages.load(ch, k, pageW, Pages.ANY, g -> {
            if (ch != chapter) return;
            if (g.bitmap == null) { if (g.error != null && k == page) host.toast("Page " + (k + 1) + ": " + g.error); return; }
            boolean above = v.getBottom() <= scroller.getScrollY();
            int was = v.getHeight();
            v.setMinimumHeight(0);
            v.setImageBitmap(g.bitmap);
            if (above) v.post(() -> scroller.scrollBy(0, v.getHeight() - was)); // a page above changed height: the one read stays put
        });
    }

    // ---- taps and keys ----

    private float downX, downY;

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        if (bars.dispatch(e) || penBar.over(e.getX(), e.getY())) return super.dispatchTouchEvent(e);
        if (mode != Mode.WEBTOON && ink.take(e)) return true; // the pen writes, a palm does nothing (a pen tap comes back as a tap)
        if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { downX = e.getX(); downY = e.getY(); }
        if (e.getActionMasked() == MotionEvent.ACTION_UP && Math.hypot(e.getX() - downX, e.getY() - downY) < host.look().dp(12)) {
            act(zone(e.getX() / getWidth(), e.getY() / getHeight()));
            return true;
        }
        if (e.getActionMasked() == MotionEvent.ACTION_UP && swiped(e.getX() - downX, e.getY() - downY)) return true;
        return super.dispatchTouchEvent(e);
    }

    /** A swipe turns the page as a finger expects:
     *  sideways in the paged modes (towards the left goes on; right to left the other way), up / down in vertical;
     *  webtoon scrolls by itself. A drag that is mostly the other way is left to the scroller (a fit-width page). */
    private boolean swiped(float dx, float dy) {
        if (chapter == null || mode == Mode.WEBTOON || bars.shown()) return false;
        float min = host.look().dp(56);
        boolean vertical = mode == Mode.VERTICAL;
        float along = vertical ? dy : dx, across = vertical ? dx : dy;
        if (Math.abs(along) < min || Math.abs(along) < 2 * Math.abs(across)) return false;
        if (vertical && fitWidth && scroller.canScrollVertically(along < 0 ? 1 : -1)) return false; // still the page's own scroll
        boolean forward = along < 0;
        if (mode == Mode.RTL) forward = !forward;
        turn(forward);
        return true;
    }

    private void act(Turn t) {
        if (t == Turn.MENU) { bars.show(!bars.shown()); if (host.eink()) post(host::einkRefresh); return; }
        if (bars.shown()) { bars.show(false); return; }
        if (t == Turn.NONE) return;
        // right to left: the left side of the screen goes on, as in a manga
        boolean forward = t == Turn.NEXT;
        if (mode == Mode.RTL) forward = !forward;
        turn(forward);
    }

    /** Mihon's tap zones; x and y from 0 to 1. NEXT / PREV are for left to right (act() flips them for right to left). */
    private Turn zone(float x, float y) {
        String kind = options.optString("taps", "default");
        boolean invert = options.optBoolean("invert_taps", false);
        Turn t;
        switch (kind) {
            case "off": t = (x > 0.33f && x < 0.66f && y > 0.33f && y < 0.66f) ? Turn.MENU : Turn.NONE; break;
            case "Kindle": t = x < 0.33f ? Turn.PREV : (x < 0.66f && y < 0.33f) ? Turn.MENU : Turn.NEXT; break;
            case "edge": t = x < 0.15f || x > 0.85f ? Turn.NEXT : (y > 0.33f && y < 0.66f ? Turn.MENU : Turn.PREV); break;
            case "right and left": t = x < 0.4f ? Turn.PREV : x > 0.6f ? Turn.NEXT : Turn.MENU; break;
            case "L-shaped": t = (x < 0.33f && y < 0.66f) || (y < 0.33f && x < 0.66f) ? Turn.PREV : (x > 0.33f && x < 0.66f && y > 0.33f && y < 0.66f) ? Turn.MENU : Turn.NEXT; break;
            default: t = x < 0.33f ? Turn.PREV : x > 0.66f ? Turn.NEXT : Turn.MENU;
        }
        if ((mode == Mode.VERTICAL || mode == Mode.WEBTOON) && kind.equals("default")) t = y < 0.33f ? Turn.PREV : y > 0.66f ? Turn.NEXT : Turn.MENU;
        if (invert && t != Turn.MENU && t != Turn.NONE) t = t == Turn.NEXT ? Turn.PREV : Turn.NEXT;
        return t;
    }

    // ---- panels ----

    /** The chapters, this one marked, each with where you are in it; a tap opens one there. */
    private void chaptersPanel() {
        LinearLayout l = bars.column();
        View here = null;
        for (int i = 0; i < series.chapters.size(); i++) {
            final int k = i;
            String ch = series.chapters.get(i);
            boolean read = Library.isRead(reading, ch);
            int at = Library.pageOf(reading, ch);
            View r = bars.row(Chapter.titleOf(ch), read ? "read" : at > 0 ? "page " + (at + 1) : null, i == index, 0,
                () -> { bars.show(false); openChapter(k, read ? 0 : at); });
            if (read && i != index) r.setAlpha(0.55f); // read ones quiet, as in Mihon
            l.addView(r);
            if (i == index) here = r;
        }
        bars.panel(chaptersButton, "Chapters", l);
        final View mark = here;
        if (mark != null && bars.panelScroll() != null) bars.panelScroll().post(() -> bars.panelScroll().scrollTo(0, Math.max(0, mark.getTop() - host.look().dp(120))));
    }

    /** Mihon's reader settings: the mode and scale (the reader made again at this page), taps, keys, e-ink refresh. */
    private void settingsPanel() {
        LinearLayout l = bars.column();
        int m = mode.ordinal();
        l.addView(bars.segments("Reading mode", new String[] { "Right to left", "Left to right", "Vertical", "Webtoon" }, m,
            k -> { if (k != m) { setOption("mode", MODES[k]); again(); } }));
        if (mode != Mode.WEBTOON) l.addView(bars.segments("Scale", new String[] { "Fit screen", "Fit width" }, fitWidth ? 1 : 0,
            k -> { if ((k == 1) != fitWidth) { setOption("scale", k == 1 ? "fit width" : "fit screen"); again(); } }));
        l.addView(bars.segments("Taps on the sides", new String[] { "As you read", "Inverted" }, options.optBoolean("invert_taps", false) ? 1 : 0,
            k -> { setOption("invert_taps", k == 1); settingsPanel(); }));
        l.addView(bars.segments("Volume keys", new String[] { "Turn pages", "Volume" }, options.optBoolean("volume_keys", true) ? 0 : 1,
            k -> { setOption("volume_keys", k == 0); settingsPanel(); }));
        if (host.eink()) {
            int[] every = { 1, 3, 6, 0 };
            int now = options.optInt("flash_every", 1), at = 0;
            for (int i = 0; i < every.length; i++) if (every[i] == now) at = i;
            l.addView(bars.segments("Full refresh", new String[] { "Every page", "3", "6", "Never" }, at, k -> { setOption("flash_every", every[k]); settingsPanel(); }));
        }
        bars.closePanel();
        bars.panel(settingsTab, "Settings", l);
    }

    /** A reader option for this series: in its note (`reader_options`); a server's series has none, so there it is the
     *  plugin's setting, for every one. Kept in memory at once (the reader made again reads it). */
    private void setOption(String key, Object v) {
        try {
            options.put(key, v);
            JSONObject own = reading.optJSONObject("options");
            if (own == null) { own = new JSONObject(); reading.put("options", own); }
            own.put(key, v);
            if (series.remote == 0) { Library.setOptions(host, series, new JSONObject(own.toString())); return; }
        } catch (Exception e) { return; }
        Pages.run(opener, () -> {
            String said;
            try { said = host.saveSettings(new JSONObject().put(key, v)); } catch (Exception e) { said = why(e); }
            if (said != null) host.toast("Not saved: " + said);
        });
    }

    /** The reader made again in the new mode, at this chapter and page. */
    private void again() {
        bars.show(false);
        screen.read(index, Math.max(0, page));
    }

    @Override public boolean back() {
        if (bars.back()) return true;
        if (penBar.shown()) { penBar.show(false); return true; }
        return false;
    }

    @Override
    protected void onAttachedToWindow() { super.onAttachedToWindow(); requestFocus(); }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        boolean volume = options.optBoolean("volume_keys", true);
        if (volume && code == KeyEvent.KEYCODE_VOLUME_DOWN) { turn(true); return true; }
        if (volume && code == KeyEvent.KEYCODE_VOLUME_UP) { turn(false); return true; }
        if (code == KeyEvent.KEYCODE_DPAD_RIGHT || code == KeyEvent.KEYCODE_PAGE_DOWN || code == KeyEvent.KEYCODE_SPACE) { turn(mode != Mode.RTL || code != KeyEvent.KEYCODE_DPAD_RIGHT); return true; }
        if (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_PAGE_UP) { turn(mode == Mode.RTL && code == KeyEvent.KEYCODE_DPAD_LEFT); return true; }
        return super.onKeyDown(code, e);
    }

    @Override
    public boolean onKeyUp(int code, KeyEvent e) {
        // the volume keys' release too, or Android changes the volume
        if (options.optBoolean("volume_keys", true) && (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP)) return true;
        return super.onKeyUp(code, e);
    }

    @Override
    protected void onDetachedFromWindow() {
        closed = true;
        pages.close();
        opener.shutdownNow();
        if (chapter != null) chapter.close();
        if (following != null) following.close();
        super.onDetachedFromWindow();
    }
}
