package org.atlas.capture;

/** When a reader writes where you are into the book's note (docs/design/REVIEW-android-boox.md, E1/M1): not at every
 *  page turn — a whole-note write, several requests on a server vault and a change Syncthing must carry each few
 *  seconds — but when you leave, when the chapter changes, and otherwise at most every {@link #EVERY}. The readers
 *  (EPUB, PDF, manga) tell it each move and ask whether to write now; plain Java, tested on the desktop JVM. */
public final class ReadingPlace {
    /** The longest a moved place waits unwritten while you read on in one chapter. */
    public static final long EVERY = 120_000;

    private String savedChapter;
    private long savedAt = Long.MIN_VALUE / 2;
    private boolean pending;

    /** You moved, in `chapter` (a PDF: one chapter per ten pages, say), at `now` ms: true when the place is to be
     *  written now (then call {@link #saved}); else it is kept pending until the next move or {@link #leaving}. */
    public synchronized boolean moved(String chapter, long now) {
        pending = true;
        return savedChapter == null || !savedChapter.equals(chapter) || now - savedAt >= EVERY;
    }

    /** The place was written (the chapter it was in, at `now`). */
    public synchronized void saved(String chapter, long now) {
        savedChapter = chapter;
        savedAt = now;
        pending = false;
    }

    /** The reader is closing: true when a move is still unwritten. */
    public synchronized boolean leaving() {
        return pending;
    }
}
