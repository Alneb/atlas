package org.atlas.plugins.notepad;

import java.util.ArrayList;
import java.util.List;

/** One thing undo takes back: items taken away (with where they stood) and items put in — a stroke, an erase, a
 *  partial erase (a stroke for its pieces), a shape snapped, a duplicate — or items moved, resized or turned, or
 *  recoloured — and pages added, removed or swapped (the page overview). */
final class Step {
    /** A snap's training record (Dataset): its verdict changes when this step is undone or redone. */
    org.json.JSONObject snapRecord;
    private final List<Item> removed = new ArrayList<>(), added = new ArrayList<>();
    private final List<Integer> at = new ArrayList<>();
    private List<Item> moved;
    private float dx, dy;
    private List<Item> transformed;
    private float ax, ay, scale = 1, turn;
    private final List<Page> pagesRemoved = new ArrayList<>(), pagesAdded = new ArrayList<>();
    private Page swapA, swapB;
    /** Pages moved with what is on them (Arrange in a grid): each page, its shift, its items. */
    private List<Page> shifted;
    private List<float[]> shifts;
    private List<List<Item>> shiftedItems;
    private List<Item> recolored;
    private List<String> oldColors;
    private String newColor;
    private List<Item> relinked;
    private List<String> oldLinks;
    private String newLink;

    boolean empty() { return removed.isEmpty() && added.isEmpty() && moved == null && recolored == null && transformed == null && relinked == null
        && pagesRemoved.isEmpty() && pagesAdded.isEmpty() && swapA == null && shifted == null; }

    /** The pages laid out in the scene's grid, in their order, each with what is on it (done here; one undo). Null when
     *  they already are. */
    static Step arranged(Scene s) {
        if (s.pages.isEmpty()) return null;
        float x0 = Float.MAX_VALUE, y0 = Float.MAX_VALUE;
        for (Page p : s.pages) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); }
        List<Page> order = new ArrayList<>(s.pages);
        List<List<Item>> on = new ArrayList<>();
        for (Page p : order) on.add(s.itemsOn(p)); // all read before anything moves: a page lands where another stood
        Step st = new Step();
        st.shifted = new ArrayList<>(); st.shifts = new ArrayList<>(); st.shiftedItems = new ArrayList<>();
        for (int i = 0; i < order.size(); i++) {
            android.graphics.RectF to = s.slot(x0, y0, i);
            float dx = to.left - order.get(i).r.left, dy = to.top - order.get(i).r.top;
            if (dx == 0 && dy == 0) continue;
            st.shifted.add(order.get(i)); st.shifts.add(new float[] { dx, dy }); st.shiftedItems.add(on.get(i));
        }
        if (st.shifted.isEmpty()) return null;
        st.shift(s, 1);
        return st;
    }

    private void shift(Scene s, int sign) {
        for (int i = 0; i < shifted.size(); i++) {
            float dx = shifts.get(i)[0] * sign, dy = shifts.get(i)[1] * sign;
            shifted.get(i).r.offset(dx, dy);
            s.changed(shifted.get(i));
            for (Item it : shiftedItems.get(i)) { it.moveBy(dx, dy); s.changed(it); }
        }
        s.sortPages();
    }

    /** Page `p` put in (a new page, a duplicate). */
    void addPage(Scene s, Page p) {
        s.putPage(p);
        pagesAdded.add(p);
    }

    /** Page `p` taken out (its items taken out by `remove` in the same step). */
    void removePage(Scene s, Page p) {
        if (s.removePage(p) >= 0) pagesRemoved.add(p);
    }

    /** Pages `a` and `b` swapped (done here). */
    static Step swapped(Scene s, Page a, Page b) {
        Step st = new Step();
        s.swapPages(a, b);
        st.swapA = a;
        st.swapB = b;
        return st;
    }

    /** `it` put in the scene, on top. */
    void add(Scene s, Item it) {
        s.add(it, -1);
        added.add(it);
    }

    /** `it` taken out; a piece put in by this same step just goes (it never was, as far as undo knows). */
    void remove(Scene s, Item it) {
        int where = s.remove(it);
        if (where < 0) return;
        if (added.remove(it)) return;
        removed.add(it);
        at.add(where);
    }

    static Step moved(List<Item> items, float dx, float dy) {
        Step st = new Step();
        st.moved = new ArrayList<>(items);
        st.dx = dx;
        st.dy = dy;
        return st;
    }

    /** `items` scaled by `s` and turned by `a` about (ax, ay) (done already, by the handles). */
    static Step transformed(List<Item> items, float ax, float ay, float s, float a) {
        Step st = new Step();
        st.transformed = new ArrayList<>(items);
        st.ax = ax; st.ay = ay; st.scale = s; st.turn = a;
        return st;
    }

    /** `items` given colour `c` (done here). */
    static Step recolor(Scene s, List<Item> items, String c) {
        Step st = new Step();
        st.recolored = new ArrayList<>(items);
        st.oldColors = new ArrayList<>();
        st.newColor = c;
        for (Item it : items) { st.oldColors.add(it.color()); it.setColor(c); s.changed(it); }
        return st;
    }

    /** `items` linked to `link` (null: unlinked) (done here). */
    static Step relink(Scene s, List<Item> items, String link) {
        Step st = new Step();
        st.relinked = new ArrayList<>(items);
        st.oldLinks = new ArrayList<>();
        st.newLink = link;
        for (Item it : items) { st.oldLinks.add(it.link()); it.setLink(link); s.changed(it); }
        return st;
    }

    void undo(Scene s) {
        if (relinked != null) for (int i = 0; i < relinked.size(); i++) { relinked.get(i).setLink(oldLinks.get(i)); s.changed(relinked.get(i)); }
        if (moved != null) { for (Item it : moved) { it.moveBy(-dx, -dy); s.changed(it); } s.follow(moved, -dx, -dy, 0, 0, 1, 0); }
        if (transformed != null) { for (Item it : transformed) { it.transform(ax, ay, 1 / scale, -turn, s.host); s.changed(it); } s.follow(transformed, 0, 0, ax, ay, 1 / scale, -turn); }
        if (recolored != null) for (int i = 0; i < recolored.size(); i++) { recolored.get(i).setColor(oldColors.get(i)); s.changed(recolored.get(i)); }
        if (swapA != null) s.swapPages(swapA, swapB);
        if (shifted != null) shift(s, -1);
        for (Page p : pagesAdded) s.removePage(p);
        for (Page p : pagesRemoved) s.putPage(p);
        for (Item it : added) s.remove(it);
        // back where they stood, last removed first: each index was taken after the removals before it
        for (int i = removed.size() - 1; i >= 0; i--) s.add(removed.get(i), at.get(i));
    }

    void redo(Scene s) {
        for (Page p : pagesRemoved) s.removePage(p);
        for (Page p : pagesAdded) s.putPage(p);
        if (swapA != null) s.swapPages(swapA, swapB);
        if (shifted != null) shift(s, 1);
        for (Item it : removed) s.remove(it);
        for (Item it : added) s.add(it, -1);
        if (recolored != null) for (Item it : recolored) { it.setColor(newColor); s.changed(it); }
        if (relinked != null) for (Item it : relinked) { it.setLink(newLink); s.changed(it); }
        if (moved != null) { for (Item it : moved) { it.moveBy(dx, dy); s.changed(it); } s.follow(moved, dx, dy, 0, 0, 1, 0); }
        if (transformed != null) { for (Item it : transformed) { it.transform(ax, ay, scale, turn, s.host); s.changed(it); } s.follow(transformed, 0, 0, ax, ay, scale, turn); }
    }
}
