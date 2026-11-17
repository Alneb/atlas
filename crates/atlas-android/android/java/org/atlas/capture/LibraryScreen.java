package org.atlas.capture;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.LruCache;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.GridView;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The phone's Library, native (docs/design/DESIGN-android-native-app.md §3, §4): the vault's own libraries — a folder or
 * a Base with a kind, `[ui] libraries` — as chips along the top; the chosen one's search, order and layout under them,
 * then what you were in the middle of (Continue), then its things as covers or a list. The libraries, their things,
 * their order and the Continue row come from the vault's core (`GET /api/libraries`, `GET /api/library`: the core in
 * this app for a folder vault, the server for a server's), so it works while the page loads or has failed; LibraryRows
 * reads the answers. A server's things are never mixed in: a plugin with a library app of its own (Manga's,
 * Audiobookshelf's: a native side that opens `<id>:library`) is a button in a row above the vault's chips, with its
 * launcher icon, opening its app; "More" opens the page's Libraries (Drawings, References, the plugins' others). A tap opens a thing as any file
 * opens (its native reader, else the note view); a long press gives the file's menu (FilesScreen.menu).
 */
final class LibraryScreen {
    /** What the app does for the Library, beyond what it does for Files. */
    interface Shell extends FilesScreen.Shell {
        /** The plugins whose library app the Library lists, running on this vault. */
        List<LibraryRows.App> apps();
        /** Plugin `id`'s screen at `address`. */
        void openApp(String id, String address);
        /** The page's Libraries (the libraries Atlas and the plugins give, drawn by the page). */
        void pageLibraries();
    }

