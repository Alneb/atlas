package org.atlas.capture;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** A note's flat frontmatter properties, read and changed by the core's own rules (atlas-text frontmatter.rs, through
 *  Core): only the keys asked for are touched, every other line (other keys, lists, comments, the body) stays as
 *  written; numbers and booleans are written typed, other values as YAML strings. The plugins' (Books, Manga) one way to
 *  keep state in a note. */
public final class Props {
    private Props() {}

    /** The top-level properties as texts (a list's as ""); empty when there is no frontmatter. */
    public static Map<String, String> read(String text) {
        Map<String, String> out = new LinkedHashMap<>();
        try {
            JSONObject o = new JSONObject(Core.propsRead(text == null ? "" : text));
            for (Iterator<String> k = o.keys(); k.hasNext(); ) { String key = k.next(); out.put(key, o.optString(key)); }
        } catch (JSONException e) { /* the core answers JSON; nothing read is the safe answer */ }
        return out;
    }

    /** `text` with each key in `set` given its value (null: removed); a note without frontmatter gets one. */
    public static String set(String text, Map<String, String> set) {
        JSONObject o = new JSONObject();
        try { for (Map.Entry<String, String> e : set.entrySet()) o.put(e.getKey(), e.getValue() == null ? JSONObject.NULL : e.getValue()); }
        catch (JSONException e) { throw new IllegalArgumentException(e); }
        return Core.propsSet(text == null ? "" : text, o.toString());
    }

    /** A list property's items: a block list, a flow list (`[a, b]`) or one value. */
    public static List<String> list(String text, String key) {
        List<String> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(Core.propsList(text == null ? "" : text, key));
            for (int i = 0; i < a.length(); i++) out.add(a.getString(i));
        } catch (JSONException e) { /* as read */ }
        return out;
    }

    /** `text` with `key` set to these items as a block list, as Obsidian writes one (none: the key removed). */
    public static String setList(String text, String key, List<String> items) {
        return Core.propsSetList(text == null ? "" : text, key, new JSONArray(items).toString());
    }
}
