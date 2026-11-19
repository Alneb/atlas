package org.atlas.plugins.manga;

import android.content.Context;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridView;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.Look;
import org.atlas.capture.Tile;
import org.atlas.capture.TopBar;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;

/**
 * The native library, a Suwayomi client's (Mihon's library screen): the server's categories as tabs (Shelf.tabs), the
 * vault's own series in their tab, and Reading — what was started, last read first — whose series open straight in the
 * reader where they were left. Covers in a grid or a list (the plugin's `library_layout`), the unread count on each,
 * a filter by title, pull to refresh (the server looks for new chapters: Suwayomi's library update). With the server
 * out of reach its library as last listed (Kept.library). Opening a series is MangaScreen's (SeriesView).
 *
 * The bar's Browse (with a server) opens the server's sources (SourcesView): series found there are added to the
 * library from their screen, and the library lists again when it is shown after a change. The categories' tabs follow
 * the server's own order of them.
 */
final class LibraryView extends LinearLayout implements org.atlas.capture.NativePlugin.Back {
    /** The tab shown last, for the next time the library opens in this run of the app. */
    private static String lastTab;

    private final MangaScreen screen;
    private final Host host;
    private final Look look;
    private final Covers covers;
    private final ExecutorService io = Pages.pool(1, "manga-library");
    private final TopBar bar;
    private final ImageView layoutButton;
    private final EditText filter;
    private final LinearLayout tabs;
    private final FrameLayout body;
    private final TextView status;
    private Pull pull;
    private AbsListView list;
    private final Adapter adapter = new Adapter();
    /** Everything listed, the vault's series behind their items (their chapters and where you are). */
    private List<Shelf.Item> items = new ArrayList<>();
    private final Map<String, Library.Series> vault = new HashMap<>();
    private List<Shelf.Item> shown = new ArrayList<>();
    private String tab, server = "Suwayomi", offline = "";
    /** The server's categories by name, in its order (the tabs'). */
    private List<String> order = new ArrayList<>();
    /** Why the server's library could not be listed (null: it was, or there is no server). */
    private String failure;
    private boolean grid, loaded;
    /** The order chosen (the plugin's `library_order` and `library_descending`; the bar's sort button). */
    private Shelf.Order sortBy;
    private boolean descending;
    /** Which series show (the plugin's `library_show`; the order dialog's second choice). */
    private Shelf.Show show;

    LibraryView(MangaScreen screen) {
        super(screen.getContext());
        this.screen = screen;
        this.host = screen.host;
        this.look = host.look();
        covers = new Covers(host);
        setOrientation(VERTICAL);
        setBackgroundColor(look.bg);
        Context c = getContext();
        grid = !"list".equals(host.settings().optString("library_layout", "grid"));
        sortBy = Shelf.Order.of(host.settings().optString("library_order", "auto"));
        descending = host.settings().optBoolean("library_descending", false);
        show = Shelf.Show.of(host.settings().optString("library_show", "all"));
        String base = Suwayomi.base(host);
        if (!base.isEmpty()) server = base.replaceFirst("^https?://", "").replaceFirst("/.*$", "");

        bar = new TopBar(host, () -> host.activity().onBackPressed());
        bar.title("Manga");
        if (!base.isEmpty()) bar.action("plus", "Browse: find new series in the server's sources", screen::browse);
        bar.action("search", "Filter by title", this::toggleFilter);
        bar.action("arrow_down", "Order the library", this::chooseOrder);
        layoutButton = bar.action(grid ? "menu" : "grid", grid ? "Show as a list" : "Show as a grid", this::toggleLayout);
        bar.action("repeat", "Look for new chapters", () -> { if (pull != null) pull.start(); });
        addView(bar, new LayoutParams(-1, -2));

        filter = new EditText(c);
        filter.setHint("Filter by title");
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
        status = look.label(c, "Opening the library…", 15, look.muted);
        status.setGravity(Gravity.CENTER);
        status.setPadding(look.dp(32), 0, look.dp(32), 0);
        addView(body, new LayoutParams(-1, 0, 1));
        makeList();
        load(false);
    }

    // ---- data ----

    /** The vault's series and the server's library, away from the UI; `update`: the server asked to look for new
     *  chapters first (a pull). */
    private void load(boolean update) { load(update, null); }

