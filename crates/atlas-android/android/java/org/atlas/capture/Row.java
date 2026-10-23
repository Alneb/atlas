package org.atlas.capture;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * A list row (Look.row): an icon, a label, a short detail. The label and detail sit side by side when both fit whole;
 * otherwise (a long label, a large font) the label wraps and the detail goes under it — Material's two-line item —
 * so neither is cut to "…". The parts are fields, never child indices (which shift when there is no icon).
 */
public final class Row extends LinearLayout {
    public final TextView label;
    /** Null when the row has none. */
    public final TextView detail;

    Row(Context c, View icon, LayoutParams iconAt, TextView label, TextView detail, int gap) {
        super(c);
        this.label = label;
        this.detail = detail;
        if (icon != null) addView(icon, iconAt);
        Line line = new Line(c, gap);
        line.addView(label);
        if (detail != null) line.addView(detail);
        addView(line, new LayoutParams(0, -2, 1f));
    }

    /** The label then the detail: on one line, the detail at the end, when both fit; else stacked. */
    private static final class Line extends ViewGroup {
        private final int gap;
        private boolean stacked;

        Line(Context c, int gap) {
            super(c);
            this.gap = gap;
        }

        @Override
        protected void onMeasure(int ws, int hs) {
            int width = MeasureSpec.getSize(ws), free = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
            int across = MeasureSpec.makeMeasureSpec(width, MeasureSpec.AT_MOST);
            View a = getChildAt(0), b = getChildCount() > 1 ? getChildAt(1) : null;
            a.measure(free, free);
            int h;
            if (b == null) {
                stacked = false;
                a.measure(across, free);
                h = a.getMeasuredHeight();
            } else {
                b.measure(free, free);
                stacked = a.getMeasuredWidth() + gap + b.getMeasuredWidth() > width;
                if (stacked) {
                    a.measure(across, free);
                    b.measure(across, free);
                    h = a.getMeasuredHeight() + b.getMeasuredHeight();
                } else {
                    h = Math.max(a.getMeasuredHeight(), b.getMeasuredHeight());
                }
            }
            setMeasuredDimension(width, resolveSize(h, hs));
        }

        @Override
        protected void onLayout(boolean changed, int l, int t, int r, int bottom) {
            int width = r - l, height = bottom - t;
            boolean rtl = getLayoutDirection() == LAYOUT_DIRECTION_RTL;
            View a = getChildAt(0), b = getChildCount() > 1 ? getChildAt(1) : null;
            if (stacked) {
                place(a, rtl, width, 0, 0);
                place(b, rtl, width, 0, a.getMeasuredHeight());
            } else {
                place(a, rtl, width, 0, (height - a.getMeasuredHeight()) / 2);
                if (b != null) place(b, rtl, width, width - b.getMeasuredWidth(), (height - b.getMeasuredHeight()) / 2);
            }
        }

        /** `x` from the start edge (mirrored right to left). */
        private static void place(View v, boolean rtl, int width, int x, int y) {
            int w = v.getMeasuredWidth(), left = rtl ? width - x - w : x;
            v.layout(left, y, left + w, y + v.getMeasuredHeight());
        }
    }
}
