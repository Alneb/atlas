package org.atlas.plugins.notepad;

import android.view.View;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;

/** The notepad plugin's Android side (plugin.toml): on an e-ink screen a drawing opened from the vault goes to the pen
 *  screen; a phone keeps Excalidraw. A PDF too: written on in its drawing beside it, `x.pdf.excalidraw`, its pages in as the notebook's. */
public final class Notepad implements NativePlugin {
    @Override public String id() { return "notepad"; }

    @Override public boolean opens(String path) { return (path.endsWith(".excalidraw") || path.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) && Host.einkScreen(); }


    @Override public View view(Host host, String path) {
        // `x.excalidraw#Page 2` (a link to a page): the drawing, opened at that page
        int hash = path.indexOf('#');
        if (hash > 0) {
            View v = view(host, path.substring(0, hash));
            if (v instanceof NotepadView) ((NotepadView) v).startAt = path.substring(hash + 1);
            return v;
        }
        String low = path.toLowerCase(java.util.Locale.ROOT);
        // a PDF's companion (Books' "Write on it"): written on, its pages linked in the first time
        if (low.endsWith(".pdf.excalidraw")) return new NotepadView(host, path, path.substring(0, path.length() - ".excalidraw".length()));
        if (!low.endsWith(".pdf")) return new NotepadView(host, path);
        if ("reader".equals(host.settings().optString("pdf", "write"))) { host.openPlugin("books", path); return new View(host.activity()); } // Settings: PDFs in the book reader (the same ink)
        return new NotepadView(host, path + ".excalidraw", path);
    }
}
