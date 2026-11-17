package org.atlas.plugins.audiobookshelf;

import android.view.Gravity;
import android.widget.AbsListView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.atlas.capture.Look;
import org.atlas.capture.TopBar;

import java.util.List;
import java.util.Map;

/** A group's books as covers: a series, a collection, a playlist (books and episodes, in its order), an author's books
 *  (asked when opened), a podcast's episodes (newest first, asked when opened; a tap plays one). */
final class GroupView extends LinearLayout {
    private final AbsScreen screen;
    private final CardGrid.Adapter adapter;
    private final TextView status;

    GroupView(AbsScreen screen, Cards.Card g) {
        super(screen.getContext());
        this.screen = screen;
        Look look = screen.host.look();
        setOrientation(VERTICAL);
        setBackgroundColor(look.bg);
        TopBar bar = new TopBar(screen.host, () -> screen.host.activity().onBackPressed());
        bar.title(g.title);
        String kind = g.kind == Cards.Kind.SHOW ? "Podcast" : g.kind.name().charAt(0) + g.kind.name().substring(1).toLowerCase(java.util.Locale.ROOT);
        bar.sub(kind + (g.kind == Cards.Kind.SHOW ? (g.author.isEmpty() ? "" : " · " + g.author) : " · " + g.detail()));
        addView(bar, new LayoutParams(-1, -2));
        boolean episodes = g.kind == Cards.Kind.SHOW;
        adapter = new CardGrid.Adapter(screen, !episodes);
        AbsListView list = CardGrid.of(screen, adapter, !episodes);
        FrameLayout body = new FrameLayout(getContext());
        body.addView(list, new FrameLayout.LayoutParams(-1, -1));
        status = look.label(getContext(), "", 15, look.muted);
        status.setGravity(Gravity.CENTER);
        body.addView(status, new FrameLayout.LayoutParams(-1, -1));
        addView(body, new LayoutParams(-1, 0, 1));
        if (episodes || g.kind == Cards.Kind.AUTHOR && g.cards.isEmpty()) load(g);
        else shown(g.cards, null);
    }

    private void load(Cards.Card g) {
        status.setText("Asking the server…");
        screen.io.execute(() -> {
            try {
                Map<String, Object> p = Cards.progressMap(screen.abs.me());
                List<Cards.Card> cards = g.kind == Cards.Kind.SHOW ? Cards.episodesOf(screen.abs.item(g.id), p)
                    : Cards.authorBooks(screen.abs.get("/api/authors/" + Abs.q(g.id) + "?include=items"), p);
                post(() -> shown(cards, null));
            } catch (Exception e) { post(() -> shown(java.util.Collections.emptyList(), "Not listed: " + e.getMessage())); }
        });
    }

    private void shown(List<Cards.Card> cards, String why) {
        adapter.cards = cards;
        adapter.notifyDataSetChanged();
        status.setText(why != null ? why : cards.isEmpty() ? "Nothing in it." : "");
        status.setVisibility(status.getText().length() == 0 ? GONE : VISIBLE);
        if (screen.host.eink()) post(screen.host::einkRefresh);
    }
}
