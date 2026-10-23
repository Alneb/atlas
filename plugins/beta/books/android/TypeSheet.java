package org.atlas.plugins.books;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.Look;
import org.atlas.capture.ReaderBars;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Locale;

/** The Aa panel: in the readers' bars, the page live above it. The text size first (− 19 +), then
 *  Themes · Text · Page · Turning as segments, each setting a stepper or a row of choices (KOReader's bottom menu: on
 *  e-ink a tap is surer than a slider), and where they are kept: all books or this one. Every change is shown at once
 *  (laid out again a moment after the last touch) and kept when the panel closes. */
final class TypeSheet {
    /** The keys a theme carries: the type and the measure, not the colours (those follow the screen: e-ink, the night). */
    private static final String[] THEME_KEYS = { "font", "size", "line", "weight", "para", "indent", "justify", "hyphenate", "publisher", "margin" };
    private static final String[] TABS = { "Themes", "Text", "Page", "Turning" };

    private final ReaderView reader;
    private final ReaderBars bars;
    private final Host host;
    private final Look look;
    private final Context c;
    private final JSONObject o;
    private boolean forBook;
    private static String tab = "Text"; // the tab last used, for the next time
    private JSONArray saved = new JSONArray();
    private LinearLayout themes;

    TypeSheet(ReaderView reader, ReaderBars bars) {
        this.reader = reader;
        this.bars = bars;
        this.host = reader.host();
        this.look = host.look();
        this.c = reader.getContext();
        this.o = Shelf.copy(reader.options());
        this.forBook = reader.ownSettings();
        // the saved themes (the plugin's settings)
        new Thread(() -> {
            JSONArray t = Shelf.savedThemes(host);
            reader.post(() -> { saved = t; if (themes != null) drawThemes(); });
        }, "themes").start();
    }

    /** Opened in the bars' panel under `tab`; kept when it closes. */
    void show(View aaTab) {
        final String was = o.toString();
        final boolean wasForBook = forBook;
        bars.panel(aaTab, "Text and page", body(), () -> { if (!o.toString().equals(was) || forBook != wasForBook) reader.apply(o, forBook); });
    }

    private void redraw() { bars.replacePanel(body()); }

    private View body() {
        LinearLayout l = bars.column();
        l.addView(bars.stepper("Text size", String.valueOf(o.optInt("size", 19)), () -> size(-1), () -> size(1)));
        int at = java.util.Arrays.asList(TABS).indexOf(tab);
        l.addView(bars.segments("", TABS, Math.max(0, at), i -> { tab = TABS[i]; redraw(); }));
        switch (tab) {
            case "Themes": themesTab(l); break;
            case "Page": pageTab(l); break;
            case "Turning": turningTab(l); break;
            default: textTab(l);
        }
        l.addView(bars.segments("Keep these for", new String[] { "All books", "This book" }, forBook ? 1 : 0, i -> { forBook = i == 1; redraw(); }));
        l.addView(bars.hint(forBook ? "Only this book reads like this; the others keep yours." : "Your settings for every book (Settings → Plugins → Books shows the same)."));
        return l;
    }

    // ---- changing ------------------------------------------------------------------------------------------------

    private void set(String key, Object v) {
        try { o.put(key, v); } catch (Exception e) { return; }
        reader.removeCallbacks(preview);
        reader.postDelayed(preview, 250);
        redraw();
    }

    private final Runnable preview = this::preview;
    private void preview() { reader.preview(o); }

    private void size(int d) { set("size", Math.max(10, Math.min(40, o.optInt("size", 19) + d))); }

    /** A number stepped by `step` within [min, max], shown with `fmt`. */
    private View step(String label, String key, double min, double max, double step, double fallback, String fmt) {
        double now = o.optDouble(key, fallback);
        return bars.stepper(label, String.format(Locale.ROOT, fmt, now),
            () -> set(key, Math.round(Math.max(min, now - step) * 100) / 100.0),
            () -> set(key, Math.round(Math.min(max, now + step) * 100) / 100.0));
    }

    /** 2–5 exclusive choices. */
    private View choice(String label, String key, String[] values, String[] names, String fallback) {
        String now = String.valueOf(o.has(key) ? o.opt(key) : fallback);
        int at = 0;
        for (int i = 0; i < values.length; i++) {
            boolean on = numberLike(values[i]) ? numberLike(now) && Math.abs(Double.parseDouble(values[i]) - Double.parseDouble(now)) < 1e-6 : values[i].equals(now);
            if (on) at = i;
        }
        return bars.segments(label, names, at, i -> set(key, numberLike(values[i]) ? (Object) Integer.valueOf(values[i]) : values[i]));
    }

    private View toggle(String label, String key, boolean fallback) {
        return bars.segments(label, new String[] { "Off", "On" }, o.optBoolean(key, fallback) ? 1 : 0, i -> set(key, i == 1));
    }

