package org.atlas.capture;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** The vault's own settings drawn natively, from the schema `GET /api/config` gives (VaultFiles.config: a vault here and on a server alike) — the same
 *  source the desktop's Settings is generated from, so a new setting appears here with no work. A section of the
 *  config is a page; its switches, choices, numbers and words become PluginForm's fields; lists and tables stay in the
 *  web settings, one tap away. */
final class ConfigPages {
    private ConfigPages() {}

    /** A section: its key, its title, its one-line description, how many settings it has. */
    static final class Section {
        final String key, title, blurb;
        final int count;
        Section(String key, String title, String blurb, int count) { this.key = key; this.title = title; this.blurb = blurb; this.count = count; }
    }

    /** The config's sections in schema order; top-level single settings gathered as "general". */
    static List<Section> sections(JSONObject doc) {
        JSONObject schema = doc.optJSONObject("schema"), props = schema == null ? null : schema.optJSONObject("properties");
        List<Section> out = new ArrayList<>();
        if (props == null) return out;
        int loose = 0;
        for (Iterator<String> it = props.keys(); it.hasNext(); ) {
            String k = it.next();
            JSONObject r = resolve(schema, props.optJSONObject(k));
            JSONObject inner = r.optJSONObject("properties");
            if (inner != null) {
                // a short description names the section better than its key ("Appearance" for ui); a long one says what
                // it is under the key's name (LSP, PDF in capitals)
                String d = firstSentence(r.optString("description")).replaceAll("\\s*\\((docs|see)/[^)]*\\)", "").replaceAll("[.:]$", "").trim();
                boolean short_ = !d.isEmpty() && d.split("\\s+").length <= 5;
                out.add(new Section(k, short_ ? d : name(k), short_ ? "" : d, inner.length()));
            }
            else loose++;
        }
        if (loose > 0) out.add(0, new Section("", "General", "where things go, and what stands alone", loose));
        return out;
    }

    /** Section `key`'s settings as PluginForm fields ({key, label, kind, choices, hint}); `values` gets their values;
     *  `elsewhere[0]` counts those only the web settings show (lists, tables). */
    static JSONArray fields(JSONObject doc, String key, JSONObject values, int[] elsewhere) {
        JSONObject schema = doc.optJSONObject("schema"), config = doc.optJSONObject("config");
        JSONArray out = new JSONArray();
        if (schema == null || config == null) return out;
        JSONObject props = schema.optJSONObject("properties"), now = config;
        if (!key.isEmpty()) {
            props = resolve(schema, props.optJSONObject(key)).optJSONObject("properties");
            now = config.optJSONObject(key) != null ? config.optJSONObject(key) : new JSONObject();
        }
        if (props == null) return out;
        for (Iterator<String> it = props.keys(); it.hasNext(); ) {
            String k = it.next();
            JSONObject r = resolve(schema, props.optJSONObject(k));
            if (key.isEmpty() && r.optJSONObject("properties") != null) continue; // a section: its own page
            String kind = kind(r);
            if (kind == null) { elsewhere[0]++; continue; }
            try {
                JSONObject f = new JSONObject().put("key", k).put("label", human(k)).put("kind", kind).put("hint", firstSentence(r.optString("description")));
                if ("choice".equals(kind)) f.put("choices", choices(r));
                out.put(f);
                if (now.has(k)) values.put(k, now.get(k));
            } catch (org.json.JSONException e) { /* left out */ }
        }
        return out;
    }

    /** The field kind PluginForm draws for a schema, or null when only the web settings can (lists, tables). */
    private static String kind(JSONObject r) {
        if (r.optJSONArray("enum") != null || r.optJSONArray("oneOf") != null) return choices(r).length() > 0 ? "choice" : null;
        String t = type(r);
        if ("boolean".equals(t)) return "toggle";
        if ("integer".equals(t) || "number".equals(t)) return "number";
        if ("string".equals(t)) return "text";
        return null;
    }

