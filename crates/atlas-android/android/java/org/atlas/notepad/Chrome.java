package org.atlas.notepad;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.Look;

import java.util.ArrayList;
import java.util.List;

/** Notepad's controls laid out as Excalidraw lays out its own. The page fills the screen; the
 *  controls float over it in rounded islands: the menu and the title at the top left, the tools in the middle (at the
 *  bottom on a phone), the pages at the top right; the tool in hand shows its options in a panel at the left
 *  (Excalidraw's "Stroke", "Stroke width", "Font size", "Actions"), hidden and shown by a second tap on the tool. On
 *  e-ink no shadows (a border marks each island), and Onyx's quick ink never draws under them (`keepOut`). */
final class Chrome {
    private final NotepadView n;
    private final Look look;
    private final Context c;
    /** A phone (< 600 dp): the panel across the bottom, above the tools, and closed at first. */
    final boolean compact;
    private final Typeface ui, uiBold;
    private final View menuIsland, pageIsland, toolIsland;
    private final ScrollView panelBox;
    private final LinearLayout panel, favourites;
    private final TextView pageLabel;
    private final View[] toolButtons = new View[NotepadView.Tool.values().length];
    private final ImageView shapeIcon;
    /** Whether the tool in hand shows its options (a selection always shows its own). */
    boolean panelOpen;
    /** The side panel shown or hidden by hand: kept for the next drawing while the app runs. */
    private static Boolean panelChosen;
    /** What the panel and the favourites were last built for: rebuilt only when it changes (on e-ink every rebuild
     *  repaints that part of the panel). */
    private String panelKey = "", favouritesKey = "";

    Chrome(NotepadView n, FrameLayout stage) {
        this.n = n;
        this.look = n.look;
        this.c = n.host.activity();
        this.compact = c.getResources().getConfiguration().smallestScreenWidthDp < 600;
        this.panelOpen = panelChosen != null ? panelChosen : !compact;
        Typeface regular = n.host.font("assistant"), bold = n.host.font("assistant_semibold");
        this.ui = regular != null ? regular : Typeface.DEFAULT;
        this.uiBold = bold != null ? bold : Typeface.DEFAULT_BOLD;
        int gap = look.dp(12);

        // the menu and the drawing's name
        LinearLayout menu = island();
        menu.addView(button("menu", "Menu: close, the file, the screen", n::mainMenu));
        TextView title = text(name(n.path), 15, look.text, false);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setMaxWidth(look.dp(compact ? 120 : 220));
        title.setPadding(look.dp(2), 0, look.dp(10), 0);
        menu.addView(title);
        menu.addView(button("palette", "The tool's options: show / hide the side panel", v -> setPanel(!panelOpen)));
        menuIsland = menu;
        stage.addView(menu, at(Gravity.TOP | Gravity.START, gap, gap));

        // the tools: what the pen does, then the favourite pens, then undo and redo
        LinearLayout tools = island();
        for (NotepadView.Tool t : NotepadView.Tool.values()) {
            View b = button(t.icon, t.what, v -> n.pick(t));
            toolButtons[t.ordinal()] = b;
            tools.addView(b);
        }
        shapeIcon = (ImageView) toolButtons[NotepadView.Tool.SHAPE.ordinal()];
        tools.addView(button("image", "Insert: a picture, a photo, a link to a note or file, a page of a PDF", n::pictureMenu));
        favourites = new LinearLayout(c);
        favourites.setGravity(Gravity.CENTER_VERTICAL);
        tools.addView(favourites);
        tools.addView(divider());
        tools.addView(button("undo", "Undo (or tap with two fingers)", v -> n.undoOnce()));
        tools.addView(button("redo", "Redo (or tap with three fingers)", v -> n.redoOnce()));
        HorizontalScrollView toolScroll = new HorizontalScrollView(c); // a phone narrower than the island: it slides
        toolScroll.setHorizontalScrollBarEnabled(false);
        toolScroll.setClipToPadding(false);
        toolScroll.addView(tools);
        toolIsland = toolScroll;
        tools.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> { if (r - l != or - ol) v.post(this::placeTools); }); // a favourite more or less
        FrameLayout.LayoutParams tp = at(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL, gap, gap); // placeTools() lifts it when it fits
        tp.width = ViewGroup.LayoutParams.WRAP_CONTENT;
        stage.addView(toolScroll, tp);

