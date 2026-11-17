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

    /** A mark this reader shows but does not draw itself (highlights, underlines, struck words — made here or on the
     *  desktop —, post-its, stamps, clips). A passage's mark (`id` set) can be removed or recoloured here: written as
     *  that one change; the others are never written. Places in page fractions. */
    public static final class Shape {
        public String kind;          // a pdf-marks kind: highlight, underline, strike, postit, stamp, clip
        public String id;            // a passage's mark: its id in the note (removable here); else null
        public int color;
        public float[] boxes;        // left, top, right, bottom… (a passage's lines; a clip's box)
        public float x, y;           // a post-it's or stamp's place
        public String text = "";     // a post-it's words, a stamp's glyph, a clip's title
        /** The same mark in another colour (a sheet's lists are copied for undo: a shape is replaced, never changed). */
        public Shape recoloured(int c) {
            Shape s = new Shape();
            s.kind = kind; s.id = id; s.color = c; s.boxes = boxes; s.x = x; s.y = y; s.text = text;
            return s;
        }
        public boolean passage() { return "highlight".equals(kind) || "underline".equals(kind) || "strike".equals(kind); }
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

    /** Six numbers a pen sample: x, y, pressure, tiltX, tiltY, t (Core.samplesEncode, pdf_marks.rs `Samples`). */
    static final int SAMPLE = 6;

    /** A book of pictures' marks (a manga chapter: an archive, or a folder ending in `/`), pages numbered from 1: kept
     *  in its series' note, a block per chapter, by the core as a PDF's are. */
    public static Store pictures(Host host, String chapter) {
        PageSpace picture = PageSpace.plain(PICTURE, PICTURE);
        return marks(host, chapter, n -> picture);
    }

    /** Where page n's points are shown (PageSource.space for a PDF): marks are page points, the ink fractions of the
     *  shown page. Asked off the UI thread (it may read the PDF). */
    public interface Spaces { PageSpace of(int n); }

    /** A typed note's text height by default: about 11 pt on A4. */
    public static final float NOTE_SIZE = 0.018f;

    static double r4(float v) { return Math.round(v * 10000) / 10000.0; }
    public static String hex(int c) { return String.format("#%06x", c & 0xffffff); }
    public static int color(String s) {
        try { return 0xff000000 | Integer.parseInt(s.replace("#", "").substring(0, 6), 16); } catch (Exception e) { return 0xff000000; }
    }

    // ---- in the PDF's note ----------------------------------------------------------------------------------------

    /** The PDF's marks in its note (core pdf_marks.rs, the store every device writes): its pen marks as strokes and its
     *  text boxes as notes, places turned between PDF points (page space, y up) and fractions of the shown page by each
     *  page's space (its box and /Rotate: a turned page's marks land where the desktop shows them). Only what
     *  changed is sent (a put or a remove a mark), so the desktop's highlights, post-its and stamps are never touched. */
    public static Store marks(Host host, String pdf, Spaces spaces) {
        final Map<String, JSONObject> was = new HashMap<>(); // the marks read, by id
        final Map<String, JSONObject> passages = new HashMap<>(); // the passages' marks read (shown, removable), by id
        return new Store() {
            final Map<Integer, PageSpace> known = new HashMap<>();
            PageSpace space(int n) { return known.computeIfAbsent(n, spaces::of); }

            public Map<Integer, Sheet> read() throws Exception {
                return sheets(host.pdfMarks(pdf).optJSONArray("marks"));
            }

            Map<Integer, Sheet> sheets(JSONArray marks) {
                Map<Integer, Sheet> out = new HashMap<>();
                was.clear();
                passages.clear();
                if (marks == null) return out;
                for (int i = 0; i < marks.length(); i++) {
                    JSONObject m = marks.optJSONObject(i);
                    if (m == null) continue;
                    String kind = m.optString("kind"), id = m.optString("id");
                    int n = m.optInt("page", 1);
                    PageSpace sp = space(n);
                    if ("ink".equals(kind)) {
                        JSONArray strokes = m.optJSONArray("strokes");
                        for (int k = 0; strokes != null && k < strokes.length(); k++) {
                            JSONObject sj = strokes.optJSONObject(k);
                            double[] smp = Core.samplesDecode(sj.optString("samples"));
                            if (smp.length < 2 * SAMPLE) continue;
                            Stroke st = new Stroke();
                            st.id = id + "#" + k;
                            st.width = sp.widthFraction((float) sj.optDouble("width", 1));
                            st.color = color(sj.optString("color", m.optString("color", "#000000")));
                            st.opacity = (float) sj.optDouble("opacity", 1);
                            int count = smp.length / SAMPLE;
                            st.pts = new float[2 * count];
                            st.sm = new float[4 * count];
                            for (int j = 0, q = 0, a = 0; j + SAMPLE <= smp.length; j += SAMPLE, q += 2, a += 4) {
                                float[] f = sp.fraction((float) smp[j], (float) smp[j + 1]);
                                st.pts[q] = f[0]; st.pts[q + 1] = f[1];
                                st.sm[a] = (float) smp[j + 2]; st.sm[a + 1] = (float) smp[j + 3]; st.sm[a + 2] = (float) smp[j + 4]; st.sm[a + 3] = (float) smp[j + 5];
                            }
                            out.computeIfAbsent(n, x -> new Sheet()).strokes.add(st);
                        }
                    } else if ("text-box".equals(kind)) {
                        JSONArray r = m.optJSONArray("rect");
                        if (r == null || m.optString("text").isEmpty()) continue;
                        Note note = new Note();
                        note.id = id;
                        float[] at = sp.boxFraction(new float[] { (float) r.optDouble(0), (float) r.optDouble(1), (float) r.optDouble(2), (float) r.optDouble(3) });
                        note.x = at[0]; note.y = at[1]; // its shown top left
                        note.size = sp.widthFraction((float) m.optDouble("size", 10));
                        note.text = m.optString("text");
                        out.computeIfAbsent(n, x -> new Sheet()).notes.add(note);
                    } else {
                        Shape sh = shape(m, sp);
                        if (sh == null) continue;
                        if (sh.passage()) { sh.id = id; passages.put(id, m); }
                        out.computeIfAbsent(n, x -> new Sheet()).shapes.add(sh);
                        continue; // never in `was`: only a passage removed or recoloured here is written back
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
                // a passage's mark gone from its page here: removed; in another colour: put again with it
                Map<String, Shape> shown = new HashMap<>();
                for (Sheet sh : pages.values()) for (Shape s : sh.shapes) if (s.id != null) shown.put(s.id, s);
                for (Map.Entry<String, JSONObject> e : passages.entrySet()) {
                    Shape s = shown.get(e.getKey());
                    Shape read = shape(e.getValue(), PageSpace.plain(1, 1)); // only its colour compared
                    if (s == null) ops.put(new JSONObject().put("op", "remove").put("id", e.getKey()));
                    else if (read != null && s.color != read.color) ops.put(put(new JSONObject(e.getValue().toString()).put("color", hex(s.color))));
                }
                for (Map.Entry<Integer, Sheet> e : pages.entrySet()) {
                    int n = e.getKey();
                    PageSpace sp = space(n);
                    JSONArray fresh = new JSONArray();
                    JSONObject ink = mark(n, "#000000");
                    for (Stroke st : e.getValue().strokes) if (st.id == null && st.pts != null && st.pts.length >= 4) {
                        st.id = ink.getString("id") + "#" + fresh.length();
                        newStrokes.add(st);
                        double[] smp = new double[st.pts.length / 2 * SAMPLE];
                        boolean has = st.sm != null && st.sm.length >= st.pts.length * 2;
                        for (int q = 0, j = 0, a = 0; q + 1 < st.pts.length; q += 2, j += SAMPLE, a += 4) {
                            float[] pt = sp.fromFraction(st.pts[q], st.pts[q + 1]);
                            smp[j] = pt[0]; smp[j + 1] = pt[1];
                            if (has) { smp[j + 2] = st.sm[a]; smp[j + 3] = st.sm[a + 1]; smp[j + 4] = st.sm[a + 2]; smp[j + 5] = st.sm[a + 3]; }
                            else { smp[j + 2] = 0.5; smp[j + 5] = q / 2 * 8; }
                        }
                        JSONObject sj = new JSONObject().put("pen", "pen").put("width", st.width * sp.shownW()).put("samples", Core.samplesEncode(smp));
                        if (!st.plain()) sj.put("color", hex(st.color)).put("opacity", st.opacity);
                        fresh.put(sj);
                    }
                    if (fresh.length() > 0) ops.put(put(ink.put("kind", "ink").put("strokes", fresh)));
                    for (Note note : e.getValue().notes) if (note.id == null && note.text != null && !note.text.isEmpty()) {
                        // its box as shown (text runs across the shown page), back in page points
                        float size = note.size * sp.shownW(), X = note.x * sp.shownW(), Y = note.y * sp.shownH();
                        String[] lines = note.text.split("\n");
                        int longest = 4; for (String l : lines) longest = Math.max(longest, l.length());
                        float[] a = sp.toPage(X, Y), b = sp.toPage(X + longest * size * 0.55f, Y + lines.length * size * 1.25f);
                        JSONArray rect = new JSONArray().put(Math.min(a[0], b[0])).put(Math.min(a[1], b[1])).put(Math.max(a[0], b[0])).put(Math.max(a[1], b[1]));
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
    static Shape shape(JSONObject m, PageSpace sp) {
        String kind = m.optString("kind");
        Shape sh = new Shape();
        sh.kind = kind;
        switch (kind) {
            case "highlight": case "underline": case "strike": {
                JSONArray q = m.optJSONArray("quads");
                if (q == null || q.length() == 0) return null;
                sh.boxes = new float[4 * q.length()];
                for (int i = 0; i < q.length(); i++) box(q.optJSONArray(i), sp, sh.boxes, 4 * i);
                sh.color = color(m.optString("color", "highlight".equals(kind) ? "#FFE066" : "#e03131"));
                sh.text = m.optJSONObject("quote") != null ? m.optJSONObject("quote").optString("exact") : "";
                return sh;
            }
            case "clip": {
                sh.boxes = new float[4];
                box(m.optJSONArray("rect"), sp, sh.boxes, 0);
                sh.color = color(m.optString("color", "#1c7ed6"));
                sh.text = m.optString("title");
                return sh;
            }
            case "postit": case "stamp": {
                JSONArray at = m.optJSONArray("at");
                if (at == null) return null;
                float[] f = sp.fraction((float) at.optDouble(0), (float) at.optDouble(1));
                sh.x = f[0]; sh.y = f[1];
                sh.color = color(m.optString("color", "postit".equals(kind) ? "#FFE066" : "#e03131"));
                sh.text = "postit".equals(kind) ? m.optString("text") : glyph(m.optString("stamp"));
                return sh;
            }
            default: return null;
        }
    }

    /** A PDF box [x0, y0, x1, y1] (points, y up) into out[at…at+3] as left, top, right, bottom fractions of the shown page. */
    private static void box(JSONArray b, PageSpace sp, float[] out, int at) {
        if (b == null) return;
        float[] f = sp.boxFraction(new float[] { (float) b.optDouble(0), (float) b.optDouble(1), (float) b.optDouble(2), (float) b.optDouble(3) });
        System.arraycopy(f, 0, out, at, 4);
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

    // ---- a reflowed book's ink (an EPUB): `text-ink` marks in its note -------------------------------------------
    // pdf_marks.rs Body::TextInk, docs/design/DESIGN-ebook-ink.md: `page` the chapter (from 1), the stroke pinned to
    // character `k` of its text (marks.js textMap), its samples and width in em from that character's top left. The web
    // reader (books/view.js, shared/ink.js) reads and writes the same marks, so ink made here shows there and back.

    /** One stroke of a book's ink. `color` 0: the text's own colour (black ink on a dark page stays readable). */
    public static final class TextInk {
        public String id;            // its mark's; null: not written yet
        public int chapter, k;       // chapter from 1; the character it is pinned to
        public float width;          // in em
        public int color;
        public float opacity = 1;
        public float[] pts;          // x, y, x, y… in em from the character's top left (y down)
    }

    /** The book's ink, every chapter's. Never on the UI thread. */
    public static List<TextInk> textInk(Host host, String book) throws Exception {
        List<TextInk> out = new ArrayList<>();
        JSONArray marks = host.pdfMarks(book).optJSONArray("marks");
        for (int i = 0; marks != null && i < marks.length(); i++) {
            JSONObject m = marks.optJSONObject(i);
            if (m == null || !"text-ink".equals(m.optString("kind"))) continue;
            JSONArray strokes = m.optJSONArray("strokes");
            for (int j = 0; strokes != null && j < strokes.length(); j++) {
                JSONObject sj = strokes.optJSONObject(j);
                double[] smp = sj == null ? new double[0] : Core.samplesDecode(sj.optString("samples"));
                if (smp.length < SAMPLE) continue;
                TextInk t = new TextInk();
                t.id = m.optString("id");
                t.chapter = m.optInt("page", 1);
                t.k = m.optInt("k");
                t.width = (float) sj.optDouble("width", 0.09);
                String c = sj.optString("color", m.optString("color", ""));
                t.color = c.isEmpty() || (color(c) & 0xffffff) == 0 ? 0 : color(c);
                t.opacity = (float) sj.optDouble("opacity", 1);
                int count = smp.length / SAMPLE;
                t.pts = new float[2 * count];
                for (int q = 0; q < count; q++) { t.pts[2 * q] = (float) smp[q * SAMPLE]; t.pts[2 * q + 1] = (float) smp[q * SAMPLE + 1]; }
                out.add(t);
            }
        }
        return out;
    }

    /** `t` written as a new mark of the book's note (the note made with the first) → its id. Never on the UI thread. */
    public static String putTextInk(Host host, String book, TextInk t) throws Exception {
        double[] smp = new double[t.pts.length / 2 * SAMPLE];
        for (int q = 0; q < t.pts.length / 2; q++) {
            smp[q * SAMPLE] = t.pts[2 * q]; smp[q * SAMPLE + 1] = t.pts[2 * q + 1]; smp[q * SAMPLE + 2] = 0.5; // no pressure kept here yet
        }
        JSONObject stroke = new JSONObject().put("pen", "pen").put("width", Math.round(t.width * 1000) / 1000.0).put("samples", Core.samplesEncode(smp));
        if (t.color != 0 && (t.color & 0xffffff) != 0) stroke.put("color", hex(t.color));
        if (t.opacity < 0.999f) stroke.put("opacity", Math.round(t.opacity * 100) / 100.0);
        JSONObject m = mark(t.chapter, "#000000").put("kind", "text-ink").put("k", t.k).put("strokes", new JSONArray().put(stroke));
        m.remove("color"); // the stroke says its colour; none: the text's
        if (t.id != null) m.put("id", t.id); // put back (an undone erasing): the same mark, a version up
        host.changePdfMarks(book, new JSONArray().put(put(m)));
        return m.optString("id");
    }

    /** The marks `ids` taken out of the book's note (a tombstone each, so another device's copy does not bring them back). */
    public static void removeTextInk(Host host, String book, List<String> ids) throws Exception {
        JSONArray ops = new JSONArray();
        for (String id : ids) ops.put(new JSONObject().put("op", "remove").put("id", id));
        if (ops.length() > 0) host.changePdfMarks(book, ops);
    }
}
