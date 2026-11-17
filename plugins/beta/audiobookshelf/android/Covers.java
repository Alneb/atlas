package org.atlas.plugins.audiobookshelf;

import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Book covers for the screens: the bytes from the plugin's cache or the server (Abs.cover) away from the UI, decoded
 *  small, kept in a memory LRU for the app's run. A view given another book meanwhile (a list recycles) is left alone. */
final class Covers {
    private static final LruCache<String, Bitmap> memory = new LruCache<String, Bitmap>(24 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getAllocationByteCount(); }
    };
    private final AbsScreen screen;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(2);
    private final int width;

    Covers(AbsScreen screen) { this.screen = screen; width = Math.min(screen.host.look().dp(220), 600); }

    /** `item`'s cover into `v` (at once when in memory). */
    void show(ImageView v, String item) {
        v.setTag(item);
        Bitmap had = item == null ? null : memory.get(item);
        v.setImageBitmap(had);
        if (had != null || item == null || item.isEmpty() || pool.isShutdown()) return;
        pool.execute(() -> {
            byte[] b = screen.abs.cover(item);
            Bitmap bm = b == null ? null : screen.host.decode(b, width, width * 3 / 2);
            if (bm == null) return;
            ui.post(() -> { memory.put(item, bm); if (item.equals(v.getTag())) v.setImageBitmap(bm); });
        });
    }

    /** The bytes of a cover already shown (for the lock screen), or null. Never on the UI thread. */
    byte[] bytes(String item) { return screen.abs.cover(item); }

    void close() { pool.shutdownNow(); }
}
