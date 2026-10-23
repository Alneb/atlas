package org.atlas.plugins.notepad;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Pen favourites, as Boox Notes keeps them: up to six pen + width + colour, one tap away on the toolbar — and the pen
 *  last used, so a drawing opens with it. Kept on this device (SharedPreferences), not in the vault: they belong to
 *  the hand and the screen, not to the notes. */
final class Favourites {
    static final int MAX = 6;

    /** One pen as it is held: openink's pen, the width factor, the colour. */
    static final class Pen {
        final int pen;
        final float width;
        final String color;

        Pen(int pen, float width, String color) { this.pen = pen; this.width = width; this.color = color; }

        boolean same(Pen o) { return o != null && pen == o.pen && Math.abs(width - o.width) < 0.01f && color.equalsIgnoreCase(o.color); }

        JSONObject json() throws JSONException { return new JSONObject().put("pen", pen).put("width", width).put("color", color); }

        static Pen of(JSONObject o) {
            return o == null ? null : new Pen(o.optInt("pen", 1), (float) o.optDouble("width", 1), o.optString("color", "#000000"));
        }
    }

    private final SharedPreferences prefs;
    final List<Pen> list = new ArrayList<>();

    Favourites(Context c) {
        prefs = c.getSharedPreferences("notepad", Context.MODE_PRIVATE);
        try {
            JSONArray a = new JSONArray(prefs.getString("favourites", "[]"));
            for (int i = 0; i < a.length() && list.size() < MAX; i++) {
                Pen p = Pen.of(a.optJSONObject(i));
                if (p != null) list.add(p);
            }
        } catch (JSONException e) { /* none kept yet, or unreadable: start empty */ }
    }

    boolean has(Pen p) {
        for (Pen f : list) if (f.same(p)) return true;
        return false;
    }

    /** `p` added at the end (the oldest one goes when there are already six). */
    void add(Pen p) {
        if (has(p)) return;
        list.add(p);
        while (list.size() > MAX) list.remove(0);
        store();
    }

    void remove(Pen p) {
        list.removeIf(f -> f.same(p));
        store();
    }

    /** The pen last used, or null the first time. */
    Pen last() {
        try { return Pen.of(new JSONObject(prefs.getString("last", "null"))); } catch (JSONException e) { return null; }
    }

    void setLast(Pen p) {
        if (p.same(last())) return;
        try { prefs.edit().putString("last", p.json().toString()).apply(); } catch (JSONException e) { /* numbers and a string */ }
    }

    private void store() {
        JSONArray a = new JSONArray();
        try { for (Pen p : list) a.put(p.json()); } catch (JSONException e) { return; }
        prefs.edit().putString("favourites", a.toString()).apply();
    }
}
