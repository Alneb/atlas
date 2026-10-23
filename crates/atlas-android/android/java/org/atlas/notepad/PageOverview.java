package org.atlas.notepad;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** Pages → All pages: every page small, as Boox Notes' page overview. A tap goes to the page; a long press moves it
 *  earlier or later, duplicates or deletes it — each one undoable step. A full-screen dialog over the drawing. */
final class PageOverview {
    private final NotepadView n;
    private final Context a;
    private final Dialog dialog;
    private final LinearLayout grid;
    private final Painter painter = new Painter();

    PageOverview(NotepadView n) {
        this.n = n;
        this.a = n.host.activity();
        painter.files(n.scene.files);
        painter.linked((file, page, px) -> org.atlas.capture.PageSource.page(n.host, file, page, px, this::pagesCame)); // linked PDF pages, drawn on the fly
        dialog = new Dialog(a, android.R.style.Theme_DeviceDefault_Light_NoActionBar_Fullscreen);
        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(n.look.bg);
        LinearLayout top = new LinearLayout(a);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(n.look.dp(4), 0, n.look.dp(16), 0);
        ImageView close = new ImageView(a);
        close.setImageDrawable(n.look.icon(a, "close", n.look.text));
        close.setScaleType(ImageView.ScaleType.CENTER);
        close.setContentDescription("Close the page overview");
        close.setOnClickListener(v -> dialog.dismiss());
        top.addView(close, new LinearLayout.LayoutParams(n.look.dp(48), n.look.dp(48)));
        TextView title = n.look.label(a, "Pages", 17, n.look.text);
        title.setPadding(n.look.dp(4), 0, 0, 0);
        top.addView(title, new LinearLayout.LayoutParams(0, n.look.dp(56), 1f));
        top.addView(n.look.label(a, "Long press a page for more", 13, n.look.muted));
        root.addView(top);
        View line = new View(a);
        line.setBackgroundColor(n.look.borderStrong);
        root.addView(line, new LinearLayout.LayoutParams(-1, Math.max(1, n.look.dp(1))));
        ScrollView scroll = new ScrollView(a);
        grid = new LinearLayout(a);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(n.look.dp(8), n.look.dp(8), n.look.dp(8), n.look.dp(24));
        scroll.addView(grid);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));
        dialog.setContentView(root);
        dialog.setOnDismissListener(d -> { n.pad.repaintAfterEdit(); n.host.einkRefresh(); });
    }

    void show() {
        fill();
        dialog.show();
    }

    /** The pages in rows: as many to a row as fit at ~180 dp each (three on a Boox Note Air, two on a phone). */
    /** Linked PDF pages arrived (PageSource): the thumbnails drawn again once they stop coming. */
    private final Runnable refill = this::fill;
    private void pagesCame() { this.grid.removeCallbacks(refill); this.grid.postDelayed(refill, 300); }

    private void fill() {
        grid.removeAllViews();
        int width = a.getResources().getDisplayMetrics().widthPixels - n.look.dp(16);
        int cols = Math.max(2, width / n.look.dp(180));
        int tw = width / cols - n.look.dp(16);
        int here = n.currentPage();
        LinearLayout row = null;
        for (int i = 0; i < n.scene.pages.size(); i++) {
            if (i % cols == 0) {
                row = new LinearLayout(a);
                grid.addView(row);
            }
            row.addView(cell(i, tw, i == here), new LinearLayout.LayoutParams(width / cols, -2));
        }
        n.host.einkRefresh();
    }

    private View cell(int i, int tw, boolean here) {
        Page p = n.scene.pages.get(i);
        LinearLayout c = new LinearLayout(a);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        c.setPadding(n.look.dp(8), n.look.dp(8), n.look.dp(8), n.look.dp(8));
        ImageView img = new ImageView(a);
        img.setImageBitmap(thumbnail(p, tw));
        int edge = n.look.dp(here ? 3 : 1);
        img.setPadding(edge, edge, edge, edge);
        img.setBackground(n.look.round(Color.WHITE, 4, here ? (n.look.eink ? Color.BLACK : n.look.accent) : n.look.borderStrong));
        c.addView(img, new LinearLayout.LayoutParams(-2, -2));
        String name = (i + 1) + (Scene.numbered(p.name) ? "" : " · " + p.name);
        TextView label = n.look.label(a, name, 14, here ? n.look.text : n.look.muted);
        label.setGravity(Gravity.CENTER);
        label.setPadding(0, n.look.dp(6), 0, 0);
        c.addView(label);
        c.setContentDescription("Page " + name + (here ? ", open now" : "") + ". Long press to move, duplicate or delete it");
        c.setOnClickListener(v -> { dialog.dismiss(); n.toPage(i); });
        c.setOnLongClickListener(v -> { actions(p); return true; });
        return c;
    }

    /** The page drawn `tw` pixels wide: its paper and its items, as the canvas draws them. */
    private Bitmap thumbnail(Page p, int tw) {
        float s = tw / p.r.width();
        Bitmap b = Bitmap.createBitmap(Math.max(1, tw), Math.max(1, Math.round(p.r.height() * s)), Bitmap.Config.ARGB_8888);
        b.eraseColor(Color.WHITE);
        Canvas c = new Canvas(b);
        c.scale(s, s);
        c.translate(-p.r.left, -p.r.top);
        c.clipRect(p.r);
        Paint rule = new Paint(Paint.ANTI_ALIAS_FLAG);
        rule.setStyle(Paint.Style.STROKE);
        rule.setColor(n.look.eink ? 0xffb4b4b4 : 0xffd9dde3);
        p.drawPaper(c, rule, s);
        List<Item> on = n.scene.itemsOn(p);
        for (int pass = 0; pass < 2; pass++) for (Item it : on) if (it.under() == (pass == 0)) it.draw(c, painter); // as the canvas: highlighter under
        return b;
    }

    /** A long press: what can be done with the page (only what makes sense where it stands). */
    private void actions(Page p) {
        int i = n.scene.pages.indexOf(p);
        List<String> names = new ArrayList<>();
        List<Runnable> does = new ArrayList<>();
        if (i > 0) { names.add("Move earlier"); does.add(() -> n.done(Step.swapped(n.scene, p, n.scene.pages.get(i - 1)))); }
        if (i < n.scene.pages.size() - 1) { names.add("Move later"); does.add(() -> n.done(Step.swapped(n.scene, p, n.scene.pages.get(i + 1)))); }
        names.add("Duplicate (as the last page)");
        does.add(() -> duplicate(p));
        if (n.scene.pages.size() > 1) { names.add("Delete"); does.add(() -> delete(p)); }
        new AlertDialog.Builder(a).setTitle("Page " + (i + 1))
            .setItems(names.toArray(new String[0]), (d, w) -> { does.get(w).run(); fill(); })
            .setNegativeButton("Cancel", null).show();
    }

    /** A copy of the page and its items under the last page, its paper too. */
    private void duplicate(Page p) {
        Step st = new Step();
        Page q = n.scene.nextPage();
        q.paper = p.paper;
        float dx = q.r.left - p.r.left, dy = q.r.top - p.r.top;
        List<Item> on = n.scene.itemsOn(p);
        st.addPage(n.scene, q);
        for (Item c : Scene.copied(on, n.scene.ids, dx, dy)) {
            c.setFrame(q.id);
            st.add(n.scene, c);
        }
        n.done(st);
    }

    /** The page and everything on it gone (undo brings them back). */
    private void delete(Page p) { n.deletePage(p); }
}
