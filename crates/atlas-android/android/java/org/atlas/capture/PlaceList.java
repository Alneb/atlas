package org.atlas.capture;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.style.BackgroundColorSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * The one list of the app's native places (docs/design/DESIGN-android-native-app.md §3; Files and Search draw on it, the
 * Library next): Material 3 list items of 56 dp at least — an icon, a title, a supporting line, a trailing ⋮ — under
 * sticky section headers, in the Look's colours. A tap opens, a long press or the ⋮ opens the item's menu, a pull from
 * the top refreshes, a sideways fling steps to the place beside (as the bottom bar's does), and a fling scrolls
 * natively (a ListView: rows made only for what is on screen). Public: a native plugin's lists are drawn with it too
 * (Audiobookshelf's series, authors, chapters). What the lines are is decided elsewhere (PlaceItem,
 * FileRows, SearchRows): this only draws them and reports the gestures.
 */
public final class PlaceList extends FrameLayout {
    public interface On {
        void open(PlaceItem item);
        /** A long press, or the row's ⋮ (`anchor`: where to show the menu). */
        void more(PlaceItem item, View anchor);
        /** Pulled down from the top: read again, then setRefreshing(false). */
        void refresh();
        /** A sideways fling: 1 the place after, -1 the one before. */
        default void step(int by) {}
    }

    private final Look look;
    private final On on;
    private final ListView list;
    private final View sticky;
    private final TextView empty;
    private final FrameLayout puller;
    private final View pullIcon, spinner;
    private final Lines lines = new Lines();
    private List<PlaceItem> items = new ArrayList<>();
    private boolean refreshing;

    public PlaceList(Context c, Look look, On on) {
        super(c);
        this.look = look;
        this.on = on;
        setBackgroundColor(look.app);
        list = new ListView(c);
        list.setDivider(null);
        list.setSelector(new android.graphics.drawable.ColorDrawable(0)); // each row has its own ripple
        list.setCacheColorHint(0);
        list.setClipToPadding(false);
        list.setPadding(0, 0, 0, look.dp(88)); // the last row clear of the +
        if (look.eink) list.setOverScrollMode(View.OVER_SCROLL_NEVER); // no glow: a panel refresh each frame
        list.setAdapter(lines);
        list.setOnItemClickListener((p, v, pos, id) -> on.open(items.get(pos)));
        list.setOnItemLongClickListener((p, v, pos, id) -> {
            PlaceItem it = items.get(pos);
            if (!it.more) return false;
            on.more(it, v);
            return true;
        });
        addView(list, new LayoutParams(-1, -1));

        sticky = header(c);
        sticky.setVisibility(View.GONE);
        sticky.setElevation(look.elevation(1));
        addView(sticky, new LayoutParams(-1, -2, Gravity.TOP));
        list.setOnScrollListener(new AbsListView.OnScrollListener() {
            @Override public void onScrollStateChanged(AbsListView v, int state) {}
            @Override public void onScroll(AbsListView v, int first, int count, int total) { placeSticky(); }
        });

        empty = look.label(c, "", 14.5f, look.muted);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(look.dp(32), look.dp(32), look.dp(32), look.dp(32));
        empty.setVisibility(View.GONE);
        addView(empty, new LayoutParams(-1, -2, Gravity.TOP));

        // the pull's disc: an arrow that turns as it is pulled, then the platform's spinner (a still arrow on e-ink)
        puller = new FrameLayout(c);
        puller.setBackground(look.round(look.pop, 20, look.border));
        puller.setElevation(look.elevation(3));
        ImageView arrow = new ImageView(c);
        arrow.setImageDrawable(look.icon(c, "repeat", look.accent));
        arrow.setScaleType(ImageView.ScaleType.CENTER);
        puller.addView(arrow, new LayoutParams(-1, -1));
        pullIcon = arrow;
        ProgressBar spin = new ProgressBar(c);
        spin.setIndeterminate(true);
        spin.setIndeterminateTintList(ColorStateList.valueOf(look.accent));
        spin.setVisibility(View.GONE);
        int pad = look.dp(8);
        spin.setPadding(pad, pad, pad, pad);
        puller.addView(spin, new LayoutParams(-1, -1));
        spinner = spin;
        LayoutParams pp = new LayoutParams(look.dp(40), look.dp(40), Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        addView(puller, pp);
        puller.setTranslationY(-look.dp(48));
        puller.setVisibility(View.INVISIBLE);
        slop = ViewConfiguration.get(c).getScaledTouchSlop();
        minFling = ViewConfiguration.get(c).getScaledMinimumFlingVelocity();
    }

    /** The lines to show (`emptyText` when there are none), the scroll kept where it was. */
    public void setItems(List<PlaceItem> items, String emptyText) {
        this.items = new ArrayList<>(items);
        lines.notifyDataSetChanged();
        empty.setText(emptyText == null ? "" : emptyText);
        empty.setVisibility(this.items.isEmpty() && emptyText != null && !emptyText.isEmpty() ? View.VISIBLE : View.GONE);
        post(this::placeSticky);
    }

    /** Back at the first line (another folder). */
    public void toTop() { list.setSelection(0); }

    /** The refreshing disc shown (a read under way) or put away. */
    public void setRefreshing(boolean on) {
        refreshing = on;
        puller.animate().cancel();
        if (on) {
            puller.setVisibility(View.VISIBLE);
            pullIcon.setVisibility(look.eink ? View.VISIBLE : View.GONE);
            spinner.setVisibility(look.eink ? View.GONE : View.VISIBLE);
            puller.setTranslationY(look.dp(16));
        } else {
            spinner.setVisibility(View.GONE);
            pullIcon.setVisibility(View.VISIBLE);
            if (look.eink) { puller.setVisibility(View.INVISIBLE); puller.setTranslationY(-look.dp(48)); }
            else puller.animate().translationY(-look.dp(48)).setDuration(180).withEndAction(() -> puller.setVisibility(View.INVISIBLE)).start();
        }
    }

    // ---- the gestures: a pull from the top, a sideways fling -----------------------------------------------------

    private final int slop, minFling;
    private float downX, downY;
    private enum Drag { NONE, PULL, SIDEWAYS }
    private Drag drag = Drag.NONE;
    private VelocityTracker velocity;

    @Override public boolean dispatchTouchEvent(MotionEvent e) {
        if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { if (velocity != null) velocity.recycle(); velocity = VelocityTracker.obtain(); }
        if (velocity != null) velocity.addMovement(e);
        return super.dispatchTouchEvent(e);
    }

    /** Whether this gesture is now the list's own (a pull, a sideways fling) rather than the rows' (a tap, a scroll). */
    private boolean claim(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = e.getX();
                downY = e.getY();
                drag = Drag.NONE;
                return false;
            case MotionEvent.ACTION_MOVE:
                if (drag != Drag.NONE) return true;
                float dx = e.getX() - downX, dy = e.getY() - downY;
                if (!refreshing && dy > slop && dy > Math.abs(dx) * 1.5f && !list.canScrollVertically(-1)) drag = Drag.PULL;
                else if (Math.abs(dx) > slop * 2 && Math.abs(dx) > Math.abs(dy) * 1.5f) drag = Drag.SIDEWAYS;
                if (drag == Drag.PULL) { puller.setVisibility(View.VISIBLE); downY = e.getY(); }
                return drag != Drag.NONE;
            default:
                return false;
        }
    }

    @Override public boolean onInterceptTouchEvent(MotionEvent e) { return claim(e); }

    @Override public boolean onTouchEvent(MotionEvent e) {
        if (claim(e) && e.getActionMasked() != MotionEvent.ACTION_MOVE) return true;
        int pull = look.dp(72);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                return true; // an empty list: the gesture is still followed
            case MotionEvent.ACTION_MOVE:
                if (drag == Drag.PULL) {
                    float d = Math.max(0, (e.getY() - downY) * 0.5f);
                    float at = Math.min(d, pull * 1.4f);
                    puller.setTranslationY(-look.dp(48) + at);
                    if (!look.eink) pullIcon.setRotation(at * 2);
                    pullIcon.setAlpha(at >= pull ? 1f : 0.5f);
                }
                return true;
            case MotionEvent.ACTION_UP:
                if (drag == Drag.PULL) {
                    if (puller.getTranslationY() + look.dp(48) >= pull) { setRefreshing(true); on.refresh(); }
                    else setRefreshing(false);
                } else if (drag == Drag.SIDEWAYS && velocity != null) {
                    velocity.computeCurrentVelocity(1000);
                    float vx = velocity.getXVelocity(), dx = e.getX() - downX;
                    if (Math.abs(vx) > minFling && Math.abs(dx) > look.dp(48) && Math.signum(vx) == Math.signum(dx)) on.step(dx < 0 ? 1 : -1);
                }
                drag = Drag.NONE;
                return true;
            case MotionEvent.ACTION_CANCEL:
                if (drag == Drag.PULL) setRefreshing(false);
                drag = Drag.NONE;
                return true;
            default:
                return true;
        }
    }

    // ---- the lines -------------------------------------------------------------------------------------------------

    /** The sticky header: the section of the first line on screen, pushed up by the next section's header. */
    private void placeSticky() {
        int first = list.getFirstVisiblePosition();
        int h = items.isEmpty() ? -1 : PlaceItem.headerFor(items, first);
        View top = list.getChildAt(0);
        if (h < 0 || (h == first && top != null && top.getTop() >= 0)) { sticky.setVisibility(View.GONE); return; }
        bindHeader(sticky, items.get(h));
        sticky.setVisibility(View.VISIBLE);
        int next = PlaceItem.nextHeader(items, first);
        View below = next < 0 ? null : list.getChildAt(next - first);
        int height = sticky.getHeight() > 0 ? sticky.getHeight() : look.dp(40);
        sticky.setTranslationY(below == null ? 0 : Math.min(0, below.getTop() - height));
    }

    private final class Lines extends BaseAdapter {
        @Override public int getCount() { return items.size(); }
        @Override public Object getItem(int i) { return items.get(i); }
        @Override public long getItemId(int i) { return i; }
        @Override public int getViewTypeCount() { return 2; }
        @Override public int getItemViewType(int i) { return items.get(i).header() ? 0 : 1; }
        @Override public boolean areAllItemsEnabled() { return false; }
        /** A header opens its file (a search's section) when it has one; "Folders" and "Files" do nothing. */
        @Override public boolean isEnabled(int i) { PlaceItem it = items.get(i); return !it.header() || it.path != null; }

        @Override public View getView(int i, View old, ViewGroup parent) {
            PlaceItem it = items.get(i);
            if (it.header()) {
                View v = old != null ? old : header(parent.getContext());
                bindHeader(v, it);
                return v;
            }
            View v = old != null ? old : row(parent.getContext());
            bindRow(v, it);
            return v;
        }
    }

    /** A section's header (Material's list subheader): the accent's medium title, a quiet count at the end. */
    private View header(Context c) {
        LinearLayout h = new LinearLayout(c);
        h.setGravity(Gravity.CENTER_VERTICAL);
        h.setMinimumHeight(look.dp(40));
        h.setPadding(look.dp(16), look.dp(8), look.dp(16), look.dp(4));
        h.setBackgroundColor(look.app); // opaque: the sticky one lies over the rows
        TextView t = look.label(c, "", 14, look.accent);
        t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        h.addView(t, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView d = look.label(c, "", 12.5f, look.faint);
        d.setPaddingRelative(look.dp(12), 0, 0, 0);
        h.addView(d);
        h.setTag(new TextView[] { t, d });
        return h;
    }

    private void bindHeader(View v, PlaceItem it) {
        TextView[] parts = (TextView[]) v.getTag();
        parts[0].setText(it.title);
        parts[1].setText(it.detail);
        if (v == sticky) {
            v.setOnClickListener(it.path == null ? null : x -> on.open(it));
            v.setClickable(it.path != null);
        }
    }

    private static final class Holder { ImageView icon; TextView title, detail; ImageView more; }

    /** A list item: 56 dp at least, a 24 dp icon, the title over its supporting line, a 48 dp ⋮ at the end. */
    private View row(Context c) {
        LinearLayout r = new LinearLayout(c);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setMinimumHeight(look.dp(56));
        r.setBackground(look.pressable(0x00000000, 0, 0));
        Holder h = new Holder();
        h.icon = new ImageView(c);
        h.icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(look.dp(24), look.dp(24));
        ip.setMarginEnd(look.dp(16));
        r.addView(h.icon, ip);
        LinearLayout words = new LinearLayout(c);
        words.setOrientation(LinearLayout.VERTICAL);
        words.setPadding(0, look.dp(8), 0, look.dp(8));
        h.title = look.label(c, "", 16, look.text);
        h.title.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(h.title);
        h.detail = look.label(c, "", 13.5f, look.muted);
        h.detail.setSingleLine(true);
        h.detail.setEllipsize(TextUtils.TruncateAt.START); // a folder's path: its end is what tells it apart
        words.addView(h.detail);
        r.addView(words, new LinearLayout.LayoutParams(0, -2, 1f));
        h.more = new ImageView(c);
        h.more.setImageDrawable(look.icon(c, "more", look.muted));
        h.more.setScaleType(ImageView.ScaleType.CENTER);
        h.more.setBackground(look.pressable(0x00000000, 24, 0));
        h.more.setFocusable(false); // the row stays the list's item: a tap beside the ⋮ still opens
        h.more.setContentDescription("More options");
        r.addView(h.more, new LinearLayout.LayoutParams(look.dp(48), look.dp(48)));
        r.setTag(h);
        return r;
    }

    private void bindRow(View v, PlaceItem it) {
        Holder h = (Holder) v.getTag();
        boolean icon = it.icon != null;
        h.icon.setVisibility(icon ? View.VISIBLE : View.GONE);
        if (icon) h.icon.setImageDrawable(look.icon(getContext(), it.icon, it.folder ? look.accent : look.muted));
        h.title.setText(marked(it));
        h.title.setMaxLines(it.line > 0 ? 2 : 1); // a search hit's line may take two
        h.detail.setText(it.detail);
        h.detail.setVisibility(it.detail.isEmpty() ? View.GONE : View.VISIBLE);
        h.more.setVisibility(it.more ? View.VISIBLE : View.GONE);
        h.more.setOnClickListener(it.more ? x -> on.more(it, x) : null);
        v.setPaddingRelative(look.dp(16), 0, look.dp(it.more ? 4 : 16), 0);
        v.setAlpha(it.dim ? 0.55f : 1f);
        v.setContentDescription(it.title + (it.detail.isEmpty() ? "" : ", " + it.detail));
    }

    /** The title with the query's matches bold on the accent's soft tint. */
    private CharSequence marked(PlaceItem it) {
        if (it.marks.length == 0) return it.title;
        SpannableString s = new SpannableString(it.title);
        for (int i = 0; i + 1 < it.marks.length; i += 2) {
            int a = Math.max(0, it.marks[i]), b = Math.min(it.title.length(), it.marks[i + 1]);
            if (a >= b) continue;
            s.setSpan(new StyleSpan(Typeface.BOLD), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            s.setSpan(new BackgroundColorSpan(look.accentSoft), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            if (!look.eink) s.setSpan(new ForegroundColorSpan(look.text), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        return s;
    }
}
