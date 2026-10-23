package org.atlas.notepad;

import org.atlas.capture.Host;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The page each drawing was last shown at, so it opens there again. One small file in the vault, so it travels to the other devices:
 *  `{ "<drawing path>": "<page frame id>" }`; a page is kept by its frame's id, which moving pages does not change. */
final class LastPages {
    static final String FILE = ".atlas/notepad/last-pages.json";
    private static final ExecutorService ONE = Executors.newSingleThreadExecutor(); // in order, off the UI thread

    private LastPages() {}

    /** The page id `drawing` was last shown at, or null. Reads the vault: not on the UI thread for a server vault. */
    static String of(Host host, String drawing) {
        try {
            String text = host.exists(FILE) ? host.readText(FILE) : null;
            return text == null ? null : new JSONObject(text).optString(drawing, null);
        } catch (JSONException e) { return null; }
    }

    /** `drawing` is at page `pageId` now: written in the background, the file read again first (another device's). */
    static void remember(Host host, String drawing, String pageId) {
        if (pageId == null) return;
        ONE.execute(() -> {
            try {
                String text = host.exists(FILE) ? host.readText(FILE) : null;
                JSONObject all = text == null || text.trim().isEmpty() ? new JSONObject() : new JSONObject(text);
                if (pageId.equals(all.optString(drawing, null))) return;
                host.write(FILE, all.put(drawing, pageId).toString(1).getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) { /* only a convenience: the drawing opens at its last page instead */ }
        });
    }
}
