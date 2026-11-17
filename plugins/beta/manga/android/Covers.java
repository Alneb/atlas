package org.atlas.plugins.manga;

import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;

import org.atlas.capture.Host;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;

/** Series covers for the library and the series screen: the bytes asked away from the UI (a server's cover kept in
 *  the cache, Kept.cover; a vault series' cover.jpg or its first page), decoded small, kept in a memory LRU for the
 *  app's run. A view
 *  that was given another series meanwhile (a list recycles its rows) is left alone. */
final class Covers {
    /** Covers are decoded this wide at most (a grid tile's width on a large phone). */
    final int width;
    private final Host host;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Pages.pool(2, "manga-covers");
    /** Shared by the library and the series screens (a cover seen in one shows at once in the other). */
    private static final LruCache<String, Bitmap> memory = new LruCache<String, Bitmap>(24 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getAllocationByteCount(); }
    };

    Covers(Host host) {
        this.host = host;
        width = Math.min(host.look().dp(180), 480);
    }

    /** `key`'s cover into `v` (at once when in memory), its bytes from `bytes` (null bytes: none, the view stays as
     *  it is). */
    void show(ImageView v, String key, Callable<byte[]> bytes) {
        v.setTag(key);
        Bitmap had = memory.get(key);
        if (had != null) { v.setImageBitmap(had); return; }
        v.setImageDrawable(null);
        Pages.run(pool, () -> {
            Bitmap b = null;
            try {
                byte[] got = bytes.call();
                if (got != null) b = Pages.decode(host, got, width, width * 3 / 2, memory);
            } catch (Throwable e) { /* no cover: the tile's title stands for it */ }
            final Bitmap done = b;
            ui.post(() -> {
                if (done == null) return;
                memory.put(key, done);
                if (key.equals(v.getTag())) v.setImageBitmap(done);
            });
        });
    }

    /** A server series' cover bytes. */
    Callable<byte[]> server(Shelf.Item it) {
        return () -> it.cover == null || it.cover.isEmpty() ? null : Suwayomi.cover(host, Suwayomi.idOf(it.key), it.cover);
    }

    /** A series a source listed (Browse): its cover kept as a library series' is. */
    Callable<byte[]> found(Browse.Found f) {
        return () -> f.cover == null || f.cover.isEmpty() ? null : Suwayomi.cover(host, f.id, f.cover);
    }

    /** A source's icon. */
    Callable<byte[]> icon(Browse.Source s) { return () -> Suwayomi.icon(host, s); }

    /** A vault series' cover: a cover picture in its folder (view.js coverOf), else its first chapter's first page. */
    Callable<byte[]> vault(Library.Series s) {
        return () -> {
            if (host.isDir(s.path)) {
                for (String f : host.list(s.path)) {
                    String name = f.substring(f.lastIndexOf('/') + 1);
                    if (name.matches("(?i)cover\\.(jpe?g|png|webp)")) {
                        try (java.io.InputStream in = host.read(s.path + "/" + name)) { return org.atlas.capture.Bytes.all(in); }
                    }
                }
            }
            if (s.chapters.isEmpty()) return null;
            Chapter c = new Chapter(host, s.chapters.get(0));
            try { return c.size() == 0 ? null : c.page(0); } finally { c.close(); }
        };
    }

    void close() { pool.shutdownNow(); }
}
