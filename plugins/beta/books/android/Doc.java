package org.atlas.plugins.books;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/** A reflowable book, whatever its format (EPUB; later MOBI / AZW3, FB2, plain text — each turned into the same shape):
 *  chapters of XHTML laid out by the reader's text view, and the entries they use (pictures, styles, fonts) read on
 *  demand. Fixed-page formats (PDF, DjVu) are a different reader: their pages are pictures (DESIGN-native-book-reader.md). */
interface Doc extends Closeable {
    String title();
    String author();
    /** The cover's entry, or null. */
    String cover();
    /** The chapters in reading order, as entries. */
    List<String> spine();
    /** Each chapter's size (bytes): where you are in the book, as a share of its text. */
    List<Long> sizes();
    List<Epub.Toc> toc();
    boolean has(String entry);
    InputStream open(String entry) throws IOException;
    byte[] bytes(String entry) throws IOException;
    /** An entry's media type. */
    String type(String entry);

    /** The label of the contents line that opens chapter `i`, or "". */
    default String chapterLabel(int i) {
        if (i < 0 || i >= spine().size()) return "";
        for (Epub.Toc t : toc()) if (t.path.equals(spine().get(i))) return t.label;
        return "";
    }
}
