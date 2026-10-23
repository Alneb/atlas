package org.atlas.capture;

import android.content.Context;
import android.util.Log;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.json.JSONObject;

/**
 * A server vault's file writes that could not reach it (no connection), kept on the device and sent when it answers —
 * as Outbox does for captures. One folder per file (a later save of it replaces the waiting one): `write.json` {server, path,
 * at} and `body`. While a write waits, reading that file gives it back (VaultFiles.OnServer), so a drawing reopened
 * offline is the one last drawn. Sent oldest first by Outbox.send (the box, the app, OutboxJob once there is a network).
 * The server's copy is overwritten when it is sent: an edit made elsewhere meanwhile loses to this one. Nothing kept is
 * ever deleted but by a send that reached the server, or a newer save of the same file that did (an HTTP error keeps it).
 */
final class PendingWrites {
    private static final String TAG = "AtlasPendingWrites";

    private PendingWrites() {}

    private static File dir(Context c) { return new File(c.getFilesDir(), "pending-writes"); }

    private static File of(Context c, String server, String path) {
        return new File(dir(c), Integer.toHexString((server + "\n" + path).hashCode()));
    }

    /** Keeps `bytes` for `path` on `server` (replacing a write of it still waiting), and asks for a send. */
    static synchronized void keep(Context c, String server, String path, byte[] bytes) throws IOException {
        File d = of(c, server, path);
        if (!d.isDirectory() && !d.mkdirs()) throw new IOException("no room to keep the file on the device");
        Files.write(new File(d, "body").toPath(), bytes);
        try {
            File tmp = new File(d, "write.json.tmp");
            Files.write(tmp.toPath(), new JSONObject().put("server", server).put("path", path).put("at", System.currentTimeMillis()).toString().getBytes(StandardCharsets.UTF_8));
            Files.move(tmp.toPath(), new File(d, "write.json").toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (org.json.JSONException e) { throw new IOException(e); }
        Log.i(TAG, "kept for later: " + path + " (" + server + ")");
        Outbox.schedule(c);
    }

    /** The bytes waiting for `path`, or null. */
    static synchronized byte[] waitingFor(Context c, String server, String path) {
        File body = new File(of(c, server, path), "body");
        try { return new File(of(c, server, path), "write.json").isFile() ? Files.readAllBytes(body.toPath()) : null; } catch (IOException e) { return null; }
    }

    /** A write that reached the server: an older one of the same file waiting must not follow it. */
    static synchronized void drop(Context c, String server, String path) { deleteAll(of(c, server, path)); }

    /** How many writes wait for `server`. */
    static int waiting(Context c, String server) {
        int n = 0;
        for (File d : entries(c)) {
            try { if (server.equals(read(d).getString("server"))) n++; } catch (Exception e) { /* unreadable */ }
        }
        return n;
    }

    /** Sends what waits, oldest first; a server that still does not answer keeps the rest of its writes. Off the main
     *  thread. → how many were sent; whether any is still waiting goes in `left[0]`. */
    static synchronized int send(Context c, boolean[] left) {
        List<String> down = new ArrayList<>();
        List<File> all = entries(c);
        all.sort((a, b) -> { try { return Long.compare(read(a).optLong("at"), read(b).optLong("at")); } catch (Exception e) { return 0; } });
        int sent = 0;
        for (File d : all) {
            try {
                JSONObject o = read(d);
                String server = o.getString("server"), path = o.getString("path");
                if (down.contains(server)) { left[0] = true; continue; }
                try {
                    new VaultFiles.OnServer(c, server).writeNow(path, Files.readAllBytes(new File(d, "body").toPath()));
                    deleteAll(d);
                    sent++;
                    Log.i(TAG, "sent " + path + " to " + server);
                } catch (VaultFiles.Refused r) {
                    Log.w(TAG, "the server refused " + path + ": " + r.getMessage() + " (kept; tried again with the next send)");
                    down.add(server); // its order kept: a refusal is often a sign-in that has run out
                    left[0] = true;
                } catch (IOException e) {
                    down.add(server);
                    left[0] = true;
                }
            } catch (Exception e) {
                Log.w(TAG, "a kept write could not be read: " + d, e);
            }
        }
        return sent;
    }

    private static List<File> entries(Context c) {
        File[] all = dir(c).listFiles(f -> new File(f, "write.json").isFile());
        return all == null ? new ArrayList<>() : new ArrayList<>(Arrays.asList(all));
    }

    private static JSONObject read(File d) throws Exception {
        return new JSONObject(new String(Files.readAllBytes(new File(d, "write.json").toPath()), StandardCharsets.UTF_8));
    }

    private static void deleteAll(File d) {
        File[] in = d.listFiles();
        if (in != null) for (File f : in) f.delete();
        d.delete();
    }
}
