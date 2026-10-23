package org.atlas.capture;

import android.content.Context;
import android.graphics.Typeface;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

/** The readers' chrome (books, PDFs, manga: one look). Hidden while reading; a tap in the middle (or the top band) shows it:
 *  - on top: Back, the title over where you are, a few icons (bookmark, search…);
 *  - at the bottom: where you are in words (chapter · page, % and what is left), a slider, and a row of tabs with an
 *    icon over a word (Contents · Pen · Aa · Notes · Settings), KOReader's bottom menu;
 *  - a tab opens its panel above the bottom bar (a list, settings), the page still visible over it.
 *  Flat on e-ink (lines, no shadow, nothing animated), elevated elsewhere. Lives in the reader's FrameLayout. */
public final class ReaderBars {
    private final Look look;
    private final Context c;
    private final FrameLayout parent;
    private final LinearLayout top, bottom, actions, tabs, panelBox, panelHead;
    private final TextView title, where, infoLeft, infoRight, panelTitle;
    private final FrameLayout panelBody;
    public final SeekBar slider;
    private View tabOn;
    private Runnable onHide = () -> {};
    private Runnable panelClosed; // the open panel's "closed" (the Aa panel keeps its settings then)

    public ReaderBars(Host host, FrameLayout parent, Runnable back) {
        this.look = host.look();
        this.c = parent.getContext();
        this.parent = parent;

        top = new LinearLayout(c);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(look.dp(4), look.dp(4), look.dp(6), look.dp(4));
        top.setBackground(edge(true));
        top.setElevation(look.elevation(3));
        top.setMinimumHeight(look.dp(56));
        top.addView(icon("back", "Back", back));
        LinearLayout names = new LinearLayout(c);
        names.setOrientation(LinearLayout.VERTICAL);
        names.setPadding(look.dp(4), 0, look.dp(8), 0);
        title = look.label(c, "", 16, look.text);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        where = look.label(c, "", 12.5f, look.muted);
        where.setSingleLine(true);
        where.setEllipsize(TextUtils.TruncateAt.END);
        where.setVisibility(View.GONE);
        names.addView(title);
        names.addView(where);
        top.addView(names, new LinearLayout.LayoutParams(0, -2, 1));
        actions = new LinearLayout(c);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(actions);
        top.setVisibility(View.GONE);
        top.setClickable(true);
        parent.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        bottom = new LinearLayout(c);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setBackground(edge(false));
        bottom.setElevation(look.elevation(3));
        bottom.setClickable(true);
        LinearLayout info = new LinearLayout(c);
        info.setGravity(Gravity.CENTER_VERTICAL);
        info.setPadding(look.dp(18), look.dp(10), look.dp(18), 0);
        infoLeft = look.label(c, "", 13, look.text);
        infoLeft.setSingleLine(true);
        infoLeft.setEllipsize(TextUtils.TruncateAt.END);
        infoRight = look.label(c, "", 13, look.muted);
        infoRight.setSingleLine(true);
        info.addView(infoLeft, new LinearLayout.LayoutParams(0, -2, 1));
        info.addView(infoRight);
        bottom.addView(info);
        slider = new SeekBar(c);
        slider.setPadding(look.dp(18), look.dp(6), look.dp(18), look.dp(6));
        bottom.addView(slider, new LinearLayout.LayoutParams(-1, look.dp(44)));
        View rule = new View(c);
        rule.setBackgroundColor(look.border);
        bottom.addView(rule, new LinearLayout.LayoutParams(-1, look.eink ? look.dp(1) : Math.max(1, look.dp(0.5f))));
        tabs = new LinearLayout(c);
        tabs.setPadding(look.dp(6), look.dp(4), look.dp(6), look.dp(6));
        bottom.addView(tabs);
        bottom.setVisibility(View.GONE);
        parent.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        // a tab's panel, above the bottom bar
        panelBox = new LinearLayout(c);
        panelBox.setOrientation(LinearLayout.VERTICAL);
        panelBox.setBackground(look.round(look.bg, 0, look.border));
        panelBox.setElevation(look.elevation(6));
        panelBox.setClickable(true);
        panelHead = new LinearLayout(c);
        panelHead.setGravity(Gravity.CENTER_VERTICAL);
        panelHead.setPadding(look.dp(18), look.dp(4), look.dp(4), 0);
        panelTitle = look.label(c, "", 17, look.text);
        panelTitle.setTypeface(Typeface.DEFAULT_BOLD);
        panelHead.addView(panelTitle, new LinearLayout.LayoutParams(0, -2, 1));
        panelHead.addView(icon("close", "Close", this::closePanel));
        panelBox.addView(panelHead);
        panelBody = new FrameLayout(c);
        panelBox.addView(panelBody, new LinearLayout.LayoutParams(-1, -2));
        panelBox.setVisibility(View.GONE);
        parent.addView(panelBox, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
    }

    /** A bar's background: the page's colour, a line on the side facing the page (e-ink: a firm one). */
    private android.graphics.drawable.Drawable edge(boolean onTop) {
        android.graphics.drawable.GradientDrawable fill = new android.graphics.drawable.GradientDrawable();
        fill.setColor(look.bg);
        android.graphics.drawable.GradientDrawable line = new android.graphics.drawable.GradientDrawable();
        line.setColor(look.eink ? look.borderStrong : look.border);
        android.graphics.drawable.LayerDrawable l = new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[] { line, fill });
        int w = look.eink ? look.dp(1) : Math.max(1, look.dp(0.5f));
        if (onTop) l.setLayerInset(1, 0, 0, 0, w); else l.setLayerInset(1, 0, w, 0, 0);
        return l;
    }

