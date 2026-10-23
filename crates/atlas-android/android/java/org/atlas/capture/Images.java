package org.atlas.capture;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

/** Pictures for the native plugins, at the size they are shown (a manga page is decoded for the screen, not whole):
 *  Android's own decoders (JPEG, PNG, WebP, GIF; AVIF and HEIF from Android 12), then the app's Rust library for
 *  JPEG XL, which no Android decoder reads (Core.decodeJxl). Null when it is not a picture. */
public final class Images {
    private Images() {}

    public static Bitmap decode(byte[] b, int maxW, int maxH) {
        if (isJxl(b)) return jxl(b, maxW, maxH);
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

    private static Bitmap jxl(byte[] b, int maxW, int maxH) {
        int[] r = Core.decodeJxl(b);
        if (r == null || r.length < 2) return null;
        Bitmap full = Bitmap.createBitmap(r, 2, r[0], r[0], r[1], Bitmap.Config.ARGB_8888);
        float k = Math.min(1f, Math.min(maxW / (float) r[0], maxH / (float) r[1]));
        return k >= 1f ? full : Bitmap.createScaledBitmap(full, Math.max(1, Math.round(r[0] * k)), Math.max(1, Math.round(r[1] * k)), true);
    }
}
