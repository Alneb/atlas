package org.atlas.capture;

import android.app.Activity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/** The full app's Settings, in Android's own pattern: a short list of areas, each a page of its own that Back leaves; a plugin
 *  is one row with its switch, and its settings are its own page. `arg` names the page: "" the list, "vaults",
 *  "capture", "plugins", "plugin:<id>". */
final class SettingsPages {
    /** What the pages ask of the activity. */
    interface Nav {
        /** Another page of Settings, kept in the history (Back returns here). */
        void page(String arg);
        /** A call of the vault's own Settings in the note view (`view('settings')`, `pluginSettings('id')`). */
        void web(String call);
        void switchPlugin(String id, boolean on);
        /** The vault on screen, or null before one is chosen. */
        String vault();
        /** Its plugins as VaultFiles.plugins lists them ([] until read). */
        JSONArray plugins();
    }

    private final Activity a;
    private final Look look;
    private final Nav nav;

    SettingsPages(Activity a, Look look, Nav nav) { this.a = a; this.look = look; this.nav = nav; }

    /** The top bar's title for page `arg`. */
    static String title(String arg) {
        if (arg == null || arg.isEmpty()) return "Settings";
        if (arg.startsWith("plugin:")) return titleOf(arg.substring(7), null);
        if (arg.startsWith("cfg:")) { int bar = arg.indexOf('|'); return bar > 0 ? arg.substring(bar + 1) : arg.length() == 4 ? "General" : ConfigPages.human(arg.substring(4)); }
        switch (arg) {
            case "vaults": return "Vaults";
            case "capture": return "Capture";
            case "plugins": return "Plugins";
            case "vault-settings": return "This vault";
            default: return "Settings";
        }
    }

    /** The page's content (without its scroll view). */
    View page(String arg) {
        LinearLayout col = new LinearLayout(a);
        col.setOrientation(LinearLayout.VERTICAL);
        String at = arg == null ? "" : arg;
        // no vault yet: choosing one is the only thing that matters
        if (nav.vault() == null && !at.equals("capture")) return new Setup(a, look, Setup.Part.ALL).view;
        if (at.equals("vaults")) return new Setup(a, look, Setup.Part.VAULTS).view;
        if (at.equals("capture")) return new Setup(a, look, Setup.Part.CAPTURE).view;
        col.setPadding(look.dp(12), 0, look.dp(12), look.dp(24));
        if (at.equals("plugins")) plugins(col);
        else if (at.equals("vault-settings") || at.startsWith("cfg:")) vaultSettings(col, at);
        else if (at.startsWith("plugin:")) plugin(col, at.substring(7));
        else top(col);
        return col;
    }

    private void top(LinearLayout col) {
        col.addView(look.heading(a, "This vault — " + Vaults.name(nav.vault())));
        LinearLayout card = look.card(a);
        int on = 0, all = 0;
        for (String id : ids()) { all++; if (VaultFiles.on(nav.plugins(), id)) on++; }
        card.addView(go(look.row(a, "vault", "Vaults", Vaults.name(nav.vault()) + " · where captures go"), () -> nav.page("vaults")));
        card.addView(go(look.row(a, "grid", "Plugins", all == 0 ? "none" : on + " of " + all + " on"), () -> nav.page("plugins")));
        card.addView(go(look.row(a, "plus", "Capture", "the tile, the screen, what is playing"), () -> nav.page("capture")));
        card.addView(go(look.row(a, "settings", "Editor, look and more", "the vault's own settings"), () -> nav.page("vault-settings")));
        col.addView(card);
        col.addView(Setup.about(a, look));
    }

