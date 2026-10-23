package org.atlas.capture;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.util.Log;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Captures for a server that could not be reached (no connection, a sign-in in front), kept on the phone and sent when it
 * answers. One folder per capture in the app's files: `capture.json` {server, text, files} and the files not yet sent.
 * Sent oldest first — when the box or the app opens, and by a job Android runs once there is a network (OutboxJob).
 */
final class Outbox {
    private static final String TAG = "AtlasOutbox";
    private static final int JOB = 4242;

    private Outbox() {}

    static File dir(Context c) { return new File(c.getFilesDir(), "outbox"); }

    /** Keeps a capture: its text (with the embeds of files already sent) and the files still to send, copied here. */
    static void keep(Context c, String server, String text, List<String> files) throws Exception { keep(c, server, text, files, new ArrayList<>()); }

    /** …and `catalog`: links the user asked to catalogue ("Catalogue it"), sent to the catalog once the capture is. */
    static void keep(Context c, String server, String text, List<String> files, List<String> catalog) throws Exception {
        File d = new File(dir(c), System.currentTimeMillis() + "-" + Math.abs(text.hashCode() % 10000));
        d.mkdirs();
        JSONArray names = new JSONArray();
        for (String f : files) {
            File from = new File(f), to = new File(d, from.getName());
            Files.copy(from.toPath(), to.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            names.put(to.getName());
        }
        write(d, new JSONObject().put("server", server).put("text", text).put("files", names).put("catalog", new JSONArray(catalog)));
        schedule(c);
    }

    /** How many captures wait for `server`: still to try (`refused` false), or refused by it for good (`refused` true —
     *  sent again only when the user asks: retryRefused). */
    static int waiting(Context c, String server, boolean refused) {
        int n = 0;
        for (File d : entries(c)) {
            try { JSONObject o = read(d); if (server.equals(o.getString("server")) && o.optBoolean("refused") == refused) n++; } catch (Exception e) { /* unreadable: not counted */ }
        }
        return n;
    }

    static int waiting(Context c, String server) { return waiting(c, server, false); }

    /** The user's "try again": the refused captures back in line, then everything sent. */
    static int retryRefused(Context c) {
        for (File d : entries(c)) {
            try { JSONObject o = read(d); if (o.optBoolean("refused")) write(d, o.put("refused", false)); } catch (Exception e) { /* left as it is */ }
        }
        return send(c);
    }

    /** Sends what waits, oldest first; off the main thread. Stops at a server that still does not answer (the rest of its
     *  captures keep their order). → how many were sent. */
    static synchronized int send(Context c) {
        Server.init(c);
        boolean[] writesLeft = { false };
        int written = PendingWrites.send(c, writesLeft); // a server vault's files saved offline, before the captures
        if (written > 0) Log.i(TAG, "sent " + written + " file(s) saved offline");
        if (writesLeft[0]) schedule(c);
        Vaults vaults = new Vaults(c);
        List<String> down = new ArrayList<>();
        int sent = 0;
        for (File d : entries(c)) {
            try {
                JSONObject o = read(d);
                String server = o.getString("server");
                if (down.contains(server) || o.optBoolean("refused")) continue;
                String token = vaults.token(server), text = o.getString("text");
                JSONArray files = o.getJSONArray("files");
                boolean stopped = false;
                while (files.length() > 0) { // each file sent is written down at once: never sent twice
                    File f = new File(d, files.getString(0));
                    JSONObject a = Server.attach(server, token, f);
                    if (a.has("error")) { stopped = true; note(d, o, a, server, down); break; }
                    text = text + "\n" + Links.thumbnail(a.getString("embed"));
                    files.remove(0);
                    f.delete();
                    write(d, o.put("text", text).put("files", files));
                }
                if (stopped) continue;
                JSONObject r = Server.capture(server, token, text);
                if (r.has("error")) { note(d, o, r, server, down); continue; }
                JSONArray cat = o.optJSONArray("catalog");
                if (cat != null && cat.length() > 0) { // "Catalogue it" chosen while offline: now, as the box does
                    List<String> links = new ArrayList<>();
                    for (int i = 0; i < cat.length(); i++) links.add(cat.optString(i));
                    Log.i(TAG, "kept capture's links: " + CaptureActivity.catalogue(server, token, links));
                }
                deleteAll(d);
                sent++;
                Log.i(TAG, "sent a kept capture to " + server + " → " + r.optString("path"));
            } catch (Exception e) {
                Log.w(TAG, "a kept capture could not be read: " + d, e);
            }
        }
        for (File d : entries(c)) {
            try { if (!read(d).optBoolean("refused")) { schedule(c); break; } } catch (Exception e) { /* unreadable */ }
        }
        return sent;
    }

    /** A refusal: a passing one (`retry`) stops this server for now; any other marks the capture refused, kept for the
     *  user (Settings shows it) and no longer holding newer captures back. */
    private static void note(File d, JSONObject o, JSONObject err, String server, List<String> down) throws Exception {
        String why = err.optString("error");
        boolean passing = err.optBoolean("retry");
        if (passing) down.add(server);
        write(d, o.put("lastError", why).put("refused", !passing));
        Log.w(TAG, "not sent to " + server + ": " + why);
    }

    /** Asks Android to start OutboxJob once there is a network (kept across a restart of the phone). */
    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        try {
            js.schedule(new JobInfo.Builder(JOB, new ComponentName(c, OutboxJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(60_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .setPersisted(true)
                .build());
        } catch (RuntimeException e) {
            // a phone that refuses the job (a missing permission killed the app here, 2026-10-19): what waits stays
            // kept and goes at the next start or resume instead
            Log.w(TAG, "no job for the outbox: " + e);
        }
    }

    private static List<File> entries(Context c) {
        File[] all = dir(c).listFiles(f -> new File(f, "capture.json").isFile());
        if (all == null) return new ArrayList<>();
        Arrays.sort(all); // the names start with the time they were kept
        return new ArrayList<>(Arrays.asList(all));
    }

    private static JSONObject read(File d) throws Exception {
        return new JSONObject(new String(Files.readAllBytes(new File(d, "capture.json").toPath()), StandardCharsets.UTF_8));
    }

    /** Written whole then renamed, so a capture.json is never half written. */
    private static void write(File d, JSONObject o) throws Exception {
        File tmp = new File(d, "capture.json.tmp");
        Files.write(tmp.toPath(), o.toString().getBytes(StandardCharsets.UTF_8));
        Files.move(tmp.toPath(), new File(d, "capture.json").toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
    }

    private static void deleteAll(File d) {
        File[] in = d.listFiles();
        if (in != null) for (File f : in) f.delete();
        d.delete();
    }
}
