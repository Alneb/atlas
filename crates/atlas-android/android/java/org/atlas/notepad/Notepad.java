package org.atlas.notepad;

import android.view.View;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;

/** The notepad's Android side: on an e-ink screen a drawing opened from the vault goes to the pen screen; a phone keeps
 *  Excalidraw. A PDF goes to the book reader, whose pen and marks are kept in the PDF's note (pdf-marks), as on the
 *  desktop; an older `x.pdf.excalidraw` still opens here until `atlas pdf-marks migrate` moves it into the note. */
public final class Notepad implements NativePlugin {
    @Override public String id() { return "notepad"; }

    @Override public boolean opens(String path) { return (path.endsWith(".excalidraw") || path.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) && Host.einkScreen(); }


    @Override public View view(Host host, String path) {
        // `x.excalidraw#Page 2` (a link to a page): the drawing, opened at that page
        int hash = path.indexOf('#');
        if (hash > 0 && path.toLowerCase(java.util.Locale.ROOT).substring(0, hash).endsWith(".pdf")) { host.openElsewhere(id(), path); return new View(host.activity()); } // the reader, at `#page=N`
        if (hash > 0) {
            View v = view(host, path.substring(0, hash));
            if (v instanceof NotepadView) ((NotepadView) v).startAt = path.substring(hash + 1);
            return v;
        }
        String low = path.toLowerCase(java.util.Locale.ROOT);
        // an older PDF companion drawing, not yet moved into the note: opened as it is
        if (low.endsWith(".pdf.excalidraw")) return new NotepadView(host, path, path.substring(0, path.length() - ".excalidraw".length()));
        if (!low.endsWith(".pdf")) return new NotepadView(host, path);
        host.openElsewhere(id(), path); // one store for a PDF's ink and marks: its note, through the reader
        return new View(host.activity());
    }
}