    /** An icon button, 48 dp for a finger. */
    public ImageView icon(String name, String what, Runnable run) {
        ImageView b = new ImageView(c);
        b.setImageDrawable(look.icon(c, name, look.text));
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setContentDescription(what);
        b.setBackground(look.pressable(0, 24, 0));
        b.setOnClickListener(v -> run.run());
        b.setLayoutParams(new LinearLayout.LayoutParams(look.dp(48), look.dp(48)));
        b.setOnLongClickListener(v -> { android.widget.Toast.makeText(c, what, android.widget.Toast.LENGTH_SHORT).show(); return true; });
        return b;
    }

    public void title(String t) { title.setText(t); }

    /** Where you are, under the title (a chapter's name), or none. */
    public void where(String s) { where.setText(s == null ? "" : s); where.setVisibility(s == null || s.isEmpty() ? View.GONE : View.VISIBLE); }

    /** The bottom bar's line: what you read (left), how far and what is left (right). */
    public void info(String left, String right) { infoLeft.setText(left == null ? "" : left); infoRight.setText(right == null ? "" : right); }

    /** A top-right icon. */
    public ImageView action(String icon, String what, Runnable run) { ImageView b = icon(icon, what, run); actions.addView(b); return b; }

    /** A bottom tab: its icon over its word. */
    public View tab(String icon, String label, Runnable run) {
        LinearLayout t = new LinearLayout(c);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, look.dp(6), 0, look.dp(4));
        t.setBackground(look.pressable(0, 12, 0));
        ImageView i = new ImageView(c);
        i.setImageDrawable(look.icon(c, icon, look.text));
        t.addView(i, new LinearLayout.LayoutParams(look.dp(24), look.dp(24)));
        TextView w = look.label(c, label, 11.5f, look.text);
        w.setGravity(Gravity.CENTER);
        w.setPadding(0, look.dp(3), 0, 0);
        t.addView(w);
        t.setContentDescription(label);
        t.setOnClickListener(v -> run.run());
        tabs.addView(t, new LinearLayout.LayoutParams(0, look.dp(60), 1));
        return t;
    }

    private void mark(View tab) {
        if (tabOn != null) tabOn.setBackground(look.pressable(0, 12, 0));
        tabOn = tab;
        if (tab != null) tab.setBackground(look.pressable(look.accentSoft, 12, look.eink ? look.borderStrong : 0));
    }

    public boolean shown() { return top.getVisibility() == View.VISIBLE; }

    public void show(boolean on) {
        top.setVisibility(on ? View.VISIBLE : View.GONE);
        bottom.setVisibility(on ? View.VISIBLE : View.GONE);
        if (!on) { closePanel(); onHide.run(); }
        else top.post(this::placePanel);
    }

    public void onHide(Runnable r) { onHide = r == null ? () -> {} : r; }

    /** Whether (x, y) of the parent is on a bar or the panel (a touch there is theirs, not the page's). */
    public boolean over(float x, float y) {
        if (!shown()) return false;
        if (y < top.getBottom() || y > bottom.getTop()) return true;
        return panelBox.getVisibility() == View.VISIBLE && y >= panelBox.getTop() && y <= panelBox.getBottom();
    }

    public boolean panelOpen() { return panelBox.getVisibility() == View.VISIBLE; }

    /** `content` in the panel above the bottom bar (scrolled when long), `tab` marked; the bars shown. A second tap on
     *  the same tab closes it. */
    public void panel(View tab, String name, View content) { panel(tab, name, content, null); }

    /** …and `closed` run when it closes (by its X, Back, a tap on the page, another panel). */
    public void panel(View tab, String name, View content, Runnable closed) {
        if (tab != null && tab == tabOn && panelOpen()) { closePanel(); return; }
        if (panelOpen()) closePanel();
        panelClosed = closed;
        if (!shown()) show(true);
        panelTitle.setText(name);
        panelBody.removeAllViews();
        ScrollView sv = new ScrollView(c);
        sv.addView(content);
        panelBody.addView(sv, new FrameLayout.LayoutParams(-1, -2));
        panelBox.setVisibility(View.VISIBLE);
        mark(tab);
        placePanel();
    }

    /** The scroll view inside the panel (to scroll a list to where you are), or null. */
    public ScrollView panelScroll() { return panelBody.getChildCount() == 0 ? null : (ScrollView) panelBody.getChildAt(0); }

    /** The panel sits on the bottom bar and is at most 60 % of the screen tall. */
    private void placePanel() {
        if (panelBox.getVisibility() != View.VISIBLE) return;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) panelBox.getLayoutParams();
        lp.bottomMargin = bottom.getHeight();
        panelBox.setLayoutParams(lp);
        int max = (int) (parent.getHeight() * 0.6f);
        ViewGroup.LayoutParams bp = panelBody.getLayoutParams();
        panelBody.measure(View.MeasureSpec.makeMeasureSpec(Math.max(1, parent.getWidth()), View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        bp.height = panelBody.getMeasuredHeight() > max ? max : ViewGroup.LayoutParams.WRAP_CONTENT;
        panelBody.setLayoutParams(bp);
        if (lp.bottomMargin == 0) bottom.post(this::placePanel); // not laid out yet
    }

    public void closePanel() {
        boolean was = panelOpen();
        panelBox.setVisibility(View.GONE);
        panelBody.removeAllViews();
        mark(null);
        Runnable r = panelClosed;
        panelClosed = null;
        if (was && r != null) r.run();
    }

    /** The open panel's content drawn again in place (a choice changed), its scroll kept. */
    public void replacePanel(View content) {
        ScrollView sv = panelScroll();
        if (sv == null) return;
        int y = sv.getScrollY();
        sv.removeAllViews();
        sv.addView(content);
        sv.post(() -> sv.scrollTo(0, y));
        placePanel();
    }

    /** A setting's name and value with − and + (KOReader's steppers: on e-ink a tap is surer than a slider). */
    public View stepper(String label, String value, Runnable less, Runnable more) {
        LinearLayout r = new LinearLayout(c);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(look.dp(12), look.dp(6), look.dp(8), look.dp(6));
        r.addView(look.label(c, label, 15, look.text), new LinearLayout.LayoutParams(0, -2, 1));
        TextView minus = stepButton("−", "Less " + label.toLowerCase(java.util.Locale.ROOT), less);
        TextView v = look.label(c, value, 15, look.text);
        v.setGravity(Gravity.CENTER);
        v.setTypeface(Typeface.DEFAULT_BOLD);
        TextView plus = stepButton("+", "More " + label.toLowerCase(java.util.Locale.ROOT), more);
        r.addView(minus);
        r.addView(v, new LinearLayout.LayoutParams(look.dp(76), -2));
        r.addView(plus);
        return r;
    }

    private TextView stepButton(String s, String what, Runnable run) {
        TextView b = look.label(c, s, 20, look.text);
        b.setGravity(Gravity.CENTER);
        b.setContentDescription(what);
        b.setBackground(look.pressable(0, 22, look.borderStrong));
        b.setOnClickListener(v -> run.run());
        b.setLayoutParams(new LinearLayout.LayoutParams(look.dp(48), look.dp(44)));
        return b;
    }

    /** A small quiet heading between a panel's groups. */
    public TextView group(String s) {
        TextView h = look.label(c, s.toUpperCase(java.util.Locale.ROOT), 11.5f, look.muted);
        h.setLetterSpacing(0.08f);
        h.setPadding(look.dp(12), look.dp(16), look.dp(12), look.dp(2));
        return h;
    }

    /** A line of help under a setting. */
    public TextView hint(String s) {
        TextView h = look.label(c, s, 12.5f, look.faint);
        h.setPadding(look.dp(12), look.dp(2), look.dp(12), look.dp(6));
        return h;
    }

    /** Back: the panel, then the bars; false when nothing was open. */
    public boolean back() {
        if (panelOpen()) { closePanel(); return true; }
        if (shown()) { show(false); return true; }
        return false;
    }

    // ---- what panels are made of -------------------------------------------------------------------------------

    /** A column for a panel's rows. */
    public LinearLayout column() {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(look.dp(8), 0, look.dp(8), look.dp(12));
        return l;
    }

    /** A row of a list: its words, a detail quiet at the right, marked when `on`. */
    public TextView row(String text, String detail, boolean on, float indentDp, Runnable run) {
        TextView r = look.label(c, text, 15, on ? look.accent : look.text);
        if (on) r.setTypeface(Typeface.DEFAULT_BOLD);
        r.setPadding(look.dp(12 + indentDp), look.dp(10), look.dp(12), look.dp(10));
        r.setMinHeight(look.dp(48));
        r.setBackground(look.pressable(on ? look.accentSoft : 0, 10, 0));
        if (detail != null && !detail.isEmpty()) {
            r.setText(text + "  ·  " + detail);
        }
        if (run != null) r.setOnClickListener(v -> run.run());
        else r.setTextColor(look.faint);
        return r;
    }

    /** A setting's name over its choices: segments, the chosen one filled. */
    public View segments(String label, String[] names, int chosen, java.util.function.IntConsumer pick) {
        LinearLayout box = new LinearLayout(c);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(look.dp(12), look.dp(10), look.dp(12), look.dp(2));
        box.addView(look.label(c, label, 13, look.muted));
        LinearLayout row = new LinearLayout(c);
        row.setPadding(0, look.dp(6), 0, 0);
        for (int i = 0; i < names.length; i++) {
            final int k = i;
            boolean on = i == chosen;
            TextView b = look.label(c, names[i], 14, on ? look.accentFg : look.text);
            b.setGravity(Gravity.CENTER);
            b.setBackground(look.pressable(on ? look.accent : 0, 10, on ? look.accent : look.borderStrong));
            b.setOnClickListener(v -> pick.accept(k));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, look.dp(44), 1);
            if (i > 0) lp.setMarginStart(look.dp(6));
            row.addView(b, lp);
        }
        box.addView(row);
        return box;
    }

    /** Touches on the bars and the panel go to them, never to the page under: call from the reader's dispatch. */
    public boolean dispatch(MotionEvent e) { return over(e.getX(), e.getY()); }
}