    private static boolean numberLike(String s) { return s.matches("-?\\d+(\\.\\d+)?"); }

    // ---- the tabs ------------------------------------------------------------------------------------------------

    private void textTab(LinearLayout l) {
        l.addView(choice("Font", "font", new String[] { "the book's own", "serif", "sans-serif" }, new String[] { "The book's", "Serif", "Sans" }, "serif"));
        l.addView(choice("Weight", "weight", new String[] { "300", "400", "500", "600" }, new String[] { "Light", "Regular", "Medium", "Bold" }, "400"));
        l.addView(bars.group("Spacing"));
        l.addView(step("Line spacing", "line", 1.0, 2.2, 0.05, 1.55, "%.2f"));
        l.addView(step("Between paragraphs", "para", 0, 1.5, 0.1, 0.4, "%.1f em"));
        l.addView(step("First-line indent", "indent", 0, 3, 0.1, 1.2, "%.1f em"));
        l.addView(bars.group("Setting"));
        l.addView(toggle("Justified", "justify", true));
        l.addView(toggle("Hyphenation", "hyphenate", true));
        l.addView(toggle("The book's own styles", "publisher", false));
        l.addView(bars.hint("Its fonts, sizes and spacing as its publisher set them; off, yours."));
    }

    private void pageTab(LinearLayout l) {
        l.addView(step("Side margins", "margin", 0, 80, 4, 28, "%.0f px"));
        if (reader.eink()) {
            l.addView(choice("Colours", "theme", new String[] { "white", "black" }, new String[] { "White", "Black" }, "white"));
            l.addView(bars.hint("On e-ink, books are always paged: a scroll ghosts."));
        } else {
            l.addView(choice("Colours", "theme", new String[] { "white", "sepia", "dark", "black" }, new String[] { "White", "Sepia", "Dark", "Black" }, "white"));
            l.addView(choice("Layout", "flow", new String[] { "paged", "scrolled" }, new String[] { "Pages", "Scrolled" }, "paged"));
        }
    }

    private void turningTab(LinearLayout l) {
        l.addView(choice("Tap zones", "taps", new String[] { "sides", "Kindle", "edge", "L-shaped" }, new String[] { "Sides", "Kindle", "Edges", "L" }, "sides"));
        l.addView(bars.hint(zonesHint(o.optString("taps", "sides"))));
        l.addView(toggle("Inverted taps (left goes on)", "invert_taps", false));
        l.addView(toggle("Volume keys turn pages", "volume_keys", true));
        if (reader.eink()) l.addView(choice("Full refresh", "flash_every", new String[] { "1", "3", "6", "12", "0" }, new String[] { "Each", "3", "6", "12", "Never" }, "6"));
    }

    private void themesTab(LinearLayout l) {
        themes = new LinearLayout(c);
        themes.setPadding(look.dp(8), look.dp(10), look.dp(8), look.dp(6));
        HorizontalScrollView hs = new HorizontalScrollView(c);
        hs.setHorizontalScrollBarEnabled(false);
        hs.addView(themes);
        l.addView(hs);
        l.addView(bars.hint("A theme sets the type and the spacing; long-press one of yours to remove it."));
        drawThemes();
    }

    // ---- themes --------------------------------------------------------------------------------------------------

