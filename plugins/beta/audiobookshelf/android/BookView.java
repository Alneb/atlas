package org.atlas.plugins.audiobookshelf;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.view.Gravity;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.atlas.capture.Look;
import org.atlas.capture.Row;
import org.atlas.capture.TopBar;

import java.util.ArrayList;
import java.util.List;

/**
 * A book: its cover, title, author, narrator, series, length and how far you are; one button that plays it — Play, or
 * Go on from where the server says you are (a session on any device) — and From the start; its description; then its
 * chapters (a tap plays from there) and your bookmarks (a tap plays from there, a long press removes one; + adds one
 * where the player is, when it plays this book). The book is asked of the server each time the screen is made.
 */
final class BookView extends ScrollView implements AbsScreen.Place {
    private final AbsScreen screen;
    private final Look look;
    private final String id;
    private final TopBar bar;
    private final ImageView cover;
    private final TextView title, people, length, about, status;
    private final TextView playButton, fromStart, chTab, bmTab;
    private final LinearLayout list;
    private final Runnable unwatch;
    private Book.Details book;
    private Cards.Card progress;
    private List<Cards.Mark> marks = new ArrayList<>();
    private boolean showMarks;
    private State state;

    BookView(AbsScreen screen, String id, Cards.Card known) {
        super(screen.getContext());
        this.screen = screen;
        this.look = screen.host.look();
        this.id = id;
        setBackgroundColor(look.bg);
        setFillViewport(true);
        Context c = getContext();
        LinearLayout col = new LinearLayout(c);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(0, 0, 0, look.dp(24));
        addView(col);
        bar = new TopBar(screen.host, () -> screen.host.activity().onBackPressed());
        bar.title(known == null ? "Audiobook" : known.title);
        col.addView(bar, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout content = new LinearLayout(c);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(look.dp(20), look.dp(16), look.dp(20), 0);
        col.addView(look.readable(c, content), new LinearLayout.LayoutParams(-1, -2));

        cover = new ImageView(c);
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cover.setBackground(look.round(look.hover, 10, look.border));
        cover.setClipToOutline(true);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(look.dp(200), look.dp(200));
        cp.gravity = Gravity.CENTER_HORIZONTAL;
        content.addView(cover, cp);
        screen.covers.show(cover, id);

        title = look.label(c, known == null ? "" : known.title, 22, look.text);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, look.dp(16), 0, look.dp(4));
        content.addView(title, new LinearLayout.LayoutParams(-1, -2));
        people = look.label(c, known == null ? "" : known.author, 15, look.muted);
        people.setGravity(Gravity.CENTER);
        content.addView(people, new LinearLayout.LayoutParams(-1, -2));
        length = look.label(c, known == null ? "" : known.detail(), 13.5f, look.faint);
        length.setGravity(Gravity.CENTER);
        length.setPadding(0, look.dp(4), 0, look.dp(16));
        content.addView(length, new LinearLayout.LayoutParams(-1, -2));

        playButton = look.button(c, "Play", true);
        playButton.setOnClickListener(v -> play(Double.NaN));
        content.addView(playButton, new LinearLayout.LayoutParams(-1, look.dp(52)));
        fromStart = look.button(c, "From the start", false);
        fromStart.setOnClickListener(v -> play(0));
        fromStart.setVisibility(GONE);
        LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1, look.dp(48));
        fp.topMargin = look.dp(8);
        content.addView(fromStart, fp);
        status = look.label(c, "", 13.5f, look.muted);
        status.setPadding(0, look.dp(8), 0, 0);
        content.addView(status);

        about = look.label(c, "", 15, look.text);
        about.setGravity(Gravity.START);
        about.setPadding(0, look.dp(16), 0, look.dp(8));
        about.setMaxLines(6);
        about.setOnClickListener(v -> about.setMaxLines(about.getMaxLines() == 6 ? Integer.MAX_VALUE : 6));
        content.addView(about, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout tabs = new LinearLayout(c);
        tabs.setPadding(0, look.dp(8), 0, look.dp(4));
        chTab = TopBar.chip(look, c, "Chapters", true, () -> tab(false));
        bmTab = TopBar.chip(look, c, "Bookmarks", false, () -> tab(true));
        tabs.addView(chTab);
        tabs.addView(TopBar.gap(look, c));
        tabs.addView(bmTab);
        content.addView(tabs);
        list = new LinearLayout(c);
        list.setOrientation(LinearLayout.VERTICAL);
        content.addView(list, new LinearLayout.LayoutParams(-1, -2));

        unwatch = screen.host.watchPlayer(json -> { state = State.of(json); buttons(); });
        load();
    }

    private void load() {
        screen.io.execute(() -> {
            try {
                Object item = screen.abs.item(id), me = screen.abs.me();
                Book.Details d = Book.details(item);
                Cards.Card p = Cards.cardOf(item, Cards.progressMap(me), null);
                List<Cards.Mark> m = Cards.bookmarksOf(me, id);
                post(() -> { book = d; progress = p; marks = m; shown(); });
            } catch (Exception e) { post(() -> status.setText("Not loaded: " + e.getMessage())); }
        });
    }

