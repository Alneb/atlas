package org.atlas.capture;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

/** Pictures for the native plugins, at the size they are shown (a manga page is decoded for the screen, not whole):
 *  the app's Rust library for JPEG XL, which no Android decoder reads, and for AVIF, which Android's decoders refuse in
 *  forms manga sources serve (Core.decodePictureFit); Android's own for the rest (JPEG, PNG, WebP, GIF, HEIF). Null when
 *  it is not a picture. */
public final class Images {
    private Images() {}

    public static Bitmap decode(byte[] b, int maxW, int maxH) {
        if (isJxl(b)) return rust(b, maxW, maxH);
        if (isAvif(b)) { Bitmap m = rust(b, maxW, maxH); if (m != null) return m; } // else Android's own may still read it
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(b, 0, b.length, o);
        if (o.outWidth <= 0) return null;
        o.inJustDecodeBounds = false;
        o.inSampleSize = 1;
        while (o.outWidth / (o.inSampleSize * 2) >= maxW && o.outHeight / (o.inSampleSize * 2) >= maxH) o.inSampleSize *= 2;
        return BitmapFactory.decodeByteArray(b, 0, b.length, o);
    }

    /** The two JPEG XL signatures: a bare codestream (FF 0A) or the ISO box container. */
    static boolean isJxl(byte[] b) {
        if (b.length >= 2 && (b[0] & 0xff) == 0xff && b[1] == 0x0a) return true;
        byte[] box = { 0, 0, 0, 0x0c, 'J', 'X', 'L', ' ', 0x0d, 0x0a, (byte) 0x87, 0x0a };
        if (b.length < box.length) return false;
        for (int i = 0; i < box.length; i++) if (b[i] != box[i]) return false;
        return true;
    }

    /** An AVIF still: an `ftyp` box with the brand `avif` (an `avis` sequence is left to Android). */
    static boolean isAvif(byte[] b) {
        return b.length >= 12 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p' && b[8] == 'a' && b[9] == 'v' && b[10] == 'i' && b[11] == 'f';
    }

    private static Bitmap rust(byte[] b, int maxW, int maxH) {
        int[] r = Core.decodePictureFit(b, maxW, maxH); // already about the size shown (a whole factor smaller)
        if (r == null || r.length < 2) return null;
        Bitmap full = Bitmap.createBitmap(r, 2, r[0], r[0], r[1], Bitmap.Config.ARGB_8888);
        float k = Math.min(1f, Math.min(maxW / (float) r[0], maxH / (float) r[1]));
        return k >= 1f ? full : Bitmap.createScaledBitmap(full, Math.max(1, Math.round(r[0] * k)), Math.max(1, Math.round(r[1] * k)), true);
    }
}
