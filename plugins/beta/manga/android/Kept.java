package org.atlas.plugins.manga;

import java.io.IOException;

/**
 * What a Suwayomi server answered, kept in the vault's cache for the plugin, `.atlas/cache/plugins/manga/suwayomi/`, the
 * one place the web side (suwayomi.js) and this reader both read and write, so a chapter kept on one opens offline on
 * the other:
 *   - `<chapter id>/<i>`: page i's picture as the server sent it;
 *   - `<chapter id>/pages.json`: the chapter's page list, the server's addresses (a JSON array of strings);
 *   - `series/<manga id>.json`: a series' title and its chapters as last listed ({id, title, nodes});
 *   - `covers/<manga id>`: a cover (the web's and the native library's);
 *   - `library.json`: the server's library as last listed (the native library's: {nodes, categories});
 *   - `icons/<source id>`: a source's icon (Browse's sources list).
 * The cache is per device (never synced, no lease: mirror_guard.rs). Pure: the files and the server are handed in, so
 * the rule is tested on the desktop JVM (KeptTest).
 */
final class Kept {
    static final String DIR = ".atlas/cache/plugins/manga/suwayomi/";

    /** The vault's files, as far as the cache needs them. */
    interface Files {
        /** The file's bytes, or null when it is not there. */
        byte[] read(String path) throws IOException;
        void write(String path, byte[] bytes) throws IOException;
    }

    /** One question to the server. */
    interface Ask { byte[] get() throws IOException; }

    private final Files files;

    Kept(Files files) { this.files = files; }

    /** For what never changes once the server made it (a chapter's page list, a page's picture): the kept copy, else
     *  the server's answer, kept. A copy that cannot be written is only a later fetch, never a failure. */
    byte[] once(String path, Ask ask) throws IOException {
        byte[] had = readOrNull(path);
        if (had != null && had.length > 0) return had;
        byte[] got = ask.get();
        keep(path, got);
        return got;
    }

    /** As once(), the answer kept by `later` (a writer behind the reader): the bytes are the caller's as soon as they
     *  are here, the copy follows. A page asked again before it is written is only asked twice. */
    byte[] once(String path, Ask ask, java.util.concurrent.Executor later) throws IOException {
        byte[] had = readOrNull(path);
        if (had != null && had.length > 0) return had;
        byte[] got = ask.get();
        later.execute(() -> keep(path, got));
        return got;
    }

    /** For what changes (a series' chapters, where you are in them): the server's answer, kept; the kept one when the
     *  server cannot be reached — `offline` is then why. With nothing kept, the server's failure. */
    byte[] fresh(String path, Ask ask) throws IOException {
        try {
            byte[] got = ask.get();
            keep(path, got);
            offline = "";
            return got;
        } catch (IOException e) {
            byte[] had = readOrNull(path);
            if (had == null || had.length == 0) throw e;
            offline = String.valueOf(e.getMessage());
            return had;
        }
    }

    /** Why the last `fresh` came from the cache ("" when the server answered). */
    String offline = "";

    /** What is kept at `path`, or null. */
    byte[] readOrNull(String path) {
        try { return files.read(path); } catch (IOException e) { return null; }
    }

    private void keep(String path, byte[] bytes) {
        try { files.write(path, bytes); } catch (IOException e) { /* asked again next time */ }
    }

    static String page(int chapter, int i) { return DIR + chapter + "/" + i; }
    static String pages(int chapter) { return DIR + chapter + "/pages.json"; }
    static String series(int manga) { return DIR + "series/" + manga + ".json"; }
    static String seriesDir() { return DIR + "series"; }
    static String cover(int manga) { return DIR + "covers/" + manga; }
    static String library() { return DIR + "library.json"; }
    static String icon(String source) { return DIR + "icons/" + source.replaceAll("[^0-9A-Za-z_-]", "_"); }
    /** The folder of a chapter's kept pages (its page list and pictures). */
    static String chapterDir(int chapter) { return DIR + chapter; }
}
