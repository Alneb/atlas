package org.atlas.capture;

import java.util.List;

/**
 * One line of a PlaceList, as plain data (no Android: FileRows and SearchRows build them, android/test/run.sh tests
 * them): a section's header or a row. PlaceList draws what this says; it decides nothing.
 */
public final class PlaceItem {
    public enum Kind { HEADER, ROW }

    public final Kind kind;
    public final String title;
    /** The supporting line under the title ("": none). */
    public String detail = "";
    /** A Look.icon name for the leading icon; null: none (a search hit under its file's header). */
    public String icon;
    /** The file or folder the line stands for; null: none (the "Files" header of a search). */
    public String path;
    /** A search hit's line, 1-based; 0: the file's top. */
    public int line;
    public boolean folder;
    /** On the vault's ignore list: drawn quieter, as the desktop's explorer dims it. */
    public boolean dim;
    /** A trailing ⋮ button: the file's menu (the same menu a long press opens). */
    public boolean more;
    /** Ranges of `title` to highlight (the query's matches): start, end, start, end… */
    public int[] marks = new int[0];
    /** What the line stands for, for the screen that made it (the Agenda's AgendaRows.Item); null: only its path. */
    public Object ref;

    private PlaceItem(Kind kind, String title) { this.kind = kind; this.title = title; }

    public static PlaceItem header(String title) { return new PlaceItem(Kind.HEADER, title); }

    public static PlaceItem row(String title) { return new PlaceItem(Kind.ROW, title); }

    public boolean header() { return kind == Kind.HEADER; }

    /** The header of the section `position` is in (the last header at or before it), or -1: what the sticky header
     *  at the top of the list shows while the list's first visible line is `position`. */
    static int headerFor(List<PlaceItem> items, int position) {
        for (int i = Math.min(position, items.size() - 1); i >= 0; i--) if (items.get(i).header()) return i;
        return -1;
    }

    /** The first header after `position`, or -1: the one that pushes the sticky header up as it reaches the top. */
    static int nextHeader(List<PlaceItem> items, int position) {
        for (int i = Math.max(0, position + 1); i < items.size(); i++) if (items.get(i).header()) return i;
        return -1;
    }

    @Override public String toString() {
        return (header() ? "# " : "- ") + title + (detail.isEmpty() ? "" : " | " + detail) + (path == null ? "" : " @" + path + (line > 0 ? ":" + line : ""));
    }
}
