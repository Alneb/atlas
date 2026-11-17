package org.atlas.capture;

import android.content.Context;
import android.graphics.Typeface;
import android.text.TextUtils;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;


/** A library's thing (a manga series, an audiobook): its cover (two by three), a count on it, the title under it; as a
 *  list row, the cover small at the start and the count beside the title. Manga and Audiobookshelf share it. */
public final class Tile extends LinearLayout {
    public final boolean grid;
    public final ImageView cover;
    public final TextView title, detail, badge;

    public Tile(Look look, Context c, boolean grid) {
        super(c);
        this.grid = grid;
        setOrientation(grid ? VERTICAL : HORIZONTAL);
        setBackground(look.pressable(0, 10, 0));
        cover = new ImageView(c) {
            @Override protected void onMeasure(int ws, int hs) {
                if (grid) { int w = MeasureSpec.getSize(ws); setMeasuredDimension(w, w * 3 / 2); } else super.onMeasure(ws, hs);
            }
        };
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cover.setBackground(look.round(look.hover, 8, look.border));
        cover.setClipToOutline(true);
        FrameLayout frame = new FrameLayout(c);
        frame.addView(cover, new FrameLayout.LayoutParams(-1, grid ? -2 : -1));
        badge = look.label(c, "", 12, look.accentFg);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setPadding(look.dp(7), look.dp(1), look.dp(7), look.dp(1));
        badge.setBackground(look.round(look.accent, 9, 0));
        FrameLayout.LayoutParams bp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START);
        bp.setMargins(look.dp(6), look.dp(6), 0, 0);
        frame.addView(badge, bp);
        title = look.label(c, "", grid ? 13.5f : 15.5f, look.text);
        title.setMaxLines(2);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setGravity(Gravity.START | Gravity.TOP);
        detail = look.label(c, "", 12.5f, look.faint);
        detail.setSingleLine(true);
        if (grid) {
            addView(frame, new LayoutParams(-1, -2));
            title.setPadding(look.dp(2), look.dp(6), look.dp(2), 0);
            addView(title, new LayoutParams(-1, -2));
            detail.setPadding(look.dp(2), 0, look.dp(2), look.dp(4));
            addView(detail, new LayoutParams(-1, -2));
        } else {
            setGravity(Gravity.CENTER_VERTICAL);
            setPadding(look.dp(12), look.dp(6), look.dp(12), look.dp(6));
            addView(frame, new LayoutParams(look.dp(48), look.dp(72)));
            LinearLayout names = new LinearLayout(c);
            names.setOrientation(VERTICAL);
            names.setPadding(look.dp(14), 0, 0, 0);
            names.addView(title);
            names.addView(detail);
            addView(names, new LayoutParams(0, -2, 1));
        }
    }
}
