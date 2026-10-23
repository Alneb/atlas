package org.atlas.capture;

import android.content.Context;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;

/** The readers' pen tools over the page (Boox's reader: a floating strip while you annotate): the pen, the
 *  highlighter, the eraser, a typed note; the colour, the width; undo; close. It drives a PageInk, or any `Pen` (the
 *  EPUB reader's ink is its own). Stays while you write, the reader's bars hidden; closing it keeps the tool in hand. */
public final class PenBar {
    /** What the bar drives (PageInk is one). */
    public interface Pen {
        void tool(PageInk.Tool t);
        PageInk.Tool tool();
        void color(int c);
        int color();
        void widthTimes(float w);
        float widthTimes();
        boolean undo();
    }

    /** Black, red, blue, green: the Boox's colour panel shows them; on a grey panel they are greys apart. */
    public static final int[] COLORS = { 0xff000000, 0xffd32f2f, 0xff1e5bd6, 0xff2e7d32 };
    private static final float[] WIDTHS = { 0.6f, 1f, 1.8f };

    private final Look look;
    private final Context c;
    private final FrameLayout strip;
    private final LinearLayout row;
    private final Pen pen;
    private final Host host;

    public PenBar(Host host, FrameLayout parent, Pen pen) {
        this.host = host;
        this.look = host.look();
        this.c = parent.getContext();
        this.pen = pen;
        strip = new FrameLayout(c);
        strip.setBackground(look.round(look.bg, 28, look.eink ? look.borderStrong : look.border));
        strip.setElevation(look.elevation(6));
        strip.setPadding(look.dp(4), look.dp(2), look.dp(4), look.dp(2));
        strip.setClickable(true);
        HorizontalScrollView hs = new HorizontalScrollView(c);
        hs.setHorizontalScrollBarEnabled(false);
        row = new LinearLayout(c);
        row.setGravity(Gravity.CENTER_VERTICAL);
        hs.addView(row);
        strip.addView(hs);
        strip.setVisibility(View.GONE);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        lp.topMargin = look.dp(10);
        lp.leftMargin = lp.rightMargin = look.dp(8);
        parent.addView(strip, lp);
        draw();
    }

    public boolean shown() { return strip.getVisibility() == View.VISIBLE; }
    public void show(boolean on) { strip.setVisibility(on ? View.VISIBLE : View.GONE); if (on) { draw(); strip.bringToFront(); } if (host.eink()) strip.post(host::einkRefresh); }

    /** Whether (x, y) of the parent is on the strip. */
    public boolean over(float x, float y) {
        return shown() && x >= strip.getLeft() && x <= strip.getRight() && y >= strip.getTop() && y <= strip.getBottom();
    }

    private void draw() {
        row.removeAllViews();
        tool("pen", "Pen", PageInk.Tool.PEN);
        tool("highlighter", "Highlighter", PageInk.Tool.HIGHLIGHTER);
        tool("eraser", "Eraser", PageInk.Tool.ERASER);
        tool("text", "A typed note: tap where it goes", PageInk.Tool.TEXT);
        gap();
        for (int col : COLORS) swatch(col);
        gap();
        for (float w : WIDTHS) width(w);
        gap();
        button("undo", "Undo", () -> { if (!pen.undo()) host.toast("Nothing to undo"); });
        button("close", "Hide the pen tools", () -> show(false));
    }

    private void gap() {
        View v = new View(c);
        v.setBackgroundColor(look.border);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(look.eink ? look.dp(1) : Math.max(1, look.dp(0.5f)), look.dp(28));
        lp.leftMargin = lp.rightMargin = look.dp(4);
        row.addView(v, lp);
    }

    private ImageView cell(boolean on) {
        ImageView b = new ImageView(c);
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setBackground(look.pressable(on ? look.accentSoft : 0, 22, on && look.eink ? look.borderStrong : 0));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(look.dp(44), look.dp(44));
        lp.leftMargin = lp.rightMargin = look.dp(1);
        b.setLayoutParams(lp);
        return b;
    }

    private void tool(String icon, String what, PageInk.Tool t) {
        ImageView b = cell(pen.tool() == t);
        b.setImageDrawable(look.icon(c, icon, look.text));
        b.setContentDescription(what);
        b.setOnClickListener(v -> { pen.tool(t); draw(); });
        b.setOnLongClickListener(v -> { host.toast(what); return true; });
        row.addView(b);
    }

    private void button(String icon, String what, Runnable run) {
        ImageView b = cell(false);
        b.setImageDrawable(look.icon(c, icon, look.text));
        b.setContentDescription(what);
        b.setOnClickListener(v -> run.run());
        row.addView(b);
    }

    private void swatch(int col) {
        ImageView b = cell((pen.color() & 0xffffff) == (col & 0xffffff));
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(col);
        dot.setSize(look.dp(20), look.dp(20));
        b.setImageDrawable(dot);
        b.setContentDescription("Colour");
        b.setOnClickListener(v -> { pen.color(col); if (pen.tool() == PageInk.Tool.ERASER || pen.tool() == PageInk.Tool.TEXT) pen.tool(PageInk.Tool.PEN); draw(); });
        row.addView(b);
    }

    private void width(float w) {
        ImageView b = cell(Math.abs(pen.widthTimes() - w) < 0.01f);
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(look.text);
        int d = look.dp(4 + 6 * w);
        dot.setSize(d, d);
        b.setImageDrawable(dot);
        b.setContentDescription(w < 1 ? "Fine" : w > 1 ? "Bold" : "Medium");
        b.setOnClickListener(v -> { pen.widthTimes(w); draw(); });
        row.addView(b);
    }
}
