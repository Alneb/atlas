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
        // `x.pdf#page=3` (a link to a page, Obsidian's form): that page, not where the book was left
        int hash = path.indexOf("#page=");
        int page = 0;
        if (hash > 0) { try { page = Integer.parseInt(path.substring(hash + 6).replaceAll("[^0-9].*", "")); } catch (NumberFormatException e) { /* none */ } path = path.substring(0, hash); }
        s.read(path, page);
        return s;
    }
}
