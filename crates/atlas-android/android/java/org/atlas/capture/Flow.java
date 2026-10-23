package org.atlas.capture;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;

/** Children left to right, wrapping onto a new line when the width runs out (the capture box's choices: never a sideways scroll). */
final class Flow extends ViewGroup {
    private final int gapX, gapY;

    Flow(Context c, int gapX, int gapY) {
        super(c);
        this.gapX = gapX;
        this.gapY = gapY;
    }

    @Override
    protected void onMeasure(int ws, int hs) {
        int width = MeasureSpec.getSize(ws), x = 0, y = 0, line = 0;
        int across = MeasureSpec.makeMeasureSpec(width, MeasureSpec.AT_MOST), down = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
        for (int i = 0; i < getChildCount(); i++) {
            View v = getChildAt(i);
            if (v.getVisibility() == GONE) continue;
            LayoutParams p = v.getLayoutParams();
            v.measure(getChildMeasureSpec(across, 0, p.width), getChildMeasureSpec(down, 0, p.height));
            if (x > 0 && x + v.getMeasuredWidth() > width) { x = 0; y += line + gapY; line = 0; }
            x += v.getMeasuredWidth() + gapX;
            line = Math.max(line, v.getMeasuredHeight());
        }
        setMeasuredDimension(width, resolveSize(y + line, hs));
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int width = r - l, x = 0, y = 0, line = 0;
        for (int i = 0; i < getChildCount(); i++) {
            View v = getChildAt(i);
            if (v.getVisibility() == GONE) continue;
            int w = v.getMeasuredWidth(), h = v.getMeasuredHeight();
            if (x > 0 && x + w > width) { x = 0; y += line + gapY; line = 0; }
            boolean rtl = getLayoutDirection() == LAYOUT_DIRECTION_RTL;
            int left = rtl ? width - x - w : x;
            v.layout(left, y, left + w, y + h);
            x += w + gapX;
            line = Math.max(line, h);
        }
    }
}
