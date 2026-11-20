package org.atlas.capture;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/** A stream read to its end: `InputStream.readAllBytes` is Android 13+ (API 33), and the app runs from Android 8 (26). */
public final class Bytes {
    private Bytes() {}

    public static byte[] all(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        return out.toByteArray();
    }

    /** As all(), `progress` told the percentage read of `size` bytes whenever it grows (-1 once when the size is
     *  unknown, ≤ 0). */
    public static byte[] all(InputStream in, long size, java.util.function.IntConsumer progress) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(size > 0 && size < Integer.MAX_VALUE ? (int) size : 65536);
        byte[] buf = new byte[65536];
        long read = 0;
        int said = -2;
        if (size <= 0) progress.accept(-1);
        else { progress.accept(0); said = 0; }
        for (int n; (n = in.read(buf)) > 0; ) {
            out.write(buf, 0, n);
            read += n;
            int now = size > 0 ? (int) Math.min(100, read * 100 / size) : -1;
            if (now > said) { said = now; progress.accept(now); }
        }
        return out.toByteArray();
    }
}
