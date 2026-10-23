package org.atlas.plugins.books;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;

import org.atlas.capture.Host;
import org.atlas.capture.InkStore;
import org.atlas.capture.PageInk;
import org.atlas.capture.PenBar;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Free notes on a reflowed book. A reflowed page has no fixed place, so each note is pinned to a character of its chapter —
 *  `k`, its index in the chapter's text with whitespace collapsed (marks.js textMap, the highlights' own measure) — and
 *  drawn from where that character is now, its size in the text's em: a bigger font or other margins move the note
 *  with its words. Ink: `x.epub.ink.json` beside the book, `{ chapters: { "<spine>": [{k, w, color, opacity, pts}] } }`
 *  (pts and w in em from the character's top left). Typed notes: in the book's note, a list under "## Notes" —
 *  `- text <!-- atlas-note ch=N k=K id=ID -->` then the passage they sit at — so they read and search as notes. */
final class EpubInk extends View implements PenBar.Pen {
    static final class Mark { int k; float w; int color = 0xff000000; float opacity = 1; float[] pts; }
    static final class Note { int spine, k; String text, id; }

    private final Host host;
    private final String book, note;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG), glyph = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Map<Integer, List<Mark>> marks = new HashMap<>();
    private final List<Note> notes = new ArrayList<>();
    /** Where each mark and note of the chapter on screen is drawn from: {x, y, line height} in view px; and its em. */
    private final Map<Object, float[]> placed = new IdentityHashMap<>();
    private float em = 16;
    private int spine = -1;
    private final Deque<Runnable> undo = new ArrayDeque<>();
    private PageInk.Tool tool = PageInk.Tool.PEN;
    private int color = 0xff000000;
    private float widthTimes = 1;
    private final float density;
    private final Runnable save = this::saveInk;
    private boolean dirty;

    EpubInk(Context c, Host host, String book, String note) {
        super(c);
        this.host = host;
        this.book = book;
        this.note = note;
        density = getResources().getDisplayMetrics().density;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        glyph.setStyle(Paint.Style.FILL);
        setWillNotDraw(false);
    }

    // ---- PenBar.Pen ------------------------------------------------------------------------------------------------

    public void tool(PageInk.Tool t) { tool = t; }
    public PageInk.Tool tool() { return tool; }
    public void color(int c) { color = c; }
    public int color() { return color; }
    public void widthTimes(float w) { widthTimes = w; }
    public float widthTimes() { return widthTimes; }
    public boolean undo() { Runnable u = undo.poll(); if (u == null) return false; u.run(); return true; }

    /** The pen's width now, in view px (the PDF reader's pen on a phone-sized page: ~1.6 px a CSS px). */
    float penPx() { return 1.4f * density * widthTimes; }

    // ---- reading and saving ----------------------------------------------------------------------------------------

    private String inkFile() { return InkStore.file(book); }

    /** Read away from the UI thread. */
    void load() {
        try {
            if (host.exists(inkFile())) {
                JSONObject ch = new JSONObject(host.readText(inkFile())).optJSONObject("chapters");
                if (ch != null) for (java.util.Iterator<String> it = ch.keys(); it.hasNext(); ) {
                    String key = it.next();
                    JSONArray list = ch.optJSONArray(key);
                    List<Mark> out = new ArrayList<>();
                    for (int i = 0; list != null && i < list.length(); i++) {
                        JSONObject o = list.optJSONObject(i);
                        JSONArray p = o == null ? null : o.optJSONArray("pts");
                        if (p == null || p.length() < 4) continue;
                        Mark m = new Mark();
                        m.k = o.optInt("k"); m.w = (float) o.optDouble("w", 0.1);
                        m.color = InkStore.color(o.optString("color", "#000000")); m.opacity = (float) o.optDouble("opacity", 1);
                        m.pts = new float[p.length() & ~1];
                        for (int j = 0; j < m.pts.length; j++) m.pts[j] = (float) p.optDouble(j);
                        out.add(m);
                    }
                    try { marks.put(Integer.parseInt(key), out); } catch (NumberFormatException e) { /* not a chapter */ }
                }
            }
        } catch (Exception e) { post(() -> host.toast("The book's ink could not be read: " + e.getMessage())); }
        List<Note> n = notesIn(host.exists(note) ? host.readText(note) : "");
        post(() -> { notes.clear(); notes.addAll(n); invalidate(); });
    }

    private void later() { dirty = true; removeCallbacks(save); postDelayed(save, 1500); }
    void flush() { removeCallbacks(save); if (dirty) saveInk(); }

    private void saveInk() {
        if (!dirty) return;
        dirty = false;
        final byte[] bytes;
        try {
            JSONObject ch = new JSONObject();
            for (Map.Entry<Integer, List<Mark>> e : marks.entrySet()) {
                if (e.getValue().isEmpty()) continue;
                JSONArray list = new JSONArray();
                for (Mark m : e.getValue()) {
                    JSONArray p = new JSONArray();
                    for (float v : m.pts) p.put(Math.round(v * 1000) / 1000.0);
                    list.put(new JSONObject().put("k", m.k).put("w", Math.round(m.w * 1000) / 1000.0).put("color", InkStore.hex(m.color)).put("opacity", m.opacity).put("pts", p));
                }
                ch.put(String.valueOf(e.getKey()), list);
            }
            bytes = new JSONObject().put("chapters", ch).toString().getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) { return; }
        new Thread(() -> { try { host.write(inkFile(), bytes); } catch (Exception e) { post(() -> host.toast("The ink was not saved: " + e.getMessage())); } }, "book-ink").start();
    }

    // ---- the chapter on screen -------------------------------------------------------------------------------------

    /** The characters to place for chapter `s`: its marks' and its notes' (in that order: `placedAt`'s answer). */
    int[] anchors(int s) {
        spine = s;
        List<Integer> ks = new ArrayList<>();
        for (Mark m : marks.getOrDefault(s, new ArrayList<>())) ks.add(m.k);
        for (Note n : notes) if (n.spine == s) ks.add(n.k);
        int[] out = new int[ks.size()];
        for (int i = 0; i < out.length; i++) out[i] = ks.get(i);
        return out;
    }

    /** The page's answer to atlasInk.where(anchors(s)): `{em, at: [[x, y, h] | null…]}` in CSS px of the viewport. */
    void placedAt(int s, String json) {
        if (s != spine) return;
        placed.clear();
        try {
            JSONObject o = new JSONObject(json);
            em = (float) o.optDouble("em", 16) * density;
            JSONArray at = o.optJSONArray("at");
            int i = 0;
            for (Mark m : marks.getOrDefault(s, new ArrayList<>())) put(m, at, i++);
            for (Note n : notes) if (n.spine == s) put(n, at, i++);
        } catch (Exception e) { /* nothing placed */ }
        invalidate();
    }

    private void put(Object o, JSONArray at, int i) {
        JSONArray p = at == null ? null : at.optJSONArray(i);
        if (p == null) return;
        float x = (float) p.optDouble(0) * density, y = (float) p.optDouble(1) * density;
        if (x < -getWidth() * 0.1f || x > getWidth() * 1.1f) return; // on another page of the chapter
        placed.put(o, new float[] { x, y, (float) p.optDouble(2, 16) * density });
    }

    /** Nothing placed: the chapter is being laid out (shown again with placedAt). */
    void clear() { placed.clear(); invalidate(); }

    // ---- writing ---------------------------------------------------------------------------------------------------

    /** A stroke drawn (view px) pinned to character `k`, whose top left is (ax, ay) (view px), the text's em `emPx`. */
    void stroke(int k, float ax, float ay, float emPx, float[] pts, boolean highlighter) {
        Mark m = new Mark();
        m.k = k;
        m.color = highlighter ? (color & 0xffffff) == 0 ? 0xff9e9e9e : color : color;
        m.opacity = highlighter ? 0.4f : 1;
        m.w = (highlighter ? emPx * 0.9f : penPx()) / emPx;
        m.pts = new float[pts.length];
        for (int i = 0; i + 1 < pts.length; i += 2) { m.pts[i] = (pts[i] - ax) / emPx; m.pts[i + 1] = (pts[i + 1] - ay) / emPx; }
        List<Mark> list = marks.computeIfAbsent(spine, x -> new ArrayList<>());
        list.add(m);
        em = emPx;
        placed.put(m, new float[] { ax, ay, emPx });
        final int s = spine;
        undo.push(() -> { List<Mark> l = marks.get(s); if (l != null) l.remove(m); placed.remove(m); invalidate(); later(); });
        invalidate();
        later();
    }

    /** The strokes the eraser's path (view px) passes over go. */
    void erase(float[] path) {
        List<Mark> list = marks.get(spine);
        if (list == null) return;
        float reach = 8 * density;
        List<Mark> gone = new ArrayList<>();
        for (Mark m : list) {
            float[] at = placed.get(m);
            if (at == null) continue;
            outer:
            for (int i = 0; i + 1 < m.pts.length; i += 2) {
                float x = at[0] + m.pts[i] * em, y = at[1] + m.pts[i + 1] * em;
                for (int j = 0; j + 1 < path.length; j += 2) if (Math.hypot(x - path[j], y - path[j + 1]) < reach + m.w * em / 2) { gone.add(m); break outer; }
            }
        }
        if (gone.isEmpty()) return;
        list.removeAll(gone);
        final int s = spine;
        undo.push(() -> { marks.computeIfAbsent(s, x -> new ArrayList<>()).addAll(gone); invalidate(); later(); });
        invalidate();
        later();
    }

    /** The typed note whose mark is near (x, y) on screen, or null. */
    Note noteAt(float x, float y) {
        float reach = 22 * density;
        for (Note n : notes) {
            float[] at = placed.get(n);
            if (at != null && Math.hypot(x - (at[0] - em * 0.7f), y - (at[1] + at[2] / 2)) < reach) return n;
        }
        return null;
    }

    /** A new typed note at character `k` (`quote`: the words around it, `where`: the chapter; `at`: where it is on
     *  screen, view px {x, y, h}), asked for in a box. */
    void newNote(int k, String quote, String where, float[] at) {
        ask("A note here", "", quote, t -> {
            if (t.isEmpty()) return;
            Note n = new Note();
            n.spine = spine; n.k = k; n.text = t;
            n.id = Long.toString(System.currentTimeMillis(), 36);
            notes.add(n);
            if (at != null) placed.put(n, at);
            undo.push(() -> { notes.remove(n); invalidate(); writeNotes(md -> drop(md, n.id)); });
            invalidate();
            writeNotes(md -> add(md, n, quote, where));
            post(() -> host.toast("Kept in the book's note"));
        }, null);
    }

    void edit(Note n) {
        ask("The note", n.text, null, t -> {
            if (t.equals(n.text)) return;
            if (t.isEmpty()) { remove(n); return; }
            String was = n.text;
            n.text = t;
            undo.push(() -> { n.text = was; writeNotes(md -> retext(md, n)); });
            writeNotes(md -> retext(md, n));
        }, () -> remove(n));
    }

    private void remove(Note n) {
        notes.remove(n);
        invalidate();
        writeNotes(md -> drop(md, n.id));
    }

    List<Note> notes() { return notes; }

    private void ask(String title, String now, String context, java.util.function.Consumer<String> done, Runnable delete) {
        EditText in = new EditText(getContext());
        in.setText(now);
        in.setSelection(now.length());
        in.setMinLines(2);
        in.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        int p = host.look().dp(20);
        android.widget.LinearLayout f = new android.widget.LinearLayout(getContext());
        f.setOrientation(android.widget.LinearLayout.VERTICAL);
        f.setPadding(p, p / 2, p, 0);
        if (context != null && !context.isEmpty()) f.addView(host.look().label(getContext(), "“" + context + "”", 13, host.look().muted));
        f.addView(in);
        AlertDialog.Builder b = new AlertDialog.Builder(getContext()).setTitle(title).setView(f)
            .setPositiveButton("Keep", (d, w) -> done.accept(in.getText().toString().trim()))
            .setNegativeButton("Cancel", null);
        if (delete != null) b.setNeutralButton("Delete", (d, w) -> delete.run());
        AlertDialog d = b.show();
        in.requestFocus();
        if (d.getWindow() != null) d.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
    }

    // ---- the note's "## Notes" -------------------------------------------------------------------------------------

    private static final Pattern LINE = Pattern.compile("^- (.*?) <!-- atlas-note ch=(\\d+) k=(\\d+) id=([\\w-]+) -->\\s*$");

    static List<Note> notesIn(String md) {
        List<Note> out = new ArrayList<>();
        for (String line : md.split("\n", -1)) {
            Matcher m = LINE.matcher(line);
            if (!m.matches()) continue;
            Note n = new Note();
            n.text = m.group(1).replace("<br>", "\n"); n.spine = Integer.parseInt(m.group(2)) - 1; n.k = Integer.parseInt(m.group(3)); n.id = m.group(4);
            out.add(n);
        }
        return out;
    }

    private static String line(Note n) {
        return "- " + n.text.trim().replace("\r", "").replace("\n", "<br>") + " <!-- atlas-note ch=" + (n.spine + 1) + " k=" + n.k + " id=" + n.id + " -->";
    }

    interface Edit { String apply(String md); }

    private void writeNotes(Edit e) {
        new Thread(() -> {
            try {
                synchronized (EpubInk.class) {
                    String md = host.exists(note) ? host.readText(note) : Highlights.newNote(book.substring(book.lastIndexOf('/') + 1), "", "");
                    host.write(note, e.apply(md).getBytes(StandardCharsets.UTF_8));
                }
            } catch (Exception ex) { post(() -> host.toast("The note was not saved: " + ex.getMessage())); }
        }, "book-notes").start();
    }

    private static String add(String md, Note n, String quote, String where) {
        String block = line(n) + "\n  > " + Highlights.squash(quote == null ? "" : quote) + (where.isEmpty() ? "" : " — " + where) + "\n";
        int at = md.indexOf("\n## Notes\n");
        if (at < 0) return md.replaceAll("\\n*$", "\n") + "\n## Notes\n\n" + block;
        int end = md.indexOf("\n## ", at + 10); // the next section: the note goes at the end of this one
        String head = end < 0 ? md.replaceAll("\\n*$", "\n") : md.substring(0, end).replaceAll("\\n*$", "\n");
        return head + block + (end < 0 ? "" : "\n" + md.substring(end + 1));
    }

    private static String drop(String md, String id) {
        StringBuilder out = new StringBuilder();
        String[] lines = md.split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].contains("atlas-note ") && lines[i].contains("id=" + id + " ")) {
                if (i + 1 < lines.length && lines[i + 1].startsWith("  > ")) i++; // its passage too
                continue;
            }
            out.append(lines[i]);
            if (i < lines.length - 1) out.append('\n');
        }
        return out.toString();
    }

    private static String retext(String md, Note n) {
        StringBuilder out = new StringBuilder();
        String[] lines = md.split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            out.append(lines[i].contains("atlas-note ") && lines[i].contains("id=" + n.id + " ") ? line(n) : lines[i]);
            if (i < lines.length - 1) out.append('\n');
        }
        return out.toString();
    }

    // ---- drawing ---------------------------------------------------------------------------------------------------

    @Override protected void onDraw(Canvas c) {
        Path p = new Path();
        for (Mark m : marks.getOrDefault(spine, new ArrayList<>())) {
            float[] at = placed.get(m);
            if (at == null) continue;
            p.rewind();
            p.moveTo(at[0] + m.pts[0] * em, at[1] + m.pts[1] * em);
            for (int i = 2; i + 1 < m.pts.length; i += 2) p.lineTo(at[0] + m.pts[i] * em, at[1] + m.pts[i + 1] * em);
            paint.setColor(m.color);
            paint.setAlpha(Math.round(255 * m.opacity));
            paint.setStrokeWidth(Math.max(1f, m.w * em));
            c.drawPath(p, paint);
        }
        // a typed note: a small folded sheet in the margin before its words
        glyph.setColor(host.eink() ? 0xff000000 : host.look().accent);
        for (Note n : notes) {
            float[] at = placed.get(n);
            if (at == null || n.spine != spine) continue;
            float s = Math.max(10 * density, em * 0.55f), x = Math.max(2 * density, at[0] - em * 0.7f - s / 2), y = at[1] + at[2] / 2 - s / 2;
            Path g = new Path();
            g.moveTo(x, y); g.lineTo(x + s * 0.7f, y); g.lineTo(x + s, y + s * 0.3f); g.lineTo(x + s, y + s); g.lineTo(x, y + s); g.close();
            c.drawPath(g, glyph);
        }
    }

    @Override protected void onDetachedFromWindow() { flush(); super.onDetachedFromWindow(); }
}
