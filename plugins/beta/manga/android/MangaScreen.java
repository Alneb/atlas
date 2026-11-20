package org.atlas.plugins.manga;

import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

/** The plugin's frame, a stack of places as a reader app has them: the library (LibraryView), Browse (the server's
 *  sources, SourcesView, and a source's series, SourceView), a series (SeriesView), the reader (ReaderView); Back goes down one, and past the first the app takes it. What it opens on:
 *  `manga:library`, `manga:series/<vault path or suwayomi:<id>>` (the page's Comics library hands a series over), or a
 *  chapter — a vault .cbz, a vault folder of pictures, a Suwayomi chapter — whose series and place are found away from
 *  the UI, the reader opening at the page it was left on. A reading mode changed in the reader makes it again at the
 *  same page. */
final class MangaScreen extends FrameLayout implements NativePlugin.Back {
    /** The addresses of the plugin's own places (Manga.opens). */
    static final String LIBRARY = "manga:library", SERIES = "manga:series/", BROWSE = "manga:browse";

    final Host host;
    private final List<View> stack = new ArrayList<>();
    private TextView status;
    private final ExecutorService opener = Pages.pool(1, "manga-open");
    /** The reader's series (its chapters and where you are). */
    private Library.Series series;
    /** A series was added to or removed from the server's library (a series' screen): the library lists again when
     *  it is shown. */
    boolean libraryChanged;

    MangaScreen(Host host, String path) {
        super(host.activity());
        this.host = host;
        setBackgroundColor(host.look().bg);
        // opened on a series or a chapter (Continue, a link, the launcher): the places under it are made too, so Back
        // steps reader → series → library as if you had come that way, and only then leaves
        if (path.startsWith(SERIES)) { push(new LibraryView(this)); series(path.substring(SERIES.length()), null, null, null); }
        else if (BROWSE.equals(path)) { push(new LibraryView(this)); browse(); } // Back goes to the library
        else if (path.startsWith("manga:")) push(new LibraryView(this));
        else {
            status = host.look().label(getContext(), "Opening " + Chapter.titleOf(path) + "…", 15, host.look().muted);
            status.setGravity(Gravity.CENTER);
            status.setPadding(host.look().dp(32), 0, host.look().dp(32), 0);
            addView(status, new LayoutParams(-1, -1));
            Pages.run(opener, () -> open(path));
        }
    }

    // ---- the stack ----

    private void push(View v) {
        if (!stack.isEmpty()) stack.get(stack.size() - 1).setVisibility(GONE); // kept as it was: Back shows it again
        stack.add(v);
        addView(v, new LayoutParams(-1, -1));
        v.requestFocus(); // the reader's volume keys
        if (host.eink()) post(host::einkRefresh); // a whole new screen: no ghost of the last one
    }

    private void pop() {
        View gone = stack.remove(stack.size() - 1);
        removeView(gone);
        View top = stack.get(stack.size() - 1);
        top.setVisibility(VISIBLE);
        top.requestFocus();
        Library.Series s = gone instanceof ReaderView ? series : gone instanceof SeriesView ? ((SeriesView) gone).series() : null;
        if (top instanceof SeriesView) ((SeriesView) top).returned();
        if (top instanceof LibraryView) {
            if (libraryChanged) { libraryChanged = false; ((LibraryView) top).reload(); }
            else ((LibraryView) top).returned(s);
        }
        if (top instanceof SourceView && gone instanceof SeriesView) ((SourceView) top).returned((SeriesView) gone);
        if (host.eink()) post(host::einkRefresh);
    }

    /** A series' screen: `known` when the library has it already (a vault series), else found by its key. */
    void series(String key, String title, String coverUrl, Library.Series known) {
        push(new SeriesView(this, key, title, coverUrl, known));
    }

    /** Browse: the server's sources. */
    void browse() { push(new SourcesView(this)); }

    /** A source's series (popular first). */
    void source(Browse.Source s) { push(new SourceView(this, s)); }

    /** The reader on chapter `i` of `s` at `page`, over the screen shown (Back returns to it). */
    void read(Library.Series s, int i, int page) {
        series = s;
        if (s.reading == null) s.reading = new JSONObject();
        push(new ReaderView(this, s, s.reading, i, page));
    }

    /** The reader made again (a reading mode changed) on chapter `i` at `page`, in place of the one shown. */
    void read(int i, int page) {
        View top = stack.isEmpty() ? null : stack.get(stack.size() - 1);
        if (top instanceof ReaderView) { stack.remove(stack.size() - 1); removeView(top); }
        push(new ReaderView(this, series, series.reading, i, page));
    }

    // ---- a chapter handed over ----

    /** Away from the UI: the series (listing a folder, or asking the server), where you are, then the reader. */
    private void open(String path) {
        try {
            Library.Series s;
            int i;
            if (Suwayomi.is(path)) {
                s = Suwayomi.series(host, path);
                int id = Suwayomi.idOf(path);
                i = -1;
                for (int k = 0; k < s.chapters.size() && i < 0; k++) if (Suwayomi.idOf(s.chapters.get(k)) == id) i = k;
                if (i < 0) throw new java.io.IOException("the server no longer lists this chapter");
            } else {
                s = local(path);
                if (s == null) { post(() -> { host.openInWeb(path); host.activity().finish(); }); return; } // no chapter: the app's own view
                s.reading = Library.reading(host, s);
                i = Math.max(0, s.chapters.indexOf(Manga.chapterPath(host, path)));
            }
            String ch = s.chapters.get(i);
            int page = Library.isRead(s.reading, ch) ? 0 : Library.pageOf(s.reading, ch);
            final int at = i;
            post(() -> {
                removeView(status);
                push(new LibraryView(this));
                // a vault series is known as it is; a server's is asked again by its key (its cover, its categories)
                series(s.remote != 0 ? "suwayomi:" + s.remote : s.path, s.title, null, s.remote != 0 ? null : s);
                read(s, at, page);
            });
        } catch (Exception e) {
            post(() -> status.setText("Cannot open " + Chapter.titleOf(path) + ": " + e.getMessage()));
        }
    }

    /** A vault chapter's series: the folder it is in, or the chapter alone (a .cbz loose in the library folder, a
     *  folder of pictures there). Null when the path holds no chapter (an empty folder). */
    private Library.Series local(String path) {
        String chapter = Manga.chapterPath(host, path);
        if (!Chapter.isZip(chapter)) {
            if (!host.isDir(chapter)) return null;
            boolean pictures = false;
            for (String f : host.list(chapter)) if (Chapter.PICTURE.matcher(f).matches()) { pictures = true; break; }
            if (!pictures) return null;
        }
        String folder = Library.seriesOf(chapter);
        if (!folder.equals(chapter) && !folder.equals(Library.folder(host)) && host.isDir(folder)) {
            Library.Series s = new Library.Series(folder, folder.substring(folder.lastIndexOf('/') + 1));
            Library.chapters(host, s);
            if (s.chapters.contains(chapter)) return s;
        }
        Library.Series s = new Library.Series(chapter, Chapter.titleOf(chapter));
        s.chapters.add(chapter);
        return s;
    }

    /** The top place's own Back first (the reader's bars, the library's filter), then down one place. */
    @Override public boolean back() {
        if (stack.isEmpty()) return false;
        View top = stack.get(stack.size() - 1);
        if (top instanceof NativePlugin.Back && ((NativePlugin.Back) top).back()) return true;
        if (stack.size() > 1) { pop(); return true; }
        return false;
    }

    @Override protected void onDetachedFromWindow() { opener.shutdownNow(); super.onDetachedFromWindow(); }
}
