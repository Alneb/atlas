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

        // a page turned by its /Rotate 90, its box not at the origin (pdfium.rs's rotated-page test): the screen goes
        // through its space — fractions of the shown page → page points — and the word under the finger is found
        PageSpace turned = new PageSpace(100, 50, 500, 650, 1);
        eq(turned.shownW() + "×" + turned.shownH(), "600.0×400.0", "a quarter turn swaps the shown sides");
        PdfText words = new PdfText(page("The quantum dot model"));
        float[] centre = { 72 + 10 * 4 + 4.5f, 706 }; // the middle of "q", page points
        float[] f = turned.fraction(centre[0], centre[1]);
        float[] back = turned.fromFraction(f[0], f[1]);
        eq(words.text(words.at(back[0], back[1], 6), words.at(back[0], back[1], 6)), "q", "a tap where q is shown finds q");
        // the old mapping (shown size alone, as if unturned at the origin) from the same tap: not q
        float oldX = f[0] * 600, oldY = 400 - f[1] * 400;
        int wrong = words.at(oldX, oldY, 6);
        eq(wrong < 0 || !words.text(wrong, wrong).equals("q"), true, "the shown size alone misses it");
        // every turn: toPage undoes toShown; a box comes out with its sides in order
        for (int r = 0; r < 4; r++) {
            PageSpace sp = new PageSpace(10, 20, 410, 620, r);
            float[] sh = sp.toShown(123, 456), p2 = sp.toPage(sh[0], sh[1]);
            eq(Math.round(p2[0]) + "," + Math.round(p2[1]), "123,456", "turn " + r + ": back where it was");
            float[] b = sp.boxFraction(new float[] { 110, 120, 210, 220 });
            eq(b[0] < b[2] && b[1] < b[3] && b[0] >= 0 && b[3] <= 1, true, "turn " + r + ": a box's sides in order, on the page");
        }
        eq(String.valueOf(PageSpace.of(null, 612, 792).shownH()), "792.0", "no PDFium: its plain size");
        eq(PageSpace.of(new float[] { 0, 0, 612, 792, -1 }, 0, 0).rotate, 3, "a negative /Rotate is a turn the other way");
        // the boxes the column under a finger is found from (Pdfium.column): shown points, y down, no spaces
        PdfText two = new PdfText(page("ab c"));
        float[] sb = two.shownBoxes(PageSpace.plain(612, 792));
        eq(sb.length, 12, "three printed characters, four floats each (the space left out)");
        eq(Math.round(sb[0]) + " " + Math.round(sb[1]) + " " + Math.round(sb[2]) + " " + Math.round(sb[3]), "72 80 81 92", "a: left, top (792 - 712), right, bottom");
        float[] tb = two.shownBoxes(turned);
        eq(tb[0] < tb[2] && tb[1] < tb[3], true, "turned: still left < right, top < bottom");
        System.out.println("PdfTextTest: ok");
    }
}
