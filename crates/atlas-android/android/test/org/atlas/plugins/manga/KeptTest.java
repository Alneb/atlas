package org.atlas.plugins.manga;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** The Suwayomi cache shared with the web side (Kept): a chapter opened once opens again with the server out of reach,
 *  a series' chapters come from the cache only when the server does not answer (android/test/run.sh). A failed check
 *  prints what it got and the run exits 1. */
public final class KeptTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    private static String s(byte[] b) { return new String(b, StandardCharsets.UTF_8); }
    private static byte[] b(String s) { return s.getBytes(StandardCharsets.UTF_8); }

    /** The vault's files in memory; `full` refuses every write (a full disk: never a failure of the read). */
    static final class Mem implements Kept.Files {
        final Map<String, byte[]> files = new HashMap<>();
        boolean full;
        @Override public byte[] read(String path) { return files.get(path); }
        @Override public void write(String path, byte[] bytes) throws IOException { if (full) throw new IOException("disk full"); files.put(path, bytes); }
    }

    /** A server that answers `body` and counts its calls, or is out of reach. */
    static final class Server implements Kept.Ask {
        String body; boolean down; int asked;
        Server(String body) { this.body = body; }
        @Override public byte[] get() throws IOException { asked++; if (down) throw new IOException("no route to host"); return b(body); }
    }

    public static void main(String[] a) throws IOException {
        Mem vault = new Mem();
        Kept k = new Kept(vault);
        Server list = new Server("[\"/api/v1/manga/7/chapter/3/page/0\",\"/api/v1/manga/7/chapter/3/page/1\"]");

        // a chapter opened online: its page list and pages kept where the web side keeps them
        eq("the page list, from the server", list.body, s(k.once(Kept.pages(42), list)));
        eq("kept at the shared path", list.body, s(vault.files.get(".atlas/cache/plugins/manga/suwayomi/42/pages.json")));
        Server pic = new Server("JXL0");
        k.once(Kept.page(42, 0), pic);
        eq("a page kept beside it", "JXL0", s(vault.files.get(".atlas/cache/plugins/manga/suwayomi/42/0")));

        // the next day, offline: it opens and reads without asking
        list.down = true; pic.down = true;
        eq("the list from the cache, offline", list.body, s(k.once(Kept.pages(42), list)));
        eq("the page from the cache, offline", "JXL0", s(k.once(Kept.page(42, 0), pic)));
        eq("never asked again for what does not change", 1, list.asked);
        try { k.once(Kept.page(42, 1), pic); eq("a page never fetched fails offline", "an IOException", "bytes"); }
        catch (IOException e) { eq("a page never fetched: the server's failure", "no route to host", e.getMessage()); }

        // a series' chapters: the server's when it answers, the kept ones only when it does not
        Server chapters = new Server("{\"id\":7,\"nodes\":[1]}");
        eq("online: the server's", chapters.body, s(k.fresh(Kept.series(7), chapters)));
        eq("online: not offline", "", k.offline);
        chapters.body = "{\"id\":7,\"nodes\":[1,2]}";
        eq("online again: the new answer, not the kept one", chapters.body, s(k.fresh(Kept.series(7), chapters)));
        chapters.down = true;
        eq("offline: the last answer kept", "{\"id\":7,\"nodes\":[1,2]}", s(k.fresh(Kept.series(7), chapters)));
        eq("offline: says why", "no route to host", k.offline);
        try { k.fresh(Kept.series(8), chapters); eq("nothing kept and offline fails", "an IOException", "bytes"); }
        catch (IOException e) { eq("nothing kept: the server's failure", "no route to host", e.getMessage()); }

        // a cache that cannot be written is only a later fetch
        Mem full = new Mem();
        full.full = true;
        Server once = new Server("[\"/p/0\"]");
        eq("a full disk still gives the answer", once.body, s(new Kept(full).once(Kept.pages(5), once)));
        // an empty file kept (a write cut short) is asked again
        vault.files.put(Kept.page(9, 0), new byte[0]);
        Server again = new Server("PNG");
        eq("an empty copy is fetched again", "PNG", s(k.once(Kept.page(9, 0), again)));

        // the native library: the server's library kept for offline, covers where the web side keeps them
        Server lib = new Server("{\"nodes\":[{\"id\":7}]}");
        k.fresh(Kept.library(), lib);
        lib.down = true;
        eq("the library offline: as last listed", lib.body, s(k.fresh(Kept.library(), lib)));
        eq("the library kept at its path", lib.body, s(vault.files.get(".atlas/cache/plugins/manga/suwayomi/library.json")));
        Server cover = new Server("JPG");
        k.once(Kept.cover(7), cover);
        eq("a cover at the web side's path", "JPG", s(vault.files.get(".atlas/cache/plugins/manga/suwayomi/covers/7")));
        eq("a chapter's folder holds its pages", true, Kept.page(42, 3).startsWith(Kept.chapterDir(42) + "/"));

        // a page answered before it is written: the copy follows when the writer behind gets to it
        java.util.List<Runnable> behind = new java.util.ArrayList<>();
        Server late = new Server("JXL");
        eq("the bytes at once", "JXL", s(k.once(Kept.page(11, 0), late, behind::add)));
        eq("not written yet", false, vault.files.containsKey(Kept.page(11, 0)));
        for (Runnable r : behind) r.run();
        eq("written behind", "JXL", s(vault.files.get(Kept.page(11, 0))));
        eq("then read from the copy", "JXL", s(k.once(Kept.page(11, 0), late, behind::add)));
        eq("the server asked once", 1, late.asked);
        Mem full2 = new Mem();
        full2.full = true;
        eq("a copy written behind onto a full disk is no failure", "JXL", s(new Kept(full2).once(Kept.page(11, 1), late, Runnable::run)));

        System.out.println("KeptTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
