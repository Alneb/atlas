package org.atlas.capture;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A JSON text read into plain Java (objects as LinkedHashMap, arrays as ArrayList, numbers as Long or Double, true,
 * false, null, strings) and the few accessors a server's answers need. Android's org.json is not on the desktop JVM,
 * where the native plugins' parsing is tested against recorded answers (Manga's BrowseTest, Audiobookshelf's
 * CardsTest), so their plain logic reads with this; the screens keep org.json.
 */
public final class Json {
    private final String s;
    private int i;

    private Json(String s) { this.s = s; }

    /** The value `text` holds; IllegalArgumentException says where it stops being JSON. */
    public static Object parse(String text) {
        Json j = new Json(text);
        Object v = j.value();
        j.space();
        if (j.i != j.s.length()) throw j.bad("text after the value");
        return v;
    }

    private IllegalArgumentException bad(String what) { return new IllegalArgumentException("not JSON at " + i + ": " + what); }

    private void space() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

    private Object value() {
        space();
        if (i >= s.length()) throw bad("the end");
        char c = s.charAt(i);
        switch (c) {
            case '{': return object();
            case '[': return array();
            case '"': return string();
            case 't': return word("true", Boolean.TRUE);
            case 'f': return word("false", Boolean.FALSE);
            case 'n': return word("null", null);
            default: return number();
        }
    }

    private Object word(String w, Object v) {
        if (!s.startsWith(w, i)) throw bad("a word");
        i += w.length();
        return v;
    }

    private Map<String, Object> object() {
        Map<String, Object> m = new LinkedHashMap<>();
        i++;
        space();
        if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
        while (true) {
            space();
            if (i >= s.length() || s.charAt(i) != '"') throw bad("a key");
            String k = string();
            space();
            if (i >= s.length() || s.charAt(i) != ':') throw bad("':'");
            i++;
            m.put(k, value());
            space();
            if (i >= s.length()) throw bad("the end");
            char c = s.charAt(i++);
            if (c == '}') return m;
            if (c != ',') throw bad("',' or '}'");
        }
    }

    private List<Object> array() {
        List<Object> a = new ArrayList<>();
        i++;
        space();
        if (i < s.length() && s.charAt(i) == ']') { i++; return a; }
        while (true) {
            a.add(value());
            space();
            if (i >= s.length()) throw bad("the end");
            char c = s.charAt(i++);
            if (c == ']') return a;
            if (c != ',') throw bad("',' or ']'");
        }
    }

    private String string() {
        StringBuilder b = new StringBuilder();
        i++;
        while (i < s.length()) {
            char c = s.charAt(i++);
            if (c == '"') return b.toString();
            if (c != '\\') { b.append(c); continue; }
            if (i >= s.length()) break;
            char e = s.charAt(i++);
            switch (e) {
                case 'n': b.append('\n'); break;
                case 't': b.append('\t'); break;
                case 'r': b.append('\r'); break;
                case 'b': b.append('\b'); break;
                case 'f': b.append('\f'); break;
                case 'u':
                    if (i + 4 > s.length()) throw bad("a \\u escape");
                    b.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                    i += 4;
                    break;
                default: b.append(e); // \" \\ \/
            }
        }
        throw bad("an unfinished string");
    }

    private Object number() {
        int start = i;
        while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
        String n = s.substring(start, i);
        if (n.isEmpty()) throw bad("a value");
        try {
            return n.contains(".") || n.contains("e") || n.contains("E") ? (Object) Double.parseDouble(n) : (Object) Long.parseLong(n);
        } catch (NumberFormatException e) { throw bad("a number"); }
    }

    // ---- reading what was parsed ----

    /** `o[key]` as an object (empty when absent or not one). */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> obj(Object o, String key) {
        Object v = o instanceof Map ? ((Map<String, Object>) o).get(key) : null;
        return v instanceof Map ? (Map<String, Object>) v : new LinkedHashMap<>();
    }

    /** `o[key]` as an array (empty when absent or not one). */
    @SuppressWarnings("unchecked")
    public static List<Object> arr(Object o, String key) {
        Object v = o instanceof Map ? ((Map<String, Object>) o).get(key) : null;
        return v instanceof List ? (List<Object>) v : new ArrayList<>();
    }

    /** `o[key]` as text (a number as its digits; `or` when absent or null). */
    @SuppressWarnings("unchecked")
    public static String str(Object o, String key, String or) {
        Object v = o instanceof Map ? ((Map<String, Object>) o).get(key) : null;
        return v == null || v instanceof Map || v instanceof List ? or : String.valueOf(v);
    }

    /** `o[key]` as a long (a LongString's digits too; `or` when it is none). */
    public static long num(Object o, String key, long or) {
        String v = str(o, key, null);
        if (v == null) return or;
        try { return v.contains(".") ? (long) Double.parseDouble(v) : Long.parseLong(v.trim()); } catch (NumberFormatException e) { return or; }
    }

    /** `o[key]` is true. */
    public static boolean yes(Object o, String key) { return "true".equals(str(o, key, "false")); }
}
