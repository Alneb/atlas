package org.atlas.plugins.books;

import org.json.JSONObject;

/** The reading settings as the page's CSS and colours — the one place they are turned into a look (the reader and
 *  the Aa sheet's live preview both use it). The keys are the plugin's settings (plugin.toml), shared with the web
 *  reader where it has them: font, size, line, margin, justify, flow; the native reader adds theme, weight, para,
 *  indent, hyphenate, publisher (the book's own styles). */
final class Typeset {
    private Typeset() {}

    /** The page's colours, background then text: the theme, on e-ink only white or black. */
    static int[] colors(JSONObject o, boolean eink) {
        String t = o.optString("theme", "white");
        if (eink) return t.equals("black") || t.equals("dark") ? new int[] { 0xff000000, 0xffffffff } : new int[] { 0xffffffff, 0xff000000 };
        switch (t) {
            case "sepia": return new int[] { 0xfff4ecd8, 0xff5b4636 };
            case "dark": return new int[] { 0xff1e1f22, 0xffd6d6d6 };
            case "black": return new int[] { 0xff000000, 0xffc8c8c8 };
            default: return new int[] { 0xffffffff, 0xff1a1a1a };
        }
    }

    static String hex(int c) { return String.format("#%06x", c & 0xffffff); }

    static boolean paged(JSONObject o, boolean eink) { return eink || !"scrolled".equals(o.optString("flow", "paged")); }

    static int margin(JSONObject o) { return Math.max(0, o.optInt("margin", 28)); }

    /** The CSS laid over a chapter, for a page `width` CSS px wide. */
    static String css(JSONObject o, int width, boolean eink) {
        int[] c = colors(o, eink);
        int size = Math.max(8, (int) Math.round(o.optDouble("size", 19)));
        double line = o.optDouble("line", 1.55);
        int m = margin(o);
        boolean own = o.optBoolean("publisher", false); // the book's own fonts, sizes and spacing
        String font = o.optString("font", "serif");
        String family = font.equals("sans-serif") ? "system-ui, 'Noto Sans', sans-serif" : font.equals("serif") ? "Georgia, 'Noto Serif', serif" : null;
        StringBuilder b = new StringBuilder();
        b.append("html { background: ").append(hex(c[0])).append(" !important; color: ").append(hex(c[1])).append(" !important; -webkit-text-size-adjust: 100%; }\n");
        b.append("body { margin: 0 !important; background: transparent !important; color: inherit !important; overflow-wrap: break-word;");
        if (!own || o.has("size")) b.append(" font-size: ").append(size).append("px !important;");
        if (!own) b.append(" line-height: ").append(line).append(" !important;");
        if (family != null && !font.equals("the book's own")) b.append(" font-family: ").append(family).append(" !important;");
        int weight = o.optInt("weight", 400);
        if (weight != 400) b.append(" font-weight: ").append(weight).append(" !important;");
        if (o.optBoolean("justify", true)) b.append(" text-align: justify;");
        if (o.optBoolean("hyphenate", true)) b.append(" hyphens: auto; -webkit-hyphens: auto;");
        b.append(" }\n");
        if (!own) {
            b.append("p, li, blockquote, dd { line-height: inherit !important; }\n");
            if (family != null) b.append("p, li, span, div, blockquote, td { font-family: inherit !important; }\n");
            double para = o.optDouble("para", 0.4), indent = o.optDouble("indent", 1.2);
            b.append("p { margin-top: ").append(para).append("em !important; margin-bottom: ").append(para).append("em !important; text-indent: ").append(indent).append("em; }\n");
        }
        b.append("a { color: inherit; }\n");
        b.append("img, svg, video { max-width: 100% !important; max-height: 92vh !important; height: auto; object-fit: contain; break-inside: avoid; }\n");
        b.append("mark.atlas-hl { background: ").append(eink ? "transparent" : "rgba(245,197,66,.45)").append("; color: inherit;").append(eink ? " text-decoration: underline 2px; text-underline-offset: 3px;" : "").append(" }\n");
        b.append("mark.atlas-found { background: ").append(eink ? "transparent" : "rgba(74,158,255,.4)").append("; color: inherit;").append(eink ? " outline: 2px solid currentColor;" : "").append(" }\n");
        if (paged(o, eink)) {
            // a page is exactly the view's width: the side margins are the html's padding and the columns' gap, so page
            // n starts at n × width and never drifts (the web reader's rule)
            b.append("html { height: 100vh; overflow: hidden; padding: 0 ").append(m).append("px; box-sizing: border-box; }\n");
            b.append("body { height: 100vh; box-sizing: border-box; padding: ").append(Math.max(16, m / 2)).append("px 0 !important; column-width: ")
                .append(Math.max(100, width - 2 * m)).append("px; column-gap: ").append(2 * m).append("px; column-fill: auto; }\n");
        } else {
            b.append("body { padding: 24px ").append(m).append("px 40vh !important; }\n");
        }
        return b.toString();
    }
}
