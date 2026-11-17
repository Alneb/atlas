package org.atlas.plugins.manga;

import android.content.Context;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridView;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.Look;
import org.atlas.capture.Tile;
import org.atlas.capture.TopBar;

import java.util.concurrent.ExecutorService;

/**
 * A source's series (Mihon's browse of one source): Popular, Latest (when the source has it) or a search, as covers in
 * a grid, the next page asked as the grid nears its end (Browse.Paging), the ones already in the library marked. A tap
 * opens the series' screen (SeriesView), where it is added to the library. Pull to ask the list again from its first
 * page.
 */
final class SourceView extends LinearLayout implements org.atlas.capture.NativePlugin.Back {
    private final MangaScreen screen;
    private final Host host;
    private final Look look;
    private final Browse.Source source;
    private final Covers covers;
    private final ExecutorService io = Pages.pool(1, "manga-source");
    private final TopBar bar;
    private final EditText search;
    private final LinearLayout kinds;
    private final GridView grid;
    private final TextView status;
    private final Adapter adapter = new Adapter();
    private final Browse.Paging paging = new Browse.Paging();
    /** Why the last page failed (null: it did not). */
    private String failure;

    SourceView(MangaScreen screen, Browse.Source source) {
        super(screen.getContext());
        this.screen = screen;
        this.host = screen.host;
        this.look = host.look();
        this.source = source;
        covers = new Covers(host);
        Context c = getContext();
        setOrientation(VERTICAL);
        setBackgroundColor(look.bg);

        bar = new TopBar(host, () -> host.activity().onBackPressed());
        bar.title(source.displayName);
        bar.action("search", "Search this source", this::toggleSearch);
        addView(bar, new LayoutParams(-1, -2));

        search = new EditText(c);
        search.setHint("Search " + source.name);
        search.setSingleLine(true);
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setTextColor(look.text);
        search.setHintTextColor(look.faint);
        search.setBackground(look.round(look.hover, 10, look.border));
        search.setPadding(look.dp(14), look.dp(10), look.dp(14), look.dp(10));
        search.setVisibility(GONE);
        search.setOnEditorActionListener((v, action, e) -> {
            boolean go = action == EditorInfo.IME_ACTION_SEARCH || (e != null && e.getKeyCode() == KeyEvent.KEYCODE_ENTER && e.getAction() == KeyEvent.ACTION_DOWN);
            if (go) { keyboard(false); list(Browse.Type.SEARCH, search.getText().toString()); }
            return go;
        });
        LayoutParams sp = new LayoutParams(-1, -2);
        sp.setMargins(look.dp(12), look.dp(8), look.dp(12), look.dp(4));
        addView(search, sp);

        HorizontalScrollView kindScroll = new HorizontalScrollView(c);
        kindScroll.setHorizontalScrollBarEnabled(false);
        kinds = new LinearLayout(c);
        kinds.setPadding(look.dp(10), 0, look.dp(10), 0);
        kindScroll.addView(kinds);
        addView(kindScroll, new LayoutParams(-1, -2));

        grid = new GridView(c);
        grid.setColumnWidth(look.dp(112));
        grid.setNumColumns(GridView.AUTO_FIT);
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
        grid.setHorizontalSpacing(look.dp(10));
        grid.setVerticalSpacing(look.dp(14));
        grid.setPadding(look.dp(12), look.dp(8), look.dp(12), look.dp(16));
        grid.setClipToPadding(false);
        grid.setSelector(new android.graphics.drawable.ColorDrawable(0));
        grid.setAdapter(adapter);
        grid.setOnItemClickListener((p, v, i, id) -> {
            Browse.Found f = paging.items.get(i);
            screen.series(f.key(), f.title, f.cover, null, false);
        });
        grid.setOnScrollListener(new AbsListView.OnScrollListener() {
            @Override public void onScrollStateChanged(AbsListView v, int state) {}
            @Override public void onScroll(AbsListView v, int first, int visible, int total) { more(first + visible - 1); }
        });
        FrameLayout body = new FrameLayout(c);
        body.addView(new Pull(host, grid, done -> list(paging.type, paging.query, done)), new FrameLayout.LayoutParams(-1, -1));
        status = look.label(c, "", 15, look.muted);
        status.setGravity(Gravity.CENTER);
        status.setPadding(look.dp(32), 0, look.dp(32), 0);
        body.addView(status, new FrameLayout.LayoutParams(-1, -1));
        addView(body, new LayoutParams(-1, 0, 1));

        list(Browse.Type.POPULAR, "");
    }

    // ---- the list ----

    /** A new list: `type` (a search's words in `query`) from its first page. */
    private void list(Browse.Type type, String query) { list(type, query, null); }