    private static JSONObject theme(Object... kv) {
        JSONObject t = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) t.put((String) kv[i], kv[i + 1]); } catch (Exception e) { /* literals */ }
        return t;
    }

    private static final String[] BUILT_IN = { "Original", "Quiet", "Paper", "Bold" };
    private static final JSONObject[] BUILT_IN_SETTINGS = {
        theme("font", "the book's own", "publisher", true, "size", 19, "line", 1.5, "weight", 400, "margin", 24, "justify", true, "hyphenate", true, "para", 0.4, "indent", 1.2),
        theme("font", "sans-serif", "publisher", false, "size", 18, "line", 1.7, "weight", 400, "margin", 32, "justify", false, "hyphenate", false, "para", 0.6, "indent", 0.0),
        theme("font", "serif", "publisher", false, "size", 19, "line", 1.55, "weight", 400, "margin", 28, "justify", true, "hyphenate", true, "para", 0.2, "indent", 1.5),
        theme("font", "serif", "publisher", false, "size", 21, "line", 1.5, "weight", 600, "margin", 24, "justify", false, "hyphenate", true, "para", 0.4, "indent", 1.2),
    };

    private boolean matches(JSONObject t) {
        for (String k : THEME_KEYS) if (t.has(k) && !String.valueOf(t.opt(k)).equals(String.valueOf(o.opt(k) == null ? "" : o.opt(k)))) {
            Object a = t.opt(k), b = o.opt(k);
            if (a instanceof Number && b instanceof Number && Math.abs(((Number) a).doubleValue() - ((Number) b).doubleValue()) < 1e-6) continue;
            return false;
        }
        return true;
    }

    private void drawThemes() {
        themes.removeAllViews();
        for (int i = 0; i < BUILT_IN.length; i++) themes.addView(card(BUILT_IN[i], BUILT_IN_SETTINGS[i], false));
        for (int i = 0; i < saved.length(); i++) {
            JSONObject t = saved.optJSONObject(i);
            if (t != null && t.optJSONObject("options") != null) themes.addView(card(t.optString("name", "Mine"), t.optJSONObject("options"), true));
        }
        TextView add = look.label(c, "+\nSave these", 13, look.accent);
        add.setGravity(Gravity.CENTER);
        add.setBackground(look.pressable(0, 12, look.border));
        add.setOnClickListener(v -> saveTheme());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(look.dp(92), look.dp(84));
        lp.setMarginEnd(look.dp(8));
        themes.addView(add, lp);
    }

    /** A theme's card: "Aa" in its font and weight, its name; marked when the settings are its. */
    private View card(String name, JSONObject t, boolean yours) {
        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        boolean on = matches(t);
        card.setBackground(look.pressable(on ? look.accentSoft : 0, 12, on ? look.accent : look.border));
        TextView aa = look.label(c, "Aa", 24, look.text);
        String font = t.optString("font", "serif");
        aa.setTypeface(Typeface.create(font.equals("sans-serif") ? Typeface.SANS_SERIF : Typeface.SERIF, t.optInt("weight", 400) >= 600 ? Typeface.BOLD : Typeface.NORMAL));
        card.addView(aa);
        card.addView(look.label(c, name, 12.5f, on ? look.accent : look.muted));
        card.setContentDescription("Theme " + name + (on ? ", in use" : ""));
        card.setOnClickListener(v -> {
            for (Iterator<String> k = t.keys(); k.hasNext(); ) { String key = k.next(); try { o.put(key, t.get(key)); } catch (Exception e) { /* skip */ } }
            reader.removeCallbacks(preview);
            reader.post(preview);
            redraw();
        });
        if (yours) card.setOnLongClickListener(v -> { forget(name); return true; });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(look.dp(92), look.dp(84));
        lp.setMarginEnd(look.dp(8));
        card.setLayoutParams(lp);
        return card;
    }

    private void saveTheme() {
        EditText name = new EditText(c);
        name.setHint("A name for these settings");
        name.setSingleLine(true);
        new AlertDialog.Builder(c).setTitle("Save as a theme").setView(name)
            .setPositiveButton("Save", (d, w) -> {
                String n = name.getText().toString().trim();
                if (n.isEmpty()) n = "Mine " + (saved.length() + 1);
                JSONObject keep = new JSONObject();
                for (String k : THEME_KEYS) if (o.has(k)) try { keep.put(k, o.get(k)); } catch (Exception e) { /* skip */ }
                final String called = n;
                changeThemes(t -> {
                    JSONArray out = new JSONArray();
                    for (int i = 0; i < t.length(); i++) if (!called.equals(t.optJSONObject(i).optString("name"))) out.put(t.optJSONObject(i));
                    out.put(new JSONObject().put("name", called).put("options", keep));
                    return out;
                });
            })
            .setNegativeButton("Cancel", null).show();
    }

    private void forget(String name) {
        new AlertDialog.Builder(c).setMessage("Remove the theme “" + name + "”?")
            .setPositiveButton("Remove", (d, w) -> changeThemes(t -> {
                JSONArray out = new JSONArray();
                for (int i = 0; i < t.length(); i++) if (!name.equals(t.optJSONObject(i).optString("name"))) out.put(t.optJSONObject(i));
                return out;
            }))
            .setNegativeButton("Keep", null).show();
    }

    interface ThemesChange { JSONArray apply(JSONArray themes) throws Exception; }

    /** Your themes changed in the plugin's settings (read again first), then drawn. */
    private void changeThemes(ThemesChange f) {
        new Thread(() -> {
            try {
                JSONArray now = f.apply(Shelf.savedThemes(host));
                String why = Shelf.saveThemes(host, now);
                if (why != null) throw new Exception(why);
                reader.post(() -> { saved = now; drawThemes(); });
            } catch (Exception ex) { reader.post(() -> host.toast("The theme was not saved: " + ex.getMessage())); }
        }, "themes").start();
    }

    private static String zonesHint(String z) {
        switch (z) {
            case "Kindle": return "The left quarter goes back, the rest goes on; the top opens the menu.";
            case "edge": return "Either edge goes on, the top and bottom go back, the middle opens the menu.";
            case "L-shaped": return "The left and top go back, the right and bottom go on, the middle opens the menu.";
            default: return "The left third goes back, the right third goes on, the middle opens the menu.";
        }
    }

}