    private void load(boolean update, Runnable done) {
        Pages.run(io, () -> {
            List<Shelf.Item> got = new ArrayList<>();
            Map<String, Library.Series> mine = new HashMap<>();
            String why = "", failed = null;
            List<Browse.Category> cats = new ArrayList<>();
            for (Library.Series s : Library.inVault(host)) {
                s.reading = Library.reading(host, s);
                mine.put(s.path, s);
                got.add(Library.item(s));
            }
            if (!Suwayomi.base(host).isEmpty()) {
                try {
                    if (update) Suwayomi.updateLibrary(host);
                    String[] off = { "" };
                    got.addAll(Suwayomi.library(host, off, cats));
                    why = off[0];
                } catch (Exception e) { failed = e.getMessage() == null ? e.toString() : e.getMessage(); }
            }
            final String why2 = why, failed2 = failed;
            post(() -> {
                items = got;
                loaded = true;
                order = Browse.names(cats);
                failure = failed2;
                vault.clear();
                vault.putAll(mine);
                offline = why2;
                bar.sub(failed2 != null ? failed2 : !offline.isEmpty() ? server + " cannot be reached: as last seen" : null);
                if (update && failed2 == null && !Suwayomi.base(host).isEmpty() && offline.isEmpty()) host.toast(server + " is looking for new chapters: they show as unread as they come");
                tabs();
                if (done != null) done.run();
            });
        });
    }

    /** Back from Browse after a series was added or removed: the library listed again. */
    void reload() { load(false); }

    /** Back from a series (or the reader): what changed there shown at once, no network. */
    void returned(Library.Series s) {
        if (s == null) return;
        for (int k = 0; k < items.size(); k++) {
            Shelf.Item it = items.get(k);
            if (!it.key.equals(s.path)) continue;
            if (it.origin == Shelf.Origin.VAULT) { items.set(k, Library.item(s)); break; }
            if (s.reading != null && s.reading.has("last")) it.lastRead = Math.max(it.lastRead, System.currentTimeMillis());
            if (!s.chapters.isEmpty()) {
                int u = 0;
                for (String ch : s.chapters) if (!Library.isRead(s.reading == null ? new JSONObject() : s.reading, ch)) u++;
                it.unread = u;
            }
            break;
        }
        tabs();
    }

    // ---- tabs and the list ----

    private void tabs() {
        List<String> names = Shelf.tabs(items, server, order);
        if (tab == null || !names.contains(tab)) tab = lastTab != null && names.contains(lastTab) ? lastTab : names.isEmpty() ? null : first(names);
        tabs.removeAllViews();
        if (names.size() > 1) for (String n : names) {
            tabs.addView(TopBar.chip(look, getContext(), n, n.equals(tab), () -> { tab = n; lastTab = n; tabs(); }));
            tabs.addView(TopBar.gap(look, getContext()));
        }
        fill();
    }

    /** The library opens on its first shelf of series, not on Reading (one tap away). */
    private static String first(List<String> names) { return names.size() > 1 && Shelf.READING.equals(names.get(0)) ? names.get(1) : names.get(0); }

    private void fill() {
        shown = tab == null ? new ArrayList<>() : Shelf.shelf(tab, items, filter.getText().toString(), server, sortBy, descending, show);
        adapter.notifyDataSetChanged();
        if (shown.isEmpty()) {
            status.setText(!loaded ? "Opening the library…"
                : !items.isEmpty() ? "Nothing here matches."
                : failure != null ? "The library could not be listed: " + failure + "\n(pull to try again)"
                : "No manga yet: a folder per series in the vault's " + Library.folder(host) + " folder, or your Suwayomi in the plugin's settings.");
            if (status.getParent() == null) body.addView(status, new FrameLayout.LayoutParams(-1, -1));
        } else if (status.getParent() != null) body.removeView(status);
        if (host.eink()) post(host::einkRefresh);
    }

    private void makeList() {
        if (pull != null) body.removeView(pull);
        if (grid) {
            GridView g = new GridView(getContext());
            g.setColumnWidth(look.dp(112));
            g.setNumColumns(GridView.AUTO_FIT);
            g.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
            g.setHorizontalSpacing(look.dp(10));
            g.setVerticalSpacing(look.dp(14));
            g.setPadding(look.dp(12), look.dp(8), look.dp(12), look.dp(16));
            list = g;
        } else {
            ListView l = new ListView(getContext());
            l.setDivider(null);
            l.setPadding(0, look.dp(4), 0, look.dp(16));
            list = l;
        }
        list.setClipToPadding(false);
        list.setSelector(new android.graphics.drawable.ColorDrawable(0));
        list.setAdapter(adapter);
        list.setOnItemClickListener((p, v, i, id) -> open(shown.get(i)));
        pull = new Pull(host, list, done -> load(true, done));
        body.addView(pull, 0, new FrameLayout.LayoutParams(-1, -1));
    }

    private void open(Shelf.Item it) {
        boolean resume = Shelf.READING.equals(tab); // Reading: straight to where it was left
        screen.series(it.key, it.title, it.cover, vault.get(it.key), resume);
    }

    private void toggleLayout() {
        grid = !grid;
        bar.icon(layoutButton, grid ? "menu" : "grid", grid ? "Show as a list" : "Show as a grid");
        makeList();
        fill();
        String v = grid ? "grid" : "list";
        Pages.run(io, () -> { String said = host.saveSettings(settings("library_layout", v)); if (said != null) host.toast("Not saved: " + said); });
    }

