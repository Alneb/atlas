package org.atlas.capture;

import android.app.Activity;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

/** A plugin's settings drawn natively in the app's Settings: its `[[setting]]` fields as the core lists them (VaultFiles.plugins `fields`), the values the
 *  vault keeps; each change saved at once, where the server and the desktop save it (VaultFiles.saveSettings).
 *  Toggles, choices, text and numbers here; secrets, lists and cards stay in the vault's own Settings (the web form). */
final class PluginForm {
    /** Where a change goes: an error, or null. Called off the UI thread (a server answers over the network). */
    interface Saver { String save(String key, Object value) throws Exception; }

    private final Activity a;
    private final Look look;
    private final Saver saver;

    /** A plugin's settings in `vault`. */
    PluginForm(Activity a, Look look, String vault, String id) {
        this(a, look, (k, v) -> VaultFiles.saveSettings(a, vault, id, new JSONObject().put(k, v)));
    }

    /** Any form of `[[setting]]`-shaped fields, saved by `saver` (the vault's own settings: ConfigPages). */
    PluginForm(Activity a, Look look, Saver saver) { this.a = a; this.look = look; this.saver = saver; }

    /** The rows for `fields` with `values`, added to `card`; true when one or more could not be drawn here. */
    boolean fill(LinearLayout card, JSONArray fields, JSONObject values) {
        boolean elsewhere = false;
        for (int i = 0; i < fields.length(); i++) {
            JSONObject f = fields.optJSONObject(i);
            if (f == null || f.optBoolean("readonly")) continue;
            String key = f.optString("key"), label = f.optString("label", key), kind = f.optString("kind");
            Object now = values.opt(key);
            if (now == null || now == JSONObject.NULL) now = f.opt("default");
            View row;
            switch (kind) {
                case "toggle": row = toggle(key, label, Boolean.TRUE.equals(now)); break;
                case "choice": row = choice(key, label, now == null ? "" : String.valueOf(now), f.optJSONArray("choices")); break;
                case "text": case "longtext": case "number": row = field(key, label, now == null ? "" : String.valueOf(now), kind); break;
                default: elsewhere = true; continue; // secret, list, records: the vault's Settings
            }
            card.addView(row);
            String hint = f.optString("hint", "");
            if (!hint.isEmpty()) {
                TextView h = look.label(a, hint, 12.5f, look.faint);
                h.setPadding(look.dp(12), 0, look.dp(12), look.dp(8));
                card.addView(h);
            }
        }
        return elsewhere;
    }

    private void save(String key, Object value) {
        new Thread(() -> {
            String why;
            try { why = saver.save(key, value); } catch (Exception e) { why = e.getMessage(); }
            String said = why;
            if (said != null) a.runOnUiThread(() -> Toast.makeText(a, "Not saved: " + said, Toast.LENGTH_LONG).show());
        }, "plugin-setting").start();
    }

    private View toggle(String key, String label, boolean on) {
        Row r = look.row(a, null, label, null);
        Switch s = new Switch(a);
        s.setChecked(on);
        s.setOnCheckedChangeListener((b, v) -> save(key, v));
        r.addView(s);
        r.setOnClickListener(v -> s.toggle());
        return r;
    }

    /** The value at the right; a tap lists the choices. */
    private View choice(String key, String label, String now, JSONArray choices) {
        Row r = look.row(a, null, label, now.isEmpty() ? "—" : now);
        r.setOnClickListener(v -> {
            PopupMenu m = new PopupMenu(a, r, Gravity.END);
            for (int i = 0; choices != null && i < choices.length(); i++) m.getMenu().add(choices.optString(i));
            m.setOnMenuItemClickListener(it -> {
                String c = String.valueOf(it.getTitle());
                if (r.detail != null) r.detail.setText(c);
                save(key, c);
                return true;
            });
            m.show();
        });
        return r;
    }

    /** A line to type in, saved when typing is done (the keyboard's Done, or leaving the field). */
    private View field(String key, String label, String now, String kind) {
        LinearLayout col = new LinearLayout(a);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(look.dp(12), look.dp(8), look.dp(12), look.dp(4));
        col.addView(look.label(a, label, 15.5f, look.text));
        EditText e = new EditText(a);
        e.setText(now);
        e.setTextColor(look.text);
        boolean number = "number".equals(kind), lines = "longtext".equals(kind);
        e.setInputType(number ? InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED
            : lines ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE : InputType.TYPE_CLASS_TEXT);
        if (!lines) { e.setSingleLine(true); e.setImeOptions(EditorInfo.IME_ACTION_DONE); }
        String[] last = { now };
        Runnable done = () -> {
            String t = e.getText().toString();
            if (t.equals(last[0])) return;
            last[0] = t;
            if (!number) { save(key, t); return; }
            try { save(key, t.contains(".") ? (Object) Double.parseDouble(t) : (Object) Long.parseLong(t)); }
            catch (NumberFormatException x) { Toast.makeText(a, label + ": a number", Toast.LENGTH_SHORT).show(); }
        };
        e.setOnEditorActionListener((v, act, ev) -> { if (act == EditorInfo.IME_ACTION_DONE) done.run(); return false; });
        e.setOnFocusChangeListener((v, has) -> { if (!has) done.run(); });
        col.addView(e, new LinearLayout.LayoutParams(-1, -2));
        return col;
    }
}
