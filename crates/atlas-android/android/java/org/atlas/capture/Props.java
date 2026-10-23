package org.atlas.capture;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A note's flat frontmatter properties, read and changed line by line: only the keys asked for are touched, every
 *  other line (other keys, lists, comments, the body) stays as written. Values are kept as YAML scalars: plain when
 *  safe, else in single quotes ('' for a quote inside). The plugins' (Books, Manga) one way to keep state in a note. */
public final class Props {
    private Props() {}

    /** `key: value` lines at the top level of the frontmatter (values unquoted); empty when there is none. */
    public static Map<String, String> read(String text) {
        Map<String, String> out = new LinkedHashMap<>();
        if (text == null || !text.startsWith("---")) return out;
        String[] lines = text.split("\n", -1);
        for (int i = 1; i < lines.length; i++) {
            String l = lines[i];
            if (l.trim().equals("---")) break;
            int colon = l.indexOf(':');
            if (colon <= 0 || Character.isWhitespace(l.charAt(0)) || l.startsWith("#")) continue;
            out.put(l.substring(0, colon).trim(), unquote(l.substring(colon + 1).trim()));
        }
        return out;
    }

    /** `text` with each key in `set` given its value (null: removed); a note without frontmatter gets one. */
    public static String set(String text, Map<String, String> set) {
        if (text == null) text = "";
        Map<String, String> left = new LinkedHashMap<>(set);
        StringBuilder out = new StringBuilder();
        String[] lines = text.split("\n", -1);
        int end = -1;
        if (text.startsWith("---")) {
            for (int i = 1; i < lines.length; i++) if (lines[i].trim().equals("---")) { end = i; break; }
        }
        if (end < 0) {
            out.append("---\n");
            for (Map.Entry<String, String> e : left.entrySet()) if (e.getValue() != null) out.append(e.getKey()).append(": ").append(quote(e.getValue())).append('\n');
            out.append("---\n");
            return out.append(text).toString();
        }
        out.append(lines[0]).append('\n');
        for (int i = 1; i < end; i++) {
            String l = lines[i];
            int colon = l.indexOf(':');
            String key = colon > 0 && !Character.isWhitespace(l.charAt(0)) ? l.substring(0, colon).trim() : null;
            if (key != null && left.containsKey(key)) {
                String v = left.remove(key);
                if (v != null) out.append(key).append(": ").append(quote(v)).append('\n');
                while (i + 1 < end && listLine(lines[i + 1])) i++; // its old list items go with it
                continue;
            }
            out.append(l).append('\n');
        }
        for (Map.Entry<String, String> e : left.entrySet()) if (e.getValue() != null) out.append(e.getKey()).append(": ").append(quote(e.getValue())).append('\n');
        for (int i = end; i < lines.length; i++) { out.append(lines[i]); if (i < lines.length - 1) out.append('\n'); }
        return out.toString();
    }

    /** A list property's items: a block list (`key:` then `- item` lines), a flow list (`[a, b]`) or one value. */
    public static List<String> list(String text, String key) {
        List<String> out = new ArrayList<>();
        if (text == null || !text.startsWith("---")) return out;
        String[] lines = text.split("\n", -1);
        for (int i = 1; i < lines.length && !lines[i].trim().equals("---"); i++) {
            String l = lines[i];
            if (!l.startsWith(key + ":")) continue;
            String v = l.substring(key.length() + 1).trim();
            if (v.startsWith("[") && v.endsWith("]")) {
                for (String x : v.substring(1, v.length() - 1).split(",")) if (!x.trim().isEmpty()) out.add(unquote(x.trim()));
            } else if (!v.isEmpty()) out.add(unquote(v));
            else for (int j = i + 1; j < lines.length && listLine(lines[j]); j++) {
                String item = lines[j].trim().substring(1).trim();
                if (!item.isEmpty()) out.add(unquote(item));
            }
            break;
        }
        return out;
    }

    /** `text` with `key` set to these items as a block list, as Obsidian writes one (none: the key removed). */
    public static String setList(String text, String key, List<String> items) {
        String marker = "\u0000list\u0000";
        String once = set(text, java.util.Collections.singletonMap(key, items.isEmpty() ? null : marker));
        if (items.isEmpty()) return once;
        StringBuilder list = new StringBuilder();
        for (String x : items) list.append("\n  - ").append(quote(x));
        return once.replace(key + ": '" + marker + "'", key + ":" + list);
    }

    /** A line of a block list under a key: indented, or a `- ` at the margin. */
    private static boolean listLine(String l) {
        return !l.isEmpty() && (Character.isWhitespace(l.charAt(0)) || l.startsWith("- "));
    }

    private static String unquote(String v) {
        if (v.length() >= 2 && v.startsWith("'") && v.endsWith("'")) return v.substring(1, v.length() - 1).replace("''", "'");
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) return v.substring(1, v.length() - 1).replace("\\\"", "\"");
        return v;
    }

    private static String quote(String v) {
        boolean plain = v.matches("[\\p{L}\\p{N} ._%/+:-]*") && !v.isEmpty() && !v.startsWith(" ") && !v.endsWith(" ") && !v.contains(": ");
        return plain ? v : "'" + v.replace("'", "''") + "'";
    }
}
