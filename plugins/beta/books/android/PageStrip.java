package org.atlas.plugins.books;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

import org.atlas.capture.Host;
import org.atlas.capture.Look;
import org.atlas.capture.PageSource;

import java.util.function.IntConsumer;

/** The PDF reader's page strip: the pages as small pictures in a row along the bottom while the bars show
 *  (ReaderBars.strip), the page being read framed in the accent; a finger drags the row, a tap jumps to that page.
 *  Pictures are drawn small on PageSource's render thread (PageSource.thumb: their own cache, only the ones still in
 *  view), never on the UI thread; until one is there its cell is an outline. Where cells go is StripLayout's. */
@SuppressLint("ViewConstructor")
final class PageStrip extends View {
    private final Host host;
    private final Look look;
    private final String path;
    private final IntConsumer jump;
    private float[][] sizes = new float[0][];
    private StripLayout row = new StripLayout(0, 1, 0);
    private int current = 1, scroll;
    /** The pages in view, read on the render thread (PageSource.thumb's `wanted`). */
    private volatile int firstShown = 1, lastShown = 0;
    private final Paint pic = new Paint(Paint.FILTER_BITMAP_FLAG), cellEdge = new Paint(Paint.ANTI_ALIAS_FLAG),
        frame = new Paint(Paint.ANTI_ALIAS_FLAG), number = new Paint(Paint.ANTI_ALIAS_FLAG), paper = new Paint();
    private final int cell, gap, pad, label;

    PageStrip(Context c, Host host, String path, IntConsumer jump) {
        super(c);
        this.host = host;
        this.look = host.look();
        this.path = path;
        this.jump = jump;
        cell = look.dp(54);
        gap = look.dp(10);
        pad = look.dp(8);
        label = look.dp(16);
        setBackgroundColor(look.bg);
        cellEdge.setStyle(Paint.Style.STROKE);
        cellEdge.setStrokeWidth(Math.max(1, look.dp(look.eink ? 1 : 0.75f)));
        cellEdge.setColor(look.eink ? look.borderStrong : look.border);
        frame.setStyle(Paint.Style.STROKE);
        frame.setStrokeWidth(look.dp(look.eink ? 3 : 2.5f));
        frame.setColor(look.eink ? 0xff000000 : look.accent);
        number.setTextAlign(Paint.Align.CENTER);
        number.setTextSize(look.dp(11));
        paper.setColor(0xffffffff); // a page is paper, in either theme
        setContentDescription("Pages");
    }

    /** The height the strip wants: a cell's picture, its number, the padding. */
    int height() { return pad + Math.round(cell * 1.3f) + label + pad / 2; }

    /** The document's page sizes (points), once read. */
    void pages(float[][] s) {
        sizes = s;
        row = new StripLayout(s.length, cell, gap);
        show(current);
    }

    /** The page being read: framed, and brought into view when it is not (a turn, a jump). */
    void show(int page) {
        current = page;
        if (getWidth() > 0 && !row.inView(page, scroll, getWidth())) scroll = row.centre(page, getWidth());
        invalidate();
    }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        super.onSizeChanged(w, h, ow, oh);
        if (w > 0) scroll = row.centre(current, w);
    }

    @Override protected void onDraw(Canvas c) {
        int w = getWidth();
        if (row.pages == 0 || w == 0) return;
        int[] in = row.shown(scroll, w);
        firstShown = in[0];
        lastShown = in[1];
        int x0 = row.offset(w) - scroll, boxH = Math.round(cell * 1.3f);
        number.setColor(look.muted);
        for (int p = in[0]; p <= in[1]; p++) {
            float left = x0 + row.left(p);
            // the page's own shape, fitted in its cell's box (a landscape page is wider than tall)
            float[] s = p - 1 < sizes.length ? sizes[p - 1] : new float[] { 612, 792 };
            float k = Math.min(cell / Math.max(1f, s[0]), boxH / Math.max(1f, s[1]));
            float pw = s[0] * k, ph = s[1] * k;
            RectF r = new RectF(left + (cell - pw) / 2, pad + (boxH - ph) / 2, left + (cell + pw) / 2, pad + (boxH + ph) / 2);
            final int q = p;
            Bitmap b = PageSource.thumb(host, path, p, Math.round(pw), () -> q >= firstShown && q <= lastShown, this::invalidate);
            if (b != null) c.drawBitmap(b, null, r, pic);
            else c.drawRect(r, paper);
            c.drawRect(r, cellEdge);
            if (p == current) {
                float o = frame.getStrokeWidth();
                c.drawRect(r.left - o, r.top - o, r.right + o, r.bottom + o, frame);
                number.setColor(look.eink ? 0xff000000 : look.accent);
            }
            c.drawText(String.valueOf(p), left + cell / 2f, pad + boxH + label - look.dp(3), number);
            if (p == current) number.setColor(look.muted);
        }
    }

    private float downX, lastX;
    private boolean dragged;

    @SuppressLint("ClickableViewAccessibility")
    @Override public boolean onTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = lastX = e.getX();
                dragged = false;
                return true;
            case MotionEvent.ACTION_MOVE:
                if (!dragged && Math.abs(e.getX() - downX) > look.dp(8)) dragged = true;
                if (dragged) {
                    scroll = row.clamp(scroll - Math.round(e.getX() - lastX), getWidth());
                    invalidate();
                }
                lastX = e.getX();
                return true;
            case MotionEvent.ACTION_UP:
                if (!dragged) {
                    int p = row.pageAt(e.getX(), scroll, getWidth());
                    if (p > 0) jump.accept(p);
                } else if (host.eink()) post(host::einkRefresh); // a clean picture after the drag
                return true;
            default:
                return true;
        }
    }
}