    /** The library's order: one of Shelf.Order's, and turned round or not; kept as the plugin's settings. */
    private void chooseOrder() {
        Shelf.Order[] all = Shelf.Order.values();
        String[] labels = new String[all.length];
        for (int i = 0; i < all.length; i++) labels[i] = all[i].label;
        android.widget.CheckBox round = new android.widget.CheckBox(getContext());
        round.setText("Turned round");
        round.setTextColor(look.text);
        round.setChecked(descending);
        round.setPadding(look.dp(8), 0, 0, 0);
        LinearLayout foot = new LinearLayout(getContext());
        foot.setOrientation(LinearLayout.VERTICAL);
        foot.setPadding(look.dp(20), look.dp(4), look.dp(20), 0);
        foot.addView(round);
        // which series show: every one, those with chapters left, started, downloaded
        android.widget.TextView showing = new android.widget.TextView(getContext());
        showing.setText("Show");
        showing.setTextColor(look.text);
        showing.setPadding(look.dp(8), look.dp(12), 0, look.dp(4));
        foot.addView(showing);
        android.widget.RadioGroup shows = new android.widget.RadioGroup(getContext());
        Shelf.Show[] kinds = Shelf.Show.values();
        for (int i = 0; i < kinds.length; i++) {
            android.widget.RadioButton r = new android.widget.RadioButton(getContext());
            r.setId(View.generateViewId());
            r.setText(kinds[i].label);
            r.setTextColor(look.text);
            r.setTag(kinds[i]);
            shows.addView(r);
            if (kinds[i] == show) shows.check(r.getId());
        }
        foot.addView(shows);
        new android.app.AlertDialog.Builder(getContext())
            .setTitle("Order and show")
            .setSingleChoiceItems(labels, sortBy.ordinal(), (d, w) -> { sortBy = all[w]; })
            .setView(foot)
            .setPositiveButton("Done", (d, w) -> {
                descending = round.isChecked();
                View picked = shows.findViewById(shows.getCheckedRadioButtonId());
                if (picked != null && picked.getTag() instanceof Shelf.Show) show = (Shelf.Show) picked.getTag();
                fill();
                JSONObject s = settings("library_order", sortBy.word);
                try { s.put("library_descending", descending); s.put("library_show", show.word); } catch (org.json.JSONException ignored) {}
                Pages.run(io, () -> { String said = host.saveSettings(s); if (said != null) host.toast("Not saved: " + said); });
            })
            .setNegativeButton("Cancel", (d, w) -> sortBy = Shelf.Order.of(host.settings().optString("library_order", "auto")))
            .show();
    }

    private static JSONObject settings(String k, String v) {
        try { return new JSONObject().put(k, v); } catch (org.json.JSONException e) { return new JSONObject(); }
    }

    private void toggleFilter() {
        boolean on = filter.getVisibility() != VISIBLE;
        filter.setVisibility(on ? VISIBLE : GONE);
        android.view.inputmethod.InputMethodManager im = (android.view.inputmethod.InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (on) { filter.requestFocus(); im.showSoftInput(filter, 0); }
        else { filter.setText(""); im.hideSoftInputFromWindow(filter.getWindowToken(), 0); }
    }

    @Override public boolean back() {
        if (filter.getVisibility() == VISIBLE) { toggleFilter(); return true; }
        return false;
    }

    @Override protected void onDetachedFromWindow() { io.shutdownNow(); covers.close(); super.onDetachedFromWindow(); }

    // ---- a series' tile ----

    private String detail(Shelf.Item it) {
        if (it.unread > 0) return it.unread + " unread";
        if (it.chapters >= 0) return it.chapters + " chapter" + (it.chapters == 1 ? "" : "s");
        return it.origin == Shelf.Origin.SERVER ? "all read" : "";
    }

    private final class Adapter extends BaseAdapter {
        @Override public int getCount() { return shown.size(); }
        @Override public Object getItem(int i) { return shown.get(i); }
        @Override public long getItemId(int i) { return i; }

        @Override public View getView(int i, View old, ViewGroup parent) {
            Tile t = old instanceof Tile && ((Tile) old).grid == grid ? (Tile) old : new Tile(look, getContext(), grid);
            Shelf.Item it = shown.get(i);
            t.title.setText(it.title);
            t.detail.setText(detail(it));
            t.badge.setText(String.valueOf(it.unread));
            t.badge.setVisibility(it.unread > 0 && grid ? VISIBLE : GONE);
            t.setContentDescription(it.title + ", " + detail(it));
            Library.Series s = vault.get(it.key);
            covers.show(t.cover, it.key, s != null ? covers.vault(s) : covers.server(it));
            return t;
        }
    }
}
