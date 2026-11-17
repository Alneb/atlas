package org.atlas.capture;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.TextView;
import android.widget.Toast;

import java.time.LocalDate;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The phone's Agenda place, native (docs/design/DESIGN-android-native-app.md §6): a day, three days or a week as a
 * list — a header per day, the Calendar's events and the dated tasks and notes under it, an empty day said — over the
 * same two answers the desktop's Agenda reads (Agenda: the Calendar engine's `range`, the core's `from: deadlines`).
 * AgendaRows decides the days and the words; this draws them on a PlaceList with the span's chips and ‹ Today ›.
 * A task's row opens its note at its line, its ⋮ ticks it through the core; an event opens the page's Calendar at its
 * day, where its card and its form are (editing stays the page's for now). Works while the page is loading.
 */
final class AgendaScreen {
    /** What the screen asks of the app (AtlasActivity). */
    interface Shell {
        /** Opens `path` at `line` as any file opens (Files' way). */
        void open(String path, int line);
        /** The page's Calendar pane at day `day` (YYYY-MM-DD): an event's card, its editor. */
        void calendar(String day);
    }

    private static final String PREFS = "agenda";
    private final Activity a;
    private final String vault;
    private final Shell shell;
    private final SharedPreferences prefs;
    private AgendaRows.Span span;
    private LocalDate cursor = LocalDate.now();
    private Look look;
    private View root;
    private TextView title;
    private final List<TextView> chips = new ArrayList<>();
    private PlaceList list;
    private int asked; // the latest read: an older answer coming late is dropped
    private List<PlaceItem> shown = new ArrayList<>();
    private String said = "";

    AgendaScreen(Activity a, String vault, Shell shell) {
        this.a = a;
        this.vault = vault;
        this.shell = shell;
        this.prefs = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.span = AgendaRows.Span.of(prefs.getString("span", AgendaRows.Span.THREE.name()));
    }

    /** The screen in `look`'s colours, read again (an event may have come since). */
    View view(Look look) {
        if (root == null || this.look != look) build(look);
        load();
        return root;
    }

    /** Back at today (the widget's "Coming up", a launcher shortcut). */
    void today() { cursor = LocalDate.now(); }

    private LocalDate first() { return AgendaRows.first(span, cursor, WeekFields.of(Locale.getDefault()).getFirstDayOfWeek()); }

    private void build(Look look) {
        this.look = look;
        LinearLayout box = new LinearLayout(a);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(look.app);

        // Material 3's segmented buttons: Day · 3 days · Week
        LinearLayout seg = new LinearLayout(a);
        seg.setBackground(look.round(look.app, 20, look.borderStrong));
        seg.setPadding(look.dp(2), look.dp(2), look.dp(2), look.dp(2));
        chips.clear();
        for (AgendaRows.Span s : AgendaRows.Span.values()) {
            TextView c = look.label(a, s.label, 14, look.text);
            c.setGravity(Gravity.CENTER);
            c.setSingleLine(true);
            c.setContentDescription("Show " + s.label.toLowerCase(Locale.ROOT));
            c.setOnClickListener(v -> { span = s; prefs.edit().putString("span", s.name()).apply(); paintChips(); load(); });
            chips.add(c);
            seg.addView(c, new LinearLayout.LayoutParams(0, look.dp(36), 1f));
        }
        paintChips();
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2);
        sp.setMargins(look.dp(16), look.dp(8), look.dp(16), look.dp(4));
        box.addView(seg, sp);

        // ‹ the days shown › and Today
        LinearLayout nav = new LinearLayout(a);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        nav.setPadding(look.dp(4), 0, look.dp(8), 0);
        nav.addView(button("chevron_left", "Earlier", v -> { cursor = AgendaRows.step(span, cursor, -1); load(); }));
        title = look.label(a, "", 16, look.text);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        title.setGravity(Gravity.CENTER);
        title.setSingleLine(true);
        nav.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
        nav.addView(button("chevron", "Later", v -> { cursor = AgendaRows.step(span, cursor, 1); load(); }));
        TextView today = look.label(a, "Today", 14, look.accent);
        today.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        today.setGravity(Gravity.CENTER);
        today.setPadding(look.dp(12), 0, look.dp(12), 0);
        today.setBackground(look.pressable(0x00000000, 18, look.border));
        today.setOnClickListener(v -> { cursor = LocalDate.now(); load(); });
        nav.addView(today, new LinearLayout.LayoutParams(-2, look.dp(36)));
        box.addView(nav, new LinearLayout.LayoutParams(-1, look.dp(48)));

        list = new PlaceList(a, look, new PlaceList.On() {
            public void open(PlaceItem it) { AgendaScreen.this.open(it); }
            public void more(PlaceItem it, View anchor) { menu(it, anchor); }
            public void refresh() { load(); }
            public void step(int by) { cursor = AgendaRows.step(span, cursor, by); load(); } // a fling: the next days
        });
        box.addView(list, new LinearLayout.LayoutParams(-1, 0, 1f));
        list.setItems(shown, said);
        root = box;
    }

    private ImageView button(String icon, String what, View.OnClickListener on) {
        ImageView b = new ImageView(a);
        b.setImageDrawable(look.icon(a, icon, look.muted));
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setBackground(look.pressable(0x00000000, 24, 0));
        b.setContentDescription(what);
        b.setOnClickListener(on);
        b.setLayoutParams(new LinearLayout.LayoutParams(look.dp(48), look.dp(48)));
        return b;
    }

    private void paintChips() {
        for (int i = 0; i < chips.size(); i++) {
            boolean on = AgendaRows.Span.values()[i] == span;
            TextView c = chips.get(i);
            c.setBackground(on ? look.round(look.accentSoft, 18, 0) : look.pressable(0x00000000, 18, 0));
            c.setTextColor(on ? look.text : look.muted);
            c.setTypeface(on ? Typeface.create("sans-serif-medium", Typeface.NORMAL) : Typeface.DEFAULT);
            c.setSelected(on);
        }
    }

    /** The span on screen read from the core, drawn when it is still the latest asked. */
    private void load() {
        LocalDate from = first(), to = AgendaRows.last(span, from), today = LocalDate.now();
        title.setText(AgendaRows.title(span, from, today));
        int mine = ++asked;
        list.setRefreshing(true);
        boolean h12 = !android.text.format.DateFormat.is24HourFormat(a);
        new Thread(() -> {
            Agenda.Read r = Agenda.read(a, vault, from, to);
            List<PlaceItem> rows = AgendaRows.rows(r.items, from, to, today, h12, Look::shownName);
            String why = r.noEvents != null && r.noTasks != null ? r.noEvents + "\n" + r.noTasks : r.noEvents != null ? r.noEvents : r.noTasks;
            if (why != null) {
                PlaceItem note = PlaceItem.header(why);
                rows.add(0, note);
            }
            a.runOnUiThread(() -> {
                if (a.isFinishing() || mine != asked) return;
                list.setRefreshing(false);
                shown = rows;
                said = "";
                list.setItems(rows, "");
            });
        }, "agenda").start();
    }

    private void open(PlaceItem it) {
        if (!(it.ref instanceof AgendaRows.Item)) return; // a day's header, "Nothing planned"
        AgendaRows.Item i = (AgendaRows.Item) it.ref;
        if (i.task()) shell.open(i.path, i.line);
        else shell.calendar(AgendaRows.at(i.start).toLocalDate().isBefore(first()) ? first().toString() : AgendaRows.at(i.start).toLocalDate().toString());
    }

    /** A task: Done, its note; an event: the Calendar at its day (its card, its editor), the note it came from. */
    private void menu(PlaceItem it, View anchor) {
        if (!(it.ref instanceof AgendaRows.Item)) return;
        AgendaRows.Item i = (AgendaRows.Item) it.ref;
        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(look.dp(6), look.dp(6), look.dp(6), look.dp(6));
        card.setBackground(look.round(look.pop, 16, look.border));
        card.setElevation(look.elevation(8));
        PopupWindow pop = new PopupWindow(card, look.dp(244), -2, true);
        pop.setElevation(look.elevation(8));
        pop.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
        if (i.kind == AgendaRows.Item.Kind.TASK) FilesScreen.item(a, look, card, pop, "check", "Mark as done", () -> tick(i));
        if (i.task()) FilesScreen.item(a, look, card, pop, "note", "Open the note", () -> shell.open(i.path, i.line));
        else {
            FilesScreen.item(a, look, card, pop, "calendar", "Open in the Calendar", () -> open(it));
            if (i.source.endsWith(".md")) FilesScreen.item(a, look, card, pop, "note", "Open the note it came from", () -> shell.open(i.source, 0));
        }
        pop.showAsDropDown(anchor, Math.max(0, anchor.getWidth() - look.dp(244)), -look.dp(8), Gravity.START);
    }

    private void tick(AgendaRows.Item t) {
        new Thread(() -> {
            String err = Agenda.tick(a, vault, t);
            a.runOnUiThread(() -> {
                if (a.isFinishing()) return;
                Toast.makeText(a, err == null ? "Done: " + t.title : "Not ticked: " + err, err == null ? Toast.LENGTH_SHORT : Toast.LENGTH_LONG).show();
                load(); // gone, or a repeating task's next one
                TodayWidget.refresh(a);
            });
        }, "agenda-tick").start();
    }
}
