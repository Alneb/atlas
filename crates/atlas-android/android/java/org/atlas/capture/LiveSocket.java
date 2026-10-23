package org.atlas.capture;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Map;
import javax.net.ssl.SSLSocketFactory;
import org.json.JSONObject;

/**
 * A file's live room on the vault's server (core live.rs; the web's lib/live.ts speaks the same): the devices with the
 * file open send each other what changes as it happens — a drawing's elements, a pen's pointer. Android has no WebSocket
 * client of its own, so this is one (RFC 6455: text frames, ping/pong, fragments), signed in as every other call to the
 * server is (Server.headerMap). It stays joined (a lost connection comes back) until closed. The listener is called on
 * the main thread. Only for a vault on a server: a vault on the phone has no room to share.
 */
public final class LiveSocket {
    public interface Listener {
        /** In the room; `others` devices were there already. */
        default void hello(int others) {}
        default void joined(int peer, String name) {}
        default void left(int peer) {}
        void message(int from, JSONObject m);
    }

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final java.util.concurrent.ExecutorService SENDS = java.util.concurrent.Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "live sends"); t.setDaemon(true); return t; });
    private final Context c;
    private final String vault, path, name;
    private final Listener on;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean closed;
    private volatile Socket socket;
    private volatile OutputStream out;
    private final java.util.Set<Integer> peers = java.util.concurrent.ConcurrentHashMap.newKeySet();
    // there when this one came and not heard from yet: counted, or the first to open a file in a room already holding
    // another would never send it anything (lib/live.ts the same)
    private final java.util.concurrent.atomic.AtomicInteger unheard = new java.util.concurrent.atomic.AtomicInteger();

    private LiveSocket(Context c, String vault, String path, String name, Listener on) {
        this.c = c.getApplicationContext(); this.vault = vault.replaceAll("/+$", ""); this.path = path; this.name = name; this.on = on;
    }

    /** Joins `path`'s room on `vault`'s server as `name` ("Boox"); null for a vault on this device. */
    public static LiveSocket join(Context c, String vault, String path, String name, Listener on) {
        if (!Server.is(vault)) return null;
        LiveSocket s = new LiveSocket(c, vault, path, name, on);
        Thread t = new Thread(s::run, "live " + path);
        t.setDaemon(true);
        t.start();
        return s;
    }

    /** Sends `m` to the others (nothing when alone). Off the main thread or on it: the write is short. */
    public void send(JSONObject m) {
        OutputStream o = out;
        if (o == null || closed || others() == 0) return;
        byte[] data = m.toString().getBytes(StandardCharsets.UTF_8);
        // one sending thread for every message, in order (a thread each was ~20 a second while the pen moved: the user
        // asked whether the websocket was efficient, 2026-10-19)
        SENDS.execute(() -> { try { frame(o, 0x1, data); } catch (IOException e) { drop(); } });
    }

    /** How many other devices are in the room, the silent ones there before this one came included. */
    public int others() { return peers.size() + unheard.get(); }

    private void heard() { unheard.updateAndGet(n -> Math.max(0, n - 1)); }

    /** Leaves the room. From the main thread too (a drawing closed): closing a TLS socket writes to the network, which
     *  Android forbids there (the Boox crashed closing the notepad, 2026-10-20), so the close goes to the sending thread. */
    public void close() {
        closed = true;
        SENDS.execute(this::drop);
    }

    private void drop() {
        Socket s = socket;
        socket = null;
        out = null;
        if (s != null) try { s.close(); } catch (IOException ignored) { /* gone */ }
    }

    private void run() {
        long retry = 1000;
        while (!closed) {
            try {
                connect();
                retry = 1000;
                read();
            } catch (Exception e) {
                android.util.Log.i("AtlasLive", path + ": " + e.getMessage());
            }
            drop();
            for (Integer p : peers) main.post(() -> on.left(p));
            peers.clear();
            unheard.set(0);
            if (closed) break;
            try { Thread.sleep(retry); } catch (InterruptedException e) { break; }
            retry = Math.min(retry * 2, 30_000);
        }
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (java.io.UnsupportedEncodingException e) { throw new IllegalStateException(e); }
    }

    private void connect() throws IOException {
        URI u = URI.create(vault + "/api/live?path=" + enc(path) + "&name=" + enc(name));
        boolean tls = "https".equals(u.getScheme());
        int port = u.getPort() > 0 ? u.getPort() : tls ? 443 : 80;
        Socket s = tls ? SSLSocketFactory.getDefault().createSocket(u.getHost(), port) : new Socket(u.getHost(), port);
        s.setSoTimeout(0);
        byte[] nonce = new byte[16];
        RANDOM.nextBytes(nonce);
        StringBuilder req = new StringBuilder("GET ").append(u.getRawPath()).append('?').append(u.getRawQuery()).append(" HTTP/1.1\r\n")
            .append("Host: ").append(u.getHost()).append(u.getPort() > 0 ? ":" + u.getPort() : "").append("\r\n")
            .append("Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\n")
            .append("Sec-WebSocket-Key: ").append(android.util.Base64.encodeToString(nonce, android.util.Base64.NO_WRAP)).append("\r\n")
            .append("x-atlas: 1\r\n");
        for (Map.Entry<String, String> h : Server.headerMap(c, vault).entrySet()) req.append(h.getKey()).append(": ").append(h.getValue()).append("\r\n");
        req.append("\r\n");
        OutputStream o = s.getOutputStream();
        o.write(req.toString().getBytes(StandardCharsets.UTF_8));
        o.flush();
        InputStream in = new BufferedInputStream(s.getInputStream());
        String status = line(in);
        if (!status.contains(" 101")) { s.close(); throw new IOException("the server said " + status.trim()); }
        while (!line(in).isEmpty()) { /* the answer's headers */ }
        socket = s;
        out = o;
        this.in = in;
    }

    private InputStream in;

    private static String line(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        for (int ch; (ch = in.read()) != -1; ) {
            if (ch == '\n') break;
            if (ch != '\r') b.write(ch);
        }
        return b.toString("UTF-8");
    }

    /** Frames until the socket closes: text messages to the listener, pings answered. */
    private void read() throws IOException {
        ByteArrayOutputStream message = new ByteArrayOutputStream();
        while (!closed) {
            int b0 = in.read(), b1 = in.read();
            if (b0 < 0 || b1 < 0) throw new IOException("closed");
            int op = b0 & 0x0f;
            long len = b1 & 0x7f;
            if (len == 126) len = (in.read() << 8) | in.read();
            else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | in.read(); }
            byte[] mask = (b1 & 0x80) != 0 ? readN(4) : null;
            byte[] data = readN((int) len);
            if (mask != null) for (int i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
            if (op == 0x8) throw new IOException("closed by the server");
            if (op == 0x9) { OutputStream o = out; if (o != null) frame(o, 0xA, data); continue; }
            if (op == 0x1 || op == 0x0) {
                message.write(data);
                if ((b0 & 0x80) != 0) { take(message.toString("UTF-8")); message.reset(); }
            }
        }
    }

    private byte[] readN(int n) throws IOException {
        byte[] b = new byte[n];
        for (int at = 0; at < n; ) { int got = in.read(b, at, n - at); if (got < 0) throw new IOException("closed"); at += got; }
        return b;
    }

    /** `{"t":"hello"}` or `{"from":n,"m":{…}}` (core live.rs). */
    private void take(String text) {
        try {
            JSONObject d = new JSONObject(text);
            if ("hello".equals(d.optString("t"))) { int o = d.optInt("others"); unheard.set(o); main.post(() -> on.hello(o)); return; }
            int from = d.optInt("from", -1);
            JSONObject m = d.optJSONObject("m");
            if (from < 0 || m == null) return;
            String t = m.optString("t");
            if ("join".equals(t)) { peers.add(from); String n = m.optString("name", "another device"); main.post(() -> on.joined(from, n)); }
            else if ("leave".equals(t)) { if (!peers.remove(from)) heard(); main.post(() -> on.left(from)); }
            else { if (peers.add(from)) heard(); main.post(() -> on.message(from, m)); }
        } catch (org.json.JSONException e) { /* not ours */ }
    }

    /** One frame from the client: masked, as RFC 6455 asks. */
    private static synchronized void frame(OutputStream o, int op, byte[] data) throws IOException {
        ByteArrayOutputStream f = new ByteArrayOutputStream();
        f.write(0x80 | op);
        if (data.length < 126) f.write(0x80 | data.length);
        else if (data.length < 65536) { f.write(0x80 | 126); f.write(data.length >> 8); f.write(data.length); }
        else { f.write(0x80 | 127); for (int i = 7; i >= 0; i--) f.write((int) ((long) data.length >> (8 * i))); }
        byte[] mask = new byte[4];
        RANDOM.nextBytes(mask);
        f.write(mask);
        for (int i = 0; i < data.length; i++) f.write(data[i] ^ mask[i % 4]);
        o.write(f.toByteArray());
        o.flush();
    }
}
