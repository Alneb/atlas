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
 *  next ones ahead the way you read: Prefetch); a page still on its way shows a spinner and how far its download has
 *  come; the next chapter is opened Prefetch.AHEAD pages before its end, its first pages fetched behind. Between two
 *  chapters the transition page (Transition), which a turn crosses only once it has been seen (Transition.mayCross). The pen writes on a page (PenBar, PageInk:
 *  a block per chapter in the series' note, InkStore.pictures); a pen tap is a tap. Plugin settings (plugin.toml) are the defaults,
 *  a series' `reader_options` override them. */
final class ReaderView extends FrameLayout implements NativePlugin.Back {
    /** Between two chapters (the transition page): after the last page, before the first; NONE: a page is shown. */
    private enum Edge { NONE, END, START }
    /** Who a touch belongs to, decided when the finger comes down: the page (gestures), the bars and panels, the pen. */
    private enum Route { PAGE, CHILD, INK }
    /** The settings' words for Mode, in its order. */
    private static final String[] MODES = { "right to left", "left to right", "vertical", "webtoon" };

    private final MangaScreen screen;
    private final Host host;
    private final Library.Series series;
    private final JSONObject reading, options;
    private final Gestures.Layout mode;
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
    private final TextView pageNumber, status, percent;
    /** A page on its way: a spinner (none on e-ink, where it would only ghost) and how far it has come. */
    private final LinearLayout loading;
    private final android.widget.ProgressBar spinner;
    private final ReaderBars bars;
    private PenBar penBar; // made after the tabs that open it
    private final View chaptersButton, settingsTab;
    private final PageInk ink;
    /** The page between chapters, and the end of a webtoon chapter's column (the same words). */
    private final LinearLayout transition;
    private Edge edge = Edge.NONE;
    /** When the transition page came on screen (Transition.mayCross). */
    private long edgeAt;
    /** The last turn went on (false: back): the pages fetched ahead are the ones that way (Prefetch). */
    private boolean forward = true;
    /** The gestures (Gestures: pure), the double tap, and the zoom of a page in fit screen (Zoom: pure). */
    private final Gestures.Touch touch;
    private final Gestures.Taps taps;
    private final Zoom zoom = new Zoom();
    /** Pinch zoom and double tap: only a page at a time fitted to the screen (fit width scrolls, webtoon is a column). */
    private final boolean zoomable;
    private Route route = Route.PAGE;
    /** The touch also goes to the scroller under (fit width, webtoon) until a swipe or a pinch takes it. */
    private boolean forwarding;
    private float lastX, lastY, pinchSpan, pinchX, pinchY;
    private Gestures.Zone held = Gestures.Zone.NONE;
    private final Runnable fireHeld; // the held tap, acted on when no second one came (made once taps is)
    /** Fit width: the page just turned back to opens at its bottom (you were reading upwards). */
    private boolean atBottom;
    private final int transitionInk;
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
        mode = m.equals(MODES[1]) ? Gestures.Layout.LTR : m.equals(MODES[2]) ? Gestures.Layout.VERTICAL : m.equals(MODES[3]) ? Gestures.Layout.WEBTOON : Gestures.Layout.RTL;
        fitWidth = mode == Gestures.Layout.WEBTOON || o.optString("scale", "fit screen").equals("fit width");
        zoomable = !fitWidth;
        float dp = getResources().getDisplayMetrics().density;
        touch = new Gestures.Touch(mode, 10 * dp, 56 * dp, 0.6f * dp);
        taps = new Gestures.Taps(280, 48 * dp);
        fireHeld = () -> { if (taps.fire()) act(held); };
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
        // fit screen: the page placed by its own matrix (Zoom), which the ink over it reads too; fit width: the scroller's
        image.setScaleType(zoomable ? ImageView.ScaleType.MATRIX : ImageView.ScaleType.FIT_CENTER);
        image.setAdjustViewBounds(!zoomable);
        scroller = new ScrollView(c);
        scroller.setFillViewport(true);
        column = new LinearLayout(c);
        column.setOrientation(LinearLayout.VERTICAL);
        if (mode == Gestures.Layout.WEBTOON) {
            scroller.addView(column, new LayoutParams(-1, -2));
            addView(scroller, new LayoutParams(-1, -1));
            scroller.setOnScrollChangeListener((v, x, y, ox, oy) -> webtoonScrolled(y));
        } else if (fitWidth) {
            scroller.addView(image, new LayoutParams(-1, -2));
            addView(scroller, new LayoutParams(-1, -1));
        } else {
            addView(image, new LayoutParams(-1, -1));
        }
        ink = host.pageInk(image, (x, y) -> act(zone(x / getWidth(), y / getHeight()))); // a pen tap: a tap, at once
        addView(ink, new LayoutParams(-1, -1));
        if (fitWidth && mode != Gestures.Layout.WEBTOON) scroller.setOnScrollChangeListener((v, x, y, ox, oy) -> { ink.invalidate(); ink.area(); });

        // what is happening while there is no page: loading it, or why it cannot be shown
        status = host.look().label(c, "", 15, ink2);
        status.setGravity(Gravity.CENTER);
        status.setPadding(host.look().dp(32), 0, host.look().dp(32), 0);
        status.setVisibility(GONE);
        addView(status, new LayoutParams(-1, -2, Gravity.CENTER));

        loading = new LinearLayout(c);
        loading.setOrientation(LinearLayout.VERTICAL);
        loading.setGravity(Gravity.CENTER);
        spinner = new android.widget.ProgressBar(c);
        spinner.setIndeterminate(true);
        if (spinner.getIndeterminateDrawable() != null) spinner.getIndeterminateDrawable().setTint(ink2);
        spinner.setVisibility(host.eink() ? GONE : VISIBLE);
        loading.addView(spinner, new LinearLayout.LayoutParams(host.look().dp(44), host.look().dp(44)));
        percent = host.look().label(c, "", 13, ink2);
        percent.setGravity(Gravity.CENTER);
        percent.setPadding(0, host.look().dp(10), 0, 0);
        loading.addView(percent, new LinearLayout.LayoutParams(-2, -2));
        loading.setVisibility(GONE);
        addView(loading, new LayoutParams(-2, -2, Gravity.CENTER));
        // the page waited for says how far its download has come
        pages.onProgress((path, p, pct) -> { if (chapter != null && chapter.path.equals(path) && p == page && loading.getVisibility() == VISIBLE) percent.setText(pct < 0 ? "" : pct + " %"); });

        transition = new LinearLayout(c);
        transition.setOrientation(LinearLayout.VERTICAL);
        transition.setGravity(Gravity.CENTER);
        transition.setPadding(host.look().dp(32), host.look().dp(48), host.look().dp(32), host.look().dp(48));
        transition.setVisibility(GONE);
        transitionInk = ink2;
        addView(transition, new LayoutParams(-1, -1));

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
        if (mode == Gestures.Layout.RTL) bars.slider.setRotationY(180); // a manga's pages run from the right (progress stays the page)
        chaptersButton = bars.action("contents", "Chapters", this::chaptersPanel);
        bars.tab("back", "Previous chapter", () -> openChapter(index - 1, 0));
        if (mode != Gestures.Layout.WEBTOON) bars.tab("pen", "Pen", () -> { bars.show(false); penBar.show(true); });
        if (mode != Gestures.Layout.WEBTOON) bars.tab("eraser", "Clear page", () -> { ink.clearPage(); bars.show(false); });
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
        waiting(null);
        status.setText(s == null ? "" : s);
        status.setVisibility(s == null ? GONE : VISIBLE);
    }

    /** The spinner (on e-ink its words alone) with `label` under it — a page's percentage follows as its download
     *  says — or, null, none. */
    private void waiting(String label) {
        if (label != null) { status.setVisibility(GONE); percent.setText(label.isEmpty() && host.eink() ? "…" : label); }
        loading.setVisibility(label != null ? VISIBLE : GONE);
    }

    private static String why(Throwable e) { return e.getMessage() == null ? e.toString() : e.getMessage(); }

    // ---- chapters ----

    /** Chapter `i` at page `start` (MAX_VALUE: its last): the one opened ahead, or opened now away from the UI (a .cbz
     *  is read, a server's chapter asks for its pages). */
    private void openChapter(int i, int start) {
        if (i < 0 || i >= series.chapters.size()) return; // the transition page says so
        if (bars.shown()) bars.show(false);
        if (following != null && followingFor == i) { Chapter c = following; following = null; opened(i, start, c); return; }
        String path = series.chapters.get(i);
        int gen = ++opening;
        image.setImageDrawable(null);
        column.removeAllViews();
        leaveEdge();
        waiting("Opening " + Chapter.titleOf(path));
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
        ink.open(mode == Gestures.Layout.WEBTOON || Suwayomi.is(c.path) ? null : InkStore.pictures(host, c.path));
        leaveEdge();
        bars.where(c.title);
        bars.slider.setMax(Math.max(0, c.size() - 1));
        if (c.size() == 0) { say(c.title + " has no pages."); return; }
        say(null);
        int p = Math.max(0, Math.min(start, c.size() - 1));
        atBottom = false;
        if (mode == Gestures.Layout.WEBTOON) webtoon(p); else show(p);
    }

    /** Near the end of a chapter (Prefetch.nearEnd) the next one is opened and its first pages fetched: going on costs
     *  no wait. */
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
                    for (int k = 0; k < Prefetch.NEXT; k++) pages.load(c, k, pageW, mode == Gestures.Layout.WEBTOON ? Pages.ANY : pageH, null);
                });
            } catch (Exception e) { /* opened when it is reached, and said then */ }
        });
    }

    // ---- a page at a time ----

    /** Page `p` on screen (from memory at once, else the spinner until it comes), the pages around it asked for
     *  behind it, soonest first (Prefetch.around). */
    private void show(int p) {
        page = p;
        pages.focus(chapter, p, forward);
        where(p);
        markAt(p);
        int flash = options.optInt("flash_every", 1);
        boolean flashNow = host.eink() && flash > 0 && ++turns % flash == 0;
        ink.page(p + 1);
        final Chapter ch = chapter;
        zoom.reset(); // a turn while zoomed shows the next page whole
        if (pages.cached(ch, p, pageW, pageH) == null) { image.setImageDrawable(null); waiting(""); }
        pages.load(ch, p, pageW, pageH, g -> {
            if (ch != chapter || page != p) return;
            if (g.bitmap != null) {
                say(null);
                image.setImageBitmap(g.bitmap);
                fitPage();
                boolean bottom = atBottom;
                atBottom = false;
                if (bottom) scroller.post(() -> scroller.scrollTo(0, Math.max(0, image.getHeight() - scroller.getHeight())));
                else scroller.scrollTo(0, 0);
                ink.post(() -> ink.page(p + 1));
                if (flashNow) ui.postDelayed(host::einkRefresh, 60); // after the page is drawn
            } else if (g.error != null) say("Page " + (p + 1) + ": " + g.error + "\n(turn back to it to try again)");
        });
        for (int k : Prefetch.around(p, ch.size(), forward)) pages.load(ch, k, pageW, pageH, null);
        if (Prefetch.nearEnd(p, ch.size())) follow();
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
        forward = p >= page;
        if (mode != Gestures.Layout.WEBTOON) { show(p); return; }
        View v = column.getChildAt(p);
        if (v != null) scroller.scrollTo(0, v.getTop());
    }

    /** One step in reading order, by a tap or a key: fit width scrolls the page first (Gestures.fitWidth). */
    private void go(Gestures.Step s) {
        if (s == Gestures.Step.NONE || chapter == null) return;
        boolean on = s == Gestures.Step.ON;
        if (fitWidth && mode != Gestures.Layout.WEBTOON && edge == Edge.NONE
                && Gestures.fitWidth(s, scroller.canScrollVertically(1), scroller.canScrollVertically(-1)) == Gestures.Move.SCROLL) {
            int dy = (on ? 1 : -1) * getHeight() * 9 / 10;
            if (host.eink()) scroller.scrollBy(0, dy); else scroller.smoothScrollBy(0, dy);
            return;
        }
        slideTurn(on, 0);
    }

    /** The page on screen now: what slides when it turns. */
    private View shown() { return edge != Edge.NONE ? transition : fitWidth ? scroller : image; }

    /** A turn with the page sliding out the way the finger went and the next one in (sideways and vertical paged
     *  modes; none on e-ink, where an animation is only ghosting). `from`: where the finger left the page. */
    private void slideTurn(boolean forward, float from) {
        if (host.eink() || mode == Gestures.Layout.WEBTOON) { turn(forward); return; }
        boolean sideways = mode.sideways();
        // where the page goes: forward in left to right is to the left; right to left, to the right; vertical, up
        int sign = sideways ? (forward == (mode == Gestures.Layout.RTL) ? 1 : -1) : (forward ? -1 : 1);
        float far = sign * (sideways ? getWidth() : getHeight());
        View out = shown();
        if (sideways) out.setTranslationX(from); else out.setTranslationY(from);
        out.animate().cancel();
        (sideways ? out.animate().translationX(far) : out.animate().translationY(far)).setDuration(110).withEndAction(() -> {
            out.setTranslationX(0); out.setTranslationY(0);
            turn(forward);
            View in = shown();
            if (sideways) in.setTranslationX(-far * 0.35f); else in.setTranslationY(-far * 0.35f);
            (sideways ? in.animate().translationX(0) : in.animate().translationY(0)).setDuration(140).start();
        }).start();
    }

    /** A swipe let go too short: the page back in its place. */
    private void settle() {
        View v = shown();
        if (v.getTranslationX() == 0 && v.getTranslationY() == 0) return;
        if (host.eink()) { v.setTranslationX(0); v.setTranslationY(0); return; }
        v.animate().translationX(0).translationY(0).setDuration(120).start();
    }

    /** One page on or back; past a chapter's end the transition page (Mihon's), and one more turn the next chapter at
     *  its first page (back: the previous one at its last). */
    private void turn(boolean forward) {
        if (chapter == null) return;
        this.forward = forward;
        if (mode == Gestures.Layout.WEBTOON) {
            if (!scroller.canScrollVertically(forward ? 1 : -1)) { // the chapter's end (its transition is the column's end) or start
                if (forward) openChapter(index + 1, 0); else if (index > 0) openChapter(index - 1, Integer.MAX_VALUE);
                return;
            }
            int dy = (forward ? 1 : -1) * getHeight() * 9 / 10;
            if (host.eink()) scroller.scrollBy(0, dy); else scroller.smoothScrollBy(0, dy); // no animation on e-ink
            return;
        }
        // a turn that comes too soon after the one that showed the transition page stays on it: two quick swipes (or a
        // swipe while a page was still loading) no longer run on into the next or the previous chapter unseen
        if (edge != Edge.NONE && (forward == (edge == Edge.END)) && !Transition.mayCross(edgeAt, android.os.SystemClock.uptimeMillis())) return;
        if (edge == Edge.END) {
            if (forward) openChapter(index + 1, 0); // at the series' end it stays: the page says so, Back goes to the series
            else { leaveEdge(); atBottom = true; show(chapter.size() - 1); }
            return;
        }
        if (edge == Edge.START) {
            if (!forward) openChapter(index - 1, Integer.MAX_VALUE);
            else { leaveEdge(); show(0); }
            return;
        }
        int p = page + (forward ? 1 : -1);
        if (p >= chapter.size()) showEdge(Edge.END);
        else if (p < 0) showEdge(Edge.START);
        else { atBottom = !forward; show(p); }
    }

    /** The transition page's words for this chapter's end or start (Transition), with the next chapter's size when it
     *  was opened ahead. */
    private void fillTransition(LinearLayout into, boolean forward) {
        into.removeAllViews();
        int other = index + (forward ? 1 : -1);
        String o = other >= 0 && other < series.chapters.size() ? series.chapters.get(other) : null;
        java.util.List<String> lines = Transition.lines(chapter.path, o, forward);
        for (int k = 0; k < lines.size(); k++) {
            String line = lines.get(k);
            boolean warn = line.startsWith("⚠");
            TextView t = host.look().label(getContext(), line, k == 0 ? 15 : k == 1 ? 19 : 15, warn ? host.look().red : transitionInk);
            t.setGravity(Gravity.CENTER);
            t.setPadding(0, host.look().dp(k == 0 ? 0 : 12), 0, 0);
            if (k == 1) t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            into.addView(t);
        }
        String hint;
        if (o == null) hint = forward ? "Back goes to the series." : null;
        else {
            Chapter f = forward && following != null && followingFor == other ? following : null;
            hint = (f != null ? f.size() + " pages · " : "") + (forward ? "turn the page to read it" : "turn back once more to read it; turn on to stay here");
        }
        if (hint != null) {
            TextView h = host.look().label(getContext(), hint, 13, transitionInk);
            h.setAlpha(0.7f);
            h.setGravity(Gravity.CENTER);
            h.setPadding(0, host.look().dp(24), 0, 0);
            into.addView(h);
        }
    }

    private void showEdge(Edge e) {
        edge = e;
        edgeAt = android.os.SystemClock.uptimeMillis();
        boolean forward = e == Edge.END;
        fillTransition(transition, forward);
        image.setVisibility(INVISIBLE);
        if (fitWidth) scroller.setVisibility(INVISIBLE);
        say(null);
        transition.setVisibility(VISIBLE);
        pageNumber.setText("");
        ink.page(-1); // no ink on the page between chapters
        if (forward) follow();
        if (host.eink()) ui.postDelayed(host::einkRefresh, 60);
    }

    private void leaveEdge() {
        if (edge == Edge.NONE) return;
        edge = Edge.NONE;
        transition.setVisibility(GONE);
        transition.setTranslationX(0); transition.setTranslationY(0);
        image.setVisibility(VISIBLE);
        scroller.setVisibility(VISIBLE);
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
        // the column's end is the transition (a tap or a turn there opens the next chapter)
        LinearLayout end = new LinearLayout(getContext());
        end.setOrientation(LinearLayout.VERTICAL);
        end.setGravity(Gravity.CENTER);
        end.setPadding(host.look().dp(32), host.look().dp(64), host.look().dp(32), host.look().dp(96));
        fillTransition(end, true);
        column.addView(end, new LinearLayout.LayoutParams(-1, -2));
        page = -1;
        final Chapter ch = chapter;
        column.post(() -> { if (ch != chapter) return; scroller.scrollTo(0, column.getChildAt(start).getTop()); seen(start); });
    }

    private void webtoonScrolled(int y) {
        if (chapter == null) return;
        int n = Math.min(chapter.size(), column.getChildCount()); // the transition at the end is no page
        int mid = y + getHeight() / 2, at = 0;
        for (int i = 0; i < n; i++) { if (column.getChildAt(i).getTop() <= mid) at = i; else break; }
        if (at != page) seen(at);
    }

    private final org.atlas.capture.ReadingPlace place = new org.atlas.capture.ReadingPlace();

    /** Where you are, kept in memory at each page, written into the series' note on a new chapter, its last page, on
     *  leaving, else every two minutes at most (ReadingPlace): a page every few seconds rewrote the note. */
    private void markAt(int p) {
        long now = System.currentTimeMillis();
        boolean write = place.moved(chapter.path, now) || p >= chapter.size() - 1;
        if (write) place.saved(chapter.path, now);
        Library.mark(host, series, chapter.path, p, chapter.size(), write);
    }

    /** Page `p` is the one read: it and the pages Prefetch wants around it filled, pages far from it let go (several
     *  MB each), their height kept so nothing moves. */
    private void seen(int p) {
        forward = p >= page;
        page = p;
        pages.focus(chapter, p, forward);
        where(p);
        markAt(p);
        final Chapter ch = chapter;
        for (int k = 0; k < Math.min(ch.size(), column.getChildCount()); k++) {
            ImageView v = (ImageView) column.getChildAt(k);
            if (k == p || Prefetch.rank(new Prefetch.Focus("", p, ch.size(), forward, null), "", k) >= 0) { if (v.getDrawable() == null) fill(ch, k, v); }
            else if (Math.abs(k - p) > Prefetch.AHEAD + 2 && v.getDrawable() != null) { v.setMinimumHeight(v.getHeight()); v.setImageDrawable(null); }
        }
        if (Prefetch.nearEnd(p, ch.size())) follow();
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

    // ---- touches and keys ----

    /** Every touch of the reader, decided by Gestures. Who owns a touch is decided when the finger comes down — the
     *  bars and panels (and the pen bar) take their own whole, the pen and a palm are the ink's (PageInk.take), the
     *  rest is the page's — so a gesture is never split between them. The first touch is always taken (true): a view
     *  that refuses ACTION_DOWN gets nothing more of it, which is how a page in fit screen once lost every tap and
     *  swipe. In fit width and webtoon the touch also goes on to the scroller, until a swipe or a pinch takes it. */
    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        int act = e.getActionMasked();
        if (act == MotionEvent.ACTION_DOWN) route = bars.dispatch(e) || penBar.over(e.getX(), e.getY()) ? Route.CHILD : Route.PAGE;
        if (route == Route.CHILD) return super.dispatchTouchEvent(e);
        if (mode != Gestures.Layout.WEBTOON && ink.take(e)) { // the pen writes, a palm does nothing (a pen tap comes back as a tap)
            if (route == Route.PAGE && act != MotionEvent.ACTION_DOWN) { stopForwarding(e); settle(); taps.clear(); }
            route = Route.INK;
            return true;
        }
        if (route == Route.INK) return true; // the rest of a gesture the pen or a palm began
        float x = e.getX(), y = e.getY();
        switch (act) {
            case MotionEvent.ACTION_DOWN: {
                boolean sideways = mode.sideways(), rtl = mode == Gestures.Layout.RTL;
                // can the zoomed page still pan towards the next page / the previous one (in reading order)
                boolean panOn = sideways ? zoom.canPan(rtl ? 1 : -1, 0) : zoom.canPan(0, -1);
                boolean panBack = sideways ? zoom.canPan(rtl ? -1 : 1, 0) : zoom.canPan(0, 1);
                touch.down(x, y, e.getEventTime(), fitWidth && mode != Gestures.Layout.WEBTOON && edge == Edge.NONE, // the transition page does not scroll
                    scroller.canScrollVertically(1), scroller.canScrollVertically(-1), zoomable && zoom.zoomed(), panOn, panBack);
                lastX = x; lastY = y;
                forwarding = fitWidth && edge == Edge.NONE;
                if (forwarding) super.dispatchTouchEvent(e);
                return true;
            }
            case MotionEvent.ACTION_POINTER_DOWN:
                touch.pointers(e.getPointerCount());
                taps.clear();
                stopForwarding(e);
                settle();
                if (zoomable && edge == Edge.NONE && e.getPointerCount() >= 2) pinchStart(e);
                return true;
            case MotionEvent.ACTION_POINTER_UP:
                if (touch.kind() == Gestures.Kind.PINCH && e.getPointerCount() > 2) pinchStart(e); // still two fingers
                return true;
            case MotionEvent.ACTION_MOVE: {
                if (touch.kind() == Gestures.Kind.PINCH) { if (zoomable && e.getPointerCount() >= 2) pinch(e); return true; }
                Gestures.Kind k = touch.move(x, y);
                if (k == Gestures.Kind.SWIPE) {
                    stopForwarding(e);
                    if (!host.eink() && !zoom.zoomed()) { // the page follows the finger
                        if (mode.sideways()) shown().setTranslationX(touch.slide()); else shown().setTranslationY(touch.slide());
                    }
                } else if (k == Gestures.Kind.DRAG && zoomable && zoom.zoomed()) { zoom.pan(x - lastX, y - lastY); applyZoom(); }
                lastX = x; lastY = y;
                return !forwarding || super.dispatchTouchEvent(e);
            }
            case MotionEvent.ACTION_UP: {
                Gestures.Touch.End end = touch.up(x, y, e.getEventTime());
                if (end.kind == Gestures.Kind.TAP) { stopForwarding(e); tapped(x, y, e.getEventTime()); return true; }
                if (end.kind == Gestures.Kind.SWIPE) {
                    taps.clear();
                    float from = mode.sideways() ? shown().getTranslationX() : shown().getTranslationY();
                    if (end.step == Gestures.Step.NONE || chapter == null) settle(); else slideTurn(end.step == Gestures.Step.ON, from);
                    return true;
                }
                if (forwarding) return super.dispatchTouchEvent(e); // the scroller's fling
                return true;
            }
            case MotionEvent.ACTION_CANCEL:
                settle();
                if (forwarding) super.dispatchTouchEvent(e);
                forwarding = false;
                return true;
            default:
                return !forwarding || super.dispatchTouchEvent(e);
        }
    }

    /** The scroller under no longer gets this touch: it is told the gesture was cancelled (no half-made scroll). */
    private void stopForwarding(MotionEvent e) {
        if (!forwarding) return;
        forwarding = false;
        MotionEvent c = MotionEvent.obtain(e);
        c.setAction(MotionEvent.ACTION_CANCEL);
        super.dispatchTouchEvent(c);
        c.recycle();
    }

    private void pinchStart(MotionEvent e) {
        pinchSpan = span(e);
        pinchX = (e.getX(0) + e.getX(1)) / 2;
        pinchY = (e.getY(0) + e.getY(1)) / 2;
    }

    /** Two fingers: the page scaled about their middle and moved with it. */
    private void pinch(MotionEvent e) {
        float sp = span(e), mx = (e.getX(0) + e.getX(1)) / 2, my = (e.getY(0) + e.getY(1)) / 2;
        if (pinchSpan > 0 && sp > 0) zoom.scaleBy(sp / pinchSpan, mx, my);
        zoom.pan(mx - pinchX, my - pinchY);
        pinchSpan = sp; pinchX = mx; pinchY = my;
        applyZoom();
    }

    private static float span(MotionEvent e) { return (float) Math.hypot(e.getX(0) - e.getX(1), e.getY(0) - e.getY(1)); }

    /** A finger's tap: by its zone, at once on the sides; in the middle (or zoomed) a moment later, unless a second tap
     *  makes it a double tap, which zooms in there or back to the whole page (Gestures.Taps). */
    private void tapped(float x, float y, long t) {
        Gestures.Zone z = zone(x / getWidth(), y / getHeight());
        boolean hold = Gestures.holds(z, zoomable && edge == Edge.NONE && chapter != null, zoom.zoomed());
        switch (taps.tap(x, y, t, hold)) {
            case NOW: act(z); break;
            case WAIT: held = z; ui.postDelayed(fireHeld, taps.doubleMs); break;
            case DOUBLE: ui.removeCallbacks(fireHeld); zoom.toggle(x, y); applyZoom(); break;
            case HELD_THEN_NOW: ui.removeCallbacks(fireHeld); act(held); act(z); break;
            case HELD_THEN_WAIT: ui.removeCallbacks(fireHeld); act(held); held = z; ui.postDelayed(fireHeld, taps.doubleMs); break;
        }
    }

    private void act(Gestures.Zone z) {
        if (z == Gestures.Zone.MENU) { bars.show(!bars.shown()); if (host.eink()) post(host::einkRefresh); return; }
        if (bars.shown()) { bars.show(false); return; }
        go(Gestures.step(z, mode));
    }

    /** The tap zone at (x, y) from 0 to 1, by the settings' layout (Gestures.zone). */
    private Gestures.Zone zone(float x, float y) {
        return Gestures.zone(options.optString("taps", "default"), options.optBoolean("invert_taps", false), mode, x, y);
    }

    // ---- zoom (fit screen) ----

    /** The page shown fitted to the reader (a new page, a new size): the zoom starts again. */
    private void fitPage() {
        if (!zoomable) return;
        android.graphics.drawable.Drawable d = image.getDrawable();
        if (d == null || getWidth() == 0) return;
        zoom.size(getWidth(), getHeight(), d.getIntrinsicWidth(), d.getIntrinsicHeight());
        applyZoom();
    }

    /** The image's matrix from the zoom's rectangle; the ink over it follows (it reads that matrix). */
    private void applyZoom() {
        android.graphics.drawable.Drawable d = image.getDrawable();
        if (!zoomable || d == null) return;
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setRectToRect(new android.graphics.RectF(0, 0, d.getIntrinsicWidth(), d.getIntrinsicHeight()),
            new android.graphics.RectF(zoom.left(), zoom.top(), zoom.left() + zoom.width(), zoom.top() + zoom.height()), android.graphics.Matrix.ScaleToFit.FILL);
        image.setImageMatrix(m);
        ink.area();
        ink.invalidate();
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        super.onSizeChanged(w, h, ow, oh);
        post(this::fitPage); // turned, or laid out after the page came
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
        if (mode != Gestures.Layout.WEBTOON) l.addView(bars.segments("Scale", new String[] { "Fit screen", "Fit width" }, fitWidth ? 1 : 0,
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
        if (volume && code == KeyEvent.KEYCODE_VOLUME_DOWN) { go(Gestures.Step.ON); return true; }
        if (volume && code == KeyEvent.KEYCODE_VOLUME_UP) { go(Gestures.Step.BACK); return true; }
        // the arrows as the page reads (right to left: left goes on); page down / space always on
        if (code == KeyEvent.KEYCODE_DPAD_RIGHT || code == KeyEvent.KEYCODE_PAGE_DOWN || code == KeyEvent.KEYCODE_SPACE) { go(mode != Gestures.Layout.RTL || code != KeyEvent.KEYCODE_DPAD_RIGHT ? Gestures.Step.ON : Gestures.Step.BACK); return true; }
        if (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_PAGE_UP) { go(mode == Gestures.Layout.RTL && code == KeyEvent.KEYCODE_DPAD_LEFT ? Gestures.Step.ON : Gestures.Step.BACK); return true; }
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
        if (chapter != null && place.leaving()) Library.mark(host, series, chapter.path, page, chapter.size(), true);
        closed = true;
        ui.removeCallbacks(fireHeld);
        pages.close();
        opener.shutdownNow();
        if (chapter != null) chapter.close();
        if (following != null) following.close();
        super.onDetachedFromWindow();
    }
}
