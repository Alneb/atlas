package org.atlas.plugins.audiobookshelf;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.AbsListView;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.atlas.capture.Look;
import org.atlas.capture.NativePlugin;
import org.atlas.capture.PlaceItem;
import org.atlas.capture.PlaceList;
import org.atlas.capture.TopBar;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * The library: every book of the server's book libraries, as covers in a grid or a list (the bar switches it, kept on
 * this device), and its series, authors, collections and playlists as tabs, each a PlaceList whose row opens its books
 * (GroupView). A filter by title, author, narrator or series over what the tab shows. Each tab is asked of the server
 * when first shown; the bar's refresh asks again.
 */
final class LibraryView extends LinearLayout implements NativePlugin.Back {
    enum Tab {
        BOOKS("Books"), SERIES("Series"), AUTHORS("Authors"), COLLECTIONS("Collections"), PLAYLISTS("Playlists");
        final String label;
        Tab(String label) { this.label = label; }
    }

    private static Tab lastTab = Tab.BOOKS;
    private final AbsScreen screen;
    private final Look look;
    private final TopBar bar;
    private final ImageView layoutButton;
    private final EditText filter;
    private final LinearLayout tabs;
    private final FrameLayout body;
    private final TextView status;
    private final PlaceList rows;
    private AbsListView grid;
    private CardGrid.Adapter adapter;
    private boolean asGrid;
    private Tab tab = lastTab;
    private final Map<Tab, List<Cards.Card>> got = new EnumMap<>(Tab.class);
    private final Map<Tab, String> failed = new EnumMap<>(Tab.class);

