package org.atlas.capture;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Where a reader's ink is kept (PageInk), and the ink itself: per page, strokes and typed notes, everything in
 *  fractions of the page (0–1 of its width and height), so it sits in the same place on any screen. One home, the
 *  core's (pdf_marks.rs), the store every device reads and writes: `marks(pdf)` a PDF's note, its pdf-marks block;
 *  `pictures(chapter)` a manga chapter's block in its series' note. (`file(path)`: the EPUB reader's own ink file.)
 *  Read and written off the UI thread. */
public final class InkStore {
    private InkStore() {}

    public static final class Stroke {
        public float width;          // of the page's width
        public int color = 0xff000000;
        public float opacity = 1;
        public float[] pts;          // x, y, x, y… in page fractions
        /** Per point, what the pen gave: pressure (0–1), tilt x and y (−1…1 of 90°), ms since the stroke began; null:
         *  none kept (a stroke from a store without them), drawn at its full width. */
        public float[] sm;
        public String id;            // the element's in a companion drawing; null: new
        public boolean plain() { return color == 0xff000000 && opacity >= 0.999f; }
    }

    public static final class Note {
        public float x, y, size;     // top left and the text's height, in page fractions (size of the width)
        public String text;
        public String id;
        public boolean edited;       // changed since read: written again
    }

    /** A mark another device made that this reader only shows (the desktop's highlights, underlines, struck words,
     *  post-its, stamps, clips): never changed or written here. Places in page fractions. */
    public static final class Shape {
        public String kind;          // a pdf-marks kind: highlight, underline, strike, postit, stamp, clip
        public int color;
        public float[] boxes;        // left, top, right, bottom… (a passage's lines; a clip's box)
        public float x, y;           // a post-it's or stamp's place
        public String text = "";     // a post-it's words, a stamp's glyph, a clip's title
    }

    public static final class Sheet {
        public final List<Stroke> strokes = new ArrayList<>();
        public final List<Note> notes = new ArrayList<>();
        public final List<Shape> shapes = new ArrayList<>();
        /** No ink and no notes of this reader's own (what it can clear and writes). */
        public boolean empty() { return strokes.isEmpty() && notes.isEmpty(); }
        /** Nothing at all to show. */
        public boolean bare() { return empty() && shapes.isEmpty(); }
        Sheet copy() { Sheet s = new Sheet(); s.strokes.addAll(strokes); s.notes.addAll(notes); s.shapes.addAll(shapes); return s; }
    }

    /** Each stamp's glyph, as the desktop draws it (pdf-marks.ts STAMPS). */
    static String glyph(String stamp) {
        switch (stamp) { case "check": return "✓"; case "question": return "?"; case "exclaim": return "!"; case "star": return "★"; default: return "•"; }
    }

    /** Pages by number (whatever numbering the reader uses: a manga's 0-based page, a PDF's 1-based). */
    public interface Store {
        Map<Integer, Sheet> read() throws Exception;
        void write(Map<Integer, Sheet> pages) throws Exception;
    }

    /** `<path>.ink.json` (EpubInk's). */
    public static String file(String path) { return path.replaceAll("/+$", "") + ".ink.json"; }

    /** A picture page's side in the marks' space: its places are fractions × 1000 (core pdf_marks.rs `holder`). */
    static final float PICTURE = 1000;

    /** A book of pictures' marks (a manga chapter: an archive, or a folder ending in `/`), pages numbered from 1: kept
     *  in its series' note, a block per chapter, by the core as a PDF's are. */
    public static Store pictures(Host host, String chapter) { return marks(host, chapter, null); }

    /** A typed note's text height by default: about 11 pt on A4. */
    public static final float NOTE_SIZE = 0.018f;

    static double r4(float v) { return Math.round(v * 10000) / 10000.0; }
    public static String hex(int c) { return String.format("#%06x", c & 0xffffff); }
    public static int color(String s) {
        try { return 0xff000000 | Integer.parseInt(s.replace("#", "").substring(0, 6), 16); } catch (Exception e) { return 0xff000000; }
    }

    // ---- in the PDF's note ----------------------------------------------------------------------------------------

    /** The PDF's marks in its note (core pdf_marks.rs, the store every device writes): its pen marks as strokes and its
     *  text boxes as notes, places turned between PDF points (page space, y up) and page fractions by `sizes`. Only what
     *  changed is sent (a put or a remove a mark), so the desktop's highlights, post-its and stamps are never touched. */
    public static Store marks(Host host, String pdf, float[][] sizes) {
        final Map<String, JSONObject> was = new HashMap<>(); // the marks read, by id
        return new Store() {
            float w(int n) { return sizes == null ? PICTURE : n >= 1 && n <= sizes.length ? sizes[n - 1][0] : 612; }
            float h(int n) { return sizes == null ? PICTURE : n >= 1 && n <= sizes.length ? sizes[n - 1][1] : 792; }

            public Map<Integer, Sheet> read() throws Exception {
                return sheets(host.pdfMarks(pdf).optJSONArray("marks"));
            }

            Map<Integer, Sheet> sheets(JSONArray marks) {
                Map<Integer, Sheet> out = new HashMap<>();
                was.clear();
                if (marks == null) return out;
                for (int i = 0; i < marks.length(); i++) {
                    JSONObject m = marks.optJSONObject(i);
                    if (m == null) continue;
                    String kind = m.optString("kind"), id = m.optString("id");
                    int n = m.optInt("page", 1);
                    float W = w(n), H = h(n);
                    if ("ink".equals(kind)) {
                        JSONArray strokes = m.optJSONArray("strokes");
                        for (int k = 0; strokes != null && k < strokes.length(); k++) {
                            JSONObject sj = strokes.optJSONObject(k);
                            double[] smp = MarkSamples.decode(sj.optString("samples"));
                            if (smp.length < 2 * MarkSamples.N) continue;
                            Stroke st = new Stroke();
                            st.id = id + "#" + k;
                            st.width = (float) sj.optDouble("width", 1) / W;
                            st.color = color(sj.optString("color", m.optString("color", "#000000")));
                            st.opacity = (float) sj.optDouble("opacity", 1);
                            int count = smp.length / MarkSamples.N;
                            st.pts = new float[2 * count];
                            st.sm = new float[4 * count];
                            for (int j = 0, q = 0, a = 0; j + MarkSamples.N <= smp.length; j += MarkSamples.N, q += 2, a += 4) {
                                st.pts[q] = (float) smp[j] / W; st.pts[q + 1] = (H - (float) smp[j + 1]) / H;
                                st.sm[a] = (float) smp[j + 2]; st.sm[a + 1] = (float) smp[j + 3]; st.sm[a + 2] = (float) smp[j + 4]; st.sm[a + 3] = (float) smp[j + 5];
                            }
                            out.computeIfAbsent(n, x -> new Sheet()).strokes.add(st);
                        }
                    } else if ("text-box".equals(kind)) {
                        JSONArray r = m.optJSONArray("rect");
                        if (r == null || m.optString("text").isEmpty()) continue;
                        Note note = new Note();
                        note.id = id;
                        note.x = (float) r.optDouble(0) / W; note.y = (H - (float) r.optDouble(3)) / H;
                        note.size = (float) m.optDouble("size", 10) / W;
                        note.text = m.optString("text");
                        out.computeIfAbsent(n, x -> new Sheet()).notes.add(note);
                    } else {
                        Shape sh = shape(m, W, H);
                        if (sh != null) out.computeIfAbsent(n, x -> new Sheet()).shapes.add(sh);
                        continue; // shown only: never in `was`, so never written back
                    }
                    was.put(id, m);
                }
                return out;
            }

            public void write(Map<Integer, Sheet> pages) throws Exception {
                JSONArray ops = new JSONArray();
                Map<String, Set<Integer>> keptStrokes = new HashMap<>();
                Map<String, Note> notes = new HashMap<>();
                Map<String, Stroke> byId = new HashMap<>();
                List<Stroke> newStrokes = new ArrayList<>(); List<Note> newNotes = new ArrayList<>();
                for (Sheet sh : pages.values()) {
                    for (Stroke st : sh.strokes) if (st.id != null && st.id.contains("#")) {
                        String[] p = st.id.split("#", 2);
                        keptStrokes.computeIfAbsent(p[0], x -> new HashSet<>()).add(Integer.parseInt(p[1]));
                        byId.put(st.id, st);
                    }
                    for (Note n : sh.notes) if (n.id != null) notes.put(n.id, n);
                }
                for (Map.Entry<String, JSONObject> e : was.entrySet()) {
                    JSONObject m = e.getValue();
                    if ("ink".equals(m.optString("kind"))) {
                        JSONArray strokes = m.optJSONArray("strokes"), left = new JSONArray();
                        Set<Integer> kept = keptStrokes.getOrDefault(e.getKey(), new HashSet<>());
                        for (int k = 0; strokes != null && k < strokes.length(); k++) if (kept.contains(k)) {
                            Stroke st = byId.get(e.getKey() + "#" + k);
                            if (st != null) st.id = e.getKey() + "#" + left.length(); // its place in the mark as written
                            left.put(strokes.get(k));
                        }
                        if (left.length() == 0) ops.put(new JSONObject().put("op", "remove").put("id", e.getKey()));
                        else if (strokes != null && left.length() < strokes.length()) ops.put(put(new JSONObject(m.toString()).put("strokes", left)));
                    } else {
                        Note n = notes.get(e.getKey());
                        if (n == null) ops.put(new JSONObject().put("op", "remove").put("id", e.getKey()));
                        else if (n.edited) { ops.put(put(new JSONObject(m.toString()).put("text", n.text).put("tags", tags(n.text)))); n.edited = false; }
                    }
                }
                for (Map.Entry<Integer, Sheet> e : pages.entrySet()) {
                    int n = e.getKey();
                    float W = w(n), H = h(n);
                    JSONArray fresh = new JSONArray();
                    JSONObject ink = mark(n, "#000000");
                    for (Stroke st : e.getValue().strokes) if (st.id == null && st.pts != null && st.pts.length >= 4) {
                        st.id = ink.getString("id") + "#" + fresh.length();
                        newStrokes.add(st);
                        double[] smp = new double[st.pts.length / 2 * MarkSamples.N];
                        boolean has = st.sm != null && st.sm.length >= st.pts.length * 2;
                        for (int q = 0, j = 0, a = 0; q + 1 < st.pts.length; q += 2, j += MarkSamples.N, a += 4) {
                            smp[j] = st.pts[q] * W; smp[j + 1] = H - st.pts[q + 1] * H;
                            if (has) { smp[j + 2] = st.sm[a]; smp[j + 3] = st.sm[a + 1]; smp[j + 4] = st.sm[a + 2]; smp[j + 5] = st.sm[a + 3]; }
                            else { smp[j + 2] = 0.5; smp[j + 5] = q / 2 * 8; }
                        }
                        JSONObject sj = new JSONObject().put("pen", "pen").put("width", st.width * W).put("samples", MarkSamples.encode(smp));
                        if (!st.plain()) sj.put("color", hex(st.color)).put("opacity", st.opacity);
                        fresh.put(sj);
                    }
                    if (fresh.length() > 0) ops.put(put(ink.put("kind", "ink").put("strokes", fresh)));
                    for (Note note : e.getValue().notes) if (note.id == null && note.text != null && !note.text.isEmpty()) {
                        float size = note.size * W, x0 = note.x * W, y1 = H - note.y * H;
                        String[] lines = note.text.split("\n");
                        int longest = 4; for (String l : lines) longest = Math.max(longest, l.length());
                        JSONArray rect = new JSONArray().put(x0).put(y1 - lines.length * size * 1.25).put(x0 + longest * size * 0.55).put(y1);
                        JSONObject box = mark(n, "#000000");
                        note.id = box.getString("id");
                        newNotes.add(note);
                        ops.put(put(box.put("kind", "text-box").put("rect", rect).put("text", note.text).put("size", size).put("tags", tags(note.text))));
                    }
                }
                if (ops.length() == 0) return;
                try { sheets(host.changePdfMarks(pdf, ops).optJSONArray("marks")); } // what was read is now what was written
                catch (Exception x) { for (Stroke st : newStrokes) st.id = null; for (Note n : newNotes) n.id = null; throw x; } // new again next time
            }
        };
    }

    /** A mark of another kind as a shape to show, places turned from PDF points (y up) into page fractions; null: a
     *  kind not shown (a bookmark, a removed mark, one a newer device made). */
    static Shape shape(JSONObject m, float W, float H) {
        String kind = m.optString("kind");
        Shape sh = new Shape();
        sh.kind = kind;
        switch (kind) {
            case "highlight": case "underline": case "strike": {
                JSONArray q = m.optJSONArray("quads");
                if (q == null || q.length() == 0) return null;
                sh.boxes = new float[4 * q.length()];
                for (int i = 0; i < q.length(); i++) box(q.optJSONArray(i), W, H, sh.boxes, 4 * i);
                sh.color = color(m.optString("color", "highlight".equals(kind) ? "#FFE066" : "#e03131"));
                sh.text = m.optJSONObject("quote") != null ? m.optJSONObject("quote").optString("exact") : "";
                return sh;
            }
            case "clip": {
                sh.boxes = new float[4];
                box(m.optJSONArray("rect"), W, H, sh.boxes, 0);
                sh.color = color(m.optString("color", "#1c7ed6"));
                sh.text = m.optString("title");
                return sh;
            }
            case "postit": case "stamp": {
                JSONArray at = m.optJSONArray("at");
                if (at == null) return null;
                sh.x = (float) at.optDouble(0) / W; sh.y = (H - (float) at.optDouble(1)) / H;
                sh.color = color(m.optString("color", "postit".equals(kind) ? "#FFE066" : "#e03131"));
                sh.text = "postit".equals(kind) ? m.optString("text") : glyph(m.optString("stamp"));
                return sh;
            }
            default: return null;
        }
    }

    /** A PDF box [x0, y0, x1, y1] (points, y up) into out[at…at+3] as left, top, right, bottom fractions. */
    private static void box(JSONArray b, float W, float H, float[] out, int at) {
        if (b == null) return;
        float x0 = (float) b.optDouble(0), y0 = (float) b.optDouble(1), x1 = (float) b.optDouble(2), y1 = (float) b.optDouble(3);
        out[at] = Math.min(x0, x1) / W; out[at + 1] = (H - Math.max(y0, y1)) / H; out[at + 2] = Math.max(x0, x1) / W; out[at + 3] = (H - Math.min(y0, y1)) / H;
    }

    private static JSONObject put(JSONObject mark) throws JSONException { return new JSONObject().put("op", "put").put("mark", mark); }

    /** A new mark of this device on page n: an id, now. */
    /** A passage marked on page n (`kind`: highlight, underline or strike), saved into the PDF's note as the desktop
     *  saves one: its line boxes in points (left, bottom, right, top) and its words (exact, prefix, suffix). */
    public static void textMark(Host host, String pdf, int n, String kind, String color, List<float[]> quads, String[] quote) throws Exception {
        JSONArray qs = new JSONArray();
        for (float[] q : quads) qs.put(new JSONArray().put(q[0]).put(q[1]).put(q[2]).put(q[3]));
        JSONObject m = mark(n, color).put("kind", kind).put("quads", qs);
        if (quote != null && !quote[0].isEmpty()) m.put("quote", new JSONObject().put("exact", quote[0]).put("prefix", quote[1]).put("suffix", quote[2]));
        host.changePdfMarks(pdf, new JSONArray().put(put(m)));
    }

    /** The PDF's page bookmarks in its note (the desktop's B and this reader's): page → the mark's id. */
    public static Map<Integer, String> bookmarks(Host host, String pdf) throws Exception {
        Map<Integer, String> out = new HashMap<>();
        JSONArray marks = host.pdfMarks(pdf).optJSONArray("marks");
        for (int i = 0; marks != null && i < marks.length(); i++) {
            JSONObject m = marks.optJSONObject(i);
            if (m != null && "bookmark".equals(m.optString("kind"))) out.put(m.optInt("page", 1), m.optString("id"));
        }
        return out;
    }

    /** Page n bookmarked in the PDF's note (`on`), or its bookmark taken away. */
    public static void bookmark(Host host, String pdf, int n, boolean on) throws Exception {
        JSONArray ops = new JSONArray();
        if (on) ops.put(put(mark(n, "#e03131").put("kind", "bookmark").put("title", "Page " + n)));
        else for (String id : bookmarksOn(host, pdf, n)) ops.put(new JSONObject().put("op", "remove").put("id", id));
        if (ops.length() > 0) host.changePdfMarks(pdf, ops);
    }

    private static List<String> bookmarksOn(Host host, String pdf, int n) throws Exception {
        List<String> ids = new ArrayList<>();
        JSONArray marks = host.pdfMarks(pdf).optJSONArray("marks");
        for (int i = 0; marks != null && i < marks.length(); i++) {
            JSONObject m = marks.optJSONObject(i);
            if (m != null && "bookmark".equals(m.optString("kind")) && m.optInt("page") == n) ids.add(m.optString("id"));
        }
        return ids;
    }

    private static JSONObject mark(int n, String color) throws JSONException {
        String id = "m-"; java.util.Random r = new java.security.SecureRandom();
        for (int i = 0; i < 8; i++) id += Character.forDigit(r.nextInt(36), 36);
        String created = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm", java.util.Locale.ROOT).format(new java.util.Date());
        return new JSONObject().put("id", id).put("page", n).put("version", 0).put("color", color).put("device", "android").put("created", created).put("tags", new JSONArray());
    }

    /** The `#tags` in a mark's text. */
    private static JSONArray tags(String text) {
        JSONArray out = new JSONArray();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?:^|\\s)#([\\p{L}\\p{N}_/-]+)").matcher(text);
        Set<String> seen = new HashSet<>();
        while (m.find()) if (seen.add(m.group(1))) out.put(m.group(1));
        return out;
    }
}
