package org.atlas.capture;

import android.content.Context;
import android.graphics.Bitmap;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/** PDFium for the readers (docs/design/DESIGN-pdfium-android.md): the pages of a PDF in the vault drawn, their characters
 *  with their boxes, find and links — what Android's PdfRenderer cannot give. The library ships in the APK
 *  (lib/arm64-v8a/libpdfium.so) and is loaded once; without it `ready` is false and a reader keeps PdfRenderer.
 *  Places are PDF points, page space (y up), as the note's marks. Never on the UI thread. */
public final class Pdfium {
    private Pdfium() {}

    private static Boolean ready;
    private static String why = "";

    /** Whether PDFium is there (loaded the first time it is asked). */
    public static synchronized boolean ready(Context c) {
        if (ready == null) {
            try {
                why = Core.pdfiumInit(c.getApplicationInfo().nativeLibraryDir + "/libpdfium.so");
            } catch (UnsatisfiedLinkError e) { why = String.valueOf(e.getMessage()); }
            ready = why.isEmpty();
            if (!ready) android.util.Log.w("AtlasPdfium", "no PDFium, PdfRenderer instead: " + why);
        }
        return ready;
    }

    /** Why PDFium is not there ("" when it is). */
    public static String why() { return why; }

    /** Each page's [width, height] in points. */
    public static float[][] pages(String pdf) {
        float[] f = Core.pdfiumPages(pdf);
        float[][] out = new float[f.length / 2][];
        for (int i = 0; i < out.length; i++) out[i] = new float[] { f[2 * i], f[2 * i + 1] };
        return out;
    }

    /** Page n (1-based) drawn w × h on white, turned `turns` quarters more than its own /Rotate. */
    public static Bitmap render(String pdf, int n, int w, int h, int turns) {
        byte[] px = Core.pdfiumRender(pdf, n, w, h, turns);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        b.copyPixelsFromBuffer(ByteBuffer.wrap(px));
        return b;
    }

    /** One character of a page and its box (left, bottom, right, top in points). */
    public static final class Char {
        public final int code; public final float l, b, r, t;
        Char(int code, float l, float b, float r, float t) { this.code = code; this.l = l; this.b = b; this.r = r; this.t = t; }
        public String text() { return new String(Character.toChars(code)); }
    }

    public static List<Char> chars(String pdf, int n) {
        float[] f = Core.pdfiumChars(pdf, n);
        List<Char> out = new ArrayList<>(f.length / 5);
        for (int i = 0; i + 4 < f.length; i += 5) out.add(new Char((int) f[i], f[i + 1], f[i + 2], f[i + 3], f[i + 4]));
        return out;
    }

    /** Page n's text, to select words in (PdfText). */
    public static PdfText text(String pdf, int n) { return new PdfText(Core.pdfiumChars(pdf, n)); }

    /** Page n's matches of `query`, each the boxes of its lines ({left, bottom, right, top}). */
    public static List<float[][]> find(String pdf, int n, String query) {
        float[] f = Core.pdfiumFind(pdf, n, query);
        List<float[][]> out = new ArrayList<>();
        for (int i = 0; i < f.length; ) {
            int k = (int) f[i++];
            float[][] boxes = new float[k][];
            for (int j = 0; j < k && i + 3 < f.length; j++, i += 4) boxes[j] = new float[] { f[i], f[i + 1], f[i + 2], f[i + 3] };
            out.add(boxes);
        }
        return out;
    }

    /** Page n's links: [{box, page} | {box, url}]. */
    public static org.json.JSONArray links(String pdf, int n) throws org.json.JSONException {
        String s = Core.pdfiumLinks(pdf, n);
        if (s.startsWith("{")) throw new org.json.JSONException(new org.json.JSONObject(s).optString("error", "no links"));
        return new org.json.JSONArray(s);
    }
}
