package org.atlas.plugins.manga;

import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;

import org.atlas.capture.Host;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/** A chapter's pages as pictures, for the reader: the bytes fetched on a small pool (a Suwayomi page is a ~4 s network
 *  call, a .cbz entry a read), decoded on another at the size they are shown (a JPEG XL page takes ~2 s on the Boox),
 *  kept in a memory LRU. Only pages near where you are are worked on: one turned past is dropped before it costs
 *  anything. Answers on the UI thread. */
final class Pages {
    /** A page's picture, or why there is none; both null: dropped (the reader moved on). */
    static final class Got {
        final Bitmap bitmap;
        final String error;
        Got(Bitmap bitmap, String error) { this.bitmap = bitmap; this.error = error; }
    }

    interface Done { void got(Got g); }

    /** No bound on that side (fit width, webtoon: a page as tall as its width makes it). */
    static final int ANY = Integer.MAX_VALUE / 4;
    /** ~7 screen-sized pages (17 MB each on the Boox). Bitmaps live outside the Java heap since Android 8. */
    private static final int MEMORY = 128 * 1024 * 1024;
    /** The pages worth working on: one behind, three ahead (and the next chapter's first two). */
    private static final int BEHIND = 1, AHEAD = 3;

    private final Host host;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService fetch = pool(3, "manga-fetch"), decode = pool(2, "manga-decode");
    private final LruCache<String, Bitmap> memory = new LruCache<String, Bitmap>(MEMORY) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getAllocationByteCount(); }
    };
    private final Map<String, List<Done>> pending = new HashMap<>(); // UI thread only
    private volatile Chapter near, ahead;
    private volatile int center;

    Pages(Host host) { this.host = host; }

    /** Where you are: pages far from it are dropped from the queues. */
    void focus(Chapter c, int page) { near = c; center = page; }

    /** The next chapter, opened ahead: its first pages are wanted too. */
    void ahead(Chapter c) { ahead = c; }

    /** By path, not identity: a chapter opened again is a new Chapter with the same pages. */
    private boolean wanted(Chapter c, int p) {
        Chapter n = near, a = ahead;
        return n != null && n.path.equals(c.path) && p >= center - BEHIND && p <= center + AHEAD
            || a != null && a.path.equals(c.path) && p < 2;
    }

    /** The chapter to read a page from: the open one when it is the same (an older one may be closed). */
    private Chapter live(Chapter c) {
        Chapter n = near, a = ahead;
        return n != null && n.path.equals(c.path) ? n : a != null && a.path.equals(c.path) ? a : c;
    }

    Bitmap cached(Chapter c, int p, int w, int h) { return memory.get(key(c, p, w, h)); }

    /** Page `p` of `c` fitted in w × h; `done` (null: a prefetch) on the UI thread, at once when it is in memory. */
    void load(Chapter c, int p, int w, int h, Done done) {
        if (p < 0 || p >= c.size()) return;
        String k = key(c, p, w, h);
        Bitmap had = memory.get(k);
        if (had != null) { if (done != null) done.got(new Got(had, null)); return; }
        List<Done> waiting = pending.get(k);
        if (waiting != null) { if (done != null) waiting.add(done); return; }
        waiting = new ArrayList<>();
        if (done != null) waiting.add(done);
        pending.put(k, waiting);
        start(k, c, p, w, h);
    }

    private void start(String k, Chapter c, int p, int w, int h) {
        run(fetch, () -> {
            if (!wanted(c, p)) { finish(k, c, p, w, h, null, null); return; }
            byte[] bytes;
            try { bytes = live(c).page(p); }
            catch (Throwable e) { finish(k, c, p, w, h, null, e.getMessage() == null ? e.toString() : e.getMessage()); return; }
            run(decode, () -> {
                if (!wanted(c, p)) { finish(k, c, p, w, h, null, null); return; }
                Bitmap b = null;
                String why;
                try { b = decode(host, bytes, w, h, memory); why = b == null ? unreadable(bytes) : null; }
                catch (Throwable e) { why = "could not decode: " + e; } // never a dead worker with a page waiting on it
                finish(k, c, p, w, h, b, why);
            });
        });
    }

    private void finish(String k, Chapter c, int p, int w, int h, Bitmap b, String error) {
        ui.post(() -> {
            List<Done> waiting = pending.get(k);
            if (b == null && error == null && waiting != null && !waiting.isEmpty() && wanted(c, p)) { start(k, c, p, w, h); return; } // wanted again meanwhile
            pending.remove(k);
            if (b != null) memory.put(k, b);
            if (waiting != null) for (Done d : waiting) d.got(new Got(b, error));
        });
    }

    void close() { fetch.shutdownNow(); decode.shutdownNow(); memory.evictAll(); }

    private static String key(Chapter c, int p, int w, int h) { return c.path + "#" + p + "@" + w + "x" + h; }

    // ---- decoding ----------------------------------------------------------------------------------------------

    /** Any picture's bytes fitted in w × h: the app's decoder (Android's for JPEG, PNG, WebP, GIF; its Rust one for
     *  JPEG XL, sniffed by signature), then for AVIF / HEIF the platform's ImageDecoder (BitmapFactory gives null for
     *  them on the Boox). Out of memory empties `cache` and says so instead of killing the app. */
    static Bitmap decode(Host host, byte[] b, int w, int h, LruCache<String, Bitmap> cache) {
        try {
            Bitmap m = host.decode(b, w, h);
            if (m == null && Build.VERSION.SDK_INT >= 28 && isHeif(b)) m = platform(b, w, h);
            return m == null ? null : fit(m, w, h);
        } catch (OutOfMemoryError e) {
            if (cache != null) cache.evictAll();
            return null;
        }
    }

    /** An ISO-BMFF picture (AVIF, HEIC): `ftyp` at byte 4. Only these go to ImageDecoder, which waits on a codec. */
    static boolean isHeif(byte[] b) {
        return b.length > 12 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p';
    }

    @android.annotation.TargetApi(28)
    private static Bitmap platform(byte[] b, int w, int h) {
        try {
            return android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(b)), (d, info, src) -> {
                float k = Math.min(1f, Math.min(w / (float) info.getSize().getWidth(), h / (float) info.getSize().getHeight()));
                if (k < 1f) d.setTargetSize(Math.max(1, Math.round(info.getSize().getWidth() * k)), Math.max(1, Math.round(info.getSize().getHeight() * k)));
                d.setAllocator(android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE);
            });
        } catch (Exception e) { return null; }
    }

    /** Scaled down to fit w × h when much larger (inSampleSize only halves): less memory, and the page filtered once
     *  here rather than at every draw. */
    static Bitmap fit(Bitmap m, int w, int h) {
        float k = Math.min(w / (float) m.getWidth(), h / (float) m.getHeight());
        if (k >= 0.87f) return m;
        Bitmap s = Bitmap.createScaledBitmap(m, Math.max(1, Math.round(m.getWidth() * k)), Math.max(1, Math.round(m.getHeight() * k)), true);
        if (s != m) m.recycle();
        return s;
    }

    /** Why bytes are no picture, in words: a web page (a sign-in in front), or which kind this device cannot read. */
    static String unreadable(byte[] b) {
        if (b.length == 0) return "the page is empty";
        String head = new String(b, 0, Math.min(b.length, 64), StandardCharsets.ISO_8859_1).trim().toLowerCase(java.util.Locale.ROOT);
        if (head.startsWith("<") || head.startsWith("{")) return "the server sent a web page, not a picture (signed out?)";
        if (head.contains("ftypavif") || head.contains("ftypavis")) return "an AVIF picture this device cannot decode";
        if ((b[0] & 0xff) == 0xff && b.length > 1 && b[1] == 0x0a || head.contains("jxl ")) return "a JPEG XL picture the decoder could not read";
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i < Math.min(8, b.length); i++) hex.append(String.format("%02x", b[i] & 0xff));
        return "not a picture this device reads (it starts " + hex + ")";
    }

    // ---- threads -----------------------------------------------------------------------------------------------

    /** A pool of background-priority daemon threads (never in the way of the UI). */
    static ExecutorService pool(int n, String name) {
        return Executors.newFixedThreadPool(n, r -> {
            Thread t = new Thread(() -> { android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND); r.run(); }, name);
            t.setDaemon(true);
            return t;
        });
    }

    /** `r` on `pool`; nothing once the screen closed it. */
    static void run(ExecutorService pool, Runnable r) {
        try { pool.execute(r); } catch (RejectedExecutionException e) { /* closed: the screen is gone */ }
    }
}
