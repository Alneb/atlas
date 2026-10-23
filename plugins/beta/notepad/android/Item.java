package org.atlas.plugins.notepad;

import android.graphics.Canvas;
import android.graphics.RectF;

import org.atlas.capture.Host;
import org.json.JSONException;
import org.json.JSONObject;

/** One element of the drawing as Notepad holds it: a pen stroke of its own ({@link Stroke}) or any other Excalidraw
 *  element it shows and moves but does not write with the pen ({@link Figure}: shapes, text, pictures, arrows).
 *  Scene units throughout (Excalidraw's CSS pixels). */
abstract class Item {
    String id;
    /** The page (frame id) it belongs to, or null. */
    String frame;
    /** Its bounds, for culling, hit tests and the selection's box. */
    final RectF box = new RectF();

    abstract void draw(Canvas c, Painter p);

    /** Whether a point within `r` of (x, y) touches it: the eraser, a tap on a link. */
    abstract boolean touches(float x, float y, float r);

    /** Whether the eraser's path from (x0, y0) to (x1, y1), `r` wide, touches it; by default only at its ends. */
    boolean crossedBy(float x0, float y0, float x1, float y1, float r) { return touches(x0, y0, r) || touches(x1, y1, r); }

    /** Points that stand for it, for the lasso (an item is taken when most of them are inside). */
    abstract float[] anchors();

    abstract void moveBy(float dx, float dy);

    /** Scaled by `s` and turned by `a` radians about (ax, ay): the selection's handles. `host` draws a stroke's ink
     *  again. Its inverse is (ax, ay, 1 / s, -a), which undo uses. */
    abstract void transform(float ax, float ay, float s, float a, Host host);

    /** Its colour, "#rrggbb" as Excalidraw keeps it. */
    abstract String color();

    abstract void setColor(String c);

    /** The element's `[[link]]` (Obsidian's Excalidraw plugin's), or null. */
    abstract String link();

    /** Its link set (null: none). */
    abstract void setLink(String l);

    /** As Excalidraw keeps it. */
    abstract JSONObject element() throws JSONException;

    /** A copy with a new id, moved by (dx, dy): Duplicate, Paste. */
    abstract Item copy(String newId, float dx, float dy);

    /** Locked (Excalidraw's `locked`): paper to write on — a PDF's page — that the eraser, the lasso and Clear page
     *  leave alone. Deleting the page still takes it. */
    boolean locked() { return false; }

    /** Drawn before everything else, under the writing (the highlighter, as Boox Notes lays it). */
    boolean under() { return false; }

    /** Moved onto page `f` (a frame id, or null): Paste onto another page. */
    void setFrame(String f) { frame = f; }
}