    private static final int COVER_W = 360;
    /** Covers decoded small, kept for the app's run (shared by every vault's Library). */
    private static final LruCache<String, Bitmap> covers = new LruCache<String, Bitmap>(16 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getAllocationByteCount(); }
    };
    private static final ExecutorService coverPool = Executors.newFixedThreadPool(2);

    private final Activity a;
    private final String vault;
    private final Shell shell;
    private final SharedPreferences prefs;
    private Look look;
    private LinearLayout root, apps, chips, continueRow, body;
    private HorizontalScrollView continueStrip;
    private TextView continueLabel, sortButton, status;
    private ImageView layoutButton;
    private EditText search;
    private List<LibraryRows.Lib> libs = new ArrayList<>();
    private LibraryRows.View shownView;
    private List<LibraryRows.Thing> shownThings = new ArrayList<>();
    private String chosen, sort, query = "";
    /** The library asked of the core last (an older answer is dropped). */
    private String asked;
    private final Things adapter = new Things();
    private boolean grid = true;

    LibraryScreen(Activity a, String vault, Shell shell) {
        this.a = a;
        this.vault = vault;
        this.shell = shell;
        prefs = a.getSharedPreferences("library", Context.MODE_PRIVATE);
        chosen = prefs.getString(vault + "/chosen", "");
    }

    /** The screen in `look`'s colours (made again when the page's colours change), read afresh from the core. */
    View view(Look look) {
        if (root == null || this.look != look) build(look);
        load();
        return root;
    }

    private void build(Look look) {
        this.look = look;
        root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(look.app);
        // the servers' apps first, a row of their own always in view (Manga, Audiobooks: their things are theirs, not
        // the vault's); then the vault's libraries as chips, then the page's
        apps = new LinearLayout(a);
        apps.setGravity(Gravity.CENTER_VERTICAL);
        apps.setPadding(look.dp(12), look.dp(10), look.dp(12), 0);
        root.addView(apps, new LinearLayout.LayoutParams(-1, -2));
        chips = new LinearLayout(a);
        chips.setGravity(Gravity.CENTER_VERTICAL);
        chips.setPadding(look.dp(12), look.dp(8), look.dp(12), look.dp(4));
        HorizontalScrollView chipsScroll = new HorizontalScrollView(a);
        chipsScroll.setHorizontalScrollBarEnabled(false);
        chipsScroll.addView(chips);
        root.addView(chipsScroll, new LinearLayout.LayoutParams(-1, -2));
        // search, order, layout
        LinearLayout tools = new LinearLayout(a);
        tools.setGravity(Gravity.CENTER_VERTICAL);
        tools.setPadding(look.dp(12), look.dp(4), look.dp(8), look.dp(6));
        search = new EditText(a);
        search.setSingleLine(true);
        search.setTextSize(15);
        search.setTextColor(look.text);
        search.setHintTextColor(look.faint);
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setBackground(look.round(look.bg, 22, look.border));
        search.setPadding(look.dp(16), 0, look.dp(16), 0);
        search.setCompoundDrawablesRelativeWithIntrinsicBounds(look.icon(a, "search", look.faint), null, null, null);
        search.setCompoundDrawablePadding(look.dp(10));
        search.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int st, int c, int af) {}
            public void onTextChanged(CharSequence s, int st, int b, int c) {}
            public void afterTextChanged(Editable e) { query = e.toString(); showThings(); }
        });
        tools.addView(search, new LinearLayout.LayoutParams(0, look.dp(44), 1));
        sortButton = look.label(a, "", 13.5f, look.muted);
        sortButton.setGravity(Gravity.CENTER);
        sortButton.setPadding(look.dp(12), 0, look.dp(12), 0);
        sortButton.setMinHeight(look.dp(44));
        sortButton.setBackground(look.pressable(0, 22, 0));
        sortButton.setOnClickListener(v -> { sort = LibraryRows.nextSort(sort); prefs.edit().putString(vault + "/" + chosen + "/sort", sort).apply(); loadThings(); });
        tools.addView(sortButton, new LinearLayout.LayoutParams(-2, look.dp(44)));
        layoutButton = new ImageView(a);
        layoutButton.setScaleType(ImageView.ScaleType.CENTER);
        layoutButton.setBackground(look.pressable(0, 22, 0));
        layoutButton.setOnClickListener(v -> { grid = !grid; prefs.edit().putBoolean(vault + "/" + chosen + "/grid", grid).apply(); drawBody(); });
        tools.addView(layoutButton, new LinearLayout.LayoutParams(look.dp(44), look.dp(44)));
        root.addView(tools, new LinearLayout.LayoutParams(-1, -2));
        // what you were in the middle of
        continueLabel = look.label(a, "Continue", 12, look.muted);
        continueLabel.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        continueLabel.setLetterSpacing(0.06f);
        continueLabel.setPadding(look.dp(16), look.dp(6), look.dp(16), look.dp(4));
        root.addView(continueLabel);
        continueRow = new LinearLayout(a);
        continueRow.setPadding(look.dp(10), 0, look.dp(10), look.dp(8));
        continueStrip = new HorizontalScrollView(a);
        continueStrip.setHorizontalScrollBarEnabled(false);
        continueStrip.addView(continueRow);
        root.addView(continueStrip, new LinearLayout.LayoutParams(-1, -2));
        status = look.label(a, "", 15, look.muted);
        status.setGravity(Gravity.CENTER);
        status.setPadding(look.dp(28), look.dp(32), look.dp(28), look.dp(32));
        body = new LinearLayout(a);
        body.setOrientation(LinearLayout.VERTICAL);
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1f));
    }

    /** The libraries from the core, then the chosen one's things; off the main thread. */
    void load() {
        if (root == null) return;
        drawChips();
        setStatus("Reading the libraries…", null);
        new Thread(() -> {
            List<LibraryRows.Lib> got = null;
            String why = null;
            try { got = LibraryRows.libraries(new String(server().get("/api/libraries"), StandardCharsets.UTF_8)); }
            catch (Exception e) { why = message(e); android.util.Log.w("AtlasLibrary", "libraries: " + why); }
            List<LibraryRows.Lib> list = got;
            String failed = why;
            a.runOnUiThread(() -> {
                if (a.isFinishing()) return;
                if (failed != null) { libs = new ArrayList<>(); drawChips(); setStatus("Could not read the libraries: " + failed, this::load); return; }
                libs = list;
                LibraryRows.Lib pick = LibraryRows.pick(libs, chosen);
                drawChips();
                if (pick == null) { showNone(); return; }
                choose(pick);
            });
        }, "library").start();
    }

    private void choose(LibraryRows.Lib lib) {
        chosen = lib.id;
        prefs.edit().putString(vault + "/chosen", chosen).apply();
        sort = prefs.getString(vault + "/" + chosen + "/sort", lib.sort);
        grid = prefs.getBoolean(vault + "/" + chosen + "/grid", lib.covers());
        search.setHint("Search " + lib.title);
        drawChips();
        loadThings();
    }

    private void loadThings() {
        String id = chosen, order = sort;
        asked = id + "\n" + order;
        String want = asked;
        sortButton.setText(LibraryRows.sortName(order));
        if (shownView == null || !shownView.lib.id.equals(id)) setStatus("Opening…", null);
        new Thread(() -> {
            LibraryRows.View got = null;
            String why = null;
            try {
                String q = "/api/library?id=" + VaultFiles.OnServer.q(id) + (order == null ? "" : "&sort=" + VaultFiles.OnServer.q(order));
                got = LibraryRows.view(new String(server().get(q), StandardCharsets.UTF_8));
            } catch (Exception e) { why = message(e); android.util.Log.w("AtlasLibrary", "library " + id + ": " + why); }
            LibraryRows.View v = got;
            String failed = why;
            a.runOnUiThread(() -> {
                if (!want.equals(asked) || a.isFinishing()) return;
                if (failed != null) { setStatus("Could not read this library: " + failed, this::loadThings); return; }
                shownView = v;
                showThings();
            });
        }, "library-things").start();
    }

    // ---- drawing ------------------------------------------------------------------------------------------------

    private void drawChips() {
        chips.removeAllViews();
        for (LibraryRows.Lib l : libs) {
            TextView c = TopBar.chip(look, a, l.title, l.id.equals(chosen), () -> { if (!l.id.equals(chosen)) choose(l); });
            c.setCompoundDrawablesRelativeWithIntrinsicBounds(look.icon(a, LibraryRows.icon(l.kind), l.id.equals(chosen) ? look.accent : look.muted), null, null, null);
            c.setCompoundDrawablePadding(look.dp(6));
            chips.addView(c);
            chips.addView(TopBar.gap(look, a));
        }
        drawApps();
        TextView more = TopBar.chip(look, a, "More…", false, shell::pageLibraries);
        chips.addView(more);
    }

    /** The servers' apps (Manga, Audiobooks…), each a button with its launcher icon: one tap into the app. */
    private void drawApps() {
        apps.removeAllViews();
        List<LibraryRows.App> list = shell.apps();
        apps.setVisibility(list.isEmpty() ? View.GONE : View.VISIBLE);
        for (LibraryRows.App app : list) {
            TextView b = look.button(a, app.title, false);
            b.setCompoundDrawablesRelativeWithIntrinsicBounds(look.icon(a, app.icon, look.accent), null, null, null);
            b.setCompoundDrawablePadding(look.dp(8));
            b.setOnClickListener(v -> shell.openApp(app.id, app.address));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            lp.setMarginEnd(look.dp(8));
            apps.addView(b, lp);
        }
    }

    private void setStatus(String text, Runnable retry) {
        body.removeAllViews();
        continueLabel.setVisibility(View.GONE);
        continueStrip.setVisibility(View.GONE);
        status.setText(text);
        body.addView(status, new LinearLayout.LayoutParams(-1, -2));
        if (retry != null) {
            TextView again = look.button(a, "Try again", true);
            again.setOnClickListener(v -> retry.run());
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.gravity = Gravity.CENTER_HORIZONTAL;
            body.addView(again, lp);
        }
    }

    /** No library of the vault's own yet: how to make one, and the ways to what there is. */
    private void showNone() {
        search.setEnabled(false);
        sortButton.setVisibility(View.GONE);
        layoutButton.setVisibility(View.GONE);
        setStatus("No library of your own yet.\n\nIn Files, a folder's ⋮ → Show as a library makes one of it: your books, comics, audiobooks or films with their covers, and what you were in the middle of first.", null);
        TextView files = look.button(a, "Go to Files", true);
        files.setOnClickListener(v -> shell.step(1));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        body.addView(files, lp);
    }

    private void showThings() {
        if (shownView == null) return;
        search.setEnabled(true);
        sortButton.setVisibility(View.VISIBLE);
        layoutButton.setVisibility(View.VISIBLE);
        shownThings = LibraryRows.matching(shownView.items, query);
        // Continue: not while searching (it would hide what was asked for)
        boolean cont = query.trim().isEmpty() && !shownView.continuing.isEmpty();
        continueLabel.setVisibility(cont ? View.VISIBLE : View.GONE);
        continueStrip.setVisibility(cont ? View.VISIBLE : View.GONE);
        continueRow.removeAllViews();
        if (cont) for (LibraryRows.Thing t : shownView.continuing) {
            Tile tile = tile(true, t);
            continueRow.addView(tile, new LinearLayout.LayoutParams(look.dp(108), -2));
        }
        drawBody();
    }

    private void drawBody() {
        layoutButton.setImageDrawable(look.icon(a, grid ? "menu" : "grid", look.muted));
        layoutButton.setContentDescription(grid ? "Show as a list" : "Show as covers");
        body.removeAllViews();
        if (shownView == null) return;
        if (shownThings.isEmpty()) {
            status.setText(shownView.items.isEmpty() ? "Nothing in " + shownView.lib.title + " yet." : "Nothing matches “" + query.trim() + "”.");
            body.addView(status, new LinearLayout.LayoutParams(-1, -2));
            return;
        }
        AbsListView list;
        if (grid) {
            GridView g = new GridView(a);
            g.setColumnWidth(look.dp(112));
            g.setNumColumns(GridView.AUTO_FIT);
            g.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
            g.setHorizontalSpacing(look.dp(10));
            g.setVerticalSpacing(look.dp(14));
            g.setPadding(look.dp(12), look.dp(4), look.dp(12), look.dp(24));
            list = g;
        } else {
            ListView l = new ListView(a);
            l.setDivider(null);
            list = l;
        }
        list.setClipToPadding(false);
        list.setSelector(new android.graphics.drawable.ColorDrawable(0));
        list.setAdapter(adapter);
        adapter.notifyDataSetChanged();
        body.addView(list, new LinearLayout.LayoutParams(-1, -1));
    }

    /** A thing's tile: its cover (the core's thumbnail, else its kind's icon), how far on it, its title and line; a tap
     *  opens it, a long press gives the file's menu. */
    private Tile tile(boolean asGrid, LibraryRows.Thing t) {
        Tile tile = new Tile(look, a, asGrid);
        bind(tile, t);
        return tile;
    }

    private void bind(Tile tile, LibraryRows.Thing t) {
        tile.title.setText(t.title);
        tile.detail.setText(LibraryRows.detail(t));
        boolean far = t.progress > 0 && t.progress < 1;
        tile.badge.setText(far ? Math.round(t.progress * 100) + " %" : "");
        tile.badge.setVisibility(far ? View.VISIBLE : View.GONE);
        tile.setOnClickListener(v -> shell.open(t.path, 0));
        tile.setOnLongClickListener(v -> {
            PlaceItem it = PlaceItem.row(t.title);
            it.path = t.path;
            FilesScreen.menu(a, look, vault, it, v, shell, this::loadThings);
            return true;
        });
        cover(tile.cover, t);
    }

    private void cover(ImageView v, LibraryRows.Thing t) {
        String key = vault + "\n" + t.cover;
        v.setTag(key);
        Bitmap had = t.cover == null ? null : covers.get(key);
        if (had != null) { v.setScaleType(ImageView.ScaleType.CENTER_CROP); v.setImageBitmap(had); return; }
        v.setScaleType(ImageView.ScaleType.CENTER);
        v.setImageDrawable(look.icon(a, LibraryRows.icon(shownView == null ? "" : shownView.lib.kind), look.faint));
        if (t.cover == null || t.cover.startsWith("http")) return; // an address: the page's (the phone asks only the vault)
        coverPool.execute(() -> {
            Bitmap b = null;
            try { b = Images.decode(server().get("/api/thumb?path=" + VaultFiles.OnServer.q(t.cover) + "&w=" + COVER_W), COVER_W, COVER_W * 3 / 2); }
            catch (Exception e) { android.util.Log.w("AtlasLibrary", "cover " + t.cover + ": " + message(e)); }
            Bitmap got = b;
            if (got != null) covers.put(key, got);
            a.runOnUiThread(() -> {
                if (got == null || !key.equals(v.getTag())) return; // a recycled tile shows another thing now
                v.setScaleType(ImageView.ScaleType.CENTER_CROP);
                v.setImageBitmap(got);
            });
        });
    }

    private final class Things extends BaseAdapter {
        @Override public int getCount() { return shownThings.size(); }
        @Override public Object getItem(int i) { return shownThings.get(i); }
        @Override public long getItemId(int i) { return i; }
        @Override public View getView(int i, View old, ViewGroup parent) {
            Tile t = old instanceof Tile && ((Tile) old).grid == grid ? (Tile) old : new Tile(look, a, grid);
            bind(t, shownThings.get(i));
            return t;
        }
    }

    private VaultFiles.OnServer server() throws Exception { return (VaultFiles.OnServer) VaultFiles.of(a, vault); }

    private static String message(Exception e) { return e.getMessage() == null ? e.toString() : e.getMessage(); }
}