        // the pages: previous, which of how many (a tap: all of them), next, the pages' menu
        LinearLayout pages = island();
        pages.addView(button("chevron_left", "Previous page", v -> n.toPage(n.currentPage() - 1)));
        pageLabel = text("", 14, look.text, false);
        pageLabel.setGravity(Gravity.CENTER);
        pageLabel.setMinWidth(look.dp(44));
        pageLabel.setContentDescription("All pages");
        pageLabel.setTooltipText("All pages");
        pageLabel.setOnClickListener(v -> n.overview());
        pages.addView(pageLabel, new LinearLayout.LayoutParams(-2, look.dp(44)));
        pages.addView(button("chevron", "Next page (on the last: a new page)", v -> n.nextPage()));
        pages.addView(button("pages", "Pages: add one, see them all, its paper, paste", n::pageMenu));
        // the page alone, one tap away (not three menus deep)
        pages.addView(button("maximize", "Full screen: the page alone (the corner button or Back brings the controls back)", v -> n.setBare(NotepadView.Bare.FULL_SCREEN)));
        pageIsland = pages;
        stage.addView(pages, at(Gravity.TOP | Gravity.END, gap, gap));

        // the tool's options, under the menu (above the tools on a phone)
        panel = new LinearLayout(c);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(look.dp(12), look.dp(4), look.dp(12), look.dp(12));
        panelBox = new ScrollView(c) {
            @Override protected void onMeasure(int w, int h) { // at most most of the page's height: it scrolls past that
                int cap = (int) (((View) getParent()).getHeight() * (compact ? 0.45f : 0.75f));
                super.onMeasure(w, cap > 0 ? MeasureSpec.makeMeasureSpec(cap, MeasureSpec.AT_MOST) : h);
            }
        };
        panelBox.setBackground(look.round(look.bg, 10, look.eink ? look.borderStrong : look.border));
        panelBox.setElevation(look.elevation(3));
        panelBox.addView(panel);
        FrameLayout.LayoutParams pp = compact
            ? at(Gravity.BOTTOM | Gravity.START, gap, gap + look.dp(56))
            : at(Gravity.TOP | Gravity.START, gap, gap + look.dp(56));
        pp.width = compact ? ViewGroup.LayoutParams.MATCH_PARENT : look.dp(224);
        if (compact) pp.rightMargin = gap;
        stage.addView(panelBox, pp);

