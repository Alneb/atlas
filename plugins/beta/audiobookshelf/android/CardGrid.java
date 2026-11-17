package org.atlas.plugins.audiobookshelf;

import android.view.View;
import android.view.ViewGroup;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.GridView;
import android.widget.ListView;

import org.atlas.capture.Look;
import org.atlas.capture.Tile;

import java.util.ArrayList;
import java.util.List;

/** Cards as covers in a grid, or as a list (a cover small at the start): the library's books and a group's. One list
 *  view, its rows made only for what is on screen. */
final class CardGrid {
    private CardGrid() {}

    static final class Adapter extends BaseAdapter {
        private final AbsScreen screen;
        private final boolean grid;
        List<Cards.Card> cards = new ArrayList<>();

        Adapter(AbsScreen screen, boolean grid) { this.screen = screen; this.grid = grid; }

        @Override public int getCount() { return cards.size(); }
        @Override public Object getItem(int i) { return cards.get(i); }
        @Override public long getItemId(int i) { return i; }

        @Override public View getView(int i, View old, ViewGroup parent) {
            Tile t = old instanceof Tile ? (Tile) old : new Tile(screen.host.look(), parent.getContext(), grid);
            screen.bind(t, cards.get(i));
            return t;
        }
    }

    /** The view for `adapter` (a tap opens its card). */
    static AbsListView of(AbsScreen screen, Adapter adapter, boolean grid) {
        Look look = screen.host.look();
        AbsListView list;
        if (grid) {
            GridView g = new GridView(screen.getContext());
            g.setColumnWidth(look.dp(112));
            g.setNumColumns(GridView.AUTO_FIT);
            g.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
            g.setHorizontalSpacing(look.dp(10));
            g.setVerticalSpacing(look.dp(14));
            g.setPadding(look.dp(12), look.dp(8), look.dp(12), look.dp(16));
            list = g;
        } else {
            ListView l = new ListView(screen.getContext());
            l.setDivider(null);
            l.setPadding(0, look.dp(4), 0, look.dp(16));
            list = l;
        }
        list.setClipToPadding(false);
        list.setSelector(new android.graphics.drawable.ColorDrawable(0));
        list.setAdapter(adapter);
        list.setOnItemClickListener((p, v, i, id) -> screen.open(adapter.cards.get(i)));
        return list;
    }
}
