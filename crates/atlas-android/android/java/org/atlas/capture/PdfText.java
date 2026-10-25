package org.atlas.capture;

import java.util.ArrayList;
import java.util.List;

/** A PDF page's text as PDFium gives it (Pdfium.chars: each character with its box in points, y up), for selecting
 *  words on the Boox: the character under a point, a word's ends, a selection's line boxes and its quote — the same
 *  quote the desktop writes (ui/src/lib/atlas-mark.ts quoteOf: the words, and up to 32 characters of whole words on
 *  either side, spaces squashed), so a passage marked on either device is found on the other. Plain Java (no Android),
 *  tested on the desktop JVM (android/test). */
public final class PdfText {
    /** Characters around a quote's words (atlas-mark.ts AROUND). */
    static final int AROUND = 32;

    private final int[] codes;
    private final float[][] boxes; // left, bottom, right, top

    /** `f`: code point, left, bottom, right, top — five floats a character (Core.pdfiumChars). */
    public PdfText(float[] f) {
        int n = f.length / 5;
        codes = new int[n];
        boxes = new float[n][];
        for (int i = 0; i < n; i++) { codes[i] = (int) f[5 * i]; boxes[i] = new float[] { f[5 * i + 1], f[5 * i + 2], f[5 * i + 3], f[5 * i + 4] }; }
    }

    public int length() { return codes.length; }

    private boolean blank(int i) { return Character.isWhitespace(codes[i]) || boxes[i][2] <= boxes[i][0]; }

    /** The character nearest to the page point (x, y) within `reach` points, or -1. */
    public int at(float x, float y, float reach) {
        int best = -1;
        double bestD = reach;
        for (int i = 0; i < codes.length; i++) {
            if (blank(i)) continue;
            float[] b = boxes[i];
            double dx = x < b[0] ? b[0] - x : x > b[2] ? x - b[2] : 0, dy = y < b[1] ? b[1] - y : y > b[3] ? y - b[3] : 0;
            double d = Math.hypot(dx, dy);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    /** The word around character i: [first, last]. */
    public int[] word(int i) {
        int a = i, z = i;
        while (a > 0 && Character.isLetterOrDigit(codes[a - 1])) a--;
        while (z + 1 < codes.length && Character.isLetterOrDigit(codes[z + 1])) z++;
        return new int[] { a, z };
    }

    /** Characters from..to (inclusive, either order) as one box a line: left, bottom, right, top each. */
    public List<float[]> quads(int from, int to) {
        int a = Math.min(from, to), z = Math.max(from, to);
        List<float[]> out = new ArrayList<>();
        float[] line = null;
        for (int i = a; i <= z && i < codes.length; i++) {
            if (blank(i)) continue;
            float[] b = boxes[i];
            // the same line: the boxes overlap by half their height
            boolean same = line != null && Math.min(line[3], b[3]) - Math.max(line[1], b[1]) >= 0.5f * Math.min(line[3] - line[1], b[3] - b[1]);
            if (!same) { line = b.clone(); out.add(line); continue; }
            line[0] = Math.min(line[0], b[0]); line[1] = Math.min(line[1], b[1]); line[2] = Math.max(line[2], b[2]); line[3] = Math.max(line[3], b[3]);
        }
        return out;
    }

    /** The text of characters from..to. */
    public String text(int from, int to) {
        StringBuilder s = new StringBuilder();
        for (int i = Math.max(0, from); i <= to && i < codes.length; i++) s.appendCodePoint(codes[i] == '\r' ? ' ' : codes[i]);
        return s.toString();
    }

    private static String squash(String s) { return s.replaceAll("\\s+", " "); }

    /** The quote of characters from..to: {exact, prefix, suffix}, as the desktop writes it. */
    public String[] quote(int from, int to) {
        int a = Math.min(from, to), z = Math.max(from, to);
        String before = text(Math.max(0, a - AROUND), a - 1), after = text(z + 1, Math.min(codes.length - 1, z + AROUND));
        String prefix = a > AROUND ? before.replaceFirst("^\\S*\\s", "") : before;
        String suffix = codes.length - z - 1 > AROUND ? after.replaceFirst("\\s\\S*$", "") : after;
        return new String[] { squash(text(a, z)).trim(), squash(prefix).trim(), squash(suffix).trim() };
    }
}