    private void shown() {
        bar.title(book.title);
        bar.sub(book.series.isEmpty() ? null : book.series);
        title.setText(book.subtitle.isEmpty() ? book.title : book.title + "\n" + book.subtitle);
        String who = book.author + (book.narrator.isEmpty() ? "" : (book.author.isEmpty() ? "" : " · ") + "read by " + book.narrator);
        people.setText(who);
        List<String> line = new ArrayList<>();
        line.add(Clock.howFar(progress.progress, book.duration, progress.at));
        if (progress.progress > 0 && progress.progress < 1) line.add(Clock.length(book.duration));
        if (!book.year.isEmpty()) line.add(book.year);
        if (!book.genres.isEmpty()) line.add(book.genres);
        line.removeIf(String::isEmpty);
        length.setText(String.join(" · ", line));
        about.setText(book.description);
        about.setVisibility(book.description.isEmpty() ? GONE : VISIBLE);
        buttons();
        rows();
    }

    /** Play / Go on, as where you are says; Pause when this book plays now. */
    private void buttons() {
        boolean mine = state != null && state.plays(id);
        boolean begun = progress != null && progress.progress > 0 && progress.progress < 1 && progress.at > 0;
        if (mine) playButton.setText(state.playing ? "Pause" : "Resume · " + Clock.at(state.at));
        else if (begun) playButton.setText("Go on · " + Clock.at(progress.at) + chapterOf(progress.at));
        else playButton.setText(progress != null && progress.progress >= 1 ? "Listen again" : "Play");
        fromStart.setVisibility(begun || mine ? VISIBLE : GONE);
        if (showMarks) rows(); // + follows whether this book plays
    }

    private String chapterOf(double t) {
        int i = book == null ? -1 : Book.chapterAt(book.chapters, t);
        return i < 0 ? "" : " · " + book.chapters.get(i).title;
    }

    private void play(double from) {
        if (state != null && state.plays(id)) {
            if (Double.isNaN(from)) { screen.host.player(state.playing ? "pause" : "resume", null); return; }
            screen.host.player("seek", String.valueOf(from));
            screen.host.player("resume", null);
            screen.playing();
            return;
        }
        screen.play(id, null, progress != null && progress.progress >= 1 && Double.isNaN(from) ? 0 : from);
    }

    private void tab(boolean marksTab) {
        showMarks = marksTab;
        LinearLayout tabs = (LinearLayout) chTab.getParent();
        tabs.removeAllViews();
        tabs.addView(TopBar.chip(look, getContext(), "Chapters", !marksTab, () -> tab(false)));
        tabs.addView(TopBar.gap(look, getContext()));
        tabs.addView(TopBar.chip(look, getContext(), "Bookmarks", marksTab, () -> tab(true)));
        rows();
    }

    private void rows() {
        list.removeAllViews();
        if (book == null) return;
        if (!showMarks) {
            for (Book.Chapter ch : book.chapters) {
                Row r = look.row(getContext(), "contents", ch.title, Clock.at(ch.start) + " · " + Clock.length(ch.end - ch.start));
                r.setOnClickListener(v -> play(ch.start));
                list.addView(r);
            }
            if (book.chapters.isEmpty()) list.addView(look.label(getContext(), "No chapters.", 14, look.muted));
            return;
        }
        if (state != null && state.plays(id)) {
            Row add = look.row(getContext(), "plus", "Bookmark here", Clock.at(state.at));
            add.setOnClickListener(v -> addMark(state.at));
            list.addView(add);
        }
        for (Cards.Mark m : marks) {
            Row r = look.row(getContext(), "bookmark", m.title.isEmpty() ? Clock.at(m.time) : m.title, Clock.at(m.time) + chapterOf(m.time));
            r.setOnClickListener(v -> play(m.time));
            r.setOnLongClickListener(v -> { removeMark(m); return true; });
            list.addView(r);
        }
        if (marks.isEmpty()) list.addView(look.label(getContext(), "No bookmarks yet: while it plays, “Bookmark here”.", 14, look.muted));
    }

    private void addMark(double at) {
        EditText note = new EditText(getContext());
        note.setHint("A note (optional)");
        new AlertDialog.Builder(getContext()).setTitle("Bookmark at " + Clock.at(at)).setView(note)
            .setPositiveButton("Add", (d, w) -> {
                String t = note.getText().toString().trim();
                screen.io.execute(() -> {
                    try { screen.abs.addBookmark(id, at, t.isEmpty() ? "Bookmark at " + Clock.at(at) : t); load(); }
                    catch (Exception e) { screen.host.toast("Not added: " + e.getMessage()); }
                });
            }).setNegativeButton("Cancel", null).show();
    }

    private void removeMark(Cards.Mark m) {
        new AlertDialog.Builder(getContext()).setTitle("Remove this bookmark?").setMessage(m.title + " · " + Clock.at(m.time))
            .setPositiveButton("Remove", (d, w) -> screen.io.execute(() -> {
                try { screen.abs.removeBookmark(id, m.time); load(); }
                catch (Exception e) { screen.host.toast("Not removed: " + e.getMessage()); }
            })).setNegativeButton("Cancel", null).show();
    }

    @Override public void returned() { load(); }

    @Override public void closed() { unwatch.run(); }
}