        // the quick ink kept out of wherever they land
        View.OnLayoutChangeListener moved = (v, l, t, r, b, ol, ot, or, ob) -> { if (l != ol || t != ot || r != or || b != ob) n.pad.quickArea(); };
        for (View v : new View[] { menuIsland, toolIsland, pageIsland, panelBox }) v.addOnLayoutChangeListener(moved);
        stage.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> { if (r - l != or - ol) v.post(this::placeTools); });
    }

    /** The tools between the menu and the pages at the top, as Excalidraw has them, when the three fit side by side;
     *  else at the bottom (a phone, a tablet held upright with many favourites). Again whenever the width changes. */
    private void placeTools() {
        View row = ((ViewGroup) toolIsland).getChildAt(0);
        int width = ((View) toolIsland.getParent()).getWidth(), gap = look.dp(12);
        boolean top = width > 0 && menuIsland.getWidth() + row.getWidth() + pageIsland.getWidth() + 4 * gap <= width;
        FrameLayout.LayoutParams p = (FrameLayout.LayoutParams) toolIsland.getLayoutParams();
        int want = (top ? Gravity.TOP : Gravity.BOTTOM) | Gravity.CENTER_HORIZONTAL;
        if (p.gravity == want) return;
        p.gravity = want;
        p.topMargin = top ? gap : 0;
        p.bottomMargin = top ? 0 : gap;
        toolIsland.setLayoutParams(p);
    }

    // ---- what changes ---------------------------------------------------------------------------------------------

    /** The controls as the notepad now is: the tool in hand marked, the page, the panel for the tool or the selection. */
    void draw() {
        for (NotepadView.Tool t : NotepadView.Tool.values()) mark(toolButtons[t.ordinal()], n.tool == t);
        shapeIcon.setImageDrawable(look.icon(c, n.tool == NotepadView.Tool.SHAPE ? n.shape.icon : "shapes", iconColor(n.tool == NotepadView.Tool.SHAPE)));
        int p = n.currentPage();
        pageLabel.setText(n.scene.pages.isEmpty() ? "—" : (p + 1) + " / " + n.scene.pages.size());
        drawFavourites();
        drawPanel();
    }

    /** The parts of the page the controls cover (flat l,t,r,b in the page's pixels, a little wider): Onyx's quick ink
     *  ends a stroke that touches one, so a line written under a control is drawn by the app alone. */
    int[] keepOut() {
        List<View> shown = new ArrayList<>();
        for (View v : new View[] { menuIsland, toolIsland, pageIsland, panelBox, fullOut }) if (v != null && v.getVisibility() == View.VISIBLE && v.getWidth() > 0) shown.add(v);
        int[] out = new int[shown.size() * 4];
        int m = look.dp(4);
        for (int i = 0; i < shown.size(); i++) {
            View v = shown.get(i);
            out[4 * i] = v.getLeft() - m; out[4 * i + 1] = v.getTop() - m; out[4 * i + 2] = v.getRight() + m; out[4 * i + 3] = v.getBottom() + m;
        }
        return out;
    }

    /** How far down the page starts when one is shown whole: under the top islands. */
    int topInset() { return bare != NotepadView.Bare.NONE ? 0 : menuIsland.getBottom() + look.dp(8); }

    /** Excalidraw's UI font on every text in `v` (the menus' cards too). */
    void font(View v) {
        if (v instanceof TextView) { TextView t = (TextView) v; t.setTypeface(t.getTypeface() != null && t.getTypeface().isBold() ? uiBold : ui); }
        if (v instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) font(((ViewGroup) v).getChildAt(i));
    }

    // ---- the panel ------------------------------------------------------------------------------------------------

    private enum Kind { NONE, SELECTION, PEN, SHAPE, TEXT, ERASER }

    private Kind kind() {
        if (!n.chosen.isEmpty()) return Kind.SELECTION;
        if (!panelOpen) return Kind.NONE;
        switch (n.tool) {
            case PEN: return Kind.PEN;
            case SHAPE: return Kind.SHAPE;
            case TEXT: return Kind.TEXT;
            case ERASER: return Kind.ERASER;
            default: return Kind.NONE;
        }
    }

    // ---- the page alone: full screen
    // and full immersion ("a button of full inmersion where you dont see any UI and the app does not even respond to the
    // back android command"): every island and the side panel gone; full screen leaves by its corner button or Back,
    // full immersion only by a hold on the top-right corner ----
    NotepadView.Bare bare = NotepadView.Bare.NONE;
    private ImageView fullOut;
    private View immersedOut;

    void setBare(NotepadView.Bare b, FrameLayout stage) {
        bare = b;
        boolean on = b != NotepadView.Bare.NONE;
        for (View v : new View[] { menuIsland, toolIsland, pageIsland }) v.setVisibility(on ? View.GONE : View.VISIBLE);
        if (on) panelBox.setVisibility(View.GONE); else { panelKey = null; draw(); }
        if (fullOut == null) {
            fullOut = button("minimize", "Leave full screen", v -> n.setBare(NotepadView.Bare.NONE));
            fullOut.setAlpha(0.6f);
            stage.addView(fullOut, at(Gravity.TOP | Gravity.END, look.dp(8), look.dp(8)));
            immersedOut = new View(c);
            immersedOut.setContentDescription("Hold here to leave full immersion");
            immersedOut.setOnLongClickListener(v -> { n.setBare(NotepadView.Bare.NONE); return true; });
            stage.addView(immersedOut, at(Gravity.TOP | Gravity.END, 0, 0));
            immersedOut.getLayoutParams().width = look.dp(72);
            immersedOut.getLayoutParams().height = look.dp(72);
        }
        fullOut.setVisibility(b == NotepadView.Bare.FULL_SCREEN ? View.VISIBLE : View.GONE);
        immersedOut.setVisibility(b == NotepadView.Bare.IMMERSED ? View.VISIBLE : View.GONE);
        n.pad.quickArea();
    }

    /** The side panel shown or hidden by hand, remembered. */
    void setPanel(boolean open) {
        panelOpen = open;
        panelChosen = open;
        panelKey = null;
        draw();
    }

    private void drawPanel() {
        Kind k = kind();
        String key = k + "|" + n.pen + "|" + n.widthTimes + "|" + n.color + "|" + n.shape + "|" + n.textSize + "|" + n.eraseArea + "|" + (n.ruler != null) + "|" + n.isFavourite() + "|" + n.chosen.size();
        if (key.equals(panelKey)) return;
        panelKey = key;
        panel.removeAllViews();
        panelBox.setVisibility(k == Kind.NONE || bare != NotepadView.Bare.NONE ? View.GONE : View.VISIBLE);
        if (k != Kind.NONE && k != Kind.SELECTION) {
            // its own way out: an × at the top right (the palette button in the menu brings it back)
            LinearLayout top = new LinearLayout(c);
            top.setGravity(Gravity.END);
            top.addView(button("close", "Hide the side panel (the palette button at the top left shows it again)", v -> setPanel(false)));
            panel.addView(top, new LinearLayout.LayoutParams(-1, -2));
        }
        switch (k) {
            case NONE: return;
            case SELECTION:
                heading("Stroke");
                panel.addView(colours(null));
                heading("Actions");
                panel.addView(grid(4,
                    button("clipboard", "Copy the selection, to paste on any page or drawing", v -> n.copyChosen(false)),
                    button("cut", "Copy the selection and take it away", v -> n.copyChosen(true)),
                    button("duplicate", "A copy beside it", v -> n.duplicate()),
                    button("link", "Link the selection to a note: a tap on it opens the note", v -> n.linkChosen()),
                    button("trash", "Delete the selection", v -> n.deleteChosen()),
                    button("check", "Keep it and put the lasso away", v -> n.select(new ArrayList<>()))));
                break;
            case PEN:
                heading("Pen");
                View[] pens = new View[Host.PENS.length];
                for (int i = 0; i < pens.length; i++) { final int p = i; pens[i] = chip(NotepadView.penName(i), n.pen == i, () -> n.pen = p); }
                panel.addView(grid(2, pens));
                heading("Stroke");
                panel.addView(colours(n.color));
                heading("Stroke width");
                panel.addView(widths());
                heading("More");
                panel.addView(grid(2,
                    chip("Ruler", n.ruler != null, n::toggleRuler),
                    chip(n.isFavourite() ? "★ Favourite" : "☆ Favourite", n.isFavourite(), n::toggleFavourite)));
                break;
            case SHAPE:
                heading("Shape");
                View[] shapes = new View[NotepadView.Shape.values().length];
                for (NotepadView.Shape s : NotepadView.Shape.values()) {
                    View b = button(s.icon, s.label, v -> { n.shape = s; n.drawBar(); });
                    mark(b, s == n.shape);
                    shapes[s.ordinal()] = b;
                }
                panel.addView(grid(4, shapes));
                heading("Stroke");
                panel.addView(colours(n.color));
                heading("Stroke width");
                panel.addView(widths());
                break;
            case TEXT:
                heading("Font size");
                String[] names = { "S", "M", "L", "XL" };
                View[] sizes = new View[Figure.FONT_SIZES.length];
                for (int i = 0; i < sizes.length; i++) { final int s = Figure.FONT_SIZES[i]; sizes[i] = chip(names[i], n.textSize == s, () -> n.textSize = s); }
                panel.addView(grid(4, sizes));
                heading("Stroke");
                panel.addView(colours(n.color));
                break;
            case ERASER:
                heading("Eraser");
                panel.addView(grid(2, chip("Whole strokes", !n.eraseArea, () -> n.eraseArea = false), chip("Where it passes", n.eraseArea, () -> n.eraseArea = true)));
                heading("Page");
                panel.addView(grid(1, chip("Clear this page", false, n::clearPage)));
                break;
        }
        font(panel);
    }

    /** A small name over a group of options, as Excalidraw's panel has. */
    private void heading(String s) {
        TextView h = text(s, 12, look.muted, true);
        h.setPadding(0, look.dp(10), 0, look.dp(4));
        panel.addView(h);
    }

    /** The colours as rounded squares (Excalidraw's swatches), `on` ringed; a tap colours the pen, or the selection. */
    private View colours(String on) {
        View[] cells = new View[NotepadView.COLORS.length];
        for (int i = 0; i < cells.length; i++) {
            final String col = NotepadView.COLORS[i];
            FrameLayout cell = new FrameLayout(c);
            View sw = new View(c);
            GradientDrawable g = new GradientDrawable();
            g.setColor(Painter.color(col, Color.BLACK));
            g.setCornerRadius(look.dp(5));
            g.setStroke(Math.max(1, look.dp(1)), look.borderStrong);
            sw.setBackground(g);
            cell.addView(sw, new FrameLayout.LayoutParams(look.dp(26), look.dp(26), Gravity.CENTER));
            if (col.equalsIgnoreCase(on == null ? "" : on)) cell.setBackground(look.round(0, 8, look.eink ? look.text : look.accent));
            cell.setContentDescription(NotepadView.COLOR_NAMES[i]);
            cell.setTooltipText(NotepadView.COLOR_NAMES[i]);
            cell.setOnClickListener(v -> n.colorChosen(col));
            cell.setLayoutParams(new GridLayout.LayoutParams(new ViewGroup.LayoutParams(look.dp(44), look.dp(40))));
            cells[i] = cell;
        }
        return grid(4, cells);
    }

    /** Excalidraw's stroke widths: a line drawn as thick as each step, the one in hand marked; − and + between them. */
    private View widths() {
        float[] steps = NotepadView.WIDTH_STEPS;
        LinearLayout row = new LinearLayout(c);
        row.setGravity(Gravity.CENTER_VERTICAL);
        for (int i = 0; i < steps.length; i++) {
            final float w = steps[i];
            FrameLayout cell = new FrameLayout(c);
            View line = new View(c);
            line.setBackground(look.round(look.text, 2, 0));
            cell.addView(line, new FrameLayout.LayoutParams(look.dp(22), Math.max(1, look.dp(1 + 1.6f * i)), Gravity.CENTER));
            mark(cell, Math.abs(n.widthTimes - w) < 0.02f);
            String what = new String[] { "Thin", "Normal", "Thick", "Very thick" }[i];
            cell.setContentDescription(what);
            cell.setTooltipText(what);
            cell.setOnClickListener(v -> { n.widthTimes = w; n.drawBar(); });
            row.addView(cell, new LinearLayout.LayoutParams(0, look.dp(40), 1));
        }
        LinearLayout fine = new LinearLayout(c);
        fine.setGravity(Gravity.CENTER_VERTICAL);
        fine.addView(chip("−", false, () -> n.widthTimes = Math.max(0.25f, n.widthTimes / 1.25f)), new LinearLayout.LayoutParams(look.dp(44), look.dp(36)));
        TextView pct = text(Math.round(n.widthTimes * 100) + " %", 13, look.muted, false);
        pct.setGravity(Gravity.CENTER);
        fine.addView(pct, new LinearLayout.LayoutParams(0, look.dp(36), 1));
        fine.addView(chip("+", false, () -> n.widthTimes = Math.min(4f, n.widthTimes * 1.25f)), new LinearLayout.LayoutParams(look.dp(44), look.dp(36)));
        LinearLayout both = new LinearLayout(c);
        both.setOrientation(LinearLayout.VERTICAL);
        both.addView(row);
        both.addView(fine);
        return both;
    }

    /** A word to pick (a pen, a size, a mode), marked when it is the one in use; a tap sets it and redraws. */
    private View chip(String s, boolean on, Runnable tap) {
        TextView t = text(s, 13.5f, look.text, false);
        t.setGravity(Gravity.CENTER);
        t.setSingleLine(true);
        t.setMinHeight(look.dp(36));
        t.setPadding(look.dp(8), 0, look.dp(8), 0);
        t.setBackground(look.pressable(0, 8, look.border));
        mark(t, on);
        t.setOnClickListener(v -> { tap.run(); n.drawBar(); });
        return t;
    }

    /** `cells` in rows of `cols`, each column as wide as the others. */
    private View grid(int cols, View... cells) {
        GridLayout g = new GridLayout(c);
        g.setColumnCount(cols);
        g.setUseDefaultMargins(false);
        for (View v : cells) {
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            lp.width = 0;
            lp.height = look.dp(40);
            lp.setMargins(look.dp(2), look.dp(2), look.dp(2), look.dp(2));
            g.addView(v, lp);
        }
        return g;
    }

    // ---- the favourites ---------------------------------------------------------------------------------------------

    /** A dot per favourite pen: its colour, sized by its width, ringed when it is the pen in hand; a tap takes it up, a
     *  long press lets it go. */
    private void drawFavourites() {
        Favourites.Pen now = n.holding();
        StringBuilder key = new StringBuilder(String.valueOf(n.tool == NotepadView.Tool.PEN));
        for (Favourites.Pen f : n.favourites.list) key.append('|').append(f.pen).append(f.width).append(f.color).append(f.same(now));
        if (key.toString().equals(favouritesKey)) return;
        favouritesKey = key.toString();
        favourites.removeAllViews();
        if (!n.favourites.list.isEmpty()) favourites.addView(divider());
        for (Favourites.Pen f : n.favourites.list) {
            FrameLayout box = new FrameLayout(c);
            View d = new View(c);
            GradientDrawable g = new GradientDrawable();
            g.setShape(GradientDrawable.OVAL);
            g.setColor(Painter.color(f.color, Color.BLACK));
            d.setBackground(g);
            int size = look.dp(Math.max(10, Math.min(22, 8 + 6 * f.width)));
            if (n.tool == NotepadView.Tool.PEN && f.same(now)) { // a ring with a gap: on the dot a black ring vanished into a black pen
                View ring = new View(c);
                GradientDrawable r = new GradientDrawable();
                r.setShape(GradientDrawable.OVAL);
                r.setStroke(look.dp(2), look.eink ? Color.BLACK : SELECTED_ICON);
                ring.setBackground(r);
                box.addView(ring, new FrameLayout.LayoutParams(size + look.dp(10), size + look.dp(10), Gravity.CENTER));
            }
            box.addView(d, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
            String what = "Favourite: " + NotepadView.penName(f.pen) + ", " + Math.round(f.width * 100) + "%, " + NotepadView.colorName(f.color) + " — long press to remove";
            box.setContentDescription(what);
            box.setTooltipText(what);
            box.setOnClickListener(v -> n.takeUp(f));
            box.setOnLongClickListener(v -> { n.favourites.remove(f); n.host.toast("Favourite removed"); n.drawBar(); return true; });
            favourites.addView(box, new LinearLayout.LayoutParams(look.dp(36), look.dp(44)));
        }
    }

    // ---- the pieces ---------------------------------------------------------------------------------------------------

    /** Excalidraw's selected tool: its light violet with the icon in deep blue (e-ink: grey with a black border). */
    private static final int SELECTED_FILL = 0xffe0dfff, SELECTED_ICON = 0xff030064, SELECTED_FILL_DARK = 0xff403e6a;

    private int iconColor(boolean on) { return on && !look.eink ? (look.dark ? SELECTED_FILL : SELECTED_ICON) : look.text; }

    /** A floating island: a rounded white bar, a hairline (a shadow too where the screen is not e-ink). */
    private LinearLayout island() {
        LinearLayout l = new LinearLayout(c);
        l.setGravity(Gravity.CENTER_VERTICAL);
        l.setPadding(look.dp(4), look.dp(4), look.dp(4), look.dp(4));
        l.setBackground(look.round(look.bg, 10, look.eink ? look.borderStrong : look.border));
        l.setElevation(look.elevation(3));
        return l;
    }

    private static FrameLayout.LayoutParams at(int gravity, int side, int edge) {
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, gravity);
        p.leftMargin = p.rightMargin = side;
        if ((gravity & Gravity.VERTICAL_GRAVITY_MASK) == Gravity.BOTTOM) p.bottomMargin = edge; else p.topMargin = edge;
        return p;
    }

    /** An icon button, 44 dp square, its icon 20 dp. */
    private ImageView button(String icon, String what, View.OnClickListener tap) {
        ImageView i = new ImageView(c);
        i.setImageDrawable(look.icon(c, icon, look.text));
        i.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        int pad = look.dp(12);
        i.setPadding(pad, pad, pad, pad);
        i.setContentDescription(what);
        i.setTooltipText(what);
        i.setOnClickListener(tap);
        i.setLayoutParams(new LinearLayout.LayoutParams(look.dp(44), look.dp(44)));
        return i;
    }

    /** Marks a button as the one in use (Excalidraw's selected tool), or not. */
    private void mark(View v, boolean on) {
        if (on) v.setBackground(look.eink ? look.round(look.accentSoft, 8, look.text) : look.round(look.dark ? SELECTED_FILL_DARK : SELECTED_FILL, 8, 0));
        else v.setBackground(v instanceof TextView ? look.pressable(0, 8, look.border) : look.pressable(0, 8, 0));
        if (v instanceof ImageView && v != shapeIcon) ((ImageView) v).setColorFilter(iconColor(on));
    }

    private View divider() {
        View d = new View(c);
        d.setBackgroundColor(look.border);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(Math.max(1, look.dp(1)), look.dp(24));
        p.setMargins(look.dp(4), 0, look.dp(4), 0);
        d.setLayoutParams(p);
        return d;
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = look.label(c, s, sp, color);
        t.setTypeface(bold ? uiBold : ui);
        return t;
    }

    /** The drawing's name as the app shows it: no `.excalidraw`, no folders. */
    private static String name(String path) { return path.substring(path.lastIndexOf('/') + 1).replaceAll("\\.excalidraw$", ""); }
}
