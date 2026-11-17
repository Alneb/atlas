package org.atlas.plugins.audiobookshelf;

import android.content.Context;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.SeekBar;
import android.widget.TextView;

import org.atlas.capture.Look;
import org.atlas.capture.PlaceItem;
import org.atlas.capture.PlaceList;
import org.atlas.capture.TopBar;

import java.util.ArrayList;
import java.util.List;

/**
 * The player (the page's view.js on the phone) over the app's one player, MediaService: the cover, the book and its
 * chapter, the bar through the whole book, ⏮ chapter, −skip, play / pause, +skip, chapter ⏭, the speed (a tap steps
 * through them, kept on this device), the sleep timer (off, the chapter's end, 15 / 30 / 60 min), and the chapters,
 * the one playing marked, a tap going there. It only shows and commands the player: closing it does not stop the book,
 * and where you are reaches the server from the player's own reports (the plugin's `[media] progress`).
 */
final class PlayingView extends LinearLayout implements AbsScreen.Place {
    private final AbsScreen screen;
    private final Look look;
    private final TopBar bar;
    private final ImageView cover;
    private final TextView title, who, chapter, at, left, toggle, speed, sleep, error;
    private final SeekBar seek;
    private final PlaceList chapters;
    private final Runnable unwatch;
    private State state;
    private String coverOf = "";
    private boolean dragging;
    private List<Book.Chapter> listed;
    private int marked = -2;

