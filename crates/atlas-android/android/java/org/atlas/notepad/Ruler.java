package org.atlas.notepad;

import android.graphics.Canvas;
import android.graphics.Paint;

/** Boox Notes' ruler: a straightedge laid over the page (not part of the drawing, never saved). A finger moves it or,
 *  by its knob, turns it; a pen stroke begun along one of its long edges is laid onto that edge, so it comes out
 *  straight. Scene units; (cx, cy) its middle, `angle` its turn in radians. */
final class Ruler {
    /** About 17 cm by 1.7 cm at Excalidraw's 96 units an inch. */
    static final float LENGTH = 640, WIDTH = 64;
    /** One centimetre in scene units (96 / 2.54). */
    private static final float CM = 37.795f;

    float cx, cy, angle;

    Ruler(float cx, float cy) { this.cx = cx; this.cy = cy; }

    /** (x, y) in the ruler's own frame: u along it, v across it. */
    private float[] local(float x, float y) {
        double c = Math.cos(angle), s = Math.sin(angle);
        float dx = x - cx, dy = y - cy;
        return new float[] { (float) (dx * c + dy * s), (float) (-dx * s + dy * c) };
    }

    private float[] world(float u, float v) {
        double c = Math.cos(angle), s = Math.sin(angle);
        return new float[] { cx + (float) (u * c - v * s), cy + (float) (u * s + v * c) };
    }

    boolean inside(float x, float y) {
        float[] l = local(x, y);
        return Math.abs(l[0]) <= LENGTH / 2 && Math.abs(l[1]) <= WIDTH / 2;
    }

    /** The long edge (−1 the one above, +1 the one below, before turning) that (x, y) is within `reach` of, or 0. */
    int edgeNear(float x, float y, float reach) {
        float[] l = local(x, y);
        if (Math.abs(l[0]) > LENGTH / 2 + reach) return 0;
        if (Math.abs(l[1] - WIDTH / 2) < reach) return 1;
        if (Math.abs(l[1] + WIDTH / 2) < reach) return -1;
        return 0;
    }

    /** (x, y) laid onto edge `edge`: its place along the ruler kept, its distance across made the edge's. */
    float[] onEdge(int edge, float x, float y) { return world(local(x, y)[0], edge * WIDTH / 2); }

    /** The turning knob: near the right end, in the middle of its width. */
    float[] knob() { return world(LENGTH / 2 - WIDTH / 2, 0); }

    /** Translucent body, an outline, a tick every half centimetre (longer at each centimetre). `k` px a unit. */
    void draw(Canvas c, Paint body, Paint line, float k) {
        c.save();
        c.translate(cx, cy);
        c.rotate((float) Math.toDegrees(angle));
        c.drawRect(-LENGTH / 2, -WIDTH / 2, LENGTH / 2, WIDTH / 2, body);
        line.setStrokeWidth(1.2f / k);
        c.drawRect(-LENGTH / 2, -WIDTH / 2, LENGTH / 2, WIDTH / 2, line);
        for (int i = 0; -LENGTH / 2 + i * CM / 2 <= LENGTH / 2; i++) {
            float u = -LENGTH / 2 + i * CM / 2, t = i % 2 == 0 ? WIDTH * 0.3f : WIDTH * 0.15f;
            c.drawLine(u, WIDTH / 2, u, WIDTH / 2 - t, line);
            c.drawLine(u, -WIDTH / 2, u, -WIDTH / 2 + t, line);
        }
        c.drawCircle(LENGTH / 2 - WIDTH / 2, 0, WIDTH * 0.22f, line);
        c.restore();
    }
}