    private void plugins(LinearLayout col) {
        JSONArray all = nav.plugins();
        col.addView(look.heading(a, "Built into this app"));
        LinearLayout built = look.card(a);
        for (NativePlugin p : NativePlugins.ALL) built.addView(pluginRow(p.id(), true));
        col.addView(built);
        LinearLayout others = look.card(a);
        for (int i = 0; i < all.length(); i++) {
            String id = all.optJSONObject(i).optString("id");
            if (NativePlugins.byId(id) == null) others.addView(pluginRow(id, false));
        }
        if (others.getChildCount() > 0) {
            col.addView(look.heading(a, "In this vault"));
            col.addView(others);
            col.addView(note("Their settings open in the vault's own Settings. Switching one off here stops it on every device using this vault."));
        }
    }

    /** One plugin: its name and what it is, its switch at the right; a tap opens its settings. */
    private View pluginRow(String id, boolean builtIn) {
        JSONObject listed = VaultFiles.plugin(nav.plugins(), id);
        String what = !text(listed, "description").isEmpty() ? text(listed, "description") : builtIn ? "built into this app" : null;
        // why it does not run here (not made for the phone, a plugin it needs off…), from the core; switched off says itself
        String why = listed == null || listed.optBoolean("off") ? "" : text(listed, "why");
        if (!builtIn && !why.isEmpty()) what = why + (what == null ? "" : " — " + what);
        Row r = look.row(a, null, titleOf(id, listed), what);
        if (r.detail != null) r.detail.setMaxLines(2);
        // the switch is the vault's own choice (its `off` list), whether or not the plugin can run on this device
        r.addView(switchOf(listed == null ? builtIn : !listed.optBoolean("off"), on -> nav.switchPlugin(id, on)));
        r.setOnClickListener(v -> { if (builtIn) nav.page("plugin:" + id); else nav.web("pluginSettings(" + JSONObject.quote(id) + ")"); });
        return r;
    }

    /** A built-in plugin's page: on or off, then its settings, drawn here (PluginForm) from the vault's values or, before
     *  the vault has any, from the manifest the app carries. */
    private void plugin(LinearLayout col, String id) {
        JSONObject p = VaultFiles.plugin(nav.plugins(), id);
        boolean on = VaultFiles.on(nav.plugins(), id);
        if (!text(p, "description").isEmpty()) col.addView(note(text(p, "description")));
        LinearLayout card = look.card(a);
        Row r = look.row(a, null, "On in this vault", on ? null : "off: it does not open files here");
        Switch s = switchOf(on, v -> nav.switchPlugin(id, v));
        r.addView(s);
        r.setOnClickListener(v -> s.toggle());
        card.addView(r);
        col.addView(card);
        JSONArray fields = p == null ? null : p.optJSONArray("fields");
        if (fields == null || fields.length() == 0) return;
        col.addView(look.heading(a, "Settings"));
        LinearLayout form = look.card(a);
        JSONObject values = p.optJSONObject("settings") != null ? p.optJSONObject("settings") : new JSONObject();
        if (new PluginForm(a, look, nav.vault(), id).fill(form, fields, values)) {
            form.addView(go(look.row(a, "more", "More in the vault's settings", "secrets, lists"), () -> nav.web("pluginSettings(" + JSONObject.quote(id) + ")")));
        }
        col.addView(form);
    }

    /** The vault's own settings (ConfigPages), read in the background — a server answers over the network — then drawn:
     *  "vault-settings" its sections, "cfg:<section>" one section's settings ("cfg:" the top-level ones). */
    private void vaultSettings(LinearLayout col, String at) {
        TextView wait = note("Reading the settings…");
        col.addView(wait);
        String vault = nav.vault();
        new Thread(() -> {
            JSONObject doc = null;
            String why = null;
            try { doc = VaultFiles.config(a, vault); } catch (java.io.IOException e) { why = e.getMessage(); }
            JSONObject got = doc;
            String said = why;
            a.runOnUiThread(() -> {
                col.removeView(wait);
                if (got == null) { col.addView(note("The settings could not be read: " + said)); return; }
                if (at.equals("vault-settings")) sectionList(col, got);
                else { String key = at.substring(4); int bar = key.indexOf('|'); section(col, got, bar >= 0 ? key.substring(0, bar) : key, vault); }
            });
        }, "vault-settings").start();
    }