    PlayingView(AbsScreen screen) {
        super(screen.getContext());
        this.screen = screen;
        this.look = screen.host.look();
        Context c = getContext();
        setOrientation(VERTICAL);
        setBackgroundColor(look.bg);
        bar = new TopBar(screen.host, () -> screen.host.activity().onBackPressed());
        bar.title("Now playing");
        bar.action("close", "Stop and close the player", () -> { screen.host.player("close", null); screen.host.activity().onBackPressed(); });
        addView(bar, new LayoutParams(-1, -2));

        LinearLayout top = new LinearLayout(c);
        top.setOrientation(VERTICAL);
        top.setGravity(Gravity.CENTER_HORIZONTAL);
        top.setPadding(look.dp(20), look.dp(12), look.dp(20), look.dp(4));
        cover = new ImageView(c);
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cover.setBackground(look.round(look.hover, 12, look.border));
        cover.setClipToOutline(true);
        top.addView(cover, new LayoutParams(look.dp(180), look.dp(180)));
        title = centered(c, 19, look.text);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(0, look.dp(12), 0, 0);
        top.addView(title, new LayoutParams(-1, -2));
        who = centered(c, 14, look.muted);
        top.addView(who, new LayoutParams(-1, -2));
        chapter = centered(c, 14.5f, look.accent);
        chapter.setPadding(0, look.dp(6), 0, 0);
        top.addView(chapter, new LayoutParams(-1, -2));

        seek = new SeekBar(c);
        seek.setPadding(look.dp(8), look.dp(12), look.dp(8), look.dp(4));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int v, boolean user) { if (user) at.setText(Clock.at(v)); }
            @Override public void onStartTrackingTouch(SeekBar s) { dragging = true; }
            @Override public void onStopTrackingTouch(SeekBar s) { dragging = false; screen.host.player("seek", String.valueOf(s.getProgress())); }
        });
        top.addView(seek, new LayoutParams(-1, -2));
        LinearLayout times = new LinearLayout(c);
        at = look.label(c, "0:00", 12.5f, look.muted);
        left = look.label(c, "", 12.5f, look.muted);
        left.setGravity(Gravity.END);
        times.addView(at, new LayoutParams(0, -2, 1));
        times.addView(left, new LayoutParams(0, -2, 1));
        top.addView(times, new LayoutParams(-1, -2));

        int skip = screen.abs.skip();
        LinearLayout keys = new LinearLayout(c);
        keys.setGravity(Gravity.CENTER);
        keys.setPadding(0, look.dp(8), 0, look.dp(4));
        keys.addView(key("⏮", "Previous chapter", () -> chapterBy(-1)));
        keys.addView(key("−" + skip, "Back " + skip + " seconds", () -> by(-skip)));
        toggle = key("▶", "Play", () -> { if (state != null) screen.host.player(state.playing ? "pause" : "resume", null); });
        toggle.setTextSize(26);
        toggle.setTextColor(look.accentFg);
        toggle.setBackground(look.round(look.accent, 32, 0));
        LayoutParams tp = new LayoutParams(look.dp(64), look.dp(64));
        tp.setMargins(look.dp(10), 0, look.dp(10), 0);
        keys.addView(toggle, tp);
        keys.addView(key("+" + skip, "Forward " + skip + " seconds", () -> by(skip)));
        keys.addView(key("⏭", "Next chapter", () -> chapterBy(1)));
        top.addView(keys, new LayoutParams(-1, -2));

        LinearLayout opts = new LinearLayout(c);
        opts.setGravity(Gravity.CENTER);
        speed = TopBar.chip(look, c, "1×", false, this::nextSpeed);
        speed.setContentDescription("Speed");
        sleep = TopBar.chip(look, c, "Sleep", false, this::sleepMenu);
        opts.addView(speed);
        opts.addView(TopBar.gap(look, c));
        opts.addView(sleep);
        top.addView(opts, new LayoutParams(-1, -2));
        error = centered(c, 13, look.red);
        error.setVisibility(GONE);
        top.addView(error, new LayoutParams(-1, -2));
        addView(top, new LayoutParams(-1, -2));

        chapters = new PlaceList(c, look, new PlaceList.On() {
            @Override public void open(PlaceItem it) { screen.host.player("seek", it.path); if (state != null && !state.playing) screen.host.player("resume", null); }
            @Override public void more(PlaceItem it, View anchor) {}
            @Override public void refresh() { chapters.setRefreshing(false); }
        });
        addView(chapters, new LayoutParams(-1, 0, 1));
        unwatch = screen.host.watchPlayer(this::state);
        screen.host.player("state", null);
    }

    private TextView centered(Context c, float sp, int color) {
        TextView t = look.label(c, "", sp, color);
        t.setGravity(Gravity.CENTER);
        return t;
    }

    /** A round key of the player's row, 52 dp. */
    private TextView key(String s, String what, Runnable run) {
        TextView t = look.label(getContext(), s, 17, look.text);
        t.setGravity(Gravity.CENTER);
        t.setContentDescription(what);
        t.setBackground(look.pressable(0, 26, 0));
        t.setOnClickListener(v -> run.run());
        t.setLayoutParams(new LayoutParams(look.dp(52), look.dp(52)));
        return t;
    }

    private void by(double seconds) { if (state != null) screen.host.player("seek", String.valueOf(Math.max(0, state.at + seconds))); }

    /** The chapter before (or, more than 3 s into one, its own start) or after. */
    private void chapterBy(int step) {
        if (state == null || state.chapters.isEmpty()) return;
        int i = state.chapter;
        int to = step < 0 ? (i >= 0 && state.at - state.chapters.get(i).start > 3 ? i : i - 1) : i + 1;
        if (to >= 0 && to < state.chapters.size()) screen.host.player("seek", String.valueOf(state.chapters.get(to).start));
    }

    private void nextSpeed() {
        double s = State.nextSpeed(state == null ? Abs.speed(getContext()) : state.speed);
        Abs.speed(getContext(), s);
        screen.host.player("speed", String.valueOf(s));
    }

    private void sleepMenu() {
        PopupMenu m = new PopupMenu(getContext(), sleep);
        String[] labels = { "Off", "End of chapter", "15 min", "30 min", "60 min" };
        int[] minutes = { 0, -1, 15, 30, 60 };
        for (int i = 0; i < labels.length; i++) m.getMenu().add(0, i, i, labels[i]);
        m.setOnMenuItemClickListener(it -> { screen.host.player("sleep", String.valueOf(minutes[it.getItemId()])); return true; });
        m.show();
    }

    private void state(String json) {
        State s = State.of(json);
        state = s != null && s.ours() ? s : null;
        if (state == null) {
            title.setText("Nothing playing");
            who.setText("");
            chapter.setText("");
            toggle.setText("▶");
            return;
        }
        title.setText(state.title);
        who.setText(state.author);
        chapter.setText(state.chapterTitle());
        String key = state.item;
        if (!key.equals(coverOf)) { coverOf = key; screen.covers.show(cover, key); }
        seek.setMax((int) Math.floor(state.duration));
        if (!dragging) { seek.setProgress((int) Math.floor(state.at)); at.setText(Clock.at(state.at)); }
        left.setText("−" + Clock.at(state.duration - state.at) + (state.speed != 1 ? " (" + Clock.at((state.duration - state.at) / state.speed) + " at " + State.speedLabel(state.speed) + ")" : ""));
        toggle.setText(state.playing ? "❚❚" : "▶");
        toggle.setContentDescription(state.playing ? "Pause" : "Play");
        speed.setText(State.speedLabel(state.speed));
        String z = Clock.sleep(state.sleep);
        sleep.setText(z.isEmpty() ? "Sleep" : "Sleep · " + z);
        error.setText(state.error);
        error.setVisibility(state.error.isEmpty() ? GONE : VISIBLE);
        if (listed != state.chapters && !sameChapters(listed, state.chapters) || marked != state.chapter) list();
    }

    private static boolean sameChapters(List<Book.Chapter> a, List<Book.Chapter> b) {
        if (a == null || a.size() != b.size()) return false;
        for (int i = 0; i < a.size(); i++) if (a.get(i).start != b.get(i).start || !a.get(i).title.equals(b.get(i).title)) return false;
        return true;
    }

    /** The chapters, the one playing marked (▶ and its line). */
    private void list() {
        listed = state.chapters;
        marked = state.chapter;
        List<PlaceItem> items = new ArrayList<>();
        if (!listed.isEmpty()) items.add(PlaceItem.header("Chapters"));
        for (int i = 0; i < listed.size(); i++) {
            Book.Chapter ch = listed.get(i);
            PlaceItem it = PlaceItem.row((i == marked ? "▶ " : "") + ch.title);
            it.detail = Clock.at(ch.start) + " · " + Clock.length(ch.end - ch.start) + (i == marked ? " · playing" : "");
            it.icon = "contents";
            it.dim = i < marked;
            it.path = String.valueOf(ch.start);
            items.add(it);
        }
        chapters.setItems(items, listed.isEmpty() ? "This one has no chapters." : null);
    }

    @Override public void closed() { unwatch.run(); }
}
