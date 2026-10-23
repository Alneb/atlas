package org.atlas.plugins.books;

import android.view.View;
import android.widget.FrameLayout;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The reader's frame: the book's view, and the thread that reads books and files (never the UI's: a server's vault
 *  answers over the network). The library is the page's (main.js), which hands a book here. */
final class BooksScreen extends FrameLayout implements NativePlugin.Back {
    final Host host;
    final ExecutorService io = Executors.newSingleThreadExecutor();

    BooksScreen(Host host) {
        super(host.activity());
        this.host = host;
        setBackgroundColor(host.look().bg);
    }

    /** A book: a PDF a page at a time (PdfView, the same ink as Notepad's), any other reflowed (ReaderView). */
    void read(String path) {
        View r = path.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf") ? new PdfView(this, path) : new ReaderView(this, path);
        addView(r, new LayoutParams(-1, -1));
        r.requestFocus(); // the volume keys
        if (host.eink()) post(host::einkRefresh); // a whole new screen: no ghost of the last one
    }

    /** The reader's sheets first; then the app leaves the reader, back to where the book was chosen. */
    @Override public boolean back() {
        View top = getChildCount() == 0 ? null : getChildAt(0);
        return top instanceof NativePlugin.Back && ((NativePlugin.Back) top).back();
    }

    @Override protected void onDetachedFromWindow() { io.shutdownNow(); super.onDetachedFromWindow(); }
}
