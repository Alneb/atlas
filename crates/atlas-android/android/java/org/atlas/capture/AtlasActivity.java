package org.atlas.capture;

import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayDeque;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Atlas on the phone (docs/guides/ANDROID.md, "The native shell"): a native app — its top bar, its bottom bar (Home, Files,
 * Search, Settings), the capture button, the open files' sheet, the menu, the phone's settings — around one WebView, the
 * note view, which shows the web's own Home, Files, Search, the open files and any other view (ui/src/lib/native-shell
 * .svelte.ts on that side). Only files are tabs. The vault's logic runs where its Atlas server runs: the core inside this
 * app (src/serve.rs) for a vault on the phone, the server itself for a vault there.
 */
public final class AtlasActivity extends Activity {
    /** An Intent extra: a vault path to open (a native plugin sending the user back to a note: Host.open). */
    static final String OPEN = "org.atlas.open";
    /** With OPEN: in the web editor, not the native plugin that opens such files (Notepad's "Open in Excalidraw"). */
    static final String WEB = "org.atlas.web";
    /** With OPEN: the line to open the note at (the home-screen widget's task, TodayWidget). */
    static final String LINE = "org.atlas.line";
    /** The path to open on the web once (WEB): nativeOpens says no to it the next time it is asked. */
    private volatile String webOnce;
    /** A native plugin's `[[link]]` to follow, and the vault file it is in (LINK_FROM): resolved by the page. */
    static final String LINK = "org.atlas.link", LINK_FROM = "org.atlas.link-from";
    /** An Intent extra: open the vault's page afresh (SignedInActivity, after a sign-in). */
    static final String RELOAD = "org.atlas.reload";
    /** Where the shell is: the phone's own settings (drawn natively), or the note view showing the web's Home, Files or
     *  Search, or
     *  a tab (`arg`: its id) / a view (Settings…). */
    private enum Kind {
        HOME, LIBRARY, FILES, SEARCH, AGENDA, SETTINGS, NOTE;
        /** shown by the note view (the WebView), not drawn natively (Settings; the Library, Files, Search, the Agenda:
         *  LibraryScreen, FilesScreen, SearchScreen, AgendaScreen) */
        boolean web() { return this != SETTINGS && this != LIBRARY && this != FILES && this != SEARCH && this != AGENDA; }
        /** the whole page call that shows it (NOTE: the tab, by its id) */
        String call() { return this == HOME ? "atlasShell.home()" : null; }
    }

    private static final class Screen {
        final Kind kind;
        String arg; // NOTE: the tab's id (set once the page reports it)
        String path; // NOTE: its file, to open it again once its tab is closed (Back, the web's back closing it)
        Screen(Kind kind, String arg) { this.kind = kind; this.arg = arg; }
    }

