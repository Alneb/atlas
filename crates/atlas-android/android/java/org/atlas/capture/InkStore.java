package org.atlas.capture;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Where a reader's ink is kept (PageInk), and the ink itself: per page, strokes and typed notes, everything in
 *  fractions of the page (0–1 of its width and height), so it sits in the same place on any screen. Two homes:
 *  - `beside(path)`: `<file>.ink.json` beside a chapter or a book (manga, EPUB) — `{ pages: { "<n>": [stroke…] },
 *    notes: { "<n>": [{x, y, text, size}] } }`, a stroke `[width, x, y, …]` (the black pen; the web reader's format)
 *    or `{w, color, opacity, pts: [x, y, …]}`;
 *  - `marks(pdf)`: the PDF's note, its pdf-marks block (core pdf_marks.rs) — the store every device reads and writes;
 *  - `pdf(pdf)`: the PDF's companion drawing `x.pdf.excalidraw`, Notepad's (freedraw and text elements over the
 *    `atlasPage` pictures), the notebook a PDF is written into with the notepad.
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

    // ---- beside the file ------------------------------------------------------------------------------------------

    /** `<path>.ink.json` (a folder `ch 1/` → `ch 1.ink.json`; view.js inkPath alike). */
    public static String file(String path) { return path.replaceAll("/+$", "") + ".ink.json"; }

    public static Store beside(Host host, String path) {
        final String at = file(path);
        return new Store() {
            public Map<Integer, Sheet> read() throws Exception {
                Map<Integer, Sheet> out = new HashMap<>();
                if (!host.exists(at)) return out;
                JSONObject o = new JSONObject(host.readText(at));
                JSONObject pages = o.optJSONObject("pages"), notes = o.optJSONObject("notes");
                if (pages != null) for (java.util.Iterator<String> k = pages.keys(); k.hasNext(); ) {
                    String key = k.next();
                    JSONArray list = pages.optJSONArray(key);
                    Sheet s = sheet(out, key);
                    if (s != null && list != null) for (int i = 0; i < list.length(); i++) { Stroke st = stroke(list.opt(i)); if (st != null) s.strokes.add(st); }
                }
                if (notes != null) for (java.util.Iterator<String> k = notes.keys(); k.hasNext(); ) {
                    String key = k.next();
                    JSONArray list = notes.optJSONArray(key);
                    Sheet s = sheet(out, key);
                    if (s != null && list != null) for (int i = 0; i < list.length(); i++) {
                        JSONObject n = list.optJSONObject(i);
                        if (n == null || n.optString("text").isEmpty()) continue;
                        Note note = new Note();
                        note.x = (float) n.optDouble("x"); note.y = (float) n.optDouble("y");
                        note.size = (float) n.optDouble("size", NOTE_SIZE); note.text = n.optString("text");
                        s.notes.add(note);
                    }
                }
                return out;
            }

            public void write(Map<Integer, Sheet> pages) throws Exception {
                JSONObject ps = new JSONObject(), ns = new JSONObject();
                for (Map.Entry<Integer, Sheet> e : pages.entrySet()) {
                    String key = String.valueOf(e.getKey());
                    if (!e.getValue().strokes.isEmpty()) {
                        JSONArray list = new JSONArray();
                        for (Stroke st : e.getValue().strokes) list.put(json(st));
                        ps.put(key, list);
                    }
                    if (!e.getValue().notes.isEmpty()) {
                        JSONArray list = new JSONArray();
                        for (Note n : e.getValue().notes) list.put(new JSONObject().put("x", r4(n.x)).put("y", r4(n.y)).put("size", r4(n.size)).put("text", n.text));
                        ns.put(key, list);
                    }
                }
                JSONObject o = new JSONObject().put("pages", ps);
                if (ns.length() > 0) o.put("notes", ns);
                host.write(at, o.toString().getBytes(StandardCharsets.UTF_8));
            }
        };
    }

    /** A typed note's text height by default: about 11 pt on A4. */
    public static final float NOTE_SIZE = 0.018f;

    private static Sheet sheet(Map<Integer, Sheet> out, String key) {
        try { return out.computeIfAbsent(Integer.parseInt(key), k -> new Sheet()); } catch (NumberFormatException e) { return null; }
    }

    private static Stroke stroke(Object o) {
        Stroke st = new Stroke();
        JSONArray pts;
        if (o instanceof JSONArray) {
            JSONArray a = (JSONArray) o;
            if (a.length() < 5) return null;
            st.width = (float) a.optDouble(0);
            st.pts = new float[a.length() - 1];
            for (int i = 1; i < a.length(); i++) st.pts[i - 1] = (float) a.optDouble(i);
            return st;
        }
        if (!(o instanceof JSONObject)) return null;
        JSONObject j = (JSONObject) o;
        pts = j.optJSONArray("pts");
        if (pts == null || pts.length() < 4) return null;
        st.width = (float) j.optDouble("w", 0.0022);
        st.color = color(j.optString("color", "#000000"));
        st.opacity = (float) j.optDouble("opacity", 1);
        st.pts = new float[pts.length() & ~1];
        for (int i = 0; i < st.pts.length; i++) st.pts[i] = (float) pts.optDouble(i);
        return st;
    }

    private static Object json(Stroke st) throws JSONException {
        JSONArray pts = new JSONArray();
        if (st.plain()) pts.put(r4(st.width)); // the black pen: the plain array every reader reads
        for (float v : st.pts) pts.put(r4(v));
        if (st.plain()) return pts;
        return new JSONObject().put("w", r4(st.width)).put("color", hex(st.color)).put("opacity", r4(st.opacity)).put("pts", pts);
    }

    static double r4(float v) { return Math.round(v * 10000) / 10000.0; }
    public static String hex(int c) { return String.format("#%06x", c & 0xffffff); }
    public static int color(String s) {
        try { return 0xff000000 | Integer.parseInt(s.replace("#", "").substring(0, 6), 16); } catch (Exception e) { return 0xff000000; }
    }

    // ---- a PDF's companion drawing --------------------------------------------------------------------------------

    /** Excalidraw outlines a freedraw about 4.25 × strokeWidth across, and its pressure makes it ~1.41× that at the
     *  middle (the reader's line ≈ Notepad's): page fraction ↔ strokeWidth. */
    private static final float FREEDRAW = 4.25f * 1.41f;
    /** Notepad's page: A4 at 96 dpi, the gap, 4 pages a row (org.atlas.notepad Page, Scene.perRow). */
    private static final float PAGE_W = 794, PAGE_H = 1123, GAP = 48;
    private static final int PER_ROW = 4;

    /** Pages numbered from 1, as the PDF's. `sizes`: the PDF's pages (points), for a companion made here. */
    public static Store pdf(Host host, String pdf, float[][] sizes) {
        final String at = pdf + ".excalidraw";
        final Set<String> read = new HashSet<>(); // the ids read: one missing at write time was erased here
        return new Store() {
            public Map<Integer, Sheet> read() throws Exception {
                Map<Integer, Sheet> out = new HashMap<>();
                if (!host.exists(at)) return out;
                JSONArray els = new JSONObject(host.readText(at)).optJSONArray("elements");
                if (els == null) return out;
                List<JSONObject> pages = pages(els);
                for (int i = 0; i < els.length(); i++) {
                    JSONObject el = els.optJSONObject(i);
                    if (el == null || el.optBoolean("isDeleted")) continue;
                    String type = el.optString("type");
                    if (!"freedraw".equals(type) && !"text".equals(type)) continue;
                    float x = (float) el.optDouble("x"), y = (float) el.optDouble("y");
                    JSONArray pts = el.optJSONArray("points");
                    float fx = x, fy = y;
                    if ("freedraw".equals(type)) {
                        if (pts == null || pts.length() < 2) continue;
                        fx += (float) pts.optJSONArray(0).optDouble(0); fy += (float) pts.optJSONArray(0).optDouble(1);
                    }
                    JSONObject pg = pageAt(pages, fx, fy);
                    if (pg == null) continue;
                    float px = (float) pg.optDouble("x"), py = (float) pg.optDouble("y"), pw = (float) pg.optDouble("width"), ph = (float) pg.optDouble("height");
                    Sheet s = out.computeIfAbsent(pg.optJSONObject("customData").optJSONObject("atlasPage").optInt("page", 1), k -> new Sheet());
                    if ("text".equals(type)) {
                        Note n = new Note();
                        n.x = (x - px) / pw; n.y = (y - py) / ph;
                        n.size = (float) el.optDouble("fontSize", 20) / pw;
                        n.text = el.optString("text");
                        n.id = el.optString("id");
                        if (n.text.isEmpty()) continue;
                        s.notes.add(n);
                    } else {
                        Stroke st = new Stroke();
                        st.width = (float) el.optDouble("strokeWidth", 1) * FREEDRAW / pw;
                        st.color = color(el.optString("strokeColor", "#000000"));
                        st.opacity = (float) el.optDouble("opacity", 100) / 100f;
                        st.id = el.optString("id");
                        st.pts = new float[2 * pts.length()];
                        for (int k = 0; k < pts.length(); k++) {
                            JSONArray p = pts.optJSONArray(k);
                            st.pts[2 * k] = (x + (float) p.optDouble(0) - px) / pw;
                            st.pts[2 * k + 1] = (y + (float) p.optDouble(1) - py) / ph;
                        }
                        s.strokes.add(st);
                    }
                    read.add(el.optString("id"));
                }
                return out;
            }

            /** Read again and merged: what Notepad wrote meanwhile stays; ink erased here goes, new ink comes in. */
            public void write(Map<Integer, Sheet> sheets) throws Exception {
                JSONObject doc = host.exists(at) ? new JSONObject(host.readText(at)) : made(pdf, sizes);
                JSONArray els = doc.optJSONArray("elements");
                if (els == null) { els = new JSONArray(); doc.put("elements", els); }
                Map<Integer, JSONObject> byPage = new HashMap<>();
                for (JSONObject pg : pages(els)) byPage.put(pg.optJSONObject("customData").optJSONObject("atlasPage").optInt("page", 1), pg);
                Set<String> kept = new HashSet<>();
                Map<String, Note> edited = new HashMap<>();
                for (Sheet s : sheets.values()) {
                    for (Stroke st : s.strokes) if (st.id != null) kept.add(st.id);
                    for (Note n : s.notes) if (n.id != null) { kept.add(n.id); if (n.edited) edited.put(n.id, n); }
                }
                JSONArray out = new JSONArray();
                for (int i = 0; i < els.length(); i++) {
                    JSONObject el = els.optJSONObject(i);
                    if (el == null) continue;
                    String id = el.optString("id");
                    if (read.contains(id) && !kept.contains(id)) continue; // erased in the reader
                    Note n = edited.get(id);
                    if (n != null) { el.put("text", n.text).put("originalText", n.text); bump(el); n.edited = false; }
                    out.put(el);
                }
                for (Map.Entry<Integer, Sheet> e : sheets.entrySet()) {
                    JSONObject pg = byPage.get(e.getKey());
                    // ink on a page the drawing has no picture of (the Notepad lays out only the first pages of a long
                    // PDF): the page is added, never the ink dropped
                    if (pg == null && !e.getValue().empty() && e.getKey() >= 1 && e.getKey() <= sizes.length) {
                        pg = addPage(out, pdf, e.getKey(), sizes[e.getKey() - 1]);
                        byPage.put(e.getKey(), pg);
                    }
                    if (pg == null) continue;
                    float px = (float) pg.optDouble("x"), py = (float) pg.optDouble("y"), pw = (float) pg.optDouble("width"), ph = (float) pg.optDouble("height");
                    String frame = pg.isNull("frameId") ? null : pg.optString("frameId", null);
                    for (Stroke st : e.getValue().strokes) if (st.id == null) {
                        st.id = "pen-" + Long.toString(System.currentTimeMillis(), 36) + "-" + Integer.toString(out.length(), 36);
                        out.put(freedraw(st, px, py, pw, ph, frame));
                    }
                    for (Note n : e.getValue().notes) if (n.id == null) {
                        n.id = "text-" + Long.toString(System.currentTimeMillis(), 36) + "-" + Integer.toString(out.length(), 36);
                        out.put(text(n, px, py, pw, ph, frame));
                    }
                }
                doc.put("elements", out);
                read.clear();
                read.addAll(kept);
                for (Sheet s : sheets.values()) { for (Stroke st : s.strokes) read.add(st.id); for (Note n : s.notes) read.add(n.id); }
                host.write(at, doc.toString().getBytes(StandardCharsets.UTF_8));
            }
        };
    }

    // ---- in the PDF's note ----------------------------------------------------------------------------------------

    /** The PDF's marks in its note (core pdf_marks.rs, the store every device writes): its pen marks as strokes and its
     *  text boxes as notes, places turned between PDF points (page space, y up) and page fractions by `sizes`. Only what
     *  changed is sent (a put or a remove a mark), so the desktop's highlights, post-its and stamps are never touched. */
    public static Store marks(Host host, String pdf, float[][] sizes) {
        final Map<String, JSONObject> was = new HashMap<>(); // the marks read, by id
        return new Store() {
            float w(int n) { return n >= 1 && n <= sizes.length ? sizes[n - 1][0] : 612; }
            float h(int n) { return n >= 1 && n <= sizes.length ? sizes[n - 1][1] : 792; }

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

    /** PDF page `n` (`size` in points) put into `els` in the first free place of the grid — a frame and the page's
     *  picture linked to the PDF (drawn from it, never copied). Answers the picture. */
    private static JSONObject addPage(JSONArray els, String pdf, int n, float[] size) throws JSONException {
        String name = pdf.substring(pdf.lastIndexOf('/') + 1);
        float h = size[0] > 0 && size[1] > 0 ? PAGE_W * size[1] / size[0] : PAGE_H;
        List<float[]> taken = new ArrayList<>();
        for (int i = 0; i < els.length(); i++) {
            JSONObject el = els.optJSONObject(i);
            if (el == null || el.optBoolean("isDeleted") || !"frame".equals(el.optString("type"))) continue;
            float x = (float) el.optDouble("x"), y = (float) el.optDouble("y");
            taken.add(new float[] { x, y, x + (float) el.optDouble("width"), y + (float) el.optDouble("height") });
        }
        float x = 0, y = 0;
        for (int k = 0; ; k++) {
            x = (k % PER_ROW) * (PAGE_W + GAP); y = (k / PER_ROW) * (PAGE_H + GAP);
            boolean free = true;
            for (float[] r : taken) if (x - GAP / 2 < r[2] && x + PAGE_W + GAP / 2 > r[0] && y - GAP / 2 < r[3] && y + h + GAP / 2 > r[1]) { free = false; break; }
            if (free) break;
        }
        String stamp = Long.toString(System.currentTimeMillis(), 36) + "-" + n;
        String frame = "page-" + stamp;
        els.put(base("frame", frame, x, y, PAGE_W, h, null).put("name", "Page " + n).put("strokeColor", "#bbb"));
        JSONObject picture = base("image", "picture-" + stamp, x, y, PAGE_W, h, frame)
            .put("fileId", PageSource.fileId(pdf, n)).put("status", "saved").put("scale", new JSONArray().put(1).put(1)).put("crop", JSONObject.NULL)
            .put("customData", new JSONObject().put("atlasPage", new JSONObject().put("file", pdf).put("page", n)))
            .put("link", "[[" + name + "#page=" + n + "]]").put("locked", true);
        els.put(picture);
        return picture;
    }

    /** The drawing's PDF pages: its `atlasPage` pictures. */
    private static List<JSONObject> pages(JSONArray els) {
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < els.length(); i++) {
            JSONObject el = els.optJSONObject(i);
            JSONObject cd = el == null ? null : el.optJSONObject("customData");
            if (el != null && !el.optBoolean("isDeleted") && cd != null && cd.optJSONObject("atlasPage") != null && el.optDouble("width") > 0 && el.optDouble("height") > 0) out.add(el);
        }
        return out;
    }

    private static JSONObject pageAt(List<JSONObject> pages, float x, float y) {
        for (JSONObject pg : pages) {
            float px = (float) pg.optDouble("x"), py = (float) pg.optDouble("y");
            if (x >= px && y >= py && x <= px + pg.optDouble("width") && y <= py + pg.optDouble("height")) return pg;
        }
        return null;
    }

    private static JSONObject base(String type, String id, float x, float y, float w, float h, String frame) throws JSONException {
        return bump(new JSONObject().put("id", id).put("type", type).put("x", r2(x)).put("y", r2(y)).put("width", r2(w)).put("height", r2(h))
            .put("angle", 0).put("strokeColor", "#000000").put("backgroundColor", "transparent").put("fillStyle", "solid")
            .put("strokeWidth", 1).put("strokeStyle", "solid").put("roughness", 0).put("opacity", 100).put("groupIds", new JSONArray())
            .put("roundness", JSONObject.NULL).put("seed", Math.abs(id.hashCode())).put("isDeleted", false)
            .put("boundElements", JSONObject.NULL).put("link", JSONObject.NULL).put("locked", false)
            .put("frameId", frame == null ? JSONObject.NULL : frame));
    }

    private static JSONObject bump(JSONObject o) throws JSONException {
        return o.put("version", o.optLong("version", 0) + 1).put("versionNonce", java.util.concurrent.ThreadLocalRandom.current().nextInt(1, Integer.MAX_VALUE))
            .put("updated", System.currentTimeMillis());
    }

    private static double r2(float v) { return Math.round(v * 100) / 100.0; }

    private static JSONObject freedraw(Stroke st, float px, float py, float pw, float ph, String frame) throws JSONException {
        float x0 = px + st.pts[0] * pw, y0 = py + st.pts[1] * ph, minX = x0, minY = y0, maxX = x0, maxY = y0;
        JSONArray pts = new JSONArray(), pr = new JSONArray();
        for (int i = 0; i + 1 < st.pts.length; i += 2) {
            float x = px + st.pts[i] * pw, y = py + st.pts[i + 1] * ph;
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            pts.put(new JSONArray().put(r2(x - x0)).put(r2(y - y0)));
            pr.put(0.5);
        }
        boolean marker = st.opacity < 0.9f;
        return base("freedraw", st.id, x0, y0, maxX - minX, maxY - minY, frame)
            .put("strokeColor", hex(st.color)).put("strokeWidth", r2(st.width * pw / FREEDRAW)).put("opacity", Math.round(st.opacity * 100))
            .put("points", pts).put("pressures", pr).put("simulatePressure", false).put("lastCommittedPoint", JSONObject.NULL)
            .put("customData", new JSONObject().put("atlasPen", marker ? "highlighter" : "fountain"));
    }

    private static JSONObject text(Note n, float px, float py, float pw, float ph, String frame) throws JSONException {
        float size = n.size * pw;
        String[] lines = n.text.split("\n", -1);
        int longest = 0;
        for (String l : lines) longest = Math.max(longest, l.length());
        return base("text", n.id, px + n.x * pw, py + n.y * ph, longest * size * 0.55f, lines.length * size * 1.25f, frame)
            .put("fontSize", r2(size)).put("fontFamily", 5).put("text", n.text).put("originalText", n.text)
            .put("textAlign", "left").put("verticalAlign", "top").put("containerId", JSONObject.NULL).put("lineHeight", 1.25).put("autoResize", true);
    }

    /** A companion as Notepad makes one (NotepadView.insertWholePdf): a frame per PDF page in rows of four, the page
     *  linked inside it (`[[x.pdf#page=N]]`, locked: paper). */
    static JSONObject made(String pdf, float[][] sizes) throws JSONException {
        JSONArray els = new JSONArray();
        for (int i = 0; i < sizes.length; i++) addPage(els, pdf, i + 1, sizes[i]);
        return new JSONObject().put("type", "excalidraw").put("version", 2).put("source", "atlas (books)").put("elements", els)
            .put("appState", new JSONObject().put("viewBackgroundColor", "#ffffff")).put("files", new JSONObject());
    }
}
