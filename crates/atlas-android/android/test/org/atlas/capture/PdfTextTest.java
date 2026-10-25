package org.atlas.capture;

import java.util.List;

/** A page's characters as PDFium gives them, selected as on the Boox: the character under a point, a word, its line
 *  boxes and its quote (the desktop's quoteOf: words, 32 characters of whole words around, spaces squashed). */
public final class PdfTextTest {
    /** `lines` laid out in 10-point characters, line k at y = 700 - 20k. */
    static float[] page(String... lines) {
        StringBuilder all = new StringBuilder();
        java.util.List<float[]> boxes = new java.util.ArrayList<>();
        for (int k = 0; k < lines.length; k++) {
            String l = lines[k] + (k + 1 < lines.length ? "\n" : "");
            for (int i = 0; i < l.length(); i++) {
                boolean nl = l.charAt(i) == '\n';
                float x = 72 + 10 * i, y = 700 - 20 * k;
                boxes.add(new float[] { l.charAt(i), x, y, nl ? x : x + 9, y + 12 });
            }
            all.append(l);
        }
        float[] f = new float[boxes.size() * 5];
        for (int i = 0; i < boxes.size(); i++) System.arraycopy(boxes.get(i), 0, f, 5 * i, 5);
        return f;
    }

    static void eq(Object got, Object want, String what) { if (!want.equals(got)) throw new AssertionError(what + ": " + got + " (wanted " + want + ")"); }

    public static void main(String[] a) {
        PdfText t = new PdfText(page("The quantum dot model", "Go to the last page"));
        int q = t.at(72 + 10 * 4 + 3, 705, 6); // inside "q" of quantum
        eq(t.text(q, q), "q", "the character under a point");
        int[] w = t.word(q);
        eq(t.text(w[0], w[1]), "quantum", "the word around it");
        eq(t.at(500, 300, 6), -1, "nothing within reach");
        // "dot model" … "Go to": two lines, one box each
        int from = t.text(0, t.length() - 1).indexOf("dot"), to = t.text(0, t.length() - 1).indexOf("to the");
        List<float[]> qs = t.quads(from, to + 1);
        eq(qs.size(), 2, "one box a line");
        eq(qs.get(0)[1], 700f, "first line's bottom");
        eq(qs.get(1)[1], 680f, "second line's bottom");
        String[] quote = t.quote(from, to + 1);
        eq(quote[0], "dot model Go to", "exact, the line break a space");
        eq(quote[1], "The quantum", "prefix");
        eq(quote[2], "the last page", "suffix");
        // backwards is the same selection
        eq(t.quads(to + 1, from).size(), 2, "either order");
        System.out.println("PdfTextTest: ok");
    }
}
