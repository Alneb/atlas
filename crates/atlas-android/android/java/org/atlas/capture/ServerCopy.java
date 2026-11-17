package org.atlas.capture;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/** The copy of a server vault's file kept on the phone (VaultFiles.OnServer.local): what a reader opens — a book, a
 *  PDF, a comic's zip. Plain Java (no Android), so its rule is tested on the desktop JVM (android/test/run.sh):
 *  <ul>
 *  <li>a copy checked against the server in the last minute is used as it is — a PDF renders a page at a time and
 *      asks for the file each time, which was one listing request per page;</li>
 *  <li>else the server's modification time decides: the same → the copy; changed → fetched again;</li>
 *  <li>the server not answering (offline, down) → the copy kept from before, said as {@link Got#OFFLINE}; with no copy
 *      the error goes up;</li>
 *  <li>a fetch is streamed to a `.part` file beside the copy and renamed over it at the end: a large book never sits
 *      whole in memory, and a cut-off download never replaces a good copy.</li>
 *  </ul> */
final class ServerCopy {
    /** How the copy was had. */
    enum Got { FRESH, FETCHED, OFFLINE }

    /** The server's side, as OnServer reaches it. */
    interface Server {
        /** The file's modification time in ms (0: not listed or unknown); throws when the server cannot be reached. */
        long modified(String path) throws IOException;
        /** The file's bytes, written to `to`. */
        void fetch(String path, OutputStream to) throws IOException;
    }

    /** A copy checked this recently is trusted without asking again. */
    static final long TRUST = 60_000;

    private final LongSupplier clock;
    private final Map<String, Long> checked = new HashMap<>();

    ServerCopy(LongSupplier clock) { this.clock = clock; }

    /** `f` made the copy of `path` → how. */
    synchronized Got get(File f, String path, Server s) throws IOException {
        long now = clock.getAsLong();
        Long c = checked.get(path);
        if (f.isFile() && c != null && now - c < TRUST) return Got.FRESH;
        long at;
        try { at = s.modified(path); }
        catch (IOException offline) {
            if (f.isFile()) return Got.OFFLINE;
            throw offline;
        }
        if (f.isFile() && at != 0 && f.lastModified() == at) { checked.put(path, now); return Got.FRESH; }
        File dir = f.getParentFile();
        if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new IOException("no cache folder");
        File part = new File(f.getPath() + ".part");
        try (OutputStream o = new FileOutputStream(part)) { s.fetch(path, o); }
        catch (IOException e) {
            part.delete();
            if (f.isFile()) return Got.OFFLINE; // listed, then lost on the way: the old copy still reads
            throw e;
        }
        if (!part.renameTo(f) && !(f.delete() && part.renameTo(f))) throw new IOException("could not keep " + path);
        if (at != 0) f.setLastModified(at);
        checked.put(path, now);
        return Got.FETCHED;
    }

    /** Forget the last check of `path` (it was written here: the next open asks again). */
    synchronized void changed(String path) { checked.remove(path); }
}
