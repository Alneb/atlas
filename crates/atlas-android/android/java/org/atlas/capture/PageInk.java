package org.atlas.capture;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.text.InputType;
import android.view.MotionEvent;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The pen's ink over a page that is a picture — a manga page, a PDF's. The app's, not a plugin's ("the eink tech should not be
 *  on the native plugins, it should be on the main app and the plugins call for it"): a plugin asks for it with
 *  Host.pageInk, lays it over its page, hands it its touches (`take`) and says which ink it shows (`open`, an
 *  InkStore) and which page (`page`). A page is fixed, so ink stays where it was drawn, in the page's own fractions.
 *  The tools (`tool`): the pen, the highlighter, the eraser (the pen's eraser end or its button too: whole strokes),
 *  a typed note (a tap places it; a tap on one edits it). A pen tap is the reader's tap, except on a note. Undo per
 *  open file. Saved a moment after the last change, and when the file or the view closes. */
public final class PageInk extends View implements PenBar.Pen {
    /** A pen tap (a dot, not ink), for the plugin's own tap handling. */
    public interface Taps { void tap(float x, float y); }
    /** Where the page is on this view, px (null: not shown). */
    public interface Frame { RectF shown(); }

    public enum Tool { PEN, HIGHLIGHTER, ERASER, TEXT }

    /** The pens' widths, of the page's width: a fine pen on a phone-sized page, a highlighter a line of text tall. */
    public static final float PEN_WIDTH = 0.0022f, HIGHLIGHTER_WIDTH = 0.014f;

    private final Host host;
    private final Frame frame;
    private final Taps taps;
    private final Host.QuickInk quick;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG), text = new Paint(Paint.ANTI_ALIAS_FLAG), box = new Paint(Paint.ANTI_ALIAS_FLAG);
    private InkStore.Store store;                        // null: no ink here (webtoon)
    private Map<Integer, InkStore.Sheet> sheets = new HashMap<>();
    private int page = -1, opened;
    private final List<Float> drawing = new ArrayList<>(); // the stroke under the pen, in page fractions
    private final Deque<Object[]> undo = new ArrayDeque<>(); // {page, the sheet before}
    private float downX, downY;
    private long downAt;
    private boolean erasing, dirty, palm;
    private final PenInput penIn;
    private final Runnable save = this::save;
    private Tool tool = Tool.PEN;
    private int color = 0xff000000;
    private float widthTimes = 1;
    /** Whether the pen writes (else every pen touch is a tap or a turn: the reader's "pen off"). */
    private boolean writing = true;
    private Runnable changed = () -> {};

    PageInk(Context c, Host host, Frame frame, Taps taps) {
        super(c);
        penIn = new PenInput(c);
        this.host = host;
        this.frame = frame;
        this.taps = taps;
        quick = host.quickInk(this);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        text.setColor(0xff000000);
        text.setTypeface(android.graphics.Typeface.SANS_SERIF);
        box.setStyle(Paint.Style.STROKE);
        box.setColor(0xff888888);
        box.setPathEffect(new android.graphics.DashPathEffect(new float[] { 6, 5 }, 0));
    }

    /** Over an ImageView: the page is its picture, where its matrix puts it (fit screen, fit width, scrolled). */
    static Frame of(ImageView image, View over) {
        return () -> {
            Drawable d = image.getDrawable();
            if (d == null) return null;
            RectF r = new RectF(0, 0, d.getIntrinsicWidth(), d.getIntrinsicHeight());
            Matrix m = new Matrix(image.getImageMatrix());
            m.mapRect(r);
            int[] a = new int[2], b = new int[2];
            image.getLocationInWindow(a);
            over.getLocationInWindow(b);
            r.offset(a[0] - b[0] + image.getPaddingLeft(), a[1] - b[1] + image.getPaddingTop());
            return r.width() > 0 && r.height() > 0 ? r : null;
        };
    }

    // ---- what is shown ---------------------------------------------------------------------------------------------

    /** The ink of `s` (read here, away from the UI thread), or none for null. Pending ink of the last is written first. */
    public void open(InkStore.Store s) {
        flush();
        store = s;
        sheets = new HashMap<>();
        undo.clear();
        final int mine = ++opened;
        invalidate();
        if (s == null) { area(); return; }
        IO.execute(() -> {
            Map<Integer, InkStore.Sheet> got;
            try { got = s.read(); } catch (Exception e) { got = new HashMap<>(); post(() -> host.toast("The ink could not be read: " + e.getMessage())); }
            final Map<Integer, InkStore.Sheet> k = got;
            post(() -> { if (mine == opened) { sheets = k; invalidate(); area(); changed.run(); } });
        });
    }

    public void page(int p) { page = p; area(); invalidate(); }

    public void tool(Tool t) { tool = t; area(); }
    public Tool tool() { return tool; }
    public void color(int c) { color = c; area(); }
    public int color() { return color; }
    public void widthTimes(float w) { widthTimes = w; area(); }
    public float widthTimes() { return widthTimes; }
    public void writing(boolean on) { writing = on; area(); }
    public boolean writing() { return writing; }
    /** Told when the ink changed (an undo to offer, a page with notes). */
    public void onChange(Runnable r) { changed = r == null ? () -> {} : r; }

    private float lineWidth() { return (tool == Tool.HIGHLIGHTER ? HIGHLIGHTER_WIDTH : PEN_WIDTH) * widthTimes; }

    /** The screen's quick ink only over the page (Onyx's on a Boox), as wide as the line drawn there; none when the pen
     *  does not draw (the eraser, a note, the pen off). */
    public void area() {
        RectF r = store == null || !writing || tool == Tool.ERASER || tool == Tool.TEXT ? null : frame.shown();
        if (r == null || !hasWindowFocus()) { quick.area(0, 0, 0, 0, 0, 0); return; }
        quick.area((int) r.left, (int) r.top, (int) r.right, (int) r.bottom, Math.max(1f, lineWidth() * r.width()), tool == Tool.HIGHLIGHTER ? 2 : 0);
    }

    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); area(); }
    @Override protected void onSizeChanged(int w, int h, int ow, int oh) { super.onSizeChanged(w, h, ow, oh); post(this::area); }

    @Override public boolean onHoverEvent(MotionEvent e) { if (penIn.saw(e)) penAt = android.os.SystemClock.uptimeMillis(); return super.onHoverEvent(e); }

    private long penAt;

    /** Whether the pen touched or hovered a moment ago: a finger's touch now is the hand writing (resting, brushing
     *  the side zones), not a page turn. */
    public boolean penNear() { return android.os.SystemClock.uptimeMillis() - penAt < PEN_NEAR_MS; }

    private static final long PEN_NEAR_MS = 1500;

    // ---- the pen ---------------------------------------------------------------------------------------------------

    /** A touch the plugin got (its dispatchTouchEvent, before its own handling): true when it is taken here — the
     *  pen's ink, an erasure, a note, a pen tap handed back to `taps`, or a palm (which moves and taps nothing). False:
     *  a finger's, the plugin's. */
    public boolean take(MotionEvent e) {
        if (!penIn.saw(e)) {
            int act = e.getActionMasked();
            if (act == MotionEvent.ACTION_DOWN) palm = penIn.palm(e);
            else if (!palm && penIn.palm(e)) palm = true; // a second, wide contact
            boolean was = palm;
            if (act == MotionEvent.ACTION_UP || act == MotionEvent.ACTION_CANCEL) palm = false;
            return was;
        }
        RectF r = frame.shown();
        penAt = android.os.SystemClock.uptimeMillis();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = e.getX(); downY = e.getY(); downAt = e.getEventTime();
                erasing = PenInput.erasing(e) || tool == Tool.ERASER;
                drawing.clear();
                if (inks()) add(e, r);
                return true;
            case MotionEvent.ACTION_MOVE:
                if (inks()) add(e, r);
                return true;
            case MotionEvent.ACTION_UP:
                if (inks()) add(e, r);
                boolean dot = Math.hypot(e.getX() - downX, e.getY() - downY) < host.look().dp(10) && e.getEventTime() - downAt < 400;
                if (dot && r != null && store != null && page >= 0) {
                    InkStore.Note n = noteAt(e.getX(), e.getY(), r);
                    if (n != null) { drawing.clear(); edit(n); return true; }
                    if (tool == Tool.TEXT && writing) { drawing.clear(); write((e.getX() - r.left) / r.width(), (e.getY() - r.top) / r.height()); return true; }
                }
                // writing (the pen bar out): the pen only writes — a dot is ink (an i's, a full stop), never a page
                // turn
                if (inks() && r != null) { if (erasing) erase(r); else keep(); drawing.clear(); return true; }
                drawing.clear();
                quick.repaint(0);
                if (dot && !writing) taps.tap(e.getX(), e.getY());
                return true;
            case MotionEvent.ACTION_CANCEL:
                drawing.clear();
                quick.repaint(0);
                return true;
            default:
                return true;
        }
    }

    /** Whether this pen touch makes ink or erases (else it is only a tap). */
    private boolean inks() { return store != null && page >= 0 && writing && (erasing || tool == Tool.PEN || tool == Tool.HIGHLIGHTER); }

    /** The samples since the last event (every one the pen gave), in page fractions. */
    private void add(MotionEvent e, RectF r) {
        if (r == null) return;
        for (int h = 0; h < e.getHistorySize(); h++) { drawing.add((e.getHistoricalX(h) - r.left) / r.width()); drawing.add((e.getHistoricalY(h) - r.top) / r.height()); }
        drawing.add((e.getX() - r.left) / r.width());
        drawing.add((e.getY() - r.top) / r.height());
        if (erasing && drawing.size() > 4) { erase(r); drawing.subList(0, drawing.size() - 2).clear(); }
        else if (drawing.size() > 2 && !host.eink()) invalidate(); // drawn as it goes off e-ink (a Boox's quick ink draws it there)
    }

    private InkStore.Sheet sheet() { return sheets.computeIfAbsent(page, k -> new InkStore.Sheet()); }

    /** Before a change: the page as it was, for undo. */
    private void remember() {
        undo.push(new Object[] { page, sheet().copy() });
        while (undo.size() > 50) undo.removeLast();
    }

    private void keep() {
        if (drawing.size() < 4) return;
        remember();
        InkStore.Stroke st = new InkStore.Stroke();
        st.width = lineWidth();
        st.color = tool == Tool.HIGHLIGHTER ? highlight(color) : color;
        st.opacity = tool == Tool.HIGHLIGHTER ? 0.4f : 1;
        st.pts = new float[drawing.size()];
        for (int i = 0; i < st.pts.length; i++) st.pts[i] = Math.round(drawing.get(i) * 10000) / 10000f;
        sheet().strokes.add(st);
        invalidate();
        quick.up();
        later();
    }

    /** The highlighter's colour for a pen colour: black reads as grey on the panel, a colour keeps its hue. */
    private static int highlight(int c) { return (c & 0xffffff) == 0 ? 0xff9e9e9e : c; }

    /** The strokes the eraser's path touches (within a few px of it on screen) go. */
    private void erase(RectF r) {
        InkStore.Sheet s = sheets.get(page);
        if (s == null || s.strokes.isEmpty()) return;
        float reach = host.look().dp(8);
        List<InkStore.Stroke> gone = new ArrayList<>();
        for (InkStore.Stroke st : s.strokes) if (touches(st, r, reach)) gone.add(st);
        if (gone.isEmpty()) return;
        remember();
        s.strokes.removeAll(gone);
        invalidate();
        quick.repaint(0);
        later();
    }

    private boolean touches(InkStore.Stroke st, RectF r, float reach) {
        float half = st.width * r.width() / 2;
        for (int j = 0; j + 1 < drawing.size(); j += 2) {
            float ex = r.left + drawing.get(j) * r.width(), ey = r.top + drawing.get(j + 1) * r.height();
            for (int k = 0; k + 1 < st.pts.length; k += 2) {
                float x = r.left + st.pts[k] * r.width(), y = r.top + st.pts[k + 1] * r.height();
                if (Math.hypot(x - ex, y - ey) < reach + half) return true;
            }
        }
        return false;
    }

    // ---- typed notes -----------------------------------------------------------------------------------------------

    private InkStore.Note noteAt(float x, float y, RectF r) {
        InkStore.Sheet s = sheets.get(page);
        if (s == null) return null;
        float pad = host.look().dp(6);
        for (int i = s.notes.size() - 1; i >= 0; i--) {
            RectF b = noteBox(s.notes.get(i), r);
            b.inset(-pad, -pad);
            if (b.contains(x, y)) return s.notes.get(i);
        }
        return null;
    }

    private RectF noteBox(InkStore.Note n, RectF r) {
        float size = n.size * r.width();
        text.setTextSize(size);
        String[] lines = n.text.split("\n", -1);
        float w = 0;
        for (String l : lines) w = Math.max(w, text.measureText(l));
        float x = r.left + n.x * r.width(), y = r.top + n.y * r.height();
        return new RectF(x, y, x + w, y + lines.length * size * 1.25f);
    }

    /** A new note at (fx, fy) of the page, typed in a box. */
    private void write(float fx, float fy) {
        ask("A note here", "", t -> {
            if (t.isEmpty()) return;
            remember();
            InkStore.Note n = new InkStore.Note();
            n.x = fx; n.y = fy; n.size = InkStore.NOTE_SIZE; n.text = t;
            sheet().notes.add(n);
            invalidate();
            later();
        }, null);
    }

    private void edit(InkStore.Note n) {
        ask("The note", n.text, t -> {
            if (t.equals(n.text)) return;
            remember();
            if (t.isEmpty()) sheet().notes.remove(n);
            else { n.text = t; n.edited = true; }
            invalidate();
            later();
        }, () -> { remember(); sheet().notes.remove(n); invalidate(); later(); });
    }

    private void ask(String title, String now, java.util.function.Consumer<String> done, Runnable remove) {
        EditText in = new EditText(getContext());
        in.setText(now);
        in.setSelection(now.length());
        in.setMinLines(2);
        in.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        int p = host.look().dp(20);
        android.widget.FrameLayout f = new android.widget.FrameLayout(getContext());
        f.setPadding(p, p / 2, p, 0);
        f.addView(in);
        AlertDialog.Builder b = new AlertDialog.Builder(getContext()).setTitle(title).setView(f)
            .setPositiveButton("Keep", (d, w) -> done.accept(in.getText().toString().trim()))
            .setNegativeButton("Cancel", null);
        if (remove != null) b.setNeutralButton("Delete", (d, w) -> remove.run());
        AlertDialog d = b.show();
        in.requestFocus();
        if (d.getWindow() != null) d.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
    }

    // ---- the page's ink ------------------------------------------------------------------------------------------

    /** The last change on any page taken back; false when there is none. Shows that page's state (the reader may be
     *  elsewhere: the ink is put back where it was). */
    public boolean undo() {
        Object[] u = undo.poll();
        if (u == null) return false;
        sheets.put((Integer) u[0], (InkStore.Sheet) u[1]);
        invalidate();
        quick.repaint(0);
        later();
        return true;
    }

    public boolean canUndo() { return !undo.isEmpty(); }

    /** This page's ink and notes cleared (the reader's menu). */
    public void clearPage() {
        InkStore.Sheet s = sheets.get(page);
        if (s == null || s.empty()) return;
        remember();
        sheets.put(page, new InkStore.Sheet());
        invalidate();
        quick.repaint(0);
        later();
    }

    public boolean hasInk() { InkStore.Sheet s = sheets.get(page); return s != null && !s.empty(); }

    /** The pages that have ink or notes, in order (the reader's list of annotated pages). */
    public List<Integer> inked() {
        List<Integer> out = new ArrayList<>();
        for (Map.Entry<Integer, InkStore.Sheet> e : sheets.entrySet()) if (!e.getValue().empty()) out.add(e.getKey());
        java.util.Collections.sort(out);
        return out;
    }

    /** A page's typed notes, for the reader's list (read only). */
    public List<InkStore.Note> notes(int p) { InkStore.Sheet s = sheets.get(p); return s == null ? new ArrayList<>() : s.notes; }

    /** Every read and write of ink, in order, one at a time: a file closed and opened again reads what was last
     *  written, never the copy from before (two threads raced: the new ink seemed gone). */
    private static final java.util.concurrent.ExecutorService IO = java.util.concurrent.Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "page-ink"); t.setDaemon(true); return t; });

    /** `then` on the UI thread once the ink written so far is in its file (another view is about to read it). */
    public void flush(Runnable then) { flush(); IO.execute(() -> post(then)); }

    private void later() { dirty = true; removeCallbacks(save); postDelayed(save, 1500); changed.run(); }

    /** Pending ink written now (the file or the reader closing). */
    public void flush() { removeCallbacks(save); if (dirty) save(); }

    private void save() {
        if (!dirty || store == null) return;
        dirty = false;
        final InkStore.Store s = store;
        final Map<Integer, InkStore.Sheet> snapshot = new HashMap<>();
        for (Map.Entry<Integer, InkStore.Sheet> e : sheets.entrySet()) snapshot.put(e.getKey(), e.getValue().copy());
        IO.execute(() -> {
            try { s.write(snapshot); }
            catch (Exception e) { post(() -> host.toast("The ink was not saved: " + e.getMessage())); }
        });
    }

    @Override
    protected void onDraw(Canvas c) {
        InkStore.Sheet s = page < 0 ? null : sheets.get(page);
        boolean live = drawing.size() > 2 && !erasing && inks();
        if ((s == null || s.empty()) && !live) return;
        RectF r = frame.shown();
        if (r == null) return;
        Path p = new Path();
        if (s != null) for (InkStore.Stroke st : s.strokes) {
            if (st.pts.length < 4) continue;
            p.rewind();
            p.moveTo(r.left + st.pts[0] * r.width(), r.top + st.pts[1] * r.height());
            for (int k = 2; k + 1 < st.pts.length; k += 2) p.lineTo(r.left + st.pts[k] * r.width(), r.top + st.pts[k + 1] * r.height());
            paint.setColor(st.color);
            paint.setAlpha(Math.round(255 * Math.max(0, Math.min(1, st.opacity))));
            paint.setStrokeWidth(Math.max(1f, st.width * r.width()));
            c.drawPath(p, paint);
        }
        if (live) {
            p.rewind();
            p.moveTo(r.left + drawing.get(0) * r.width(), r.top + drawing.get(1) * r.height());
            for (int k = 2; k + 1 < drawing.size(); k += 2) p.lineTo(r.left + drawing.get(k) * r.width(), r.top + drawing.get(k + 1) * r.height());
            paint.setColor(tool == Tool.HIGHLIGHTER ? highlight(color) : color);
            paint.setAlpha(tool == Tool.HIGHLIGHTER ? 102 : 255);
            paint.setStrokeWidth(Math.max(1f, lineWidth() * r.width()));
            c.drawPath(p, paint);
        }
        if (s != null) for (InkStore.Note n : s.notes) {
            RectF b = noteBox(n, r);
            float size = n.size * r.width();
            String[] lines = n.text.split("\n", -1);
            for (int i = 0; i < lines.length; i++) c.drawText(lines[i], b.left, b.top + size * (0.95f + 1.25f * i), text);
            b.inset(-size * 0.3f, -size * 0.2f);
            c.drawRoundRect(b, size * 0.3f, size * 0.3f, box);
        }
    }

    @Override protected void onDetachedFromWindow() { flush(); quick.stop(); super.onDetachedFromWindow(); }
}
