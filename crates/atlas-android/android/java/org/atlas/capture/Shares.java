package org.atlas.capture;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The plain-Java half of reading a share (CaptureBox.Shared reads the intent): the pieces an app put in several places
 * made one text, each piece once. Apps fill the same thing in twice — the text and its ClipData copy (the share sheet
 * makes one), a styled text and its link's target — so a piece another one already holds is dropped. Tested on the
 * desktop JVM (android/test/SharesTest.java); what the text then becomes is the core's rule (Core.shareText).
 */
final class Shares {
    private Shares() {}

    private static final Pattern HREF = Pattern.compile("(?i)href\\s*=\\s*[\"']([^\"']+)[\"']");

    /** Whether `s` is a web address (the only kind a capture keeps from a link's target). */
    static boolean isWeb(String s) {
        return s != null && (s.regionMatches(true, 0, "http://", 0, 7) || s.regionMatches(true, 0, "https://", 0, 8));
    }

    /** The web addresses an HTML text links to, in order, each once (EXTRA_HTML_TEXT with no plain text beside it). */
    static List<String> hrefs(String html) {
        List<String> out = new ArrayList<>();
        if (html == null) return out;
        Matcher m = HREF.matcher(html);
        while (m.find()) {
            String u = m.group(1).replace("&amp;", "&").trim();
            if (isWeb(u) && !out.contains(u)) out.add(u);
        }
        return out;
    }

    /** The pieces one text, a line each, in the order given; blank pieces and pieces an earlier or later one already
     *  holds (the same text, or a link the text shows) left out. */
    static String join(List<String> pieces) {
        List<String> kept = new ArrayList<>();
        for (String p : pieces) {
            if (p == null) continue;
            String t = p.trim();
            if (t.isEmpty()) continue;
            boolean held = false;
            for (int k = 0; k < kept.size() && !held; k++) {
                if (kept.get(k).contains(t)) held = true;
                else if (t.contains(kept.get(k))) { kept.set(k, t); held = true; } // the fuller one, where the first was
            }
            if (!held) kept.add(t);
        }
        // a piece taken in for a fuller one may now hold another kept before it
        List<String> out = new ArrayList<>();
        for (String t : kept) if (!out.contains(t)) out.add(t);
        return String.join("\n", out);
    }
}
