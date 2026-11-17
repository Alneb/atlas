package org.atlas.plugins.manga;

import android.content.Context;
import android.graphics.Typeface;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.PopupMenu;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.Look;
import org.atlas.capture.TopBar;
import org.atlas.capture.Row;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;

/**
 * A series (Mihon's series screen): its cover and title, one button that goes on where you were (Shelf.resume:
 * continue the chapter left half read, else the next unread, else from the start again), the chapters newest first
 * (or oldest: the bar's arrow) — read ones quiet, the one being read marked, a server's chapter kept on this device
 * marked "offline". A tap reads a chapter from where it was left; a long press marks it read or unread, marks the ones
 * before it read, keeps it for offline, or has the server download it (and every unread one) into its own Downloads. Pull to refresh: the server fetches the series' source again (new
 * chapters), a vault series is listed again. Where you are is the series' note (a vault's) or the server (Library).
 * A server's series shows its details (who made it, its status, genres, description: Browse.Details) and Add to library
 * (with its categories) or, when it is in, its categories and Remove — the same screen for a series found in Browse,
 * whose details and chapters the server fetches from its source when it is first opened.
 */
final class SeriesView extends LinearLayout implements org.atlas.capture.NativePlugin.Back {
    private static boolean newestFirst = true;

    private final MangaScreen screen;
    private final Host host;
    private final Look look;
    private final String key, title;
    private final ExecutorService io = Pages.pool(1, "manga-series"), keeper = Pages.pool(1, "manga-keep");
    private final Covers covers;
    private final TopBar bar;
    private final ImageView orderButton;
    private final ListView list;
    private final Pull pull;
    private final TextView status, heading, origin, resumeButton, keepButton, libraryButton, about;
    private final ImageView cover;
    private final Adapter adapter = new Adapter();
    private Library.Series series;
    /** Server chapters every page of which is kept here (by chapter id), and the ones being kept now ("3 / 20"). */
    private Set<Integer> kept = new HashSet<>();
    private final Map<String, String> keeping = new HashMap<>();
    /** Open the reader at Continue as soon as the chapters are known (the library's Reading tab). */
    private boolean readOnLoad;
    /** A server series' cover address, as the library listed it (null: the kept one, else the server's usual one). */
    private final String coverUrl;
    /** A server series' details (null: a vault's, or the server out of reach). */
    private Browse.Details details;

