package org.atlas.capture;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.LruCache;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The pages of a vault document drawn on the fly (memory `project_paper_core.md`). A drawing over a PDF holds, per page, an image element with no file — `fileId` `fileId(path, n)`,
 *  `customData.atlasPage = {file, page}` — and whoever paints it (Notepad's Painter, the book reader) asks here. Pages
 *  are rendered by Android's PdfRenderer off the UI thread at the width they are drawn (in steps, so a zoom reuses
 *  them), kept in a shared cache; `ready` runs on the UI thread when a page asked for is there. */
public final class PageSource {
    private PageSource() {}

    /** The element's file id for page `page` (1-based) of `path`: the same on every device and on the web. */
    public static String fileId(String path, int page) { return "atlas-page-" + Integer.toHexString(path.hashCode()) + "-" + page; }

    private static final ExecutorService render = Executors.newSingleThreadExecutor();
    private static final Handler ui = new Handler(Looper.getMainLooper());
    private static final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(64 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getByteCount(); }
    };
    /** Pages being rendered, and who waits for each: a prefetch (no one) and the reader drawing the same page right
     *  after must both be told — the second ask was dropped, and the page stayed blank until touched. */
    private static final Map<String, java.util.List<Runnable>> asked = new HashMap<>();
    private static final Map<String, float[][]> sizes = new HashMap<>();

    /** Widths rendered at: the next step up from the width drawn (a page drawn 700 px wide is rendered 800). */
    private static int step(float px) {
        int[] steps = { 400, 800, 1200, 1600, 2400, 3200 }; // 3200: a page zoomed in the reader
        for (int s : steps) if (px <= s) return s;
        return steps[steps.length - 1];
    }

    /** Page `page` (1-based) of the vault's `path`, about `px` wide: now if it is rendered (or a smaller one meanwhile),
     *  else null; `ready` on the UI thread once it is. */
    public static Bitmap page(Host host, String path, int page, float px, Runnable ready) {
        int w = step(px);
        String key = path + "#" + page + "@" + w;
        Bitmap b = cache.get(key);
        if (b != null) return b;
        synchronized (asked) {
            java.util.List<Runnable> waiting = asked.get(key);
            if (waiting != null) { if (ready != null) waiting.add(ready); }
            else {
                java.util.List<Runnable> mine = new java.util.ArrayList<>();
                if (ready != null) mine.add(ready);
                asked.put(key, mine);
                render.execute(() -> {
                    try {
                        Bitmap got = draw(host, path, page, w);
                        if (got != null) cache.put(key, got);
                    } catch (Exception | OutOfMemoryError e) { android.util.Log.w("AtlasPages", path + " page " + page + ": " + e); }
                    java.util.List<Runnable> told;
                    synchronized (asked) { told = asked.remove(key); }
                    if (told != null) for (Runnable r : told) ui.post(r);
                });
            }
        }
        for (int s = w - 400; s >= 400; s -= 400) { Bitmap smaller = cache.get(path + "#" + page + "@" + s); if (smaller != null) return smaller; }
        return null;
    }

    /** The PDF last rendered from, kept open on the render thread: opening (parsing) a big PDF for every page made each
     *  turn slow. Only `render` touches these. */
    private static String openPath;
    private static long openStamp;
    private static ParcelFileDescriptor openFd;
    private static PdfRenderer open;

    private static PdfRenderer renderer(Host host, String path) throws Exception {
        java.io.File f = host.local(path);
        long stamp = f.lastModified() ^ f.length();
        if (open != null && path.equals(openPath) && stamp == openStamp) return open;
        closeOpen();
        openFd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
        open = new PdfRenderer(openFd);
        openPath = path;
        openStamp = stamp;
        return open;
    }

    private static void closeOpen() {
        try { if (open != null) open.close(); } catch (Exception ignored) { }
        try { if (openFd != null) openFd.close(); } catch (Exception ignored) { }
        open = null; openFd = null; openPath = null;
    }

    private static Bitmap draw(Host host, String path, int page, int width) throws Exception {
        PdfRenderer r;
        try { r = renderer(host, path); } catch (Exception e) { closeOpen(); throw e; }
        if (page < 1 || page > r.getPageCount()) return null;
        try (PdfRenderer.Page p = r.openPage(page - 1)) {
            int h = Math.max(1, Math.round(width * (float) p.getHeight() / Math.max(1, p.getWidth())));
            Bitmap b = Bitmap.createBitmap(width, h, Bitmap.Config.ARGB_8888);
            b.eraseColor(Color.WHITE); // a PDF's page is paper: transparent where nothing is printed
            p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            return b;
        }
    }

    /** Page `page` of `path` about `px` wide, waited for (an export drawing every page): never on the UI thread's
     *  only path to the renderer — it runs on the render thread and this one waits. Null when it cannot be read. */
    public static Bitmap pageNow(Host host, String path, int page, float px) {
        int w = step(px);
        String key = path + "#" + page + "@" + w;
        Bitmap b = cache.get(key);
        if (b != null) return b;
        try {
            Bitmap got = render.submit(() -> draw(host, path, page, w)).get();
            if (got != null) cache.put(key, got);
            return got;
        } catch (Exception e) { android.util.Log.w("AtlasPages", path + " page " + page + ": " + e); return null; }
    }

    /** Pages `from`..`to` rendered ahead at about `px` wide (the next turn is then instant); nothing returned. */
    public static void prefetch(Host host, String path, int from, int to, float px) {
        for (int i = from; i <= to; i++) if (i >= 1) page(host, path, i, px, null);
    }

    /** Every page's size in points ([w, h] each), or an empty array when the PDF cannot be read. Blocking: never on
     *  the UI thread. */
    public static float[][] sizes(Host host, String path) {
        synchronized (sizes) { if (sizes.containsKey(path)) return sizes.get(path); }
        float[][] out;
        try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(host.local(path), ParcelFileDescriptor.MODE_READ_ONLY);
             PdfRenderer r = new PdfRenderer(fd)) {
            out = new float[r.getPageCount()][];
            for (int i = 0; i < out.length; i++) try (PdfRenderer.Page p = r.openPage(i)) { out[i] = new float[] { p.getWidth(), p.getHeight() }; }
        } catch (Exception e) { return new float[0][]; }
        synchronized (sizes) { sizes.put(path, out); }
        return out;
    }
}
