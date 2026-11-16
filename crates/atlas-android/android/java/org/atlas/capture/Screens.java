package org.atlas.capture;

import android.graphics.Bitmap;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The screen taken for a box that is already open. Writing the picture as a PNG takes longer than everything else the
 * gesture does (a phone screen is 2–3 megapixels; PNG is slow to encode), so ScreenService opens the box as soon as
 * the pixels are in memory and writes the file meanwhile; the box asks here for it ([when]) and shows the picture once
 * it is on disk, with a thumbnail made from the pixels in memory instead of decoding the PNG again.
 * The file is written as `<path>.part` and renamed, so a file at `path` is always whole: a box that asks after the
 * process restarted (the box moved into its activity, CaptureBox.activity) finds the finished file on disk.
 */
final class Screens {
    /** The picture is on disk (`file`, its thumbnail when known, else null), or could not be written (`file` null). */
    interface Ready { void ready(File file, Bitmap thumb); }

    /** One screen's outcome. */
    private static final class Done {
        final boolean ok; final Bitmap thumb;
        Done(boolean ok, Bitmap thumb) { this.ok = ok; this.thumb = thumb; }
    }

    /** The last few screens written (a box asks soon after); older ones are found on disk. */
    private static final Map<String, Done> done = new LinkedHashMap<String, Done>() {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Done> e) { return size() > 4; }
    };
    private static final Map<String, List<Ready>> waiting = new HashMap<>();

    private Screens() {}

    /** Calls `r` once the screen at `path` is written (or failed) — at once when it is already. On the caller's thread
     *  when ready now, else on the writer's: `r` posts to its own. */
    static void when(String path, Ready r) {
        Done d;
        synchronized (Screens.class) {
            d = done.get(path);
            if (d == null && !new File(path).isFile()) { waiting.computeIfAbsent(path, k -> new ArrayList<>()).add(r); return; }
        }
        if (d == null) r.ready(new File(path), null); // written before this process asked: on disk, whole
        else r.ready(d.ok ? new File(path) : null, d.thumb);
    }

    /** From the writer: the file is in place (or not), the boxes waiting for it told. */
    static void written(String path, boolean ok, Bitmap thumb) {
        List<Ready> told;
        synchronized (Screens.class) {
            done.put(path, new Done(ok, thumb));
            told = waiting.remove(path);
        }
        if (told != null) for (Ready r : told) r.ready(ok ? new File(path) : null, thumb);
    }
}
