package org.atlas.plugins.notepad;

import android.graphics.Bitmap;
import android.os.Build;

/** A drawing kept small on disk. The same rules as the web's draw-compact.ts and
 *  `atlas drawings compact`: pictures as WebP (transparency kept), pen points to 0.1 px, pressures to 0.01.
 *  docs/design/DESIGN-drawing-size.md. */
final class DrawingSize {
    private DrawingSize() {}

    static final int QUALITY = 85;

    /** The picture as WebP bytes; its MIME type is {@link #MIME}. */
    static byte[] webp(Bitmap b) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        @SuppressWarnings("deprecation") // WEBP is the lossy one below Android 11
        Bitmap.CompressFormat f = Build.VERSION.SDK_INT >= 30 ? Bitmap.CompressFormat.WEBP_LOSSY : Bitmap.CompressFormat.WEBP;
        b.compress(f, QUALITY, out);
        return out.toByteArray();
    }

    static final String MIME = "image/webp";

    /** A pen point's coordinate, 0.1 px. */
    static double point(float v) { return Math.round(v * 10) / 10.0; }

    /** A pen pressure, 0.01. */
    static double pressure(float v) { return Math.round(v * 100) / 100.0; }
}