    /** The type, `["string", "null"]` read as "string". */
    private static String type(JSONObject r) {
        Object t = r.opt("type");
        if (t instanceof String) return (String) t;
        if (t instanceof JSONArray) for (int i = 0; i < ((JSONArray) t).length(); i++) if (!"null".equals(((JSONArray) t).optString(i))) return ((JSONArray) t).optString(i);
        return null;
    }

    private static JSONArray choices(JSONObject r) {
        JSONArray out = new JSONArray(), e = r.optJSONArray("enum"), one = r.optJSONArray("oneOf");
        for (int i = 0; e != null && i < e.length(); i++) if (!e.isNull(i)) out.put(e.optString(i));
        for (int i = 0; one != null && i < one.length(); i++) {
            JSONObject o = one.optJSONObject(i);
            if (o == null) continue;
            if (o.has("const")) out.put(o.optString("const"));
            JSONArray oe = o.optJSONArray("enum");
            for (int j = 0; oe != null && j < oe.length(); j++) out.put(oe.optString(j));
        }
        return out;
    }

    /** `s` with its `$ref` followed into `$defs` (its own description kept over the definition's). */
    private static JSONObject resolve(JSONObject schema, JSONObject s) {
        if (s == null) return new JSONObject();
        String ref = s.optString("$ref", "");
        if (ref.isEmpty()) {
            JSONArray all = s.optJSONArray("allOf"); // schemars wraps a described $ref in allOf
            if (all != null && all.length() == 1) { JSONObject in = resolve(schema, all.optJSONObject(0)); copyDescription(s, in); return in; }
            return s;
        }
        JSONObject defs = schema.optJSONObject("$defs") != null ? schema.optJSONObject("$defs") : schema.optJSONObject("definitions");
        JSONObject def = defs == null ? null : defs.optJSONObject(ref.substring(ref.lastIndexOf('/') + 1));
        if (def == null) return s;
        try { JSONObject out = new JSONObject(def.toString()); copyDescription(s, out); return out; } catch (org.json.JSONException e) { return s; }
    }

    private static void copyDescription(JSONObject from, JSONObject to) {
        if (from.has("description")) try { to.put("description", from.optString("description")); } catch (org.json.JSONException e) { /* a string */ }
    }

    /** A section's key as a name (human(): "lsp" → "LSP"). */
    private static String name(String k) { return human(k); }

    /** Words a key spells in short that read better as written out ("vscode" → "VS Code"). */
    private static final java.util.Map<String, String> WORDS = new java.util.HashMap<>();
    static {
        for (String w : new String[] {"ui", "gpu", "pdf", "lsp", "url", "id", "api", "ssh", "css", "html", "js", "ocr", "mcp", "dpi", "ai"}) WORDS.put(w, w.toUpperCase(Locale.ROOT));
        WORDS.put("vscode", "VS Code");
        WORDS.put("eink", "e-ink");
        WORDS.put("latex", "LaTeX");
    }

    /** "font_size" → "Font size", "ui_font" → "UI font", "vscode_theme" → "VS Code theme". */
    static String human(String k) {
        String[] w = k.replace('-', '_').split("_+");
        StringBuilder b = new StringBuilder();
        for (String part : w) {
            if (part.isEmpty()) continue;
            String low = part.toLowerCase(Locale.ROOT), out = WORDS.getOrDefault(low, low);
            if (b.length() > 0) b.append(' ');
            b.append(out);
        }
        if (b.length() == 0) return k;
        b.setCharAt(0, Character.toUpperCase(b.charAt(0)));
        return b.toString();
    }

    /** A description's first sentence (the rest stays in the web settings), at most ~160 characters. */
    private static String firstSentence(String d) {
        String s = d.replace("`", "").replaceAll("\\s+", " ").trim(); // code marks mean nothing here
        int dot = s.indexOf(". ");
        if (dot > 0) s = s.substring(0, dot + 1);
        return s.length() > 160 ? s.substring(0, 157) + "…" : s;
    }
}