    SeriesView(MangaScreen screen, String key, String title, String coverUrl, Library.Series known, boolean readOnLoad) {
        super(screen.getContext());
        this.screen = screen;
        this.host = screen.host;
        this.look = host.look();
        this.key = key;
        this.title = title;
        this.readOnLoad = readOnLoad;
        this.coverUrl = coverUrl;
        covers = new Covers(host);
        Context c = getContext();
        setOrientation(VERTICAL);
        setBackgroundColor(look.bg);

        bar = new TopBar(host, () -> host.activity().onBackPressed());
        bar.title(title == null ? "" : title);
        orderButton = bar.action(newestFirst ? "arrow_down" : "arrow_up", newestFirst ? "Oldest first" : "Newest first", this::toggleOrder);
        bar.action("repeat", "Look for new chapters", () -> pull().start());
        addView(bar, new LayoutParams(-1, -2));

        // the head: cover, title, where it is from, Continue, keep for offline
        LinearLayout head = new LinearLayout(c);
        head.setOrientation(VERTICAL);
        head.setPadding(look.dp(16), look.dp(14), look.dp(16), look.dp(6));
        LinearLayout top = new LinearLayout(c);
        top.setGravity(Gravity.CENTER_VERTICAL);
        cover = new ImageView(c);
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cover.setBackground(look.round(look.hover, 8, look.border));
        cover.setClipToOutline(true);
        top.addView(cover, new LayoutParams(look.dp(84), look.dp(126)));
        LinearLayout names = new LinearLayout(c);
        names.setOrientation(VERTICAL);
        names.setPadding(look.dp(16), 0, 0, 0);
        heading = look.label(c, title == null ? "" : title, 19, look.text);
        heading.setTypeface(Typeface.DEFAULT_BOLD);
        heading.setMaxLines(3);
        heading.setEllipsize(TextUtils.TruncateAt.END);
        origin = look.label(c, "", 13, look.muted);
        origin.setPadding(0, look.dp(6), 0, 0);
        names.addView(heading);
        names.addView(origin);
        top.addView(names, new LayoutParams(0, -2, 1));
        head.addView(top);
        about = look.label(c, "", 13.5f, look.muted);
        about.setPadding(0, look.dp(12), 0, 0);
        about.setMaxLines(4);
        about.setEllipsize(TextUtils.TruncateAt.END);
        about.setVisibility(GONE);
        about.setOnClickListener(v -> about.setMaxLines(about.getMaxLines() == 4 ? Integer.MAX_VALUE : 4)); // the whole description
        head.addView(about, new LayoutParams(-1, -2));
        libraryButton = look.button(c, "Add to library", false);
        libraryButton.setOnClickListener(v -> library());
        libraryButton.setVisibility(GONE);
        LayoutParams lp = new LayoutParams(-1, -2);
        lp.setMargins(0, look.dp(12), 0, 0);
        head.addView(libraryButton, lp);
        resumeButton = look.button(c, "…", true);
        resumeButton.setOnClickListener(v -> resume());
        LayoutParams rp = new LayoutParams(-1, -2);
        rp.setMargins(0, look.dp(14), 0, 0);
        head.addView(resumeButton, rp);
        keepButton = look.button(c, "Keep the next 5 for offline", false);
        keepButton.setOnClickListener(v -> keepNext(5));
        keepButton.setVisibility(GONE);
        head.addView(keepButton, new LayoutParams(-1, -2));
        // the series' one note (the catalog's rule): opened, made now when it has none — asking makes it yours
        TextView noteButton = look.button(c, "Its note", false);
        noteButton.setOnClickListener(v -> openNote());
        head.addView(noteButton, new LayoutParams(-1, -2));
        TextView chapters = look.heading(c, "Chapters");
        chapters.setPadding(0, look.dp(18), 0, look.dp(2));
        head.addView(chapters);

        list = new ListView(c);
        list.setDivider(null);
        list.setSelector(new android.graphics.drawable.ColorDrawable(0));
        list.setClipToPadding(false);
        list.setPadding(look.dp(4), 0, look.dp(4), look.dp(24));
        list.addHeaderView(head, null, false);
        list.setAdapter(adapter);
        list.setOnItemClickListener((p, v, pos, id) -> { int i = chapterAt(pos); if (i >= 0) read(i); });
        list.setOnItemLongClickListener((p, v, pos, id) -> { int i = chapterAt(pos); if (i >= 0) menu(v, i); return i >= 0; });
        pull = new Pull(host, list, this::refresh);
        FrameLayout body = new FrameLayout(c);
        body.addView(pull, new FrameLayout.LayoutParams(-1, -1));
        status = look.label(c, "Opening " + (title == null ? "the series" : title) + "…", 15, look.muted);
        status.setGravity(Gravity.CENTER);
        status.setPadding(look.dp(32), look.dp(240), look.dp(32), 0);
        body.addView(status, new FrameLayout.LayoutParams(-1, -1));
        addView(body, new LayoutParams(-1, 0, 1));

        if (known != null) { series = known; post(this::shown); } // once on screen: Continue may open the reader over it
        load(known != null);
    }

    private Pull pull() { return pull; }

    // ---- data ----

    /** The series' chapters and where you are, away from the UI (`quiet`: they are shown already; this only adds what
     *  is kept offline, and for a vault series reads the note again). */
    private void load(boolean quiet) {
        Pages.run(io, () -> {
            try {
                Browse.Details d = null;
                if (Suwayomi.is(key)) try { d = Suwayomi.details(host, Suwayomi.idOf(key)); } catch (java.io.IOException offline) { /* the chapters as kept say so */ }
                Library.Series s = series != null && quiet ? series : open();
                if (s.remote == 0 && quiet) s.reading = Library.reading(host, s);
                Set<Integer> k = s.remote > 0 ? Suwayomi.keptChapters(host) : new HashSet<>();
                final Browse.Details d2 = d;
                post(() -> { series = s; kept = k; if (d2 != null) details = d2; shown(); });
            } catch (Exception e) {
                String why = e.getMessage() == null ? e.toString() : e.getMessage();
                post(() -> { if (series == null) status.setText("Cannot open " + (title == null ? "the series" : title) + ": " + why); else host.toast(why); });
            }
        });
    }

