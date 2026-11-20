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

/** A chapter's pages as pictures, for the reader, as Mihon preloads them: the bytes fetched on a small pool (a
 *  Suwayomi page is a few MB over the network, a .cbz entry a read), decoded on another at about the size they are
 *  shown, kept in a memory LRU. Both pools take their work in the order it is wanted (Prefetch: the page on screen,
 *  then the next ones the way you read, the ones behind, the next chapter's first), so the page you wait for never
 *  queues behind a prefetch, and a page turned past is dropped before it costs anything. The decoding threads run at
 *  the normal priority: on Android a background thread (and every thread it makes, as the JPEG XL decoder's) runs on
 *  the slow cores. Each page's fetch and decode times go to the app's log (DeviceLog). Answers on the UI thread. */
final class Pages {
    /** A page's picture, or why there is none; both null: dropped (the reader moved on). */
    static final class Got {
        final Bitmap bitmap;
        final String error;
        Got(Bitmap bitmap, String error) { this.bitmap = bitmap; this.error = error; }
    }

    interface Done { void got(Got g); }

    /** How far a page's bytes have come (0–100, -1: the size is unknown), on the UI thread. */
    interface Progress { void progress(String chapter, int page, int percent); }

    /** No bound on that side (fit width, webtoon: a page as tall as its width makes it). */
    static final int ANY = Integer.MAX_VALUE / 4;
    /** ~19 screen-sized pages on a 1080 × 2400 phone (7 on the Boox). Bitmaps live outside the Java heap since Android 8. */
    private static final int MEMORY = 128 * 1024 * 1024;
    private static final String LOG = "atlas-manga";

    /** A queued piece of work and what to do when it is dropped unstarted. */
    private static final class Work {
        final Runnable run, drop;
        Work(Runnable run, Runnable drop) { this.run = run; this.drop = drop; }
    }

    private final Host host;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Prefetch<Work> fetching = new Prefetch<>(w -> w.drop.run()), decoding = new Prefetch<>(w -> w.drop.run());
    private final List<Thread> workers = new ArrayList<>();
    private final LruCache<String, Bitmap> memory = new LruCache<String, Bitmap>(MEMORY) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getAllocationByteCount(); }
    };
    private final Map<String, List<Done>> pending = new HashMap<>(); // UI thread only
    private volatile Chapter near, ahead;
    private volatile Progress progress;
    private volatile Prefetch.Focus lastFocus;

    Pages(Host host) {
        this.host = host;
        // two fetches at once: the page on screen and the next (more only split the bandwidth the one you wait for
        // needs); two decodes, each on every core (the JPEG XL decoder's own threads)
        for (int i = 0; i < 2; i++) workers.add(worker(fetching, "manga-fetch", android.os.Process.THREAD_PRIORITY_DEFAULT + android.os.Process.THREAD_PRIORITY_LESS_FAVORABLE));
        for (int i = 0; i < 2; i++) workers.add(worker(decoding, "manga-decode", android.os.Process.THREAD_PRIORITY_DEFAULT));
    }

    /** Where you are (page `page` of `c`, the last turn on or back), and the next chapter when it is open: what is
     *  far from it is dropped from the queues. */
    void focus(Chapter c, int page, boolean forward) {
        near = c;
        Chapter a = ahead;
        Prefetch.Focus f = new Prefetch.Focus(c.path, page, c.size(), forward, a == null ? null : a.path);
        fetching.focus(f);
        decoding.focus(f);
        lastFocus = f;
    }

    /** The next chapter, opened ahead (null: none): its first pages are wanted too. */
    void ahead(Chapter c) {
        ahead = c;
        Prefetch.Focus f = lastFocus;
        if (f != null && near != null) focus(near, f.page, f.forward);
    }

    /** Told how far the page being fetched has come (the reader's progress indicator). */
    void onProgress(Progress p) { progress = p; }

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
        Runnable dropped = () -> finish(k, c, p, w, h, null, null);
        fetching.add(c.path, p, new Work(() -> {
            byte[] bytes;
            long t0 = System.nanoTime();
            int[] said = { -2 };
            try {
                bytes = live(c).page(p, percent -> {
                    int shown = Prefetch.shown(percent, host.eink());
                    if (shown == said[0]) return;
                    said[0] = shown;
                    Progress to = progress;
                    if (to != null) ui.post(() -> to.progress(c.path, p, shown));
                });
            } catch (Throwable e) { finish(k, c, p, w, h, null, e.getMessage() == null ? e.toString() : e.getMessage()); return; }
            long fetched = (System.nanoTime() - t0) / 1_000_000;
            decoding.add(c.path, p, new Work(() -> {
                Bitmap b = null;
                String why;
                long t1 = System.nanoTime();
                try { b = decode(host, bytes, w, h, memory); why = b == null ? unreadable(bytes) : null; }
                catch (Throwable e) { why = "could not decode: " + e; } // never a dead worker with a page waiting on it
                android.util.Log.i(LOG, c.title + " page " + (p + 1) + ": " + bytes.length / 1024 + " KB in " + fetched + " ms, decoded"
                    + (b == null ? " (failed)" : " to " + b.getWidth() + "×" + b.getHeight()) + " in " + (System.nanoTime() - t1) / 1_000_000 + " ms");
                finish(k, c, p, w, h, b, why);
            }, dropped));
        }, dropped));
    }

    private void finish(String k, Chapter c, int p, int w, int h, Bitmap b, String error) {
        ui.post(() -> {
            List<Done> waiting = pending.get(k);
            if (b == null && error == null && waiting != null && !waiting.isEmpty() && fetching.wanted(c.path, p)) { start(k, c, p, w, h); return; } // wanted again meanwhile
            pending.remove(k);
            if (b != null) memory.put(k, b);
            if (waiting != null) for (Done d : waiting) d.got(new Got(b, error));
        });
    }

    void close() {
        fetching.close();
        decoding.close();
        for (Thread t : workers) t.interrupt();
        memory.evictAll();
    }

    private static String key(Chapter c, int p, int w, int h) { return c.path + "#" + p + "@" + w + "x" + h; }

    /** A daemon thread at `priority` doing `queue`'s work, soonest first, until it is closed. */
    private static Thread worker(Prefetch<Work> queue, String name, int priority) {
        Thread t = new Thread(() -> {
            android.os.Process.setThreadPriority(priority);
            try {
                for (Work w; (w = queue.take()) != null; ) {
                    try { w.run.run(); } catch (RuntimeException e) { android.util.Log.w(LOG, name + ": " + e); }
                }
            } catch (InterruptedException closed) { /* the reader is gone */ }
        }, name);
        t.setDaemon(true);
        t.start();
        return t;
    }

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
