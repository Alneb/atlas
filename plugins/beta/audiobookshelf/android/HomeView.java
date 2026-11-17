package org.atlas.plugins.audiobookshelf;

import android.content.Context;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.atlas.capture.Json;
import org.atlas.capture.Look;
import org.atlas.capture.NativePlugin;
import org.atlas.capture.Tile;
import org.atlas.capture.TopBar;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The home (the page's home.js on the phone): per library, the server's own shelves for you — Continue listening,
 * Recently added, Continue series, Discover, Listen again, Newest episodes (`/personalized`) — then your collections
 * and playlists; the bar's search asks the server's own search of every library as you type (after a pause). A card
 * opens its book, a group its books, an episode plays. The bar's Library opens every book.
 */
final class HomeView extends LinearLayout implements NativePlugin.Back, AbsScreen.Place {
    private final AbsScreen screen;
    private final Look look;
    private final EditText search;
    private final LinearLayout body;
    private final TextView status;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private List<Cards.Shelf> shelves = new ArrayList<>();
    private Map<String, Object> progress = new java.util.HashMap<>();
    private int asked;

    HomeView(AbsScreen screen) {
        super(screen.getContext());
        this.screen = screen;
        this.look = screen.host.look();
        setOrientation(VERTICAL);
        setBackgroundColor(look.bg);
        Context c = getContext();
        TopBar bar = new TopBar(screen.host, () -> screen.host.activity().onBackPressed());
        bar.title("Audiobooks");
        bar.sub(screen.abs.base().replaceFirst("^https?://", ""));
        bar.action("search", "Search Audiobookshelf", this::toggleSearch);
        bar.action("library", "Library: every book, series, authors", screen::library);
        bar.action("repeat", "Load the shelves again", this::load);
        addView(bar, new LayoutParams(-1, -2));

        search = new EditText(c);
        search.setHint("Search Audiobookshelf");
        search.setSingleLine(true);
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setTextColor(look.text);
        search.setHintTextColor(look.faint);
        search.setBackground(look.round(look.hover, 10, look.border));
        search.setPadding(look.dp(14), look.dp(10), look.dp(14), look.dp(10));
        search.setVisibility(GONE);
        search.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int d) {}
            public void onTextChanged(CharSequence s, int a, int b, int d) {}
            public void afterTextChanged(Editable e) { ui.removeCallbacks(find); ui.postDelayed(find, 300); }
        });
        LayoutParams sp = new LayoutParams(-1, -2);
        sp.setMargins(look.dp(12), look.dp(8), look.dp(12), look.dp(4));
        addView(search, sp);

        ScrollView scroll = new ScrollView(c);
        body = new LinearLayout(c);
        body.setOrientation(VERTICAL);
        body.setPadding(0, look.dp(4), 0, look.dp(24));
        scroll.addView(body);
        addView(scroll, new LayoutParams(-1, 0, 1));
        status = look.label(c, "Loading the shelves…", 15, look.muted);
        status.setGravity(Gravity.CENTER);
        status.setPadding(look.dp(24), look.dp(24), look.dp(24), look.dp(24));
        load();
    }

    private void load() {
        draw(new ArrayList<>(), "Loading the shelves…");
        screen.io.execute(() -> {
            try {
                Object me = screen.abs.me();
                Map<String, Object> p = Cards.progressMap(me);
                List<Object> libs = screen.abs.libraries();
                List<Cards.Shelf> got = new ArrayList<>();
                for (Object l : libs) {
                    String lib = Abs.lib(l), name = Json.str(l, "name", "");
                    for (Cards.Shelf s : Cards.shelvesOf(get("/api/libraries/" + lib + "/personalized?limit=12"), p))
                        got.add(libs.size() > 1 ? new Cards.Shelf(s.id, s.label + " · " + name, s.cards) : s);
                    List<Cards.Card> cols = Cards.collectionsOf(get("/api/libraries/" + lib + "/collections"), p);
                    if (!cols.isEmpty()) got.add(new Cards.Shelf("collections", "Collections", cols));
                    List<Cards.Card> lists = Cards.playlistsOf(get("/api/libraries/" + lib + "/playlists"), p);
                    if (!lists.isEmpty()) got.add(new Cards.Shelf("playlists", "Playlists", lists));
                }
                post(() -> { progress = p; shelves = got; if (search.getText().toString().trim().isEmpty()) draw(got, got.isEmpty() ? "Nothing on the shelves yet." : null); });
            } catch (Exception e) { post(() -> draw(new ArrayList<>(), "Not loaded: " + e.getMessage())); }
        });
    }

    /** An answer, or nothing when that part failed (the other shelves still show). */
    private Object get(String path) { try { return screen.abs.get(path); } catch (Exception e) { return null; } }

    private final Runnable find = this::find;

    /** The server's search, every library at once; a later search wins. */
    private void find() {
        String q = search.getText().toString().trim();
        int mine = ++asked;
        if (q.isEmpty()) { draw(shelves, shelves.isEmpty() ? "Nothing on the shelves yet." : null); return; }
        draw(new ArrayList<>(), "Searching…");
        screen.io.execute(() -> {
            List<List<Cards.Shelf>> parts = new ArrayList<>();
            try {
                for (Object l : screen.abs.libraries()) {
                    Object r = get("/api/libraries/" + Abs.lib(l) + "/search?q=" + Abs.q(q) + "&limit=12");
                    if (r != null) parts.add(Cards.hitsOf(r, progress));
                }
                List<Cards.Shelf> hits = Cards.merged(parts);
                post(() -> { if (mine == asked) draw(hits, hits.isEmpty() ? "Nothing found for “" + q + "”." : null); });
            } catch (Exception e) { post(() -> { if (mine == asked) draw(new ArrayList<>(), "Not searched: " + e.getMessage()); }); }
        });
    }

    private void draw(List<Cards.Shelf> rows, String said) {
        body.removeAllViews();
        if (said != null) { status.setText(said); body.addView(status, new LayoutParams(-1, -2)); }
        for (Cards.Shelf s : rows) body.addView(row(s));
        if (screen.host.eink()) post(screen.host::einkRefresh);
    }

    /** A shelf: its title over a row of covers that scrolls sideways. */
    private LinearLayout row(Cards.Shelf s) {
        Context c = getContext();
        LinearLayout box = new LinearLayout(c);
        box.setOrientation(VERTICAL);
        TextView h = look.label(c, s.label, 16, look.text);
        h.setTypeface(Typeface.DEFAULT_BOLD);
        h.setPadding(look.dp(16), look.dp(14), look.dp(16), look.dp(6));
        box.addView(h);
        HorizontalScrollView scroll = new HorizontalScrollView(c);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout cards = new LinearLayout(c);
        cards.setPadding(look.dp(12), 0, look.dp(12), 0);
        for (Cards.Card card : s.cards) {
            if (card.kind == Cards.Kind.AUTHOR) { cards.addView(chip(card)); continue; }
            Tile t = new Tile(look, c, true);
            screen.bind(t, card);
            t.setOnClickListener(v -> openCard(card));
            LayoutParams tp = new LayoutParams(look.dp(112), -2);
            tp.setMargins(look.dp(4), 0, look.dp(4), 0);
            cards.addView(t, tp);
        }
        scroll.addView(cards);
        box.addView(scroll);
        return box;
    }

    /** An author found by the search: a chip, its books opened as a group. */
    private TextView chip(Cards.Card a) {
        TextView t = TopBar.chip(look, getContext(), a.count > 0 ? a.title + " · " + a.count : a.title, false, () -> openCard(a));
        LayoutParams p = new LayoutParams(-2, -2);
        p.setMargins(look.dp(4), 0, look.dp(4), 0);
        t.setLayoutParams(p);
        return t;
    }

    private void openCard(Cards.Card c) { screen.open(c); }

    private void toggleSearch() {
        boolean on = search.getVisibility() != VISIBLE;
        search.setVisibility(on ? VISIBLE : GONE);
        InputMethodManager im = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (on) { search.requestFocus(); im.showSoftInput(search, 0); }
        else { search.setText(""); im.hideSoftInputFromWindow(search.getWindowToken(), 0); }
    }

    @Override public boolean back() {
        if (search.getVisibility() == VISIBLE) { toggleSearch(); return true; }
        return false;
    }

    /** Back from a book: where you are may have moved (Continue listening). */
    @Override public void returned() { if (search.getText().toString().trim().isEmpty()) load(); }

    @Override public void closed() { ui.removeCallbacks(find); }
}
