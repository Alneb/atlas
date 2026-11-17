package org.atlas.plugins.audiobookshelf;

import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;
import org.atlas.capture.Tile;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The plugin's frame, a stack of places as a listening app has them: the home (HomeView: Continue listening, the
 * server's shelves, search), the library (LibraryView: books, series, authors, collections, playlists), a group of
 * books (GroupView), a book (BookView), the player (PlayingView). Back goes down one; past the first the app takes it.
 * A mini player row along the bottom while something of this plugin plays opens the player. What it opens on:
 * Audiobookshelf's places (Audiobookshelf.java).
 */
final class AbsScreen extends FrameLayout implements NativePlugin.Back {
    final Host host;
    final Abs abs;
    final Covers covers;
    final ExecutorService io = Executors.newFixedThreadPool(2);
    private final FrameLayout places;
    private final List<View> stack = new ArrayList<>();
    private final MiniPlayer mini;

    AbsScreen(Host host, String path) {
        super(host.activity());
        this.host = host;
        this.abs = new Abs(host);
        this.covers = new Covers(this);
        setBackgroundColor(host.look().bg);
        LinearLayout col = new LinearLayout(getContext());
        col.setOrientation(LinearLayout.VERTICAL);
        places = new FrameLayout(getContext());
        col.addView(places, new LinearLayout.LayoutParams(-1, 0, 1));
        mini = new MiniPlayer(this);
        col.addView(mini, new LinearLayout.LayoutParams(-1, -2));
        addView(col, new LayoutParams(-1, -1));
        if (!abs.on()) { push(notSet()); return; }
        if (path.startsWith(Audiobookshelf.BOOK)) book(path.substring(Audiobookshelf.BOOK.length()), null);
        else if (path.startsWith(Audiobookshelf.PLAY)) { // another plugin's ▶: the book's screen, the book played over it
            String id = path.substring(Audiobookshelf.PLAY.length());
            book(id, null);
            play(id, null, Double.NaN);
        }
        else if (path.equals(Audiobookshelf.LIBRARY)) push(new LibraryView(this));
        else if (path.equals(Audiobookshelf.PLAYING)) { push(new HomeView(this)); playing(); } // Back goes home
        else push(new HomeView(this));
    }

    /** No server yet: what to do, and the plugin's settings. */
    private View notSet() {
        LinearLayout v = new LinearLayout(getContext());
        v.setOrientation(LinearLayout.VERTICAL);
        v.setGravity(Gravity.CENTER);
        int p = host.look().dp(32);
        v.setPadding(p, p, p, p);
        TextView t = host.look().label(getContext(), "Set your Audiobookshelf's address in the plugin's settings, then sign in from the plugin's page on the desktop or here (the command “Audiobookshelf: sign in”).", 15, host.look().muted);
        t.setGravity(Gravity.CENTER);
        v.addView(t);
        return v;
    }

    // ---- the stack ----

    void push(View v) {
        if (!stack.isEmpty()) stack.get(stack.size() - 1).setVisibility(GONE);
        stack.add(v);
        places.addView(v, new LayoutParams(-1, -1));
        mini.shownOver(v);
        if (host.eink()) post(host::einkRefresh);
    }

    private void pop() {
        View gone = stack.remove(stack.size() - 1);
        places.removeView(gone);
        if (gone instanceof Place) ((Place) gone).closed();
        View top = stack.get(stack.size() - 1);
        top.setVisibility(VISIBLE);
        if (top instanceof Place) ((Place) top).returned();
        mini.shownOver(top);
        if (host.eink()) post(host::einkRefresh);
    }

    /** A screen of the stack told when it is shown again (a book's progress may have moved) or let go. */
    interface Place {
        default void returned() {}
        default void closed() {}
    }

    void library() { push(new LibraryView(this)); }

    /** A book's screen (`known`: its card, for the title and cover at once). */
    void book(String id, Cards.Card known) { push(new BookView(this, id, known)); }

    /** A group's cards (a series, a collection, a playlist, an author's books, a podcast's episodes). */
    void group(Cards.Card g) { push(new GroupView(this, g)); }

    /** The player, over what is shown. */
    void playing() { if (!(top() instanceof PlayingView)) push(new PlayingView(this)); }

    private View top() { return stack.isEmpty() ? null : stack.get(stack.size() - 1); }

    /** A card tapped anywhere: a group opens, a book its screen, an episode plays, a podcast its episodes. */
    void open(Cards.Card c) {
        if (c.group() || c.kind == Cards.Kind.SHOW) group(c);
        else if (c.kind == Cards.Kind.EPISODE) play(c.id, c.episode, Double.NaN);
        else book(c.id, c);
    }

    /** `item` (or its `episode`) played from `from` (NaN: where the server says), the player shown. */
    void play(String item, String episode, double from) {
        host.toast("Opening…");
        io.execute(() -> {
            try {
                abs.play(item, episode, from, covers.bytes(item));
                post(this::playing);
            } catch (Exception e) { host.toast("Not opened: " + e.getMessage()); }
        });
    }

    /** A card drawn on a tile: its cover, title, line, and how far on the badge. */
    void bind(Tile t, Cards.Card c) {
        t.title.setText(c.title);
        t.detail.setText(c.detail());
        boolean begun = c.progress > 0 && c.progress < 1;
        t.badge.setText(c.progress >= 1 ? "✓" : begun ? Math.round(c.progress * 100) + "%" : "");
        t.badge.setVisibility(c.progress > 0 ? VISIBLE : GONE);
        t.setContentDescription(c.title + ", " + c.detail());
        covers.show(t.cover, c.coverItem());
    }

    @Override public boolean back() {
        View top = top();
        if (top instanceof NativePlugin.Back && ((NativePlugin.Back) top).back()) return true;
        if (stack.size() > 1) { pop(); return true; }
        return false;
    }

    @Override protected void onDetachedFromWindow() {
        for (View v : stack) if (v instanceof Place) ((Place) v).closed();
        mini.closed();
        io.shutdownNow();
        covers.close();
        super.onDetachedFromWindow();
    }
}
