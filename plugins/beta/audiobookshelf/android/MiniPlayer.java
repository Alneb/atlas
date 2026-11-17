package org.atlas.plugins.audiobookshelf;

import android.graphics.Typeface;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.atlas.capture.Look;

/** The row along the bottom of every place while a book of this plugin is loaded in the app's player: its cover,
 *  title and chapter, play / pause; a tap opens the player. Hidden over the player itself. */
final class MiniPlayer extends LinearLayout {
    private final AbsScreen screen;
    private final ImageView cover;
    private final TextView title, chapter, toggle;
    private final Runnable unwatch;
    private State state;
    private boolean overPlayer;

    MiniPlayer(AbsScreen screen) {
        super(screen.getContext());
        this.screen = screen;
        Look look = screen.host.look();
        setGravity(Gravity.CENTER_VERTICAL);
        setPadding(look.dp(12), look.dp(6), look.dp(6), look.dp(6));
        setMinimumHeight(look.dp(64));
        setBackground(look.round(look.pop, 0, look.border));
        setElevation(look.elevation(3));
        cover = new ImageView(getContext());
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cover.setBackground(look.round(look.hover, 6, look.border));
        cover.setClipToOutline(true);
        addView(cover, new LayoutParams(look.dp(44), look.dp(44)));
        LinearLayout words = new LinearLayout(getContext());
        words.setOrientation(VERTICAL);
        words.setPadding(look.dp(12), 0, look.dp(8), 0);
        title = look.label(getContext(), "", 15, look.text);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        chapter = look.label(getContext(), "", 13, look.muted);
        chapter.setSingleLine(true);
        chapter.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(title);
        words.addView(chapter);
        addView(words, new LayoutParams(0, -2, 1));
        toggle = look.label(getContext(), "▶", 20, look.text);
        toggle.setGravity(Gravity.CENTER);
        toggle.setBackground(look.pressable(0, 24, 0));
        toggle.setOnClickListener(v -> { if (state != null) screen.host.player(state.playing ? "pause" : "resume", null); });
        addView(toggle, new LayoutParams(look.dp(48), look.dp(48)));
        setOnClickListener(v -> screen.playing());
        setVisibility(GONE);
        unwatch = screen.host.watchPlayer(this::state);
        screen.host.player("state", null); // said again: something may be playing already
    }

    private void state(String json) {
        State s = State.of(json);
        boolean changed = s == null || state == null || !s.item.equals(state.item) || !s.episode.equals(state.episode);
        state = s != null && s.ours() ? s : null;
        if (state != null) {
            title.setText(state.title);
            chapter.setText(state.chapterTitle().isEmpty() ? state.author : state.chapterTitle());
            toggle.setText(state.playing ? "❚❚" : "▶");
            toggle.setContentDescription(state.playing ? "Pause" : "Play");
            if (changed) screen.covers.show(cover, state.item);
        }
        show();
    }

    /** The place shown now: hidden over the player. */
    void shownOver(View place) { overPlayer = place instanceof PlayingView; show(); }

    private void show() { setVisibility(state != null && !overPlayer ? VISIBLE : GONE); }

    void closed() { unwatch.run(); }
}
