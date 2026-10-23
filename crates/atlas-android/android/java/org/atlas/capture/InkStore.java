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
 *  - `pdf(pdf)`: the PDF's companion drawing `x.pdf.excalidraw`, Notepad's (freedraw and text elements over the
 *    `atlasPage` pictures), made the first time in Notepad's layout — so the reader and Notepad show the same ink.
 *  Read and written off the UI thread. */
public final class InkStore {
    private InkStore() {}

    public static final class Stroke {
        public float width;          // of the page's width
        public int color = 0xff000000;
        public float opacity = 1;
        public float[] pts;          // x, y, x, y… in page fractions
        public String id;            // the element's in a companion drawing; null: new
        public boolean plain() { return color == 0xff000000 && opacity >= 0.999f; }
    }

    public static final class Note {
        public float x, y, size;     // top left and the text's height, in page fractions (size of the width)
        public String text;
        public String id;
        public boolean edited;       // changed since read: written again
    }

    public static final class Sheet {
        public final List<Stroke> strokes = new ArrayList<>();
        public final List<Note> notes = new ArrayList<>();
        public boolean empty() { return strokes.isEmpty() && notes.isEmpty(); }
        Sheet copy() { Sheet s = new Sheet(); s.strokes.addAll(strokes); s.notes.addAll(notes); return s; }
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
    /** Notepad's page: A4 at 96 dpi, the gap, 4 pages a row (plugins/beta/notepad Page, Scene.perRow). */
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
