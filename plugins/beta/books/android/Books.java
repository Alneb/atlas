package org.atlas.plugins.books;

import android.view.View;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;

/** The Books plugin's Android side (docs/design/DESIGN-native-book-reader.md): the reader. A book chosen in the page's
 *  library (main.js, a server's from its local copy) or the vault opens here, where it was left. */
public final class Books implements NativePlugin {
    @Override public String id() { return "books"; }

    @Override public boolean opens(String path) { return Formats.opens(path); }

    @Override public View view(Host host, String path) {
        BooksScreen s = new BooksScreen(host);
        s.read(path);
        return s;
    }
}
