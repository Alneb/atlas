package org.atlas.capture;

/** A pen stroke's samples as every device stores them in a PDF's note (core pdf_marks.rs `Samples`, the desktop's
 *  lib/pdf-samples.ts): x, y (PDF points), pressure, tiltX, tiltY (0.001), t (ms) as quantized deltas — 0.01 pt places —
 *  zigzag varints, URL-safe base64 without padding. All three are tested on one string. Plain Java: no Android. */
public final class MarkSamples {
    private MarkSamples() {}
    /** Six numbers a sample: x, y, pressure, tiltX, tiltY, t. */
    public static final int N = 6;
    private static final double[] SCALE = { 100, 100, 1000, 1000, 1000, 1 };

    /** Rust's `f64::round`: halves away from zero. */
    private static long round(double v) { return (long) (Math.signum(v) * Math.floor(Math.abs(v) + 0.5)); }

    public static String encode(double[] s) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        long[] last = new long[N];
        for (int i = 0; i + N <= s.length; i += N) {
            for (int k = 0; k < N; k++) {
                long now = round(s[i + k] * SCALE[k]), d = now - last[k];
                long z = (d << 1) ^ (d >> 63);
                do { int b = (int) (z & 0x7f); z >>>= 7; out.write(z != 0 ? b | 0x80 : b); } while (z != 0);
                last[k] = now;
            }
        }
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(out.toByteArray());
    }

    /** The samples, six numbers each; an unreadable string gives none. */
    public static double[] decode(String text) {
        byte[] b;
        try { b = java.util.Base64.getUrlDecoder().decode(text.trim()); } catch (IllegalArgumentException e) { return new double[0]; }
        java.util.ArrayList<Double> out = new java.util.ArrayList<>();
        long[] last = new long[N];
        int at = 0;
        while (at < b.length) {
            for (int k = 0; k < N; k++) {
                long z = 0; int shift = 0, x;
                do {
                    if (at >= b.length) return new double[0];
                    x = b[at++] & 0xff; z |= (long) (x & 0x7f) << shift; shift += 7;
                } while ((x & 0x80) != 0);
                last[k] += (z >>> 1) ^ -(z & 1);
                out.add(last[k] / SCALE[k]);
            }
        }
        double[] r = new double[out.size()];
        for (int i = 0; i < r.length; i++) r[i] = out.get(i);
        return r;
    }
}