    /** The series by its key: a server's (`suwayomi:<id>`), or a vault folder or loose .cbz. */
    /** The series' note opened: the one it has, else made by the catalog's rule (Library.thingNote, why "asked"). */
    private void openNote() {
        Library.Series s = series;
        if (s == null) return;
        io.execute(() -> {
            String note = s.remote > 0 ? null : Library.noteOf(host, s);
            if (note != null && !host.exists(note)) note = null;
            if (note == null) note = Library.thingNote(host, s, "asked", 0);
            String found = note;
            post(() -> {
                if (found != null) host.open(found);
                else host.toast(s.remote > 0 && !s.offline.isEmpty() ? "Suwayomi cannot be reached: the series' note waits for it." : "No note made: a series' note is the Catalog's (switch the Catalog plugin on).");
            });
        });
    }

    private Library.Series open() throws Exception {
        if (Suwayomi.is(key)) {
            int id = Suwayomi.idOf(key);
            return Suwayomi.series(host, id, title != null ? title : Suwayomi.title(host, id));
        }
        Library.Series s;
        if (host.isDir(key)) {
            s = new Library.Series(key, key.substring(key.lastIndexOf('/') + 1));
            Library.chapters(host, s);
        } else if (Chapter.isZip(key) && host.exists(key)) {
            s = new Library.Series(key, Chapter.titleOf(key));
            s.chapters.add(key);
        } else throw new java.io.IOException("no series at " + key);
        s.reading = Library.reading(host, s);
        return s;
    }

    /** A pull: the server asked for the series' new chapters (a vault series listed again). */
    private void refresh(Runnable done) {
        Pages.run(io, () -> {
            String why = null;
            Library.Series s = series;
            try {
                if (s == null) s = open();
                else if (s.remote > 0) Suwayomi.refresh(host, s);
                else s = open();
            } catch (Exception e) { why = e.getMessage() == null ? e.toString() : e.getMessage(); }
            Set<Integer> k = s != null && s.remote > 0 ? Suwayomi.keptChapters(host) : kept;
            final Library.Series got = s;
            final String why2 = why;
            post(() -> {
                if (got != null) { int before = series == null ? 0 : series.chapters.size(); series = got; kept = k; shown(); if (why2 == null && got.chapters.size() > before && before > 0) host.toast((got.chapters.size() - before) + " new chapter" + (got.chapters.size() - before == 1 ? "" : "s")); }
                if (why2 != null) host.toast(why2);
                done.run();
            });
        });
    }

    // ---- what is shown ----

    private boolean[] readFlags() {
        boolean[] r = new boolean[series.chapters.size()];
        for (int i = 0; i < r.length; i++) r[i] = Library.isRead(reading(), series.chapters.get(i));
        return r;
    }

    private int[] pagesLeft() {
        int[] p = new int[series.chapters.size()];
        for (int i = 0; i < p.length; i++) p[i] = Library.pageOf(reading(), series.chapters.get(i));
        return p;
    }

    private JSONObject reading() { if (series.reading == null) series.reading = new JSONObject(); return series.reading; }

    /** The chapter read last (index), or -1. */
    private int last() {
        String l = reading().optString("last", "");
        if (l.isEmpty()) return -1;
        for (int i = 0; i < series.chapters.size(); i++) if (Library.name(series.chapters.get(i)).equals(l)) return i;
        return -1;
    }

    private Shelf.Resume resumeAt() { return Shelf.resume(readFlags(), pagesLeft(), last()); }

