package org.atlas.capture;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * The phone's Search place, native (docs/design/DESIGN-android-native-app.md §3): a search field over a PlaceList of
 * results as you type. The answers are the vault core's `/api/search` (the desktop's ranking: names first, then the
 * matching lines by file), asked twice as the desktop's Search pane does — the names at once, then the lines — and
 * timed by SearchRows.Typing; works while the page is loading or has failed. A hit opens at its line (Shell.open).
 */
final class SearchScreen {
    private final Activity a;
    private final String vault;
    private final FilesScreen.Shell shell;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SearchRows.Typing typing = new SearchRows.Typing();
    private Look look;
    private View root;
    private EditText field;
    private ImageView clear;
    private PlaceList list;
    private Runnable pending;
    /** The last answer drawn, kept for a screen made again in new colours. */
    private List<PlaceItem> shown = new ArrayList<>();
    private String said = "";

    SearchScreen(Activity a, String vault, FilesScreen.Shell shell) {
        this.a = a;
        this.vault = vault;
        this.shell = shell;
    }

    /** The screen in `look`'s colours; the query kept, asked again (the vault may have changed meanwhile). */
    View view(Look look) {
        if (root == null || this.look != look) build(look);
        if (!typing.query().isEmpty()) ask(typing.again());
        else empty();
        return root;
    }

    /** The keyboard up in the field, when there is nothing searched yet (the place was just opened). */
    void focus() {
        if (field == null || !typing.query().isEmpty()) return;
        field.requestFocus();
        field.post(() -> ((InputMethodManager) a.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(field, InputMethodManager.SHOW_IMPLICIT));
    }

    private void build(Look look) {
        this.look = look;
        String typed = field == null ? "" : field.getText().toString();
        LinearLayout box = new LinearLayout(a);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(look.app);

        // Material 3's search bar: a 56 dp pill, the search icon, the field, a clear button while there is text
        LinearLayout bar = new LinearLayout(a);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackground(look.round(look.pop, 28, look.border));
        bar.setPadding(look.dp(16), 0, look.dp(4), 0);
        ImageView icon = new ImageView(a);
        icon.setImageDrawable(look.icon(a, "search", look.muted));
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(look.dp(24), look.dp(24));
        ip.setMarginEnd(look.dp(12));
        bar.addView(icon, ip);
        field = new EditText(a);
        field.setBackground(null);
        field.setSingleLine(true);
        field.setHint("Search names and text");
        field.setHintTextColor(look.faint);
        field.setTextColor(look.text);
        field.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, look.eink ? 16 * Look.EINK_SCALE : 16);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        field.setImeOptions(EditorInfo.IME_ACTION_SEARCH | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        field.setPadding(0, 0, 0, 0);
        field.setText(typed);
        field.setOnEditorActionListener((v, action, e) -> { hideKeyboard(); return true; }); // results are already there
        bar.addView(field, new LinearLayout.LayoutParams(0, look.dp(56), 1f));
        clear = new ImageView(a);
        clear.setImageDrawable(look.icon(a, "close", look.muted));
        clear.setScaleType(ImageView.ScaleType.CENTER);
        clear.setBackground(look.pressable(0x00000000, 24, 0));
        clear.setContentDescription("Clear");
        clear.setOnClickListener(v -> { field.setText(""); field.requestFocus(); });
        clear.setVisibility(typed.isEmpty() ? View.GONE : View.VISIBLE);
        bar.addView(clear, new LinearLayout.LayoutParams(look.dp(48), look.dp(48)));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, look.dp(56));
        bp.setMargins(look.dp(16), look.dp(8), look.dp(16), look.dp(8));
        box.addView(bar, bp);
        field.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int st, int c, int af) {}
            @Override public void onTextChanged(CharSequence s, int st, int b, int c) {}
            @Override public void afterTextChanged(Editable s) {
                clear.setVisibility(s.length() == 0 ? View.GONE : View.VISIBLE);
                SearchRows.Typing.Ask ask = typing.typed(s.toString());
                if (ask != null) ask(ask);
            }
        });

        list = new PlaceList(a, look, new PlaceList.On() {
            public void open(PlaceItem it) { if (it.path == null) return; hideKeyboard(); shell.open(it.path, it.line); }
            public void more(PlaceItem it, View anchor) { FilesScreen.menu(a, SearchScreen.this.look, vault, it, anchor, shell, () -> ask(typing.again())); }
            public void refresh() { ask(typing.again()); }
            public void step(int by) { shell.step(by); }
        });
        box.addView(list, new LinearLayout.LayoutParams(-1, 0, 1f));
        list.setItems(shown, said);
        root = box;
    }

    private void hideKeyboard() {
        ((InputMethodManager) a.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(field.getWindowToken(), 0);
    }

    private void empty() { draw(new ArrayList<>(), "Type to search the vault: file names first, then the lines that match."); }

    private void draw(List<PlaceItem> items, String emptyText) {
        shown = items;
        said = emptyText;
        list.setItems(items, emptyText);
    }

    /** A search: after its pause, the names then the lines, each drawn while it is still the latest. */
    private void ask(SearchRows.Typing.Ask ask) {
        if (pending != null) main.removeCallbacks(pending);
        if (ask.query.isEmpty()) { list.setRefreshing(false); empty(); return; }
        pending = () -> {
            if (!typing.current(ask)) return;
            list.setRefreshing(true);
            String q = VaultFiles.OnServer.q(ask.query);
            fetch("/api/search?q=" + q + "&names=true", ask, true);
            fetch("/api/search?q=" + q, ask, false);
        };
        main.postDelayed(pending, ask.delay);
    }

    private void fetch(String call, SearchRows.Typing.Ask ask, boolean namesOnly) {
        new Thread(() -> {
            List<String> names = new ArrayList<>();
            List<SearchRows.Hit> lines = new ArrayList<>();
            Map<String, Integer> counts = new HashMap<>();
            String error = null;
            try {
                VaultFiles.OnServer f = (VaultFiles.OnServer) VaultFiles.of(a, vault);
                JSONObject r = new JSONObject(new String(f.get(call), StandardCharsets.UTF_8));
                JSONArray files = r.optJSONArray("files");
                for (int i = 0; files != null && i < files.length(); i++) names.add(files.getString(i));
                JSONArray hits = r.optJSONArray("lines");
                for (int i = 0; hits != null && i < hits.length(); i++) {
                    JSONObject h = hits.getJSONObject(i);
                    lines.add(new SearchRows.Hit(h.getString("path"), h.optInt("line"), h.optString("text")));
                }
                JSONObject c = r.optJSONObject("counts");
                if (c != null) for (Iterator<String> k = c.keys(); k.hasNext(); ) { String p = k.next(); counts.put(p, c.optInt(p)); }
            } catch (Exception e) {
                error = e.getMessage() == null ? e.toString() : e.getMessage();
                android.util.Log.w("AtlasSearch", call + ": " + error);
            }
            String why = error;
            a.runOnUiThread(() -> {
                if (a.isFinishing() || !(namesOnly ? typing.names(ask) : typing.lines(ask))) return;
                if (!namesOnly) list.setRefreshing(false);
                if (why != null) {
                    if (!namesOnly) draw(new ArrayList<>(), "Could not search: " + why + "\n\nPull down to try again.");
                    return;
                }
                List<PlaceItem> rows = SearchRows.rows(ask.query, names, lines, counts, Look::shownName);
                draw(rows, namesOnly ? "" : "Nothing matches “" + ask.query + "”");
            });
        }, "search").start();
    }
}