    LibraryView(AbsScreen screen) {
        super(screen.getContext());
        this.screen = screen;
        this.look = screen.host.look();
        setOrientation(VERTICAL);
        setBackgroundColor(look.bg);
        Context c = getContext();
        asGrid = !"list".equals(prefs().getString("layout", "grid"));
        bar = new TopBar(screen.host, () -> screen.host.activity().onBackPressed());
        bar.title("Library");
        bar.action("search", "Filter", this::toggleFilter);
        layoutButton = bar.action(asGrid ? "menu" : "grid", asGrid ? "Show as a list" : "Show as a grid", this::toggleLayout);
        bar.action("repeat", "Ask the server again", () -> { got.remove(tab); failed.remove(tab); show(); });
        addView(bar, new LayoutParams(-1, -2));

        filter = new EditText(c);
        filter.setHint("Filter by title, author, series");
        filter.setSingleLine(true);
        filter.setTextColor(look.text);
        filter.setHintTextColor(look.faint);
        filter.setBackground(look.round(look.hover, 10, look.border));
        filter.setPadding(look.dp(14), look.dp(10), look.dp(14), look.dp(10));
        filter.setVisibility(GONE);
        filter.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int d) {}
            public void onTextChanged(CharSequence s, int a, int b, int d) {}
            public void afterTextChanged(Editable e) { fill(); }
        });
        LayoutParams fp = new LayoutParams(-1, -2);
        fp.setMargins(look.dp(12), look.dp(8), look.dp(12), look.dp(4));
        addView(filter, fp);

        HorizontalScrollView tabScroll = new HorizontalScrollView(c);
        tabScroll.setHorizontalScrollBarEnabled(false);
        tabs = new LinearLayout(c);
        tabs.setPadding(look.dp(10), 0, look.dp(10), 0);
        tabScroll.addView(tabs);
        addView(tabScroll, new LayoutParams(-1, -2));

        body = new FrameLayout(c);
        addView(body, new LayoutParams(-1, 0, 1));
        status = look.label(c, "", 15, look.muted);
        status.setGravity(Gravity.CENTER);
        status.setPadding(look.dp(32), 0, look.dp(32), 0);
        rows = new PlaceList(c, look, new PlaceList.On() {
            @Override public void open(PlaceItem it) { Cards.Card g = byKey(it.path); if (g != null) screen.open(g); }
            @Override public void more(PlaceItem it, View anchor) {}
            @Override public void refresh() { got.remove(tab); failed.remove(tab); show(); rows.setRefreshing(false); }
            @Override public void step(int by) { Tab[] all = Tab.values(); int i = tab.ordinal() + by; if (i >= 0 && i < all.length) pick(all[i]); }
        });
        makeGrid();
        show();
    }

    private SharedPreferences prefs() { return getContext().getSharedPreferences("audiobookshelf", Context.MODE_PRIVATE); }

    private void pick(Tab t) { tab = t; lastTab = t; show(); }

    /** The tab's chips, then its content: asked of the server the first time. */
    private void show() {
        tabs.removeAllViews();
        for (Tab t : Tab.values()) {
            tabs.addView(TopBar.chip(look, getContext(), t.label, t == tab, () -> pick(t)));
            tabs.addView(TopBar.gap(look, getContext()));
        }
        if (!got.containsKey(tab) && !failed.containsKey(tab)) load(tab);
        fill();
    }

    private void load(Tab t) {
        got.put(t, null); // asked
        screen.io.execute(() -> {
            try {
                Map<String, Object> p = Cards.progressMap(screen.abs.me());
                List<Cards.Card> out = new ArrayList<>();
                for (Object l : screen.abs.bookLibraries()) {
                    String lib = "/api/libraries/" + Abs.lib(l);
                    switch (t) {
                        case BOOKS: out.addAll(screen.abs.items(l, p)); break;
                        case SERIES: out.addAll(Cards.seriesOf(screen.abs.get(lib + "/series?limit=500"), p)); break;
                        case AUTHORS: out.addAll(Cards.authorsOf(screen.abs.get(lib + "/authors"))); break;
                        case COLLECTIONS: out.addAll(Cards.collectionsOf(screen.abs.get(lib + "/collections"), p)); break;
                        case PLAYLISTS: out.addAll(Cards.playlistsOf(screen.abs.get(lib + "/playlists"), p)); break;
                    }
                }
                post(() -> { got.put(t, out); fill(); });
            } catch (Exception e) { post(() -> { got.remove(t); failed.put(t, e.getMessage()); fill(); }); }
        });
    }

    private Cards.Card byKey(String key) {
        List<Cards.Card> all = got.get(tab);
        if (all != null) for (Cards.Card c : all) if ((c.kind + ":" + c.id).equals(key)) return c;
        return null;
    }

    private void fill() {
        List<Cards.Card> all = got.get(tab);
        List<Cards.Card> shown = all == null ? new ArrayList<>() : Cards.filter(all, filter.getText().toString());
        body.removeAllViews();
        String said = failed.containsKey(tab) ? "Not listed: " + failed.get(tab) + "\n(the bar's ↻ asks again)"
            : all == null ? "Asking " + screen.abs.base().replaceFirst("^https?://", "") + "…"
            : shown.isEmpty() ? (all.isEmpty() ? "No " + tab.label.toLowerCase(java.util.Locale.ROOT) + " on the server." : "Nothing here matches.") : null;
        if (tab == Tab.BOOKS) {
            adapter.cards = shown;
            adapter.notifyDataSetChanged();
            body.addView(grid, new FrameLayout.LayoutParams(-1, -1));
            if (said != null) { status.setText(said); body.addView(status, new FrameLayout.LayoutParams(-1, -1)); }
        } else {
            List<PlaceItem> items = new ArrayList<>();
            for (Cards.Card g : shown) {
                PlaceItem it = PlaceItem.row(g.title);
                it.detail = g.detail();
                it.icon = tab == Tab.AUTHORS ? "pen" : tab == Tab.PLAYLISTS ? "music" : "library";
                it.path = g.kind + ":" + g.id;
                items.add(it);
            }
            rows.setItems(items, said);
            body.addView(rows, new FrameLayout.LayoutParams(-1, -1));
        }
        bar.sub(all == null ? null : all.size() + " " + tab.label.toLowerCase(java.util.Locale.ROOT));
        if (screen.host.eink()) post(screen.host::einkRefresh);
    }

    private void makeGrid() {
        adapter = new CardGrid.Adapter(screen, asGrid);
        grid = CardGrid.of(screen, adapter, asGrid);
    }

    private void toggleLayout() {
        asGrid = !asGrid;
        bar.icon(layoutButton, asGrid ? "menu" : "grid", asGrid ? "Show as a list" : "Show as a grid");
        prefs().edit().putString("layout", asGrid ? "grid" : "list").apply();
        makeGrid();
        fill();
    }

    private void toggleFilter() {
        boolean on = filter.getVisibility() != VISIBLE;
        filter.setVisibility(on ? VISIBLE : GONE);
        InputMethodManager im = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (on) { filter.requestFocus(); im.showSoftInput(filter, 0); }
        else { filter.setText(""); im.hideSoftInputFromWindow(filter.getWindowToken(), 0); }
    }

    @Override public boolean back() {
        if (filter.getVisibility() == VISIBLE) { toggleFilter(); return true; }
        return false;
    }
}
