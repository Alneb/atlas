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
}
