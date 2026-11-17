package org.atlas.plugins.manga;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The page between two chapters (Mihon's transition): what was finished, what comes next, and a warning when chapter
 * numbers skip (chapters missing in between). Chapter numbers come from the chapters' names, as sources and folders
 * name them ("Ch. 12", "Chapter 12.5: …", "Vol.3 Ch.15", "Berserk 012.cbz"). Pure: tested on the desktop JVM
 * (GesturesTest, android/test/run.sh).
 */
final class Transition {
    private Transition() {}

    /** "ch 12", "chapter 12.5", "chap. 3", "ep 4", "episode 4", "#12". */
    private static final Pattern MARKED = Pattern.compile("(?:\\bch(?:apter|ap|p)?|\\bep(?:isode)?|#)\\s*\\.?\\s*(\\d+(?:[.,]\\d+)?)");
    /** A volume, a season or a tome is not the chapter's number ("vol.3", "v03", "s2", "tome 4"). */
    private static final Pattern VOLUME = Pattern.compile("\\b(?:vol(?:ume)?|v|tome|t|season|s)\\s*\\.?\\s*\\d+(?:[.,]\\d+)?");
    private static final Pattern NUMBER = Pattern.compile("(\\d+(?:[.,]\\d+)?)");

    /** A chapter's number from its name (a vault path, a server's `suwayomi:<id>/<name>`); -1 when it has none. */
    static double number(String chapter) {
        String n = titleOf(name(chapter)).toLowerCase(Locale.ROOT);
        Matcher m = MARKED.matcher(n);
        if (m.find()) return parse(m.group(1));
        m = NUMBER.matcher(VOLUME.matcher(n).replaceAll(" "));
        return m.find() ? parse(m.group(1)) : -1;
    }

    private static double parse(String s) {
        try { return Double.parseDouble(s.replace(',', '.')); } catch (NumberFormatException e) { return -1; }
    }

    /** How many whole chapters are missing between `a` and the one read after it, `b` (0: none, or the numbers are
     *  unknown). 12 → 12.5 → 13 misses none; 12 → 15 misses 13 and 14. */
    static int missing(String a, String b) {
        double x = number(a), y = number(b);
        if (x < 0 || y < 0) return 0;
        int lo = (int) Math.floor(Math.min(x, y)), hi = (int) Math.floor(Math.max(x, y));
        return Math.max(0, hi - lo - 1);
    }

    /** The numbers missing, said: "13", "13–14". */
    static String which(String a, String b) {
        double x = number(a), y = number(b);
        int lo = (int) Math.floor(Math.min(x, y)) + 1, hi = (int) Math.floor(Math.max(x, y)) - 1;
        return lo == hi ? String.valueOf(lo) : lo + "–" + hi;
    }

    /** The transition page's lines. `forward`: after the last page of `here` (towards `other`, null at the series'
     *  end); else before its first page (towards the one before, null at the series' start). The first line is the
     *  heading; a gap's warning starts with "⚠". */
    static List<String> lines(String here, String other, boolean forward) {
        List<String> out = new ArrayList<>();
        String h = titleOf(name(here));
        if (forward) {
            out.add("Finished: " + h);
            if (other == null) { out.add("That was the last chapter."); return out; }
            out.add("Next: " + titleOf(name(other)));
        } else {
            out.add("Current: " + h);
            if (other == null) { out.add("This is the first chapter."); return out; }
            out.add("Previous: " + titleOf(name(other)));
        }
        int gap = missing(here, other);
        if (gap > 0) out.add("⚠ " + (gap == 1 ? "1 chapter is" : gap + " chapters are") + " missing (" + which(here, other) + ")");
        return out;
    }

    /** `Suwayomi.SCHEME`, here so this class needs nothing of Android's (Suwayomi reaches the network). */
    static final String SERVER = "suwayomi:";

    /** A server chapter's shown name (`suwayomi:<id>/<name>` → the name). */
    private static String name(String chapter) {
        return chapter.startsWith(SERVER) && chapter.indexOf('/') > 0 ? chapter.substring(chapter.indexOf('/') + 1) : chapter;
    }

    /** A chapter's (or a loose .cbz series') name: the last part of its path, without .cbz (Chapter.titleOf). */
    static String titleOf(String path) {
        String name = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        return name.substring(name.lastIndexOf('/') + 1).replaceFirst("(?i)\\.cbz$", "");
    }
}