    private void shown() {
        if (series == null) return;
        status.setVisibility(series.chapters.isEmpty() ? VISIBLE : GONE);
        if (series.chapters.isEmpty()) status.setText(series.title + " has no chapters" + (series.remote > 0 ? " on the server yet: pull to look for them." : "."));
        bar.title(series.title);
        heading.setText(series.title);
        int n = series.chapters.size(), unread = Shelf.unread(readFlags());
        String from = series.remote > 0 ? "On " + Suwayomi.base(host).replaceFirst("^https?://", "") : "In the vault";
        if (details != null && !Browse.byline(details).isEmpty()) from = Browse.byline(details) + "\n" + from;
        showDetails();
        origin.setText(from + "\n" + n + " chapter" + (n == 1 ? "" : "s") + (unread > 0 && unread < n ? " · " + unread + " unread" : unread == 0 && n > 0 ? " · all read" : ""));
        bar.sub(series.offline.isEmpty() ? null : "offline: the chapters as last seen");
        Shelf.Resume r = resumeAt();
        resumeButton.setVisibility(r.kind == Shelf.Kind.NONE ? GONE : VISIBLE);
        if (r.kind != Shelf.Kind.NONE) {
            String ch = Chapter.titleOf(Library.name(series.chapters.get(r.chapter)));
            resumeButton.setText(r.kind == Shelf.Kind.CONTINUE ? "Continue " + ch + (r.page > 0 ? " · page " + (r.page + 1) : "")
                : r.kind == Shelf.Kind.NEXT ? "Next: " + ch : r.kind == Shelf.Kind.START ? "Start reading: " + ch : "Read again from " + ch);
        }
        keepButton.setVisibility(series.remote > 0 && unread > 0 ? VISIBLE : GONE);
        covers.show(cover, series.path, series.remote > 0 ? covers.server(coverItem()) : covers.vault(series));
        adapter.notifyDataSetChanged();
        if (readOnLoad && r.kind != Shelf.Kind.NONE) { readOnLoad = false; read(r.chapter, r.page); }
        if (host.eink()) post(host::einkRefresh);
    }

    /** A server series' genres and description, and its place in the library. */
    private void showDetails() {
        if (details == null) return;
        String g = String.join(", ", details.genres), d = details.description;
        about.setText(g.isEmpty() ? d : d.isEmpty() ? g : g + "\n\n" + d);
        about.setVisibility(g.isEmpty() && d.isEmpty() ? GONE : VISIBLE);
        libraryButton.setVisibility(VISIBLE);
        libraryButton.setText(details.inLibrary ? "In your library · change" : "Add to library");
    }

    // ---- the server's library ----

    /** Add to library (asking its categories when the server has some), or, when it is in, change them or remove it. */
    private void library() {
        if (details == null) return;
        Browse.Details d = details;
        Pages.run(io, () -> {
            java.util.List<Browse.Category> cats;
            try { cats = Suwayomi.categories(host); } catch (Exception e) { String why = e.getMessage(); post(() -> host.toast("Not changed: " + why)); return; }
            post(() -> {
                if (!d.inLibrary) { if (cats.isEmpty()) change(d, true, d.categories); else choose(d, cats, "Add to library", true); return; }
                PopupMenu m = new PopupMenu(getContext(), libraryButton, Gravity.END);
                if (!cats.isEmpty()) m.getMenu().add("Categories…").setOnMenuItemClickListener(x -> { choose(d, cats, "Categories", true); return true; });
                m.getMenu().add("Remove from library").setOnMenuItemClickListener(x -> { change(d, false, new HashSet<>()); return true; });
                m.show();
            });
        });
    }

    /** The categories to put the series in, ticked where it is now; OK adds it (or keeps it) there. */
    private void choose(Browse.Details d, java.util.List<Browse.Category> cats, String title, boolean in) {
        String[] names = new String[cats.size()];
        boolean[] on = new boolean[cats.size()];
        for (int i = 0; i < names.length; i++) { names[i] = cats.get(i).name; on[i] = d.categories.contains(cats.get(i).id); }
        new android.app.AlertDialog.Builder(getContext()).setTitle(title)
            .setMultiChoiceItems(names, on, (dlg, i, checked) -> on[i] = checked)
            .setPositiveButton(d.inLibrary ? "Save" : "Add", (dlg, w) -> {
                Set<Integer> want = new HashSet<>();
                for (int i = 0; i < names.length; i++) if (on[i]) want.add(cats.get(i).id);
                change(d, in, want);
            })
            .setNegativeButton("Cancel", null).show();
    }