    private Look look;
    private Vaults vaults;
    private FrameLayout place;   // the native place's view goes here
    private WebView web;          // the note view: kept alive for the vault in use
    private Ink webInk;           // Onyx's instant ink over a drawing in the page (Bridge.ink), made on first use
    private float[] inkAsked;     // the region the page last asked for (view px, width, style); null: none
    private boolean focused = true; // the window has the focus: no dialog, sheet or menu over the page
    private TextView title, count;
    private ImageView back;
    private View brand;           // in Back's place where Back goes nowhere (Home)
    private final View[] pills = new View[6]; // the bottom bar's mark behind the current place's icon
    private View fab, bottom, topBar, topLine;
    /** The bars' backgrounds, recoloured to the vault's palette when the page says it (Bridge.paper). */
    private final java.util.List<View> paper = new java.util.ArrayList<>();
    private View unfull;          // fullscreen's way out, in a corner
    private boolean full;         // fullscreen: the page alone, no bars of the app's or the system's (setFull)
    private final TextView[] tabsOfBar = new TextView[6];
    private String shown;         // the vault on screen
    private boolean ready;        // the page's bridge is up
    private static final long READY_WAIT_MS = 20_000; // then a page that never said "ready" is shown anyway
    private final ArrayDeque<Runnable> waiting = new ArrayDeque<>();
    private final ArrayDeque<Screen> history = new ArrayDeque<>();
    /** The Back stack Android kept when it made the activity again (onSaveInstanceState), for its vault: taken by the
     *  first step into the file that was in front, instead of Home under it. */
    private String keptHistory, keptHistoryOf;
    private Screen at = new Screen(Kind.HOME, "");
    private String asked;         // the place a launcher shortcut asked for, taken on resume
    private JSONArray tabs = new JSONArray();
    // the note view's health (WebHealth): its renderer's restarts, the core's answer when the page opened, when the app left
    private final WebHealth.Restarts restarts = new WebHealth.Restarts();
    private String coreSeen;
    private long pausedAt;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        look = new Look(this);
        vaults = new Vaults(this);
        Server.init(this);
        Shell.edgeToEdge(this, look);
        setContentView(frame());
        Shell.onBack(this, this::onBackPressed); // the gesture (predictive back) takes the same path as the button
        Shortcuts.publish(this, look);
        asked = getIntent().getStringExtra(Shortcuts.PLACE);
        if (state == null) openAsked(getIntent()); // a notification's click with no window open
        Notices.askOnce(this);
        CaptureWays.post(this); // the capture notification, back after a restart of the phone
        if (state != null) { keptHistory = state.getString("history"); keptHistoryOf = state.getString("historyOf"); }
    }

    /** The vault path an intent asks to open (a plugin's "open this note", a notification's click). */
    private void openAsked(Intent i) {
        String path = i.getStringExtra(OPEN);
        if (path != null && i.getBooleanExtra(WEB, false)) webOnce = path;
        int line = i.getIntExtra(LINE, 0);
        if (path != null) js("atlasShell.open(" + JSONObject.quote(path) + (line > 0 ? "," + line : "") + ")"); // js() waits for the page
    }

    /** Only a file in front has a Back stack (the app's own places start afresh); its tab ids die with the page, so a
     *  file is gone back to by its path (backOut). */
    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (shown == null || at.kind != Kind.NOTE || history.isEmpty()) return;
        JSONArray list = new JSONArray();
        for (Screen s : history) {
            try { list.put(new JSONObject().put("kind", s.kind.name()).put("arg", s.arg).put("path", s.path)); } catch (Exception e) { /* not kept */ }
        }
        out.putString("history", list.toString());
        out.putString("historyOf", shown);
    }

    /** The kept Back stack, once, when it belongs to `vault`. */
    private ArrayDeque<Screen> takeKeptHistory(String vault) {
        String json = vault.equals(keptHistoryOf) ? keptHistory : null;
        keptHistory = keptHistoryOf = null;
        if (json == null) return null;
        ArrayDeque<Screen> out = new ArrayDeque<>();
        try {
            JSONArray list = new JSONArray(json);
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.getJSONObject(i);
                Screen s = new Screen(Kind.valueOf(o.getString("kind")), o.isNull("arg") ? null : o.getString("arg"));
                s.path = o.isNull("path") ? null : o.getString("path");
                out.addLast(s);
            }
        } catch (Exception e) { return null; } // a stack of an older build: Back from Home, as before
        return out.isEmpty() ? null : out;
    }
    private ArrayDeque<Screen> resumedHistory; // from takeKeptHistory: waits for the step into the resumed file

    /** A launcher shortcut while the app runs (Shortcuts: Search, Files): the place, over what is on screen. A native
     *  plugin's "open this note" (OPEN): the page opens it. */
    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        asked = i.getStringExtra(Shortcuts.PLACE);
        if (i.getBooleanExtra(RELOAD, false)) shown = null; // back from a sign-in: the vault's page again, now let in
        openAsked(i);
        String link = i.getStringExtra(LINK);
        if (link != null) js("atlasShell.link(" + JSONObject.quote(link) + "," + JSONObject.quote(String.valueOf(i.getStringExtra(LINK_FROM))) + ")");
    }

    /** The native plugin that opens `path` in this vault (installed there and on), or null. */
    private NativePlugin nativeFor(String path) {
        return Natives.forPath(path, this::running);
    }

    /** The shown vault's plugins (VaultFiles.plugins), read in the background when it opens and when its page is
     *  ready: a server's answer cannot be waited for on the UI thread, where `nativeFor` asks. */
    private volatile JSONArray pluginsOfShown = new JSONArray();

    private void readPlugins() {
        String v = shown;
        if (v != null) new Thread(() -> {
            JSONArray all = VaultFiles.plugins(this, v);
            runOnUiThread(() -> { if (!v.equals(shown)) return; pluginsOfShown = all; if (at.kind == Kind.SETTINGS) render(); }); // the built-ins' forms
        }, "plugins").start();
    }

    /** Whether plugin `id` runs in the vault on screen (VaultFiles.on: a built-in one unless the vault switches it off). */
    private boolean running(String id) { return shown != null && VaultFiles.on(pluginsOfShown, id); }

    @Override
    protected void onPause() {
        if (webInk != null) webInk.stop(); // the page asks again when it is shown (visibilitychange)
        final String v = shown;
        new Thread(() -> DeviceLog.write(v)).start(); // this phone's log in the vault, for the desktop to read
        TodayWidget.refresh(this); // the home screen shows what was just done here
        new Thread(() -> ReminderAlarms.plan(getApplicationContext())).start(); // the reminders ring with the app gone
        pausedAt = System.currentTimeMillis();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        String vault = vaults.current();
        new Thread(() -> Outbox.send(this)).start(); // captures kept while a server did not answer
        TodayWidget.refresh(this);
        if (vault == null) { shown = null; go(new Screen(Kind.SETTINGS, ""), false); return; }
        // back from a system screen (a permission, a sign-in) to Settings: stay there; leaving it opens a vault chosen
        // there (go) — before, any return opened it at Home ("all options redirect to home")
        if (!vault.equals(shown) && !(at.kind == Kind.SETTINGS && shown != null)) open(vault, shown == null); // first open (the activity made again): where it was
        else if (!at.kind.web()) render(); // back from the capture box or a settings screen: the place as it is now
        if (vault.equals(shown) && ready && pausedAt > 0 && System.currentTimeMillis() - pausedAt >= WebHealth.AWAY_MS) checkCore(vault, false);
        String want = asked;
        asked = null;
        if ("new".equals(want)) { view("command('ui.new')"); return; } // as the + does: a note, a template, a drawing
        Kind place = "search".equals(want) ? Kind.SEARCH : "files".equals(want) ? Kind.FILES : "home".equals(want) ? Kind.HOME : "agenda".equals(want) ? Kind.AGENDA : null;
        if (place == Kind.AGENDA && shown != null) files(); // the screens of this vault, then the Agenda at today
        if (place == Kind.AGENDA && agendaScreen != null) agendaScreen.today();
        if (place == Kind.AGENDA && at.kind == Kind.AGENDA) render();
        else if (place != null && place != at.kind) go(new Screen(place, ""), true);
    }

    // ---- the frame -----------------------------------------------------------------------------------------------

    private View frame() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(look.bg); // the system's bars, above and below, take the bars' colour
        paper.add(root);

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(look.dp(4), 0, look.dp(4), 0);
        top.setBackgroundColor(look.bg);
        paper.add(top);
        back = iconButton("back", "Back", v -> onBackPressed());
        top.addView(back);
        brand = look.brand(this, 28);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(look.dp(28), look.dp(28));
        bp.setMargins(look.dp(10), 0, look.dp(6), 0);
        top.addView(brand, bp);
        title = look.label(this, "Atlas", 20, look.text); // Material's top app bar: a 64 dp bar, its title medium weight
        title.setTypeface(MEDIUM);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setPaddingRelative(look.dp(4), 0, 0, 0);
        top.addView(title, new LinearLayout.LayoutParams(0, -1, 1f));
        // the vault's name (and the logo) open the vaults, one tap from anywhere (quickVaults)
        title.setOnClickListener(v -> quickVaults());
        title.setContentDescription("Vaults: switch");
        brand.setOnClickListener(v -> quickVaults());
        FrameLayout tabsButton = new FrameLayout(this);
        tabsButton.addView(iconButton("tabs", "Open files", v -> tabSheet()));
        // the number sits in the icon's front square (icons.rs Tabs: a 13-unit square at 4,7 of 24, so its middle is
        // 1.5 dp left of and 1.5 dp below the button's); sized in dp, not sp, and without the font's line padding: in
        // sp the phone's font size and the e-ink scale grew it out of the square, and the padding set it low
        count = new TextView(this);
        count.setTextColor(look.text);
        count.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        count.setIncludeFontPadding(false);
        count.setGravity(Gravity.CENTER);
        count.setMaxLines(1);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(look.dp(13), look.dp(13), Gravity.CENTER);
        cp.setMargins(0, look.dp(3), look.dp(3), 0); // with CENTER, half of each margin: 1.5 dp left, 1.5 dp down
        count.setClickable(false);
        tabsButton.addView(count, cp);
        // the Agenda (AgendaScreen): a place of the app's own, one tap from anywhere, outside the bottom bar's five
        top.addView(iconButton("calendar", "Agenda", v -> go(new Screen(Kind.AGENDA, ""), true)));
        top.addView(tabsButton);
        top.addView(iconButton("more", "More options", this::menu));
        root.addView(top, new LinearLayout.LayoutParams(-1, look.dp(64)));
        swipeBetweenFiles(top);
        topBar = top;
        topLine = hairline();
        root.addView(topLine);

        FrameLayout body = new FrameLayout(this);
        place = new FrameLayout(this);
        body.addView(place, new FrameLayout.LayoutParams(-1, -1));
        TextView plus = new TextView(this);
        plus.setBackground(look.pressable(look.accent, 16, 0));
        plus.setElevation(look.elevation(6));
        plus.setGravity(Gravity.CENTER);
        plus.setCompoundDrawablesRelativeWithIntrinsicBounds(look.icon(this, "plus", look.accentFg), null, null, null);
        plus.setPadding(look.dp(16), 0, 0, 0);
        // New… (the + makes "a normal markdown note, a drawing for a lecture, etc" placed where it belongs:
        // the page's ui.new); the quick capture stays a long press away, and on the Quick Settings tile
        plus.setContentDescription("New… (long press: capture)");
        plus.setOnClickListener(v -> view("command('ui.new')"));
        plus.setOnLongClickListener(v -> { startActivity(new Intent(this, CaptureActivity.class)); return true; });
        FrameLayout.LayoutParams fp = new FrameLayout.LayoutParams(look.dp(56), look.dp(56), Gravity.BOTTOM | Gravity.END);
        fp.setMargins(0, 0, look.dp(16), look.dp(16));
        body.addView(plus, fp);
        fab = plus;
        ImageView out = iconButton("minimize", "Leave fullscreen", v -> setFull(false));
        out.setBackground(look.round(look.bg, 20, look.border));
        out.setAlpha(0.6f);
        out.setVisibility(View.GONE);
        FrameLayout.LayoutParams op = new FrameLayout.LayoutParams(look.dp(40), look.dp(40), Gravity.BOTTOM | Gravity.END);
        op.setMargins(0, 0, look.dp(10), look.dp(10));
        body.addView(out, op);
        unfull = out;
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1f));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        bar.addView(hairline());
        LinearLayout row = new LinearLayout(this);
        row.setBackgroundColor(look.bg);
        paper.add(row);
        // the vault's libraries (drawings, references, comics, books…: docs/design/DESIGN-libraries-everywhere.md)
        // Apps: a menu of direct links (Manga, Audiobooks, the Agenda…), not a place of its own (BAR's null)
        String[][] items = { { "today", "Home" }, { "library", "Library" }, { "vault", "Files" }, { "search", "Search" }, { "grid", "Apps" }, { "settings", "Settings" } };
        for (int i = 0; i < items.length; i++) {
            // Material 3's navigation bar: the icon on a pill when current, the label under it
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER);
            item.setBackground(look.pressable(0x00000000, 0, 0));
            FrameLayout pill = new FrameLayout(this);
            ImageView icon = new ImageView(this);
            icon.setImageDrawable(look.icon(this, items[i][0], look.muted));
            icon.setScaleType(ImageView.ScaleType.CENTER);
            pill.addView(icon, new FrameLayout.LayoutParams(-1, -1));
            item.addView(pill, new LinearLayout.LayoutParams(look.dp(64), look.dp(32)));
            TextView b = look.label(this, items[i][1], 12, look.muted);
            // the labels follow the font size up to 1.3×: larger, "Settings" filled its slot and the bar clipped the pill
            float scale = getResources().getConfiguration().fontScale;
            if (scale > 1.3f) b.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, b.getTextSize() * 1.3f / scale);
            b.setSingleLine(true);
            b.setGravity(Gravity.CENTER);
            b.setPadding(0, look.dp(3), 0, 0);
            item.addView(b);
            Kind k = BAR[i];
            item.setOnClickListener(v -> { if (k == null) appsMenu(v); else go(new Screen(k, ""), true); });
            item.setContentDescription(items[i][1]);
            item.setMinimumHeight(look.dp(64));
            item.setPadding(0, look.dp(6), 0, look.dp(6));
            row.addView(item, new LinearLayout.LayoutParams(0, -2, 1f));
            tabsOfBar[i] = b;
            pills[i] = pill;
        }
        flingBetweenPlaces(row);
        bar.addView(row);
        bottom = bar;
        root.addView(bar);

        // the system's bars: padded around; the keyboard: the bottom bar steps aside, the page shrinks above it
        root.setOnApplyWindowInsetsListener((x, in) -> {
            if (Build.VERSION.SDK_INT < 30) return in;
            // fullscreen: the bars a swipe shows a moment lie over the page, which does not jump for them
            android.graphics.Insets s = full ? android.graphics.Insets.NONE : in.getInsets(WindowInsets.Type.systemBars()), k = in.getInsets(WindowInsets.Type.ime());
            typing = k.bottom > s.bottom;
            bottom.setVisibility(typing || full ? View.GONE : View.VISIBLE);
            fab.setVisibility(fabShown() ? View.VISIBLE : View.GONE); // over the field being typed in otherwise
            x.setPadding(s.left, s.top, s.right, typing ? k.bottom : s.bottom);
            return WindowInsets.CONSUMED;
        });
        if (Build.VERSION.SDK_INT < 30) root.setFitsSystemWindows(true);
        return root;
    }

    /** Material's medium weight: the top bar's title, the current place in the navigation bar. */
    private static final android.graphics.Typeface MEDIUM = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL);

    /** An icon-only button: `label` is what TalkBack says and what a long press shows (it has no text of its own);
     *  48 dp square, Android's smallest touch target (core app quality, Touch_Target_Size). */
    private ImageView iconButton(String icon, String label, View.OnClickListener tap) {
        ImageView i = new ImageView(this);
        i.setImageDrawable(look.icon(this, icon, look.text));
        i.setScaleType(ImageView.ScaleType.CENTER);
        i.setBackground(look.pressable(0x00000000, 24, 0));
        i.setContentDescription(label);
        if (Build.VERSION.SDK_INT >= 26) i.setTooltipText(label);
        i.setLayoutParams(new LinearLayout.LayoutParams(look.dp(48), look.dp(48)));
        i.setOnClickListener(tap);
        return i;
    }

    /** A sideways swipe on the top bar moves to the next or previous open file, as a browser's address bar does. The
     *  bar, not the note: the note scrolls tables and selects text sideways, and the screen's edges are the system's Back. */
    private void swipeBetweenFiles(View bar) {
        android.view.GestureDetector g = new android.view.GestureDetector(this, new android.view.GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(android.view.MotionEvent e) { return true; }
            @Override public boolean onFling(android.view.MotionEvent a, android.view.MotionEvent b, float vx, float vy) {
                if (a == null || Math.abs(vx) < Math.abs(vy) * 1.5f || Math.abs(b.getX() - a.getX()) < look.dp(48)) return false;
                return stepFile(vx < 0 ? 1 : -1);
            }
        });
        bar.setOnTouchListener((v, e) -> g.onTouchEvent(e));
        title.setOnTouchListener((v, e) -> g.onTouchEvent(e));
    }

    /** The bottom bar's places in its order (a swipe steps through them). */
    private static final Kind[] PLACES = { Kind.HOME, Kind.LIBRARY, Kind.FILES, Kind.SEARCH, Kind.SETTINGS };
    /** The bottom bar, left to right: the places, and (null) Apps, the menu of direct links. */
    private static final Kind[] BAR = { Kind.HOME, Kind.LIBRARY, Kind.FILES, Kind.SEARCH, null, Kind.SETTINGS };

    /** A sideways fling on the bottom bar steps to the place beside, as a tap on it would. A tap still taps: the
     *  bar's items see every touch, and only an UP that ended a fling is kept from them. */
    private void flingBetweenPlaces(LinearLayout row) {
        android.view.GestureDetector g = new android.view.GestureDetector(this, new android.view.GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(android.view.MotionEvent e) { return true; }
            @Override public boolean onFling(android.view.MotionEvent a, android.view.MotionEvent b, float vx, float vy) {
                if (a == null || Math.abs(vx) < Math.abs(vy) * 1.5f || Math.abs(b.getX() - a.getX()) < look.dp(48)) return false;
                return stepPlace(vx < 0 ? 1 : -1);
            }
        });
        for (int i = 0; i < row.getChildCount(); i++) row.getChildAt(i).setOnTouchListener((v, e) -> {
            boolean flung = g.onTouchEvent(e);
            if (e.getActionMasked() != android.view.MotionEvent.ACTION_UP || !flung) return false;
            v.setPressed(false); // the fling is the gesture: no tap on the item it ended over
            return true;
        });
    }

    /** The place `by` from the one on screen in the bottom bar's order, shown with a slide of the title; false at
     *  either end, or from an open file (whose sideways swipe is the top bar's, between files). */
    private boolean stepPlace(int by) {
        int here = java.util.Arrays.asList(PLACES).indexOf(at.kind);
        if (here < 0 || !ready) return false;
        int next = here + by;
        if (next < 0 || next >= PLACES.length) return false;
        go(new Screen(PLACES[next], ""), true);
        title.setTranslationX(look.dp(28) * by);
        title.setAlpha(0.3f);
        title.animate().translationX(0).alpha(1).setDuration(160).start();
        return true;
    }

    /** The open file `by` places from the one on screen (Home: the first or the last), shown with a slide of the title. */
    private boolean stepFile(int by) {
        java.util.List<String> ids = new java.util.ArrayList<>();
        for (int i = 0; i < tabs.length(); i++) if (tabs.optJSONObject(i).optBoolean("file")) ids.add(tabs.optJSONObject(i).optString("id"));
        if (ids.isEmpty() || !ready) return false;
        int here = at.kind == Kind.NOTE ? ids.indexOf(at.arg) : -1;
        int next = here < 0 ? (by > 0 ? 0 : ids.size() - 1) : here + by;
        if (next < 0 || next >= ids.size()) return false;
        if (at.kind != Kind.NOTE) history.push(at);
        at = new Screen(Kind.NOTE, ids.get(next)); // not on the back stack: a step between files, not a link followed
        render();
        title.setTranslationX(look.dp(28) * by);
        title.setAlpha(0.3f);
        title.animate().translationX(0).alpha(1).setDuration(160).start();
        return true;
    }

    /** The chrome made again in a new Look (the page's colours changed): the same WebView moved into it, the place,
     *  the tabs' count and the bars' colour as they were; the system bars' icons dark or light to match. */
    private void relook() {
        String was = title.getText().toString();
        look = new Look(this);
        paper.clear();
        if (web != null && web.getParent() != null) ((android.view.ViewGroup) web.getParent()).removeView(web);
        setContentView(frame());
        if (web != null) ((FrameLayout) place.getParent()).addView(web, 1, new FrameLayout.LayoutParams(-1, -1));
        Shell.edgeToEdge(this, look);
        if (paperColor != 0) repaper(paperColor);
        int files = 0;
        for (int i = 0; i < tabs.length(); i++) if (tabs.optJSONObject(i) != null && tabs.optJSONObject(i).optBoolean("file")) files++;
        showCount(files);
        if (at == null) return;
        title.setText(was);
        paintChrome();
        if (at.kind == Kind.SETTINGS) { place.removeAllViews(); place.addView(settings()); }
        else if (!at.kind.web()) render(); // Files, Search: drawn again in the new colours
        else if (!ready) render(); // its "Opening…" again
        if (full) { int b = View.GONE; topBar.setVisibility(b); topLine.setVisibility(b); bottom.setVisibility(b); unfull.setVisibility(View.VISIBLE); }
    }

    /** The bars' colour the page last gave (0: none yet, the Look's own). */
    private int paperColor;

    private void repaper(int color) {
        paperColor = color;
        for (View v : paper) v.setBackgroundColor(color);
        if (web != null) web.setBackgroundColor(color);
    }

    private View hairline() {
        View v = new View(this);
        v.setBackgroundColor(look.border);
        v.setLayoutParams(new LinearLayout.LayoutParams(-1, Math.max(1, look.dp(0.5f))));
        return v;
    }

    // ---- the vault -----------------------------------------------------------------------------------------------

    /** Its server (the core started here, or the vault's own server), then the note view's page, then Home. */
    private void open(String vault) { open(vault, false); }

    /** The vault's page, from Home; `resume`: back at the file that was in front (pageReady), for when the vault opens
     *  again by itself — a renderer that died, the activity made again — and not by the user's choice. */
    private void open(String vault, boolean resume) {
        resumeTo = resume ? prefs().getString(PLACE + vault, null) : null;
        String was = resume ? prefs().getString(WHERE + vault, "HOME") : "HOME"; // read before Home below is remembered
        shown = vault;
        pluginsOfShown = new JSONArray();
        readPlugins();
        ready = false;
        waiting.clear();
        history.clear();
        tabs = new JSONArray();
        if (web != null) { ((FrameLayout) web.getParent()).removeView(web); web.destroy(); }
        web = webView();
        web.setVisibility(View.GONE);
        ((FrameLayout) place.getParent()).addView(web, 1, new FrameLayout.LayoutParams(-1, -1));
        go(new Screen(Kind.HOME, ""), false);
        resumedHistory = resumeTo != null ? takeKeptHistory(vault) : null;
        if (resumeTo == null) { // not a file in front: the app's place it was at
            for (Kind k : new Kind[] { Kind.LIBRARY, Kind.FILES, Kind.SEARCH, Kind.AGENDA }) if (k.name().equals(was)) go(new Screen(k, ""), false);
        }
        // a page that never says it is ready (a script error, a server answering something else): shown anyway, with why
        WebView mine = web;
        place.postDelayed(() -> {
            if (ready || web != mine || !vault.equals(shown)) return;
            web.setVisibility(View.VISIBLE);
            place.setVisibility(View.GONE);
            if (!at.kind.web()) paintChrome(); // Files, Search stay in front: they need no page
            failed(WebHealth.Failure.NOT_READY, Vaults.name(vault)); // its page's console: adb logcat -s AtlasPage
            // a server whose sign-in in front turned the page's scripts away: say so and offer to sign in, not a blank page
            if (Server.is(vault)) new Thread(() -> {
                SignIn.Probe p = SignIn.probe(this, vault, true);
                if (p.front == SignIn.Front.PROXY) runOnUiThread(() -> VaultChoice.signIn(this, look, vaults, vault, u -> open(vault)));
            }).start();
        }, READY_WAIT_MS);
        if (Server.is(vault)) { started(vault); return; }
        new Thread(() -> {
            // the plugins this app carries, through the core's install path, before the core reads them (Bundled)
            String plugins = Bundled.sync(this, vault);
            if (plugins != null) runOnUiThread(() -> android.widget.Toast.makeText(this, plugins, android.widget.Toast.LENGTH_LONG).show());
            String r = Core.serve(vault, getFilesDir().getPath(), Helpers.environment(this)); // the helpers linked by name on PATH
            // the folder's copy on a server (set, or the server vault of the same name): the page edits notes and drawings
            // there while it answers, with this app's sign-in for it, as the desktop does
            applyMirror(vault);
            runOnUiThread(() -> {
                if (!vault.equals(shown)) return; // another vault was chosen meanwhile
                try {
                    JSONObject o = new JSONObject(r);
                    if (o.has("error")) throw new Exception(o.getString("error"));
                    web.loadUrl(o.getString("open")); // a one-time address: the in-app core is locked to this app (its cookie)
                } catch (Exception e) {
                    place.removeAllViews();
                    place.addView(quiet("Atlas could not open " + Vaults.name(vault) + ": " + e.getMessage()));
                    place.setVisibility(View.VISIBLE);
                }
            });
        }).start();
    }

    private static final java.util.regex.Pattern VAULT_PATH = java.util.regex.Pattern.compile("^(/v/[^/]+)(/.*)?$");

    /** The app's interface file for `u` on the server at `base` (`https://host/v/name`), or null for the server's own. */
    private static android.webkit.WebResourceResponse ownUi(Uri base, Uri u) {
        if (!String.valueOf(u.getHost()).equals(base.getHost()) || !String.valueOf(u.getScheme()).equals(base.getScheme())) return null;
        String path = u.getPath() == null || u.getPath().isEmpty() ? "/" : u.getPath();
        // the vault the address names ("/v/name/…": the page may move to another vault of the server), else the one opened
        java.util.regex.Matcher v = VAULT_PATH.matcher(path);
        boolean named = v.matches();
        String prefix = named ? v.group(1) : base.getPath() == null ? "" : base.getPath().replaceAll("/+$", "");
        String rel = named ? (v.group(2) == null ? "/" : v.group(2)) : path;
        if (rel.startsWith("/api/") || rel.equals("/api") || rel.startsWith("/auth/") || rel.equals("/login") || rel.startsWith("/plugin-files/")) return null; // the server's (plugin files: the vault's)
        byte[] got = Core.uiFile(rel.substring(1), prefix);
        if (got == null) return null; // not one of the app's files: the server answers
        int nul = 0;
        while (nul < got.length && got[nul] != 0) nul++;
        String type = new String(got, 0, nul, java.nio.charset.StandardCharsets.UTF_8).split(";")[0].trim();
        android.webkit.WebResourceResponse res = new android.webkit.WebResourceResponse(type, "UTF-8", new java.io.ByteArrayInputStream(got, nul + 1, got.length - nul - 1));
        res.setResponseHeaders(java.util.Collections.singletonMap("Cache-Control", "text/html".equals(type) ? "no-cache" : "public, max-age=3600"));
        return res;
    }

    /** The server's version against the interface this app carries (its own on a server's vault): a different API level,
     *  or a server too old to say, is said once per server and version. */
    private void checkVersion(String base) {
        new Thread(() -> {
            String mine = Core.version(), theirs;
            try {
                java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL(SignIn.base(base) + "/api/version").openConnection();
                h.setInstanceFollowRedirects(false);
                h.setConnectTimeout(8000);
                h.setReadTimeout(10000);
                h.setRequestProperty("x-atlas", "1");
                Server.headers(this, base, h);
                int code = h.getResponseCode();
                theirs = code == 200 ? new String(Bytes.all(h.getInputStream()), java.nio.charset.StandardCharsets.UTF_8) : code == 404 ? "{}" : null;
            } catch (Exception e) { theirs = null; } // no answer: nothing to compare
            if (theirs == null) return;
            try {
                JSONObject a = new JSONObject(mine), b = new JSONObject(theirs);
                int ours = a.optInt("api"), server = b.optInt("api", 0);
                String key = "version-said:" + base + ":" + b.optString("version", "?") + ":" + server;
                android.util.Log.i("AtlasPage", "versions: app " + mine + ", server " + theirs);
                if (ours == server || getSharedPreferences("atlas", MODE_PRIVATE).getBoolean(key, false)) return;
                String say = server == 0
                    ? Vaults.name(base) + "'s server is older than this app (it does not say its version): the app shows its own interface, and some things may not work until the server is updated."
                    : server < ours
                        ? Vaults.name(base) + "'s server (Atlas " + b.optString("version") + ", API " + server + ") is older than this app (API " + ours + "): some things may not work until the server is updated."
                        : Vaults.name(base) + "'s server (API " + server + ") is newer than this app (API " + ours + "): update the app.";
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return; // closed meanwhile: a dialog would crash, and it is said next time
                    getSharedPreferences("atlas", MODE_PRIVATE).edit().putBoolean(key, true).apply();
                    new android.app.AlertDialog.Builder(this).setTitle("Versions differ").setMessage(say).setPositiveButton("OK", null).show();
                });
            } catch (Exception e) { android.util.Log.w("AtlasPage", "version check: " + e); }
        }).start();
    }

    private void started(String base) {
        Server.plantGate(base, vaults.gate(base)); // the browser sign-in's session, for every path of the site (again: older plants were /v/ only)
        web.loadUrl(base + "/");
        checkVersion(base);
    }

    private WebView webView() {
        WebView w = new WebView(this);
        Look.noInjectedCss(w);
        w.setBackgroundColor(look.bg);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true); // the interface is a script
        s.setDomStorageEnabled(true); // its remembered choices (localStorage)
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        // the phone's text size goes to the page's own scale (Bridge.fontScale), which grows boxes with their words; the
        // WebView's default text zoom grows the words alone, out of their rows and buttons
        s.setTextZoom(100);
        w.addJavascriptInterface(new Bridge(), "AtlasNative");
        // a tap that reaches the page itself (the drawing's toolbar: undo, redo, its menus — the pen's strokes go to the
        // catcher over the drawing): what it changed shown once the page has drawn it (OnyxInk `repaint`)
        w.setOnTouchListener((v, e) -> {
            if (webInk != null && e.getActionMasked() == MotionEvent.ACTION_UP) webInk.repaint(150);
            return false; // the page still gets every event
        });
        // the page's console in logcat (`adb logcat -s AtlasPage`): a release WebView cannot be inspected otherwise
        w.setWebChromeClient(new WebChromeClient() {
            /** `<input type=file>` (the explorer's upload, a photo for a note): the system's picker. A WebView answers
             *  nothing to it until its app does this, so every such button did nothing in the app. */
            @Override
            public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (choosing != null) choosing.onReceiveValue(null); // one picker at a time: the last one asked wins
                Intent pick = p.createIntent();
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(pick, PICK_FILES);
                    choosing = cb;
                    return true;
                } catch (android.content.ActivityNotFoundException e) {
                    return false; // no picker on this device: the page's input gets nothing
                }
            }

            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                boolean bad = m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR;
                String line = m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")";
                if (bad) android.util.Log.e("AtlasPage", line); else android.util.Log.i("AtlasPage", line);
                return true;
            }
        });
        w.setWebViewClient(new WebViewClient() {
            /** The page's renderer died (out of memory, a crash): say so and start the vault again, never a blank screen. */
            @Override
            public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
                rendererGone(v, d.didCrash() ? "it crashed" : "out of memory");
                return true; // handled: the app lives on
            }

            /** A server's vault: the interface is the app's own (Core.uiFile) — its phone layout, no 20 MB of the server's
             *  script to fetch; `/api/…` (notes, data, plugins' code), the sign-ins and anything not the app's go to the server. */
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String vault = shown;
                if (vault == null || !Server.is(vault) || !"GET".equals(r.getMethod())) return null;
                return ownUi(Uri.parse(vault), r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String here = Uri.parse(v.getUrl() == null ? "" : v.getUrl()).getAuthority();
                // the interface's own pages stay; a link to the web goes to the browser
                if (u.getAuthority() != null && u.getAuthority().equals(here)) return false;
                if (Server.is(shown == null ? "" : shown) && "https".equals(u.getScheme())) return false; // a server's sign-in on another host
                startActivity(new Intent(Intent.ACTION_VIEW, u));
                return true;
            }
        });
        return w;
    }

    /** A service's gate signed in in the app's window (Web.signIn), the session given to the in-app core, which sends it
     *  with its plugins' requests there. A server's vault: its core signs in on the server, not here. */
    private void signInDoor(String url) {
        String vault = shown;
        if (vault == null || Server.is(vault)) { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); return; }
        Web.signIn(this, url, () -> new Thread(() -> {
            String said = Core.keepSignin(vault, url, Web.cookies(this, url));
            if (said.contains("\"error\"")) android.util.Log.w("AtlasSignin", url + ": " + said);
        }).start());
    }

    private static final int PICK_FILES = 41, DICTATE = 42;
    /** The page's file input waiting for the picker's answer. */
    private android.webkit.ValueCallback<Uri[]> choosing;

    @Override
    protected void onActivityResult(int request, int code, Intent data) {
        if (request == PICK_FILES) {
            android.webkit.ValueCallback<Uri[]> cb = choosing;
            choosing = null;
            if (cb != null) cb.onReceiveValue(picked(code, data));
        } else if (request == DICTATE) {
            java.util.ArrayList<String> heard = code == RESULT_OK && data != null ? data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS) : null;
            said(heard == null || heard.isEmpty() ? "" : heard.get(0));
        } else {
            super.onActivityResult(request, code, data);
        }
    }

    /** The files a picker chose: several (clip data) or one; null when cancelled. */
    private static Uri[] picked(int code, Intent data) {
        if (code != RESULT_OK || data == null) return null;
        android.content.ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            Uri[] all = new Uri[clip.getItemCount()];
            for (int i = 0; i < all.length; i++) all[i] = clip.getItemAt(i).getUri();
            return all;
        }
        return data.getData() != null ? new Uri[] { data.getData() } : null;
    }

    /** Dictated words to the page (KeyboardBar.svelte's `atlasDictated`); "" when nothing was heard. */
    private void said(String text) {
        if (web != null) web.evaluateJavascript("globalThis.atlasDictated && atlasDictated(" + JSONObject.quote(text) + ")", null);
    }

    /** This install's id, made once and kept (the app's prefs): what the page says with its place in the `where` room,
     *  so the native Files knows which of the places listed is this phone's own. */
    static String deviceId(android.content.Context c) {
        SharedPreferences p = c.getSharedPreferences("atlas-device", MODE_PRIVATE);
        String id = p.getString("id", "");
        if (id.isEmpty()) {
            id = "phone-" + java.util.UUID.randomUUID().toString().substring(0, 8);
            p.edit().putString("id", id).apply();
        }
        return id;
    }

    /** The page's side of the shell (native-shell.svelte.ts). Called on the WebView's thread: everything goes to the main one. */
    private final class Bridge {
        /** Dictation for the note being typed in: the system's speech recognizer (its own screen, its own microphone
         *  permission), the words handed back through `said`. */
        @JavascriptInterface public void dictate() {
            runOnUiThread(() -> {
                Intent ask = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                try {
                    startActivityForResult(ask, DICTATE);
                } catch (android.content.ActivityNotFoundException e) {
                    android.widget.Toast.makeText(AtlasActivity.this, "No speech recognizer on this phone", android.widget.Toast.LENGTH_SHORT).show();
                    said("");
                }
            });
        }
        @JavascriptInterface public void ready() { runOnUiThread(AtlasActivity.this::pageReady); }
        /** This phone's id in the vault's `where` room (ui lib/where.svelte.ts): the native Files leaves itself out of
         *  who is where by it (WhereRows). */
        @JavascriptInterface public String deviceId() { return AtlasActivity.deviceId(AtlasActivity.this); }
        /** The page's fullscreen (Super+F, a drawing's ⛶): the app's (setFull), the page being always one pane here. */
        @JavascriptInterface public void toggleFullscreen() { runOnUiThread(() -> setFull(!full)); }
        @JavascriptInterface public void tabs(String json) { runOnUiThread(() -> tabsChanged(json)); }
        /** The page's whole look (lib/settings.svelte.ts nativeLook: the theme, palette and accent as its tokens): kept
         *  for every native screen (Look.save), and this window's own chrome drawn again in it when it changed. */
        @JavascriptInterface public void look(String json) { runOnUiThread(() -> { if (Look.save(AtlasActivity.this, json)) relook(); }); }
        /** A sideways fling on a place's page that began on nothing that scrolls or edits sideways (lib/place-swipe.ts):
         *  "1" the next place, "-1" the one before; ignored on an open file. */
        @JavascriptInterface public void swipe(String by) { runOnUiThread(() -> stepPlace("1".equals(by) ? 1 : -1)); }
        /** The system's font size (Settings → Display → Font size), for the page's `--ui-scale`. */
        /** An e-ink screen (Look.isEink): the page's `ui.eink = "auto"` turns its e-ink mode on (lib/eink.ts). */
        @JavascriptInterface public String eink() { return String.valueOf(look.eink); }
        /** The page's background (`--bg`, as the vault's palette and theme draw it): the bars take it, so a black palette
         *  is not framed in the app's own grey-blue. "" puts the app's colour back. */
        @JavascriptInterface public void paper(String css) {
            runOnUiThread(() -> { int c = Look.parseCss(css, look.bg); repaper(c); TodayWidget.paint(AtlasActivity.this, shown, c, 0); });
        }
        /** The page's accent (`--accent`), reported with paper: the home-screen widget is drawn in the vault's palette. */
        @JavascriptInterface public void accent(String css) {
            runOnUiThread(() -> TodayWidget.paint(AtlasActivity.this, shown, 0, Look.parseCss(css, 0)));
        }
        /** Material You (Android 12+): the wallpaper's {accent, bars} for the page's dark or light scheme as `#rrggbb`
         *  JSON, "" on older Android. The page takes them when the vault keeps Atlas's own palette (settings.svelte.ts). */
        @JavascriptInterface public String wallpaper(boolean dark) {
            int[] you = look.eink ? null : Look.wallpaper(AtlasActivity.this, dark);
            return you == null ? "" : "{\"accent\":\"" + Look.hex(you[0]) + "\",\"bars\":\"" + Look.hex(you[1]) + "\"}";
        }
        /** native-shell.svelte.ts, before it makes a tab: a native plugin of this app opens the path instead. */
        @JavascriptInterface public String nativeOpens(String path) {
            if (path.equals(webOnce)) { webOnce = null; return "false"; } // asked for on the web this once
            return String.valueOf(nativeFor(path) != null);
        }
        /** `path` may name a place in the file after `#` (a drawing's `#Page 2`): the plugin is chosen by the file, handed all. */
        /** service-signin.ts: a plugin met a service's gate. */
        /** signin.ts `atlas.signIn`: the provider's page in the app's sign-in window; the address it comes back to goes
         *  to the page (atlasShell.signedIn), as the desktop's sign-in window hands it over. */
        @JavascriptInterface public void signIn(String url, String back) {
            runOnUiThread(() -> SignInWebActivity.oauth(AtlasActivity.this, url, back, at -> js("atlasShell.signedIn(" + JSONObject.quote(at) + ")")));
        }
        @JavascriptInterface public void signInDoor(String url) { runOnUiThread(() -> AtlasActivity.this.signInDoor(url)); }
        @JavascriptInterface public void openNative(String path) { runOnUiThread(() -> { NativePlugin p = nativeFor(path.split("#", 2)[0]); if (p != null) PluginActivity.start(AtlasActivity.this, p.id(), path); }); }
        /** lib/eink.ts's automatic refreshes: the calm one, no flash (Look.calmRefresh). */
        /** The app's player (ui/src/lib/player.svelte.ts → MediaService): a command and its JSON argument. */
        @JavascriptInterface public void player(String cmd, String arg) {
            runOnUiThread(() -> { hearPlayer(); MediaService.command(AtlasActivity.this, cmd, arg, playerHeaders()); });
        }
        @JavascriptInterface public void einkRefresh() { runOnUiThread(() -> Look.calmRefresh(web)); }
        /** lib/eink.ts, the command "E-ink: clear the screen": the full, flashing one (Look.fullRefresh). */
        @JavascriptInterface public void einkClear() { runOnUiThread(() -> Look.fullRefresh(web)); }
        @JavascriptInterface public String fontScale() { return String.valueOf(getResources().getConfiguration().fontScale); }
        /** lib/draw-excalidraw.ts on e-ink: Onyx's instant ink over the drawing (CSS pixels of the page; 0 wide: off). The
         *  firmware draws the stroke and still hands the pen's events to the page, which keeps its own copy. */
        /** pen-target.ts repaintUnderPen: the page drew under the quick ink (another device's stroke): shown now. */
        @JavascriptInterface public void inkRepaint() { runOnUiThread(() -> { if (webInk != null) webInk.up(); }); } // paced as a stroke's: never mid-word
        /** pen-target.ts wantPenDrafts: another device watches the drawing, so the stroke goes out as it grows. */
        @JavascriptInterface public void penDrafts(boolean on) { runOnUiThread(() -> { wantDrafts = on; if (catcher != null) catcher.drafts = on; }); }
        @JavascriptInterface public void ink(double left, double top, double width, double height, double lineWidth, int style) {
            runOnUiThread(() -> {
                if (webInk == null) {
                    android.util.Log.i("AtlasInk", "page asks for instant ink (e-ink " + look.eink + ", Onyx " + OnyxAccess.here() + ")");
                    if (look.eink) OnyxAccess.offer(AtlasActivity.this); // a Boox that hides its pen from Atlas: ask to be let in
                    webInk = look.eink ? Ink.onyx(web) : Ink.NONE;
                }
                float d = getResources().getDisplayMetrics().density;
                inkAsked = width > 0 && height > 0 ? new float[] { (float) (left * d), (float) (top * d), (float) ((left + width) * d), (float) ((top + height) * d), (float) (lineWidth * d), style } : null;
                applyInk();
            });
        }
    }

    /** Onyx's ink only while the page that asked for it is on screen and nothing covers it. The page cannot tell: a
     *  native screen (Settings, Files, Search) hides the WebView and a dialog sits over it while the page still sees
     *  its drawing — the pen then drew Onyx's quick line over Settings ("the screen remains in the draw mode … in
     *  settings … after having been in excalidraw", 2026-10-17). So this side decides, from what it shows. */
    private void applyInk() {
        if (webInk == null) return;
        float[] a = inkAsked;
        boolean shown = a != null && focused && web != null && web.getVisibility() == View.VISIBLE;
        if (shown) webInk.area((int) a[0], (int) a[1], (int) a[2], (int) a[3], a[4], (int) a[5]);
        else webInk.area(0, 0, 0, 0, 0, 0); // off; the page's region is kept for when it shows again
        catchPen(shown && look.eink ? a : null);
    }

    /** The native pen over the drawing's ink region (PenCatcher), or none: there exactly while the instant ink is. */
    private PenCatcher catcher;

    private boolean wantDrafts;

    private void catchPen(float[] a) {
        if (a == null) { if (catcher != null) catcher.setVisibility(View.GONE); return; }
        if (catcher == null || catcher.getParent() != web.getParent()) {
            if (catcher != null && catcher.getParent() != null) ((FrameLayout) catcher.getParent()).removeView(catcher);
            catcher = new PenCatcher(this, new PenCatcher.Stroke() {
                // the page's picture shown once the writing pauses, never mid-word (OnyxInk down / up)
                public void began() { if (webInk != null) webInk.down(0, 0, 0); }
                public void done(String json) {
                    if (ready && web != null) web.evaluateJavascript("atlasShell.penStroke && atlasShell.penStroke(" + JSONObject.quote(json) + ")", null);
                    if (webInk != null) webInk.up();
                }
                public void growing(String json) { if (ready && web != null) web.evaluateJavascript("atlasShell.penDraft && atlasShell.penDraft(" + (json == null ? "null" : JSONObject.quote(json)) + ")", null); }
            });
            catcher.drafts = wantDrafts;
            ((FrameLayout) web.getParent()).addView(catcher, new FrameLayout.LayoutParams(0, 0));
        }
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) catcher.getLayoutParams();
        lp.leftMargin = (int) a[0]; lp.topMargin = (int) a[1];
        lp.width = (int) (a[2] - a[0]); lp.height = (int) (a[3] - a[1]);
        catcher.left = a[0]; catcher.top = a[1];
        catcher.setLayoutParams(lp);
        catcher.setVisibility(View.VISIBLE);
        catcher.bringToFront();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        focused = hasFocus;
        applyInk();
        if (hasFocus && full) Shell.bars(this, true); // a dialog or a menu brought them back
    }

    /** Fullscreen: the page alone — the app's bars, the + and the system's bars gone, a swipe from an edge
     *  shows the system's a moment. Left by Back, the corner button or the page's own fullscreen button. */
    private void setFull(boolean on) {
        full = on;
        Shell.bars(this, on);
        int bars = on ? View.GONE : View.VISIBLE;
        topBar.setVisibility(bars);
        topLine.setVisibility(bars);
        bottom.setVisibility(bars);
        unfull.setVisibility(on ? View.VISIBLE : View.GONE);
        render();
        ((View) topBar.getParent()).requestApplyInsets();
    }

    private void pageReady() {
        ready = true;
        coreSeen = null;
        String seenFor = shown;
        if (seenFor != null) new Thread(() -> { String a = coreAnswer(seenFor); runOnUiThread(() -> { if (seenFor.equals(shown)) coreSeen = a; }); }, "core-seen").start();
        // a server whose page opened with nothing to sign in with lets anyone in: remembered so
        if (shown != null && Server.is(shown) && "not signed in".equals(vaults.how(this, shown))) vaults.markOpen(shown, true);
        readPlugins(); // installed or switched on since the vault opened
        // the files open when the app last showed this vault, back as tabs (the desktop's layout file is the desktop's)
        JSONArray kept = remembered();
        // behind, never native: opened as before, a kept drawing launched Notepad and a slow file took the front from
        // the view asked for meanwhile
        for (int i = 0; i < kept.length(); i++) js("(atlasShell.restore || atlasShell.open)(" + JSONObject.quote(kept.optString(i)) + ")");
        while (!waiting.isEmpty()) waiting.poll().run();
        String back = resumeTo;
        resumeTo = null;
        // the page loaded again by itself (an update's new scripts, a lost chunk, a sign-in, a reload): back at the place
        // the app shows, not the page's Home
        if (back == null && at.kind == Kind.NOTE && at.path != null) back = at.path;
        // in front again, unless a native plugin opens it (a drawing would launch Notepad over the app unasked)
        if (back != null && nativeFor(back) == null) js("atlasShell.open(" + JSONObject.quote(back) + ")");
        else if (at.kind != Kind.HOME && at.kind != Kind.NOTE && at.kind.call() != null) js(at.kind.call()); // Library, Files, Search
        render(); // the note view can be shown now
    }

    /** A call into the page, once it can take it. */
    private void js(String code) {
        if (!ready) { waiting.add(() -> js(code)); return; }
        web.evaluateJavascript(code, null);
    }

    /** Whether tab `t` is what place `k` shows itself (the page's pane ids: native-shell.svelte.ts `view`, panes.ts
     *  `paneId`; the Library is a plugin's pane, which the page names by its `place`); Home is the Today pane or the
     *  vault's home document (a file, followed as one). */
    private static boolean ownTab(Kind k, JSONObject t) {
        String id = t.optString("id");
        switch (k) {
            case SEARCH: return "search".equals(id);
            case FILES: return "files".equals(id);
            case LIBRARY: return "libraries".equals(t.optString("place"));
            case HOME: return "today".equals(id);
            default: return false;
        }
    }

    /** The tab in front before this place was asked of the page (its report can still come): not a new place. */
    private String placeTab;
    private boolean pending(String id) { return id.equals(placeTab); }

    /** The id of the page's tab in front, from its last report (null: none). */
    private String activeTab() {
        for (int i = 0; i < tabs.length(); i++) { JSONObject t = tabs.optJSONObject(i); if (t != null && t.optBoolean("active")) return t.optString("id"); }
        return null;
    }

    /** The open files' number on the tabs button. */
    private void showCount(int files) {
        int n = Math.min(files, 99);
        count.setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, n >= 10 ? 8.5f : 10f); // two digits inside the square too
        count.setText(n == 0 ? "" : String.valueOf(n));
    }

    private void tabsChanged(String json) {
        try { tabs = new JSONArray(json); } catch (Exception e) { return; }
        JSONArray files = new JSONArray();
        JSONObject active = null;
        for (int i = 0; i < tabs.length(); i++) {
            JSONObject t = tabs.optJSONObject(i);
            if (t.optBoolean("file")) files.put(t.optString("path"));
            if (t.optBoolean("active")) active = t;
        }
        showCount(files.length());
        remember(files);
        if (!at.kind.web()) return;
        if (at.kind != Kind.NOTE) {
            if (active == null) return;
            // Home, Library, Files or Search itself: the first report after going there names its tab. Another tab in
            // front after that — a file, or a view opened from there (the Catalog from the Library, a plugin's app from
            // Home) — is a place of its own, Back returning here; staying "Search" while the page showed the Catalog,
            // the next redraw put Search back
            String id = active.optString("id");
            if (pending(id) || (!active.optBoolean("file") && ownTab(at.kind, active))) return;
            go(new Screen(Kind.NOTE, id), true);
        }
        if (active == null) { go(new Screen(Kind.HOME, ""), false); return; } // the last tab closed
        if (at.arg != null && !at.arg.equals(active.optString("id"))) { // a link followed: Back returns
            Screen was = new Screen(Kind.NOTE, at.arg);
            was.path = at.path;
            history.push(was);
        }
        at.arg = active.optString("id");
        at.path = active.optBoolean("file") ? active.optString("path") : null;
        title.setText(active.optString("title"));
        place(active.optBoolean("file") ? active.optString("path") : null);
    }

    private SharedPreferences prefs() { return getSharedPreferences("atlas-tabs", MODE_PRIVATE); }
    /** prefs: the file in front per vault (PLACE + vault: its path; absent on Home, Files, Search); the one to go back to. */
    private static final String PLACE = "place:";
    /** prefs: the app's own place per vault (Library, Files, Search, Home), for a vault opened again by itself. */
    private static final String WHERE = "where:";
    private String resumeTo;
    private void place(String path) {
        if (shown == null) return;
        if (path == null) prefs().edit().remove(PLACE + shown).apply(); else prefs().edit().putString(PLACE + shown, path).apply();
    }
    private JSONArray remembered() {
        try { return new JSONArray(prefs().getString(shown, "[]")); } catch (Exception e) { return new JSONArray(); }
    }
    private void remember(JSONArray files) { if (shown != null) prefs().edit().putString(shown, files.toString()).apply(); }

    // ---- moving around -------------------------------------------------------------------------------------------

    /** A vault picked in Settings (Setup): opened now, behind the Settings page on screen, which stays (with the way
     *  back to it) — its plugins and settings are then the new vault's. */
    /** The folder's mirror, or none (unlinked there too), given to the in-app core with this app's sign-in for it. */
    private void applyMirror(String vault) {
        String mirror = vaults.mirror(vault);
        String said = Core.mirror(vault, mirror == null ? "" : mirror, mirror == null ? "" : Web.cookies(this, mirror));
        if (said.contains("\"error\"")) android.util.Log.w("AtlasMirror", vault + " → " + mirror + ": " + said);
    }

    /** Settings changed a folder's mirror (Setup): the in-app core told, and that folder's page loaded again, so the
     *  notes it opens from now on go to the new one. A folder not open now gets it when it opens. */
    void mirrorChanged(String folder) {
        if (Server.is(folder) || !folder.equals(shown)) return;
        new Thread(() -> {
            applyMirror(folder);
            runOnUiThread(() -> { if (folder.equals(shown) && web != null) web.reload(); });
        }).start();
    }

    /** This device's vaults, one tap away: a tap opens one here; a server vault that is a folder's mirror shows once, with its
     *  folder (Settings → Vaults' rule); Manage… goes to that page. */
    private void quickVaults() {
        String current = vaults.current();
        java.util.Set<String> mirrors = vaults.mirrors();
        java.util.List<String> shown = new java.util.ArrayList<>();
        for (String v : vaults.list()) if (!(Server.is(v) && mirrors.contains(v) && !v.equals(current))) shown.add(v);
        String[] labels = new String[shown.size()];
        for (int i = 0; i < shown.size(); i++) {
            String v = shown.get(i), mirror = Server.is(v) ? null : vaults.mirror(v);
            labels[i] = (v.equals(current) ? "● " : "") + vaults.title(v) + (Server.is(v) ? " (server)" : mirror != null ? " ⇄ " + Web.host(mirror) : "");
        }
        new android.app.AlertDialog.Builder(this).setTitle("Vaults")
            .setItems(labels, (d, w) -> { vaults.use(shown.get(w)); vaultChosen(); })
            .setNeutralButton("Manage…", (d, w) -> go(new Screen(Kind.SETTINGS, "vaults"), true))
            .setNegativeButton("Cancel", null).show();
    }

    void vaultChosen() {
        String chosen = vaults.current();
        if (chosen == null || chosen.equals(shown)) return;
        Screen here = at;
        java.util.ArrayDeque<Screen> back = new java.util.ArrayDeque<>(history);
        open(chosen);
        history.clear();
        history.addAll(back);
        at = here;
        render();
    }

    private void go(Screen s, boolean keep) {
        // a vault chosen in Settings opens at the next step, Settings included: its plugins and settings are there at
        // once, and a web settings page asked for right after the switch is the new vault's, not Home
        String chosen = vaults.current();
        if (chosen != null && !chosen.equals(shown)) {
            open(chosen); // Home, the new vault's history
            if (s.kind != Kind.HOME) go(s, false);
            return;
        }
        // Home, the Library, Files, Search and Settings are apps of their own, side by side: going to one starts afresh; Back steps through the files
        // opened from it, then returns to it — and within Settings, from a page to its index
        boolean settingsPage = s.kind == Kind.SETTINGS && at.kind == Kind.SETTINGS && !String.valueOf(s.arg).equals(String.valueOf(at.arg));
        if (s.kind != Kind.NOTE && !settingsPage) history.clear();
        else if (keep && resumedHistory != null && s.kind == Kind.NOTE) { history.clear(); history.addAll(resumedHistory); }
        else if (keep) history.push(at);
        resumedHistory = null; // the first step after a resume takes it, or nothing does
        at = s;
        placeTab = activeTab(); // the page may still report it once before showing the new place
        // Library, Files, Search remembered too: a vault opened again by itself (the phone turning to its night theme
        // recreates the app) comes back there, as it does to the file in front (pageReady)
        if (shown != null && (s.kind == Kind.LIBRARY || s.kind == Kind.FILES || s.kind == Kind.SEARCH || s.kind == Kind.AGENDA || s.kind == Kind.HOME)) {
            prefs().edit().putString(WHERE + shown, s.kind.name()).remove(PLACE + shown).apply(); // no file in front now
        }
        render();
    }

    /** A view of the page that is not a file (the vault's Settings, the graph): shown in the note view, never a tab. */
    private void view(String call) {
        go(new Screen(Kind.NOTE, null), true);
        js("atlasShell." + call);
    }

    /** The keyboard is up (the insets listener): the + steps aside with the bottom bar. */
    private boolean typing;

    private boolean fabShown() { return !full && !typing && at != null && (at.kind == Kind.HOME || at.kind == Kind.FILES); }

    /** What the bars show for the place on screen — which views are shown, Back or the brand, the current place's
     *  pill — with no call to the page (relook draws it again in new colours this way). */
    private void paintChrome() {
        boolean note = at.kind.web() && ready;
        if (web != null) web.setVisibility(note ? View.VISIBLE : View.GONE);
        applyInk(); // a native screen over the page: no ink there
        place.setVisibility(note ? View.GONE : View.VISIBLE);
        fab.setVisibility(fabShown() ? View.VISIBLE : View.GONE);
        boolean nowhere = history.isEmpty() || (at.kind != Kind.NOTE && at.kind != Kind.SETTINGS); // an app's own place: no Back
        back.setVisibility(nowhere ? View.GONE : View.VISIBLE);
        brand.setVisibility(nowhere ? View.VISIBLE : View.GONE);
        for (int i = 0; i < BAR.length; i++) {
            boolean on = BAR[i] != null && BAR[i] == at.kind;
            tabsOfBar[i].setTextColor(on ? look.text : look.muted);
            tabsOfBar[i].setTypeface(on ? MEDIUM : android.graphics.Typeface.DEFAULT);
            pills[i].setBackground(on ? look.round(look.accentSoft, 16, 0) : null);
            ((ImageView) ((FrameLayout) pills[i]).getChildAt(0)).getDrawable().setTint(on ? look.accent : look.muted);
        }
    }

    private void render() {
        paintChrome();
        String name = shown == null ? "Atlas" : Vaults.name(shown);
        if (at.kind == Kind.SETTINGS) { title.setText(SettingsPages.title(at.arg)); place.removeAllViews(); place.addView(settings()); return; }
        if (at.kind != Kind.NOTE && ready) place(null); // the user went Home (Files, Search): that is where to come back
        if (nativePlace()) return; // Files, Search: drawn here, the page loading or not
        title.setText(at.kind == Kind.HOME ? name : at.kind == Kind.LIBRARY ? "Library" : at.kind == Kind.FILES ? "Files" : at.kind == Kind.SEARCH ? "Search" : title.getText().toString());
        if (!ready) { place.removeAllViews(); place.addView(quiet("Opening " + name + "…")); }
        if (at.kind.call() != null) js(at.kind.call());
        else if (at.arg != null) js("atlasShell.activate(" + JSONObject.quote(at.arg) + ")");
    }

    /** A built-in plugin switched on or off in the vault on screen (VaultFiles.setOn), then its card drawn again. */
    private void switchPlugin(String id, boolean on) {
        String v = shown;
        if (v == null) return;
        new Thread(() -> {
            String err = VaultFiles.setOn(this, v, id, on);
            runOnUiThread(() -> {
                if (err != null) android.widget.Toast.makeText(this, "Not switched: " + err, android.widget.Toast.LENGTH_LONG).show();
                readPlugins();
            });
        }, "plugin-on").start();
    }

    /** A plugin this app carries added to the folder vault on screen (Bundled.add), then the plugins read again. */
    private void addPlugin(String id) {
        String v = shown;
        if (v == null) return;
        new Thread(() -> {
            String err = Bundled.add(this, v, id);
            runOnUiThread(() -> {
                android.widget.Toast.makeText(this, err == null ? "Added to " + Vaults.name(v) : "Not added: " + err, android.widget.Toast.LENGTH_LONG).show();
                readPlugins();
            });
        }, "plugin-add").start();
    }

    /** A quiet line in the middle of an empty screen (opening, an error). */
    private TextView quiet(String s) {
        TextView t = look.label(this, s, 14.5f, look.muted);
        t.setGravity(Gravity.CENTER);
        t.setPadding(look.dp(24), look.dp(24), look.dp(24), look.dp(24));
        return t;
    }

    /** Settings: the page `at.arg` names (SettingsPages), in a scroll view, a column on a tablet. */
    private View settings() {
        SettingsPages pages = new SettingsPages(this, look, new SettingsPages.Nav() {
            public void page(String arg) { go(new Screen(Kind.SETTINGS, arg), true); }
            public void web(String call) { view(call); }
            public void switchPlugin(String id, boolean on) { AtlasActivity.this.switchPlugin(id, on); }
            public void addPlugin(String id) { AtlasActivity.this.addPlugin(id); }
            public String vault() { return shown; }
            public JSONArray plugins() { return pluginsOfShown; }
        });
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(look.app);
        sv.addView(look.readable(this, pages.page(at.arg))); // a tablet: a column, not rows the screen's width
        return sv;
    }

    // ---- Files and Search, native (FilesScreen, SearchScreen; DESIGN-android-native-app.md §3) --------------------

    private FilesScreen filesScreen;
    private SearchScreen searchScreen;
    private AgendaScreen agendaScreen;
    private LibraryScreen libraryScreen;
    private String placesOf; // the vault the three were made for: another vault, new ones

    /** The vault on screen's Files (made for it on first use, kept while it is shown: its folder, its query). */
    private FilesScreen files() {
        if (filesScreen == null || !String.valueOf(shown).equals(placesOf)) newPlaces();
        return filesScreen;
    }

    private void newPlaces() {
        placesOf = String.valueOf(shown);
        FilesScreen.Shell shell = new FilesScreen.Shell() {
            public void open(String path, int line) { openFromPlace(path, line); }
            public void openWith(String path) { AtlasActivity.this.openWith(path); }
            public void copyLink(String path) { AtlasActivity.this.copyLink(path); }
            public boolean pageReady() { return ready; }
            public void step(int by) { stepPlace(by); }
        };
        filesScreen = new FilesScreen(this, shown, shell);
        searchScreen = new SearchScreen(this, shown, shell);
        libraryScreen = new LibraryScreen(this, shown, new LibraryScreen.Shell() {
            public void open(String path, int line) { openFromPlace(path, line); }
            public void openWith(String path) { AtlasActivity.this.openWith(path); }
            public void copyLink(String path) { AtlasActivity.this.copyLink(path); }
            public boolean pageReady() { return ready; }
            public void step(int by) { stepPlace(by); }
            public java.util.List<LibraryRows.App> apps() { return libraryApps(); }
            public void openApp(String id, String address) { PluginActivity.start(AtlasActivity.this, id, address); }
            public void pageLibraries() { view("view('libraries')"); }
        });
        agendaScreen = new AgendaScreen(this, shown, new AgendaScreen.Shell() {
            public void open(String path, int line) { openFromPlace(path, line); }
            public void calendar(String day) { calendarAt(day); }
        });
    }

    /** The page's Calendar pane at `day` (the Calendar plugin's own "open" and its `atlas-calendar:show` event, as its
     *  commands use them): an event's card and its editor stay the page's. */
    private void calendarAt(String day) {
        view("command('plugin.dav.open')");
        js("setTimeout(() => window.dispatchEvent(new CustomEvent('atlas-calendar:show', { detail: { date: " + JSONObject.quote(day) + ", view: 'day' } })), 600)");
    }

    /** The plugins running on this vault whose native side has a library app of its own (`<id>:library`: Manga's,
     *  Audiobookshelf's), for the Library's "Servers" chips: a server's things in its app, never mixed with the vault's. */
    private java.util.List<LibraryRows.App> libraryApps() {
        java.util.List<LibraryRows.App> out = new java.util.ArrayList<>();
        for (NativePlugin p : NativePlugins.ALL) {
            if (!running(p.id())) continue;
            LibraryRows.App app = LibraryRows.app(p.id(), p::opens, NativePlugins.manifest(p.id()));
            if (app != null) out.add(app);
        }
        return out;
    }

    /** The Library, Files, Search or the Agenda on screen, drawn natively from the vault's core; false for any other place. */
    private boolean nativePlace() {
        if (shown == null || (at.kind != Kind.LIBRARY && at.kind != Kind.FILES && at.kind != Kind.SEARCH && at.kind != Kind.AGENDA)) return false;
        files(); // the screens, for this vault
        title.setText(at.kind == Kind.LIBRARY ? "Library" : at.kind == Kind.FILES ? "Files" : at.kind == Kind.SEARCH ? "Search" : "Agenda");
        place.removeAllViews();
        place.addView(at.kind == Kind.LIBRARY ? libraryScreen.view(look) : at.kind == Kind.FILES ? filesScreen.view(look) : at.kind == Kind.SEARCH ? searchScreen.view(look) : agendaScreen.view(look));
        if (at.kind == Kind.SEARCH) searchScreen.focus();
        return true;
    }

    /** A row of Files or Search opened as any file opens: its native plugin, else the note view at `line` — a place
     *  of its own, Back returning to the list. */
    private void openFromPlace(String path, int line) {
        NativePlugin p = nativeFor(path);
        // a PDF's "line" is its page (who is where hands one): the reader is handed Obsidian's `#page=N`
        boolean pdfPage = line > 0 && path.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf");
        if (p != null) { PluginActivity.start(this, p.id(), pdfPage ? path + "#page=" + line : path); return; }
        Screen s = new Screen(Kind.NOTE, null);
        s.path = path;
        // already in front in the page (these places leave its tabs alone): no tab report will come, so taken now
        for (int i = 0; i < tabs.length(); i++) {
            JSONObject t = tabs.optJSONObject(i);
            if (t != null && t.optBoolean("active") && path.equals(t.optString("path"))) { s.arg = t.optString("id"); title.setText(t.optString("title")); }
        }
        go(s, true);
        js("atlasShell.open(" + JSONObject.quote(path) + (line > 0 ? "," + line : "") + ")");
    }

    /** Back: first whatever the page has open over the note (the palette, a menu, a dialog, a Settings area), then the
     *  app's own places. */
    @Override
    public void onBackPressed() {
        if (full) { setFull(false); return; }
        if (at.kind == Kind.FILES && filesScreen != null && filesScreen.up()) return; // the folder above first
        if (!ready || !at.kind.web() || web.getVisibility() != View.VISIBLE) { backOut(); return; }
        web.evaluateJavascript("window.atlasShell && atlasShell.dismiss ? atlasShell.dismiss() : false", r -> { if (!"true".equals(r)) backOut(); });
    }

    private void backOut() {
        while (!history.isEmpty()) {
            Screen s = history.pop();
            if (s.kind == Kind.NOTE && !isOpen(s.arg)) {
                // its tab closed since (the page closes a tab Back leaves): opened again from its file, not skipped —
                // skipping them all was Back landing on Home
                if (s.path == null || !ready) continue;
                at = new Screen(Kind.NOTE, null);
                at.path = s.path;
                render();
                js("atlasShell.open(" + JSONObject.quote(s.path) + ")");
                return;
            }
            at = s;
            render();
            return;
        }
        if (at.kind != Kind.HOME) { at = new Screen(Kind.HOME, ""); render(); return; }
        super.onBackPressed();
    }

    private boolean isOpen(String id) {
        if (id == null) return false;
        for (int i = 0; i < tabs.length(); i++) if (id.equals(tabs.optJSONObject(i).optString("id"))) return true;
        return false;
    }

    // ---- the tabs and the menu -----------------------------------------------------------------------------------

    /** A file's icon by its kind (the desktop's: a picture, a note). */
    private static String iconFor(String path) {
        return path.toLowerCase(java.util.Locale.ROOT).matches(".*\\.(png|jpe?g|gif|webp|svg|avif|jxl)$") ? "image" : "note";
    }

    /** A sheet rising from the bottom (the tabs; Material's modal bottom sheet): a grip, rounded top, the scrim behind. */
    private Dialog sheet(View content) {
        Dialog d = new Dialog(this);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        android.graphics.drawable.GradientDrawable bg = look.round(look.pop, 0, look.eink ? look.borderStrong : 0); // e-ink: a frame, no scrim
        float r = look.dp(22);
        bg.setCornerRadii(new float[] { r, r, r, r, 0, 0, 0, 0 });
        box.setBackground(bg);
        box.setPadding(look.dp(8), look.dp(8), look.dp(8), look.dp(16));
        View grip = new View(this);
        grip.setBackground(look.round(look.borderStrong, 2, 0));
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(look.dp(36), look.dp(4));
        gp.gravity = Gravity.CENTER_HORIZONTAL;
        gp.setMargins(0, look.dp(2), 0, look.dp(10));
        box.addView(grip, gp);
        ScrollView sv = new ScrollView(this);
        sv.addView(content);
        box.addView(sv);
        d.setContentView(box);
        Window w = d.getWindow();
        if (w != null) {
            w.setBackgroundDrawableResource(android.R.color.transparent);
            w.setGravity(Gravity.BOTTOM);
            w.setLayout(-1, -2);
            if (!look.eink) w.setWindowAnimations(android.R.style.Animation_InputMethod); // slides up from the bottom
            w.setDimAmount(look.eink ? 0f : 0.4f);
        }
        return d;
    }

    /** The open files: tap one to show it, × to close it, "Close all"; the one on screen marked. */
    private void tabSheet() {
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        Dialog d = sheet(list);
        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setPadding(look.dp(12), 0, look.dp(4), look.dp(6));
        int n = 0;
        for (int i = 0; i < tabs.length(); i++) if (tabs.optJSONObject(i).optBoolean("file")) n++;
        TextView h = look.label(this, n == 0 ? "Open files" : "Open files · " + n, 17, look.text);
        h.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        head.addView(h, new LinearLayout.LayoutParams(0, look.dp(40), 1f));
        if (n > 1) {
            TextView all = look.label(this, "Close all", 14, look.accent);
            all.setPadding(look.dp(12), 0, look.dp(12), 0);
            all.setBackground(look.pressable(0x00000000, 10, 0));
            all.setOnClickListener(v -> { d.dismiss(); closeAll(); });
            head.addView(all, new LinearLayout.LayoutParams(-2, look.dp(48)));
        }
        list.addView(head);
        for (int i = 0; i < tabs.length(); i++) {
            JSONObject t = tabs.optJSONObject(i);
            if (!t.optBoolean("file")) continue;
            String id = t.optString("id"), path = t.optString("path");
            boolean on = at.kind == Kind.NOTE && id.equals(at.arg);
            int slash = path.lastIndexOf('/');
            LinearLayout r = new LinearLayout(this);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setMinimumHeight(look.dp(56));
            r.setPadding(look.dp(14), look.dp(6), look.dp(2), look.dp(6));
            r.setBackground(look.pressable(on ? look.accentSoft : 0x00000000, 14, 0));
            ImageView icon = new ImageView(this);
            icon.setImageDrawable(look.icon(this, iconFor(path), on ? look.accent : look.muted));
            LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(look.dp(20), look.dp(20));
            ip.setMarginEnd(look.dp(14));
            r.addView(icon, ip);
            LinearLayout words = new LinearLayout(this);
            words.setOrientation(LinearLayout.VERTICAL);
            TextView name = look.label(this, t.optString("title"), 15.5f, look.text); // the page names it (no extension)
            name.setSingleLine(true);
            name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            if (on) name.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            words.addView(name);
            if (slash > 0) {
                TextView folder = look.label(this, path.substring(0, slash), 12.5f, look.faint);
                folder.setSingleLine(true);
                folder.setEllipsize(android.text.TextUtils.TruncateAt.START);
                words.addView(folder);
            }
            r.addView(words, new LinearLayout.LayoutParams(0, -2, 1f));
            r.setOnClickListener(v -> { d.dismiss(); go(new Screen(Kind.NOTE, id), true); });
            ImageView x = iconButton("close", "Close " + t.optString("title"), v -> { js("atlasShell.close(" + JSONObject.quote(id) + ")"); list.removeView((View) v.getParent()); });
            r.addView(x);
            list.addView(r);
        }
        if (n == 0) list.addView(quiet("No files open. Open one from Home, Files or Search."));
        d.show();
    }

    private void closeAll() {
        for (int i = 0; i < tabs.length(); i++) {
            JSONObject t = tabs.optJSONObject(i);
            if (t.optBoolean("file")) js("atlasShell.close(" + JSONObject.quote(t.optString("id")) + ")");
        }
    }

    /** The ⋮ menu, in the app's own look (a card under the button, an icon per line), not the platform's grey list. */
    private void menu(View anchor) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(look.dp(6), look.dp(6), look.dp(6), look.dp(6));
        card.setBackground(look.round(look.pop, 16, look.border));
        card.setElevation(look.elevation(8));
        android.widget.PopupWindow pop = new android.widget.PopupWindow(card, look.dp(244), -2, true);
        pop.setElevation(look.elevation(8));
        pop.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
        boolean file = at.kind == Kind.NOTE && at.arg != null && isOpen(at.arg);
        String path = file ? pathOf(at.arg) : null;
        if (file) menuItem(card, pop, "close", "Close this file", () -> js("atlasShell.close(" + JSONObject.quote(at.arg) + ")"));
        if (file && tabs.length() > 1) menuItem(card, pop, "tabs", "Close all files", this::closeAll);
        if (path != null) {
            // the file's own actions
            menuItem(card, pop, "note", "Rename…", () -> rename(path));
            menuItem(card, pop, "chevron", "Show in Files", () -> { files().reveal(path); go(new Screen(Kind.FILES, ""), true); });
            menuItem(card, pop, "more", "Open with…", () -> openWith(path));
            menuItem(card, pop, "link", "Copy a link to it", () -> copyLink(path));
            menuItem(card, pop, "search", "Outline", () -> view("view('outline')"));
            menuItem(card, pop, "close", "Move to the trash…", () -> trash(path));
        }
        menuItem(card, pop, "maximize", "Fullscreen", () -> setFull(true));
        menuItem(card, pop, "command", "Commands", () -> view("view('commands')"));
        menuItem(card, pop, "settings", "Vault settings", () -> view("view('settings')"));
        menuItem(card, pop, "server", "Phone and vaults", () -> go(new Screen(Kind.SETTINGS, ""), true));
        pop.showAsDropDown(anchor, -look.dp(200), -look.dp(4));
    }

    /** The bottom bar's Apps: direct links to the apps of this vault's plugins (Manga, Audiobooks: their own screens,
     *  as their launcher icons open them) and to the Agenda, in a menu over the bar. */
    private void appsMenu(View anchor) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(look.dp(6), look.dp(6), look.dp(6), look.dp(6));
        card.setBackground(look.round(look.pop, 16, look.border));
        card.setElevation(look.elevation(8));
        android.widget.PopupWindow pop = new android.widget.PopupWindow(card, look.dp(244), -2, true);
        pop.setElevation(look.elevation(8));
        pop.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
        for (LibraryRows.App app : libraryApps())
            menuItem(card, pop, app.icon, app.title, () -> PluginActivity.start(this, app.id, app.address));
        menuItem(card, pop, "calendar", "Agenda", () -> go(new Screen(Kind.AGENDA, ""), true));
        look.showBy(pop, card, anchor, true); // above the bar, its middle over the Apps item, whole on the screen
    }

    private String pathOf(String id) {
        for (int i = 0; i < tabs.length(); i++) {
            JSONObject t = tabs.optJSONObject(i);
            if (id.equals(t.optString("id"))) return t.isNull("path") ? null : t.optString("path");
        }
        return null;
    }

    private static String nameOf(String path) { return path.substring(path.lastIndexOf('/') + 1); }

    private void rename(String path) {
        android.widget.EditText name = new android.widget.EditText(this);
        String shown = Look.shownName(path); // no extension: the page keeps the file's own (atlasShell.rename)
        name.setText(shown);
        int dot = shown.equals(nameOf(path)) ? shown.lastIndexOf('.') : -1; // a shown extension (not a note's) stays unselected
        name.setSelection(0, dot > 0 ? dot : name.length());
        name.setSingleLine(true);
        LinearLayout form = new LinearLayout(this);
        form.setPadding(look.dp(20), look.dp(8), look.dp(20), 0);
        form.addView(name, new LinearLayout.LayoutParams(-1, -2));
        new android.app.AlertDialog.Builder(this).setTitle("Rename").setView(form)
            .setPositiveButton("Rename", (d, w) -> js("atlasShell.rename(" + JSONObject.quote(path) + "," + JSONObject.quote(name.getText().toString().trim()) + ")"))
            .setNegativeButton("Cancel", null).show();
    }

    /** The views that can show this file (the page's openers: a picture as image or as its code, a table as text…). */
    private void openWith(String path) {
        web.evaluateJavascript("atlasShell.openers(" + JSONObject.quote(path) + ")", r -> {
            try {
                JSONArray all = new JSONArray(new JSONArray("[" + r + "]").getString(0)); // the call's answer is a JSON string
                String[] labels = new String[all.length()];
                for (int i = 0; i < all.length(); i++) labels[i] = all.getJSONObject(i).getString("title") + (all.getJSONObject(i).optBoolean("isDefault") ? " · default" : "");
                new android.app.AlertDialog.Builder(this).setTitle("Open with")
                    .setItems(labels, (d, w) -> js("atlasShell.openWith(" + JSONObject.quote(path) + "," + JSONObject.quote(all.optJSONObject(w).optString("id")) + ")"))
                    .setNegativeButton("Cancel", null).show();
            } catch (Exception e) { android.widget.Toast.makeText(this, "Nothing else opens this file", android.widget.Toast.LENGTH_SHORT).show(); }
        });
    }

    /** `[[name]]` (a note without `.md`, as Obsidian links it) on the clipboard. */
    private void copyLink(String path) {
        String link = "[[" + nameOf(path).replaceFirst("\\.md$", "") + "]]";
        ((android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("link", link));
        android.widget.Toast.makeText(this, "Copied " + link, android.widget.Toast.LENGTH_SHORT).show();
    }

    private void trash(String path) {
        new android.app.AlertDialog.Builder(this).setTitle("Move to the trash?")
            .setMessage(Look.shownName(path) + " goes to the vault's .atlas/trash/, where it can be taken back.")
            .setPositiveButton("Move to the trash", (d, w) -> js("atlasShell.trash(" + JSONObject.quote(path) + ")"))
            .setNegativeButton("Cancel", null).show();
    }

    private void menuItem(LinearLayout card, android.widget.PopupWindow pop, String icon, String label, Runnable run) {
        LinearLayout r = look.row(this, icon, label, "");
        r.setOnClickListener(v -> { pop.dismiss(); run.run(); });
        card.addView(r);
    }

    /** What the player's service sends to reach the core of the vault on screen: a server's sign-in (Server.headerMap),
     *  or the in-app core's cookie (it is locked to this app's WebView). */
    private java.util.Map<String, String> playerHeaders() {
        if (shown != null && Server.is(shown)) return Server.headerMap(this, shown);
        java.util.Map<String, String> h = new java.util.HashMap<>();
        String url = web == null ? null : web.getUrl();
        String cookie = url == null ? null : android.webkit.CookieManager.getInstance().getCookie(url);
        if (cookie != null) h.put("Cookie", cookie);
        return h;
    }

    /** The player's state shown on the page, as it changes (`window.__atlasPlayer`, player.svelte.ts). */
    private void hearPlayer() {
        MediaService.listener = json -> runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__atlasPlayer&&window.__atlasPlayer(" + json + ")", null); });
    }

    // ---- the note view's failures (WebHealth; DESIGN-android-native-app.md §7) -------------------------------------

    /** A failure of the note view: logged by its name (`adb logcat -s AtlasWeb`), said in a toast when it says something. */
    private void failed(WebHealth.Failure f, String what) {
        android.util.Log.e(WebHealth.TAG, f.name + ": " + what);
        String say = f.says(what);
        if (say != null && !isFinishing()) android.widget.Toast.makeText(this, say, android.widget.Toast.LENGTH_LONG).show();
    }

    /** Renderer of `v` gone: an old view is only let go; the current one is made again at the place and its tabs
     *  (open(…, true)), unless it keeps dying — then a message waits for a tap instead of a loop. */
    private void rendererGone(WebView v, String why) {
        if (v != web) { v.destroy(); return; }
        if (shown == null) return;
        if (restarts.allow(System.currentTimeMillis())) { failed(WebHealth.Failure.RENDERER_GONE, why); open(shown, true); return; }
        failed(WebHealth.Failure.RENDERER_LOOP, why);
        ready = false; // calls wait for the next page (js)
        ((FrameLayout) web.getParent()).removeView(web);
        web.destroy();
        web = webView(); // one view, not loaded: nothing runs until the tap
        web.setVisibility(View.GONE);
        ((FrameLayout) place.getParent()).addView(web, 1, new FrameLayout.LayoutParams(-1, -1));
        String vault = shown;
        TextView m = quiet("The page of " + Vaults.name(vault) + " keeps stopping (" + why + "). Tap to open it again.");
        m.setOnClickListener(x -> { if (vault.equals(shown)) open(vault, true); });
        place.removeAllViews();
        place.addView(m);
        place.setVisibility(View.VISIBLE);
    }

    /** On resume after a while away: the core asked; another core than the page's (restarted, updated) reloads the page
     *  once, no answer is asked again once and then said (WebHealth.onResume). */
    private void checkCore(String vault, boolean retried) {
        new Thread(() -> {
            String now = coreAnswer(vault);
            runOnUiThread(() -> {
                if (!vault.equals(shown) || isFinishing()) return;
                switch (WebHealth.onResume(coreSeen, now, retried)) {
                    case NOTHING: if (coreSeen == null) coreSeen = now; break;
                    case RETRY: place.postDelayed(() -> checkCore(vault, true), 4_000); break;
                    case SAY_DOWN: failed(WebHealth.Failure.CORE_DOWN, Vaults.name(vault)); break;
                    case RELOAD: failed(WebHealth.Failure.CORE_RESTARTED, Vaults.name(vault)); open(vault, true); break;
                }
            });
        }, "core-check").start();
    }

    /** The core's address and `/api/version` answer for `vault` (the in-app core with its key, a server with the app's
     *  sign-in): its version, commit and interface digest, the cheapest GET there is; null when it does not answer.
     *  Off the UI thread. */
    private String coreAnswer(String vault) {
        try {
            boolean server = Server.is(vault);
            Local.Endpoint here = server ? null : Local.of(this, vault);
            String base = server ? SignIn.base(vault) : here.base;
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL(base + "/api/version").openConnection();
            h.setInstanceFollowRedirects(false);
            h.setConnectTimeout(5000);
            h.setReadTimeout(5000);
            h.setRequestProperty("x-atlas", "1");
            if (server) Server.headers(this, vault, h);
            else if (!here.key.isEmpty()) h.setRequestProperty("x-atlas-token", here.key);
            if (h.getResponseCode() != 200) return null;
            // the address too: the in-app core made again (same build) listens on another port, a new core all the same
            return base + "\n" + new String(Bytes.all(h.getInputStream()), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    /** Memory low: the WebView's caches let go (WebHealth.trim), the page in view kept. */
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (web == null || WebHealth.trim(level) != WebHealth.Trim.CACHES) return;
        android.util.Log.w(WebHealth.TAG, WebHealth.Failure.MEMORY_LOW.name + ": level " + level + ", the page's caches let go");
        web.clearCache(false); // the memory cache only: the files on disk stay
    }

    @Override
    protected void onDestroy() {
        MediaService.listener = null; // the page is gone; the service plays on and reports to the core itself
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