    private void list(Browse.Type type, String query, Runnable done) {
        paging.reset(type, query);
        failure = null;
        kinds();
        adapter.notifyDataSetChanged();
        shown();
        pullDone = done;
        if (!more(0) && done != null) { pullDone = null; done.run(); }
    }

    /** The pull waiting for the first page. */
    private Runnable pullDone;

    /** The grid shows up to tile `last`: the next page asked when it is near the end → whether one was asked. */
    private boolean more(int last) {
        if (!paging.wants(last) || failure != null) return false;
        int[] ticket = paging.ask();
        shown();
        Browse.Type type = paging.type;
        String query = paging.query;
        Pages.run(io, () -> {
            Browse.Page p = null;
            String why = null;
            try { p = Suwayomi.browse(host, source.id, type, ticket[1], query); } catch (Exception e) { why = e.getMessage() == null ? e.toString() : e.getMessage(); }
            final Browse.Page got = p;
            final String why2 = why;
            post(() -> {
                if (got == null) { paging.failed(ticket); failure = why2; }
                else if (paging.add(ticket, got) < 0) return; // an older list's
                adapter.notifyDataSetChanged();
                shown();
                if (pullDone != null) { pullDone.run(); pullDone = null; }
                // a first page that does not fill the screen: the next at once
                if (got != null) post(() -> more(grid.getLastVisiblePosition()));
            });
        });
        return true;
    }

    /** The chips: Popular, Latest, and the search when there is one. */
    private void kinds() {
        kinds.removeAllViews();
        kind("Popular", Browse.Type.POPULAR);
        if (source.latest) kind("Latest", Browse.Type.LATEST);
        if (paging.type == Browse.Type.SEARCH) kind("“" + paging.query + "”", Browse.Type.SEARCH);
    }

    private void kind(String name, Browse.Type type) {
        kinds.addView(TopBar.chip(look, getContext(), name, paging.type == type, () -> { if (type != Browse.Type.SEARCH) list(type, ""); }));
        kinds.addView(TopBar.gap(look, getContext()));
    }

    /** The bar's line and the empty grid's words, from where the paging is. */
    private void shown() {
        bar.sub(paging.loading ? (paging.page == 0 ? "Asking " + source.name + "…" : "Loading page " + (paging.page + 1) + "…")
            : failure != null && !paging.items.isEmpty() ? "Stopped: " + failure
            : !paging.more && paging.page > 0 ? paging.items.size() + " series" : null);
        boolean empty = paging.items.isEmpty();
        status.setText(paging.loading ? "Asking " + source.name + "…"
            : failure != null ? source.name + " could not be listed: " + failure + "\n(pull to try again)"
            : paging.type == Browse.Type.SEARCH && paging.query.isEmpty() ? "Type what to search for."
            : "Nothing found.");
        status.setVisibility(empty ? VISIBLE : GONE);
        if (host.eink()) post(host::einkRefresh);
    }

    private void toggleSearch() {
        boolean on = search.getVisibility() != VISIBLE;
        search.setVisibility(on ? VISIBLE : GONE);
        keyboard(on);
        if (!on && paging.type == Browse.Type.SEARCH) { search.setText(""); list(Browse.Type.POPULAR, ""); }
    }

    private void keyboard(boolean show) {
        InputMethodManager im = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (show) { search.requestFocus(); im.showSoftInput(search, 0); }
        else im.hideSoftInputFromWindow(search.getWindowToken(), 0);
    }

    /** Back from a series: added to or removed from the library there, its tile says so. */
    void returned(SeriesView v) {
        Boolean in = v.inLibrary();
        if (in == null || v.series() == null) return;
        for (Browse.Found f : paging.items) if (f.id == v.series().remote) f.inLibrary = in;
        adapter.notifyDataSetChanged();
    }

    @Override public boolean back() {
        if (search.getVisibility() == VISIBLE) { toggleSearch(); return true; }
        return false;
    }

    @Override protected void onDetachedFromWindow() { io.shutdownNow(); covers.close(); super.onDetachedFromWindow(); }

    private final class Adapter extends BaseAdapter {
        @Override public int getCount() { return paging.items.size(); }
        @Override public Object getItem(int i) { return paging.items.get(i); }
        @Override public long getItemId(int i) { return i; }

        @Override public View getView(int i, View old, ViewGroup parent) {
            Tile t = old instanceof Tile ? (Tile) old : new Tile(look, getContext(), true);
            Browse.Found f = paging.items.get(i);
            t.title.setText(f.title);
            t.detail.setVisibility(GONE);
            t.badge.setText("In library");
            t.badge.setVisibility(f.inLibrary ? VISIBLE : GONE);
            t.setAlpha(f.inLibrary ? 0.6f : 1f); // as Mihon: the ones you have already, quieter
            t.setContentDescription(f.title + (f.inLibrary ? ", in the library" : ""));
            covers.show(t.cover, f.key(), covers.found(f));
            return t;
        }
    }
}