    /** The series in (or out of) the server's library, in categories `want`; the library lists again when shown. */
    private void change(Browse.Details d, boolean in, Set<Integer> want) {
        Pages.run(io, () -> {
            String why = null;
            try {
                if (d.inLibrary != in) Suwayomi.setInLibrary(host, d.id, in);
                if (in) Suwayomi.setCategories(host, d.id, d.categories, want);
            } catch (Exception e) { why = e.getMessage() == null ? e.toString() : e.getMessage(); }
            final String why2 = why;
            post(() -> {
                if (why2 != null) { host.toast("Not changed: " + why2); return; }
                boolean was = d.inLibrary;
                d.inLibrary = in;
                d.categories.clear();
                if (in) d.categories.addAll(want);
                screen.libraryChanged = true;
                if (was != in) host.toast(in ? "Added to your library" : "Removed from your library");
                shown();
            });
        });
    }

    /** Whether the series is in the server's library now (null: not a server's, or not known). */
    Boolean inLibrary() { return details == null ? null : details.inLibrary; }

    /** The server's cover, kept by the series' id (its address asked only when it is not kept yet). */
    private Shelf.Item coverItem() {
        Shelf.Item it = new Shelf.Item(series.path, series.title, Shelf.Origin.SERVER);
        it.cover = coverUrl != null ? coverUrl : "/api/v1/manga/" + series.remote + "/thumbnail"; // else Suwayomi's own cover address
        return it;
    }

    /** List position (after the head) → chapter index in reading order, by the order shown. */
    private int chapterAt(int pos) {
        if (series == null) return -1;
        int p = pos - list.getHeaderViewsCount(), n = series.chapters.size();
        if (p < 0 || p >= n) return -1;
        return newestFirst ? n - 1 - p : p;
    }

    private void toggleOrder() {
        newestFirst = !newestFirst;
        bar.icon(orderButton, newestFirst ? "arrow_down" : "arrow_up", newestFirst ? "Oldest first" : "Newest first");
        adapter.notifyDataSetChanged();
    }

    // ---- actions ----

    private void resume() {
        if (series == null) return;
        Shelf.Resume r = resumeAt();
        if (r.kind != Shelf.Kind.NONE) read(r.chapter, r.page);
    }

    /** Chapter `i` from where it was left (a read one from its start). */
    private void read(int i) {
        String ch = series.chapters.get(i);
        read(i, Library.isRead(reading(), ch) ? 0 : Library.pageOf(reading(), ch));
    }

    private void read(int i, int page) { screen.read(series, i, page); }

    private void menu(View anchor, int i) {
        PopupMenu m = new PopupMenu(getContext(), anchor, Gravity.END);
        String ch = series.chapters.get(i);
        boolean read = Library.isRead(reading(), ch);
        m.getMenu().add(read ? "Mark as unread" : "Mark as read").setOnMenuItemClickListener(x -> { mark(Collections.singletonList(i), !read); return true; });
        if (i > 0) m.getMenu().add("Mark the ones before as read").setOnMenuItemClickListener(x -> { mark(Shelf.before(i), true); return true; });
        if (series.remote > 0 && !kept.contains(Suwayomi.idOf(ch)) && !keeping.containsKey(ch))
            m.getMenu().add("Keep for offline").setOnMenuItemClickListener(x -> { keep(Collections.singletonList(i)); return true; });
        if (series.remote > 0 && !series.onServer.contains(Suwayomi.idOf(ch))) {
            m.getMenu().add("Download on the server").setOnMenuItemClickListener(x -> { onServer(Collections.singletonList(ch)); return true; });
            m.getMenu().add("Download every unread one on the server").setOnMenuItemClickListener(x -> {
                List<String> unread = new ArrayList<>();
                for (String c : series.chapters) if (!Library.isRead(reading(), c)) unread.add(c);
                onServer(unread);
                return true;
            });
        }
        m.show();
    }