    private void sectionList(LinearLayout col, JSONObject doc) {
        LinearLayout card = look.card(a);
        for (ConfigPages.Section s : ConfigPages.sections(doc)) {
            card.addView(go(look.row(a, null, s.title, s.blurb.isEmpty() ? s.count + (s.count == 1 ? " setting" : " settings") : s.blurb), () -> nav.page("cfg:" + s.key + "|" + s.title)));
        }
        col.addView(card);
        LinearLayout web = look.card(a);
        web.addView(go(look.row(a, "more", "Everything, in the web settings", "keys, snippets, lists, the preview"), () -> nav.web("view('settings')")));
        col.addView(look.heading(a, "More"));
        col.addView(web);
    }

    private void section(LinearLayout col, JSONObject doc, String key, String vault) {
        JSONObject values = new JSONObject();
        int[] elsewhere = { 0 };
        JSONArray fields = ConfigPages.fields(doc, key, values, elsewhere);
        LinearLayout form = look.card(a);
        new PluginForm(a, look, (k, v) -> VaultFiles.setConfig(a, vault, key.isEmpty() ? k : key + "." + k, v)).fill(form, fields, values);
        if (fields.length() > 0) col.addView(form);
        if (elsewhere[0] > 0 || fields.length() == 0) {
            LinearLayout more = look.card(a);
            more.addView(go(look.row(a, "more", elsewhere[0] + " more in the web settings", "lists and tables"), () -> nav.web("view('settings')")));
            col.addView(look.heading(a, "More"));
            col.addView(more);
        }
    }

    // ---- small parts ---------------------------------------------------------------------------------------------

    /** `o[k]` as text, "" when missing or null (org.json's optString gives "null" for a JSON null). */
    static String text(JSONObject o, String k) { return o == null || o.isNull(k) ? "" : o.optString(k, ""); }

    /** Every plugin the Plugins page shows: the built-in ones, then the vault's own. */
    private java.util.List<String> ids() {
        java.util.List<String> out = new java.util.ArrayList<>();
        for (NativePlugin p : NativePlugins.ALL) out.add(p.id());
        JSONArray all = nav.plugins();
        for (int i = 0; i < all.length(); i++) { String id = all.optJSONObject(i).optString("id"); if (!out.contains(id)) out.add(id); }
        return out;
    }

    /** A plugin's title: as the vault lists it, else its carried manifest's `title`, else its id. */
    private static String titleOf(String id, JSONObject listed) {
        if (!text(listed, "title").isEmpty()) return text(listed, "title");
        String toml = NativePlugins.manifest(id);
        java.util.regex.Matcher m = toml == null ? null : java.util.regex.Pattern.compile("(?m)^title\\s*=\\s*\"([^\"]+)\"").matcher(toml);
        return m != null && m.find() ? m.group(1) : id;
    }

    private interface OnSwitch { void to(boolean on); }

    private Switch switchOf(boolean on, OnSwitch to) {
        Switch s = new Switch(a);
        s.setChecked(on);
        s.setOnCheckedChangeListener((b, v) -> to.to(v));
        s.setContentDescription(on ? "On" : "Off");
        return s;
    }

    /** A row leading to another page or view: a chevron at its end. */
    private View go(Row r, Runnable tap) {
        android.widget.ImageView c = new android.widget.ImageView(a);
        c.setImageDrawable(look.icon(a, "chevron", look.faint));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(look.dp(18), look.dp(18));
        lp.setMarginStart(look.dp(8));
        r.addView(c, lp);
        r.setOnClickListener(v -> tap.run());
        return r;
    }

    private TextView note(String s) {
        TextView t = look.label(a, s, 13, look.muted);
        t.setPadding(look.dp(16), look.dp(10), look.dp(16), look.dp(4));
        t.setLineSpacing(0, 1.2f);
        return t;
    }
}
