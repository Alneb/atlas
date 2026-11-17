package org.atlas.capture;

import android.graphics.Typeface;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;


/** The bar of a native plugin's places (a library, a series, a book, the player), drawn as the reader's (ReaderBars):
 *  Back, a title over a quiet line, icon actions at the end, 56 dp, a hairline under it. Manga and Audiobookshelf share it. */
public final class TopBar extends LinearLayout {
    private final Look look;
    private final TextView title, sub;
    private final LinearLayout actions;

    public TopBar(Host host, Runnable back) {
        super(host.activity());
        look = host.look();
        setGravity(Gravity.CENTER_VERTICAL);
        setPadding(look.dp(4), look.dp(4), look.dp(6), look.dp(4));
        setMinimumHeight(look.dp(56));
        setBackground(edge());
        addView(icon("back", "Back", back));
        LinearLayout names = new LinearLayout(getContext());
        names.setOrientation(VERTICAL);
        names.setPadding(look.dp(4), 0, look.dp(8), 0);
        title = look.label(getContext(), "", 17, look.text);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        sub = look.label(getContext(), "", 12.5f, look.muted);
        sub.setSingleLine(true);
        sub.setEllipsize(TextUtils.TruncateAt.END);
        sub.setVisibility(GONE);
        names.addView(title);
        names.addView(sub);
        addView(names, new LayoutParams(0, -2, 1));
        actions = new LinearLayout(getContext());
        actions.setGravity(Gravity.CENTER_VERTICAL);
        addView(actions);
    }

    public void title(String t) { title.setText(t); }

    /** The quiet line under the title (null or "": none). */
    public void sub(String s) { sub.setText(s == null ? "" : s); sub.setVisibility(s == null || s.isEmpty() ? GONE : VISIBLE); }

    public ImageView action(String icon, String what, Runnable run) { ImageView b = icon(icon, what, run); actions.addView(b); return b; }

    /** An icon button, 48 dp for a finger; a long press says what it does. */
    public ImageView icon(String name, String what, Runnable run) {
        ImageView b = new ImageView(getContext());
        b.setImageDrawable(look.icon(getContext(), name, look.text));
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setContentDescription(what);
        b.setBackground(look.pressable(0, 24, 0));
        b.setOnClickListener(v -> run.run());
        b.setOnLongClickListener(v -> { android.widget.Toast.makeText(getContext(), what, android.widget.Toast.LENGTH_SHORT).show(); return true; });
        b.setLayoutParams(new LayoutParams(look.dp(48), look.dp(48)));
        return b;
    }

    /** An icon button's picture changed (a toggle). */
    public void icon(ImageView b, String name, String what) {
        b.setImageDrawable(look.icon(getContext(), name, look.text));
        b.setContentDescription(what);
    }

    private android.graphics.drawable.Drawable edge() {
        android.graphics.drawable.GradientDrawable fill = new android.graphics.drawable.GradientDrawable();
        fill.setColor(look.bg);
        android.graphics.drawable.GradientDrawable line = new android.graphics.drawable.GradientDrawable();
        line.setColor(look.eink ? look.borderStrong : look.border);
        android.graphics.drawable.LayerDrawable l = new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[] { line, fill });
        l.setLayerInset(1, 0, 0, 0, look.eink ? look.dp(1) : Math.max(1, look.dp(0.5f)));
        return l;
    }

    /** A chip of a row of tabs: the chosen one filled with the accent's soft colour. */
    public static TextView chip(Look look, android.content.Context c, String name, boolean on, Runnable pick) {
        TextView t = look.label(c, name, 14, on ? look.text : look.muted);
        t.setGravity(Gravity.CENTER);
        t.setPadding(look.dp(14), 0, look.dp(14), 0);
        t.setMinHeight(look.dp(48));
        if (on) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setBackground(look.target(look.pressable(on ? look.accentSoft : 0, 16, on ? 0 : look.border), 32));
        t.setOnClickListener(v -> pick.run());
        return t;
    }

    /** A thin space between chips. */
    public static View gap(Look look, android.content.Context c) {
        View v = new View(c);
        v.setLayoutParams(new LayoutParams(look.dp(6), 1));
        return v;
    }
}