    private void mark(List<Integer> which, boolean read) {
        List<String> chapters = new ArrayList<>();
        for (int i : which) chapters.add(series.chapters.get(i));
        Library.setRead(host, series, chapters, read, why -> { if (why != null) host.toast("Not saved: " + why); });
        shown();
    }

    /** Chapters queued in the server's own downloads (it keeps them: they read even once their source is gone). */
    private void onServer(List<String> chapters) {
        final Library.Series s = series;
        Pages.run(keeper, () -> {
            String said;
            try {
                int n = Suwayomi.download(host, s, chapters);
                said = n == 0 ? "On the server already" : n + (n == 1 ? " chapter" : " chapters") + " queued in Suwayomi's downloads";
            } catch (Exception e) { said = "Not queued: " + (e.getMessage() == null ? e.toString() : e.getMessage()); }
            final String told = said;
            post(() -> host.toast(told));
        });
    }

    /** The next `n` unread chapters from Continue on, kept for offline. */
    private void keepNext(int n) {
        Shelf.Resume r = resumeAt();
        List<Integer> todo = new ArrayList<>();
        for (int i : Shelf.next(readFlags(), Math.max(0, r.chapter), n + 2))
            if (!kept.contains(Suwayomi.idOf(series.chapters.get(i))) && todo.size() < n) todo.add(i);
        if (todo.isEmpty()) { host.toast("The next chapters are kept already"); return; }
        keep(todo);
    }

    /** Chapters' pages fetched into the cache one chapter after the other, each row saying how far. */
    private void keep(List<Integer> which) {
        final Library.Series s = series;
        for (int i : which) keeping.put(s.chapters.get(i), "waiting");
        adapter.notifyDataSetChanged();
        for (int i : which) {
            String ch = s.chapters.get(i);
            Pages.run(keeper, () -> {
                String why = null;
                try { Suwayomi.keep(host, ch, got -> post(() -> { keeping.put(ch, "keeping " + got); adapter.notifyDataSetChanged(); })); }
                catch (Exception e) { why = e.getMessage() == null ? e.toString() : e.getMessage(); }
                final String why2 = why;
                post(() -> {
                    keeping.remove(ch);
                    if (why2 == null) kept.add(Suwayomi.idOf(ch)); else host.toast(Chapter.titleOf(Library.name(ch)) + ": not kept (" + why2 + ")");
                    adapter.notifyDataSetChanged();
                });
            });
        }
    }

    /** Back from the reader: where you are now shown (the reader kept it in `series.reading`). */
    void returned() { shown(); }

    Library.Series series() { return series; }

    @Override public boolean back() { return false; }

    @Override protected void onDetachedFromWindow() { io.shutdownNow(); keeper.shutdownNow(); covers.close(); super.onDetachedFromWindow(); }

    // ---- the chapters ----

    private final class Adapter extends BaseAdapter {
        @Override public int getCount() { return series == null ? 0 : series.chapters.size(); }
        @Override public Object getItem(int p) { return null; }
        @Override public long getItemId(int p) { return p; }

        @Override public View getView(int p, View old, ViewGroup parent) {
            int n = series.chapters.size(), i = newestFirst ? n - 1 - p : p;
            String ch = series.chapters.get(i);
            boolean read = Library.isRead(reading(), ch);
            int page = Library.pageOf(reading(), ch);
            List<String> bits = new ArrayList<>();
            if (keeping.containsKey(ch)) bits.add(keeping.get(ch));
            else if (series.remote > 0 && kept.contains(Suwayomi.idOf(ch))) bits.add("offline");
            if (series.remote > 0 && series.onServer.contains(Suwayomi.idOf(ch))) bits.add("on the server");
            if (read) bits.add("read"); else if (page > 0) bits.add("page " + (page + 1));
            Row r = look.row(getContext(), null, Chapter.titleOf(Library.name(ch)), String.join(" · ", bits));
            boolean here = i == last();
            if (here) r.label.setTypeface(Typeface.DEFAULT_BOLD);
            r.setAlpha(read && !here ? 0.5f : 1f); // read ones quiet, as in Mihon
            return r;
        }
    }
}
