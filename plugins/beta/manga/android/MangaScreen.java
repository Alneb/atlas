package org.atlas.plugins.manga;

import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;

/** The reader's frame (the library is browsed on the web side, view.js): a chapter handed over — a vault .cbz, a vault
 *  folder of pictures, a Suwayomi chapter — has its series and place found away from the UI, then the reader opens at
 *  the page it was left on; a reading mode changed in the reader makes it again at the same page. Back past the reader
 *  is the app's: back to the library it came from. */
final class MangaScreen extends FrameLayout implements NativePlugin.Back {
    final Host host;
    private final TextView status;
    private final ExecutorService opener = Pages.pool(1, "manga-open");
    private Library.Series series;
    private JSONObject reading;
    private ReaderView reader;

    MangaScreen(Host host, String path) {
        super(host.activity());
        this.host = host;
        setBackgroundColor(host.look().bg);
        status = host.look().label(getContext(), "Opening " + Chapter.titleOf(path) + "…", 15, host.look().muted);
        status.setGravity(Gravity.CENTER);
        status.setPadding(host.look().dp(32), 0, host.look().dp(32), 0);
        addView(status, new LayoutParams(-1, -1));
        Pages.run(opener, () -> open(path));
    }

    /** Away from the UI: the series (listing a folder, or asking the server), where you are, then the reader. */
    private void open(String path) {
        try {
            Library.Series s;
            JSONObject r;
            int i;
            if (Suwayomi.is(path)) {
                s = Suwayomi.series(host, path);
                r = s.reading;
                int id = Suwayomi.idOf(path);
                i = -1;
                for (int k = 0; k < s.chapters.size() && i < 0; k++) if (Suwayomi.idOf(s.chapters.get(k)) == id) i = k;
                if (i < 0) throw new java.io.IOException("the server no longer lists this chapter");
            } else {
                s = local(path);
                if (s == null) { post(() -> { host.openInWeb(path); host.activity().finish(); }); return; } // no chapter: the app's own view
                r = Library.reading(host, s);
                s.reading = r;
                i = Math.max(0, s.chapters.indexOf(Manga.chapterPath(host, path)));
            }
            String ch = s.chapters.get(i);
            int page = Library.isRead(r, ch) ? 0 : Library.pageOf(r, ch);
            final int at = i;
            post(() -> { series = s; reading = r; read(at, page); });
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

    /** The reader on chapter `i` at `page`, in place of the one shown (a mode changed). */
    void read(int i, int page) {
        if (reader != null) removeView(reader);
        status.setVisibility(GONE);
        reader = new ReaderView(this, series, reading, i, page);
        addView(reader, new LayoutParams(-1, -1));
        reader.requestFocus(); // the volume keys
        if (host.eink()) post(host::einkRefresh); // a whole new screen: no ghost of the last one
    }

    @Override public boolean back() { return reader != null && reader.back(); }

    @Override protected void onDetachedFromWindow() { opener.shutdownNow(); super.onDetachedFromWindow(); }
}
