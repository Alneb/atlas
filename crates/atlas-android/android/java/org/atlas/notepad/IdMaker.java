package org.atlas.notepad;

/** New element ids: unique in the drawing, readable in the file ("pen-…", "shape-…", "page-…"). */
final class IdMaker {
    private int n;

    String next(String kind) { return kind + "-" + Long.toString(System.currentTimeMillis(), 36) + "-" + Integer.toString(n++, 36); }
}
