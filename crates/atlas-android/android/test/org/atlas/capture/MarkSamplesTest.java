package org.atlas.capture;

/** The samples codec gives the core's string (pdf_marks.rs `the_samples_codec_is_the_one_every_device_reads`). */
public final class MarkSamplesTest {
    public static void main(String[] a) {
        double[] s = { 100, 500, 0.8, 0.25, -0.125, 0, 100.37, 499.89, 0.81, 0.25, -0.125, 8, 99.5, 501.25, 0, -1, 1, 17 };
        String want = "oJwBoI0GwAz0A_kBAEoVFAAAEK0BkALTDMMTyhES", got = MarkSamples.encode(s);
        if (!want.equals(got)) throw new AssertionError("encode: " + got);
        double[] back = MarkSamples.decode(want);
        if (back.length != s.length) throw new AssertionError("decode length " + back.length);
        for (int i = 0; i < s.length; i++) if (Math.abs(back[i] - s[i]) > 1e-9) throw new AssertionError("decode " + i + ": " + back[i]);
        System.out.println("MarkSamplesTest: ok");
    }
}
