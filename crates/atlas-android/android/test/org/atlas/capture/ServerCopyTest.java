package org.atlas.capture;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** The copy of a server vault's file kept on the phone (ServerCopy): used offline, fetched again when changed, never
 *  replaced by a cut-off download, trusted for a minute after a check (android/test/run.sh). */
public final class ServerCopyTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    /** A server with one file: `up` false = no answer; `cutAfter` ≥ 0 = the download breaks after that many bytes. */
    static final class Fake implements ServerCopy.Server {
        boolean up = true;
        int cutAfter = -1, listings, fetches;
        long modified = 1_700_000_000_000L;
        String text = "chapter one";

        @Override public long modified(String path) throws IOException {
            listings++;
            if (!up) throw new IOException("no route to host");
            return modified;
        }

        @Override public void fetch(String path, OutputStream to) throws IOException {
            fetches++;
            if (!up) throw new IOException("no route to host");
            byte[] b = text.getBytes(StandardCharsets.UTF_8);
            if (cutAfter >= 0) { to.write(b, 0, Math.min(cutAfter, b.length)); throw new IOException("connection reset"); }
            to.write(b);
        }
    }

    public static void main(String[] a) throws Exception {
        File dir = Files.createTempDirectory("servercopy").toFile();
        File f = new File(dir, "cache/book.epub");
        long[] now = { 0 };
        ServerCopy copies = new ServerCopy(() -> now[0]);
        Fake s = new Fake();

        s.up = false;
        try { copies.get(f, "books/book.epub", s); eq("offline, never opened: an error", "thrown", "returned"); }
        catch (IOException e) { eq("offline, never opened: an error", "thrown", "thrown"); }

        s.up = true;
        eq("first open: fetched", ServerCopy.Got.FETCHED, copies.get(f, "books/book.epub", s));
        eq("the copy holds the file", "chapter one", read(f));
        eq("no .part left behind", false, new File(f.getPath() + ".part").exists());

        now[0] += 5_000;
        int listings = s.listings;
        eq("again within a minute: the copy, the server not asked", ServerCopy.Got.FRESH, copies.get(f, "books/book.epub", s));
        eq("no listing asked for", listings, s.listings);

        now[0] += ServerCopy.TRUST;
        int fetches = s.fetches;
        eq("a minute on, unchanged: the copy", ServerCopy.Got.FRESH, copies.get(f, "books/book.epub", s));
        eq("checked, not fetched", fetches, s.fetches);

        now[0] += ServerCopy.TRUST;
        s.up = false;
        eq("the server gone: the copy kept, said offline", ServerCopy.Got.OFFLINE, copies.get(f, "books/book.epub", s));
        eq("and it still reads", "chapter one", read(f));

        now[0] += ServerCopy.TRUST;
        s.up = true;
        s.modified += 60_000;
        s.text = "chapter one, revised";
        s.cutAfter = 4;
        eq("changed, but the download breaks: the old copy, said offline", ServerCopy.Got.OFFLINE, copies.get(f, "books/book.epub", s));
        eq("the old copy whole, not the broken bytes", "chapter one", read(f));
        eq("no .part left behind after a break", false, new File(f.getPath() + ".part").exists());

        s.cutAfter = -1;
        eq("changed, the download whole: fetched", ServerCopy.Got.FETCHED, copies.get(f, "books/book.epub", s));
        eq("the new text", "chapter one, revised", read(f));

        copies.changed("books/book.epub");
        listings = s.listings;
        copies.get(f, "books/book.epub", s);
        eq("written here: the next open asks the server again", listings + 1, s.listings);

        for (File x : new File(dir, "cache").listFiles()) x.delete();
        new File(dir, "cache").delete();
        dir.delete();
        System.out.println("ServerCopyTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }

    private static String read(File f) throws IOException { return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8); }
}
