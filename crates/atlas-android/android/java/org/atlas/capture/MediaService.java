package org.atlas.capture;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The phone's engine of the app's one player (`atlas.player`, ui/src/lib/player.svelte.ts; docs/guides/DEVELOPING.md,
 * "Media"): a foreground service of type mediaPlayback that plays a plugin's audio — an audiobook's tracks through the
 * core's `/media/<ticket>` addresses — with the screen off and the app in the background.
 * <ul>
 * <li>Android's own MediaPlayer (no Gradle, so no ExoPlayer), one per track, the item's time laid over the tracks by
 *     {@link PlayerTimeline} (the page's rules, JVM-tested);</li>
 * <li>a MediaSession: the lock screen, the notification's controls, a headset's and a car's buttons (play, pause, ±30 s,
 *     previous / next chapter, a place chosen on the bar);</li>
 * <li>audio focus: a call or another app's sound pauses it (and a short one resumes it), a notification's ducks it;
 *     headphones pulled out pause it;</li>
 * <li>where you are reported to the core (`/api/plugins/&lt;id&gt;/media/progress` → the plugin's `[media] progress`)
 *     every 15 s while playing, on pause, at the end and on close — the page may be gone — with the accounting of
 *     {@link PlayerReports} (time listened kept until a report is taken; a key an answer gives replaces the old);</li>
 * <li>the sleep timer (minutes, or the end of the chapter).</li>
 * </ul>
 * The page commands it through {@link #command} (AtlasActivity's bridge, `AtlasNative.player`) and hears its state
 * through {@link #listener}. Needs a device to confirm (the review's "Needs a device").
 */
public final class MediaService extends Service {
    private static final String CHANNEL = "player";
    private static final int NOTE = 0x41ab;
    private static final String ACT = "org.atlas.player.";
    private static final long REPORT_MS = 15_000, TICK_MS = 1000;
    private static final int SKIP = 30;

    /** The page (AtlasActivity) told the state as it changes: JSON of the page's `PlayerState`, or "null". */
    interface Listener { void state(String json); }
    static volatile Listener listener;
    /** The native screens that show it too (a plugin's now-playing screen, through Host.watchPlayer), beside the page. */
    static final java.util.concurrent.CopyOnWriteArrayList<Listener> watchers = new java.util.concurrent.CopyOnWriteArrayList<>();

    /** The state to the page and to every native screen watching. */
    private static void tell(String json) {
        Listener l = listener;
        if (l != null) l.state(json);
        for (Listener w : watchers) w.state(json);
    }

    private static MediaService running;
    /** A play asked for before the service was up: taken by onStartCommand. */
    private static String pending;
    private static Map<String, String> pendingHeaders = new HashMap<>();

    /** A command of the page (on the main thread): `play` (the item, its plugin and the report address), `resume`,
     *  `pause`, `seek` (seconds), `speed`, `sleep` (minutes, -1 the chapter's end, 0 off), `close`, `state` (say it
     *  again: the page came back). `headers`: what reaching the core needs (its cookie, a server's sign-in). */
    static void command(Context c, String cmd, String arg, Map<String, String> headers) {
        if ("play".equals(cmd)) {
            pending = arg;
            pendingHeaders = headers;
            Intent i = new Intent(c, MediaService.class).setAction(ACT + "play");
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
            return;
        }
        MediaService s = running;
        if (s == null) { tell("null"); return; }
        s.handle(cmd, arg);
    }

    // ---- what plays ----
    private PlayerTimeline tl;
    private PlayerReports reports;
    private String plugin = "", reportUrl = "", title = "", author = "", open;
    private Bitmap art;
    private String cover = "";
    private Map<String, String> headers = new HashMap<>();
    private MediaPlayer mp;
    private boolean prepared;
    private int track = -1;
    private double speed = 1, startAt;
    /** The place a seek goes to while its track loads (NaN: none), the seek asked last, whether it should play. */
    private double going = Double.NaN;
    private int wanted;
    private boolean playing, retried;
    private String error = "";
    private long sleepAt;
    private int sleepChapter = -1;
    private long lastTick, lastReport;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private MediaSession session;
    private AudioManager am;
    private AudioFocusRequest focus;
    /** Paused by a transient loss of focus (a call): resumed when it comes back. */
    private boolean pausedByFocus;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            long t = SystemClock.elapsedRealtime();
            if (playing && reports != null) reports.listened((t - lastTick) / 1000.0); // by the clock, whatever the speed
            lastTick = t;
            if (playing && sleepAt > 0 && System.currentTimeMillis() >= sleepAt) { sleepAt = 0; pause(); }
            if (playing && sleepChapter >= 0 && tl.chapterAt(now()) != sleepChapter) { sleepChapter = -1; pause(); }
            if (playing && t - lastReport >= REPORT_MS) report(PlayerReports.State.PLAYING);
            publish(false);
            if (playing) main.postDelayed(this, TICK_MS);
        }
    };

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { if (playing) pause(); } // headphones out: never aloud
    };

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        am = (AudioManager) getSystemService(AUDIO_SERVICE);
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Playing", NotificationManager.IMPORTANCE_LOW));
        session = new MediaSession(this, "Atlas");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onStop() { pause(); }
            @Override public void onFastForward() { seekTo(now() + SKIP, playing, false); }
            @Override public void onRewind() { seekTo(now() - SKIP, playing, false); }
            @Override public void onSkipToNext() { double t = tl == null ? Double.NaN : tl.nextChapter(now()); if (!Double.isNaN(t)) seekTo(t, playing, false); }
            @Override public void onSkipToPrevious() { double t = tl == null ? Double.NaN : tl.previousChapter(now()); if (!Double.isNaN(t)) seekTo(t, playing, false); }
            @Override public void onSeekTo(long ms) { seekTo(ms / 1000.0, playing, false); }
        });
        registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
    }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        String a = i == null ? null : i.getAction();
        // a foreground service must say so within seconds of being started, before anything is loaded
        foreground();
        if ((ACT + "play").equals(a) && pending != null) { String p = pending; pending = null; load(p, pendingHeaders); }
        else if ((ACT + "toggle").equals(a)) { if (playing) pause(); else resume(); }
        else if ((ACT + "back").equals(a)) seekTo(now() - SKIP, playing, false);
        else if ((ACT + "fwd").equals(a)) seekTo(now() + SKIP, playing, false);
        else if ((ACT + "close").equals(a)) close();
        else if (tl == null) close(); // started again by the system with nothing to play
        return START_NOT_STICKY; // after the system kills it, the place is in the plugin; nothing resumes on its own
    }

    @Override
    public void onDestroy() {
        if (tl != null) close();
        unregisterReceiver(noisy);
        session.release();
        net.shutdown();
        if (running == this) running = null;
        super.onDestroy();
    }

    private void handle(String cmd, String arg) {
        double v = 0;
        try { v = Double.parseDouble(arg); } catch (Exception ignored) { /* not a number: the commands that take none */ }
        switch (cmd) {
            case "resume": resume(); break;
            case "pause": pause(); break;
            case "seek": seekTo(v, playing, false); break;
            case "speed": setSpeed(v); break;
            case "sleep":
                sleepAt = v > 0 ? System.currentTimeMillis() + (long) (v * 60_000) : 0;
                sleepChapter = v < 0 && tl != null ? tl.chapterAt(now()) : -1;
                publish(true);
                break;
            case "close": close(); break;
            case "state":
                if (tl != null) publish(true);
                else tell("null"); // up, with nothing loaded
                break;
            default: android.util.Log.w("AtlasPlayer", "unknown command " + cmd);
        }
    }

    /** The page's `play`: `{ plugin, report, item: { key, title, author, cover, tracks, chapters, at, speed, open } }`. */
    private void load(String json, Map<String, String> h) {
        try {
            JSONObject o = new JSONObject(json), item = o.getJSONObject("item");
            if (tl != null) end(); // what played before is reported closed and let go
            plugin = o.optString("plugin");
            reportUrl = o.optString("report");
            headers = h == null ? new HashMap<>() : h;
            Object k = item.opt("key");
            reports = new PlayerReports(k instanceof String ? JSONObject.quote((String) k) : String.valueOf(k));
            title = item.optString("title");
            author = item.optString("author");
            open = item.has("open") ? item.optString("open") : null;
            cover = item.optString("cover");
            speed = item.optDouble("speed", speed);
            startAt = item.optDouble("at", 0);
            List<PlayerTimeline.Track> tracks = new ArrayList<>();
            JSONArray ts = item.optJSONArray("tracks");
            for (int n = 0; ts != null && n < ts.length(); n++) { JSONObject t = ts.getJSONObject(n); tracks.add(new PlayerTimeline.Track(t.getString("src"), t.optDouble("start", 0), t.optDouble("duration", 0))); }
            List<PlayerTimeline.Chapter> chapters = new ArrayList<>();
            JSONArray cs = item.optJSONArray("chapters");
            for (int n = 0; cs != null && n < cs.length(); n++) { JSONObject c = cs.getJSONObject(n); chapters.add(new PlayerTimeline.Chapter(c.optDouble("start", 0), c.optDouble("end", 0), c.optString("title"))); }
            tl = new PlayerTimeline(tracks, chapters);
            track = -1; error = ""; sleepAt = 0; sleepChapter = -1; retried = false; art = null;
            lastReport = SystemClock.elapsedRealtime();
            session.setActive(true);
            loadArt();
            if (tracks.isEmpty()) { error = "Nothing to play: no audio"; publish(true); return; }
            seekTo(startAt, true, false);
        } catch (Exception e) {
            error = "Not played: " + e.getMessage();
            publish(true);
        }
    }

    /** The item's time now: where a seek goes while its track loads, else the track's start plus where it is. */
    private double now() {
        if (!Double.isNaN(going)) return going;
        if (tl == null) return 0;
        if (track < 0 || mp == null || !prepared) return startAt;
        return tl.tracks.get(track).start + mp.getCurrentPosition() / 1000.0;
    }

    /** To time t of the item: its track prepared when another (or `fresh`: asked for again), then the place in it. The
     *  last seek wins: an older one whose track prepares late does nothing. */
    private void seekTo(double t, boolean play, boolean fresh) {
        if (tl == null || tl.tracks.isEmpty()) return;
        final int mine = ++wanted;
        t = Math.max(0, Math.min(tl.duration() - 0.5, t));
        PlayerTimeline.Place p = tl.placeOf(t);
        going = t;
        if (p.i == track && !fresh && mp != null && prepared) {
            mp.seekTo((long) (p.offset * 1000), MediaPlayer.SEEK_CLOSEST);
            going = Double.NaN;
            if (play) resume(); else publish(true);
            return;
        }
        release();
        MediaPlayer m = new MediaPlayer();
        mp = m;
        m.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
        m.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK); // the CPU kept awake while it plays, the screen off
        m.setOnPreparedListener(x -> {
            if (mine != wanted || x != mp) return;
            prepared = true;
            track = p.i;
            x.seekTo((long) (p.offset * 1000), MediaPlayer.SEEK_CLOSEST);
            going = Double.NaN;
            if (play) resume(); else publish(true);
        });
        m.setOnCompletionListener(x -> {
            if (x != mp) return;
            if (track + 1 < tl.tracks.size()) seekTo(tl.tracks.get(track + 1).start, true, false); // the next track, from its start
            else { playing = false; report(PlayerReports.State.ENDED); publish(true); }
        });
        m.setOnErrorListener((x, what, extra) -> {
            if (x != mp) return true;
            // the address stopped working (the network dropped, the core restarted): asked once more, then said
            if (!retried) { retried = true; double at = now(); main.post(() -> seekTo(at, true, true)); }
            else { playing = false; error = "The audio could not be played (the server, or its sign-in)"; going = Double.NaN; publish(true); }
            return true;
        });
        m.setOnInfoListener((x, what, extra) -> { if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) retried = false; return false; });
        try {
            m.setDataSource(this, Uri.parse(tl.tracks.get(p.i).src), headers);
            m.prepareAsync();
        } catch (Exception e) {
            going = Double.NaN;
            error = "Not played: " + e.getMessage();
            publish(true);
        }
    }

    private void resume() {
        if (mp == null || !prepared) { if (tl != null) seekTo(now(), true, false); return; }
        if (!focus()) { error = "Another app holds the sound"; publish(true); return; }
        applySpeed();
        mp.start();
        playing = true;
        pausedByFocus = false;
        error = error.startsWith("Not synced") ? error : "";
        lastTick = SystemClock.elapsedRealtime();
        main.removeCallbacks(tick);
        main.post(tick);
        publish(true);
    }

    private void pause() {
        if (mp != null && prepared && mp.isPlaying()) mp.pause();
        boolean was = playing;
        playing = false;
        main.removeCallbacks(tick);
        if (was) report(PlayerReports.State.PAUSED);
        publish(true);
    }

    private void setSpeed(double s) {
        if (s <= 0) return;
        speed = s;
        if (playing) applySpeed(); // on a paused MediaPlayer a speed would start it: kept for the next start
        publish(true);
    }

    private void applySpeed() {
        if (mp == null || !prepared) return;
        try { mp.setPlaybackParams(mp.getPlaybackParams().setSpeed((float) speed)); } catch (Exception e) { android.util.Log.w("AtlasPlayer", "speed: " + e); }
    }

    /** What played is reported closed and let go (a new item, or the close). */
    private void end() {
        if (playing && mp != null && prepared && mp.isPlaying()) mp.pause();
        playing = false;
        main.removeCallbacks(tick);
        report(PlayerReports.State.CLOSED);
        release();
        tl = null;
        track = -1;
    }

    private void close() {
        if (tl != null) end();
        if (focus != null) am.abandonAudioFocusRequest(focus);
        session.setActive(false);
        stopForeground(STOP_FOREGROUND_REMOVE);
        tell("null");
        stopSelf();
    }

    private void release() {
        prepared = false;
        if (mp != null) { try { mp.release(); } catch (Exception ignored) { /* already gone */ } }
        mp = null;
    }

    /** Asks for the sound; a call or another player takes it back (paused), a notification lowers it a moment. */
    private boolean focus() {
        if (focus == null) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setWillPauseWhenDucked(true) // speech: paused rather than talked over
                .setOnAudioFocusChangeListener(change -> {
                    if (change == AudioManager.AUDIOFOCUS_LOSS) { pausedByFocus = false; pause(); }
                    else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) { if (playing) { pause(); pausedByFocus = true; } }
                    else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedByFocus) resume();
                }, main)
                .build();
        }
        return am.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    /** Where you are, to the plugin through the core, off the main thread; the accounting is PlayerReports'. */
    private void report(PlayerReports.State state) {
        PlayerReports r = reports;
        if (r == null || !r.sending() || reportUrl.isEmpty()) return;
        lastReport = SystemClock.elapsedRealtime();
        PlayerReports.Report rep = r.report(now(), tl == null ? 0 : tl.duration(), state);
        String url = reportUrl;
        Map<String, String> h = headers;
        net.execute(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15_000);
                c.setReadTimeout(30_000);
                c.setRequestMethod("POST");
                for (Map.Entry<String, String> e : h.entrySet()) c.setRequestProperty(e.getKey(), e.getValue());
                c.setRequestProperty("x-atlas", "1");
                c.setRequestProperty("content-type", "application/json");
                c.setDoOutput(true);
                try (OutputStream o = c.getOutputStream()) { o.write(rep.body.getBytes(StandardCharsets.UTF_8)); }
                int code = c.getResponseCode();
                if (code == 404) { r.refused(); return; } // the plugin takes no reports
                if (code / 100 != 2) throw new java.io.IOException("the core answered " + code);
                String answer;
                try (InputStream in = c.getInputStream()) { answer = new String(readAll(in), StandardCharsets.UTF_8); }
                String key = null;
                try { Object o = new JSONObject(answer).opt("key"); if (o != null && o != JSONObject.NULL) key = o instanceof String ? JSONObject.quote((String) o) : o.toString(); }
                catch (Exception ignored) { /* an answer that is not an object: no new key */ }
                r.took(rep, key);
                main.post(() -> { if (error.startsWith("Not synced")) { error = ""; publish(true); } });
            } catch (Exception e) {
                main.post(() -> { error = "Not synced: " + e.getMessage(); publish(true); });
            }
        });
    }

    /** The cover for the lock screen and the notification: a data: address (the page reads its own blob into one), or
     *  an http one fetched with the core's headers. */
    private void loadArt() {
        String c = cover;
        if (c == null || c.isEmpty()) return;
        Map<String, String> h = headers;
        net.execute(() -> {
            try {
                byte[] b;
                if (c.startsWith("data:")) b = Base64.decode(c.substring(c.indexOf(',') + 1), Base64.DEFAULT);
                else if (c.startsWith("http")) {
                    HttpURLConnection x = (HttpURLConnection) new URL(c).openConnection();
                    for (Map.Entry<String, String> e : h.entrySet()) x.setRequestProperty(e.getKey(), e.getValue());
                    try (InputStream in = x.getInputStream()) { b = readAll(in); }
                } else return;
                Bitmap bm = BitmapFactory.decodeByteArray(b, 0, b.length);
                main.post(() -> { if (c.equals(cover)) { art = bm; publish(true); } });
            } catch (Exception e) { android.util.Log.w("AtlasPlayer", "cover: " + e); }
        });
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) o.write(buf, 0, n);
        return o.toByteArray();
    }

    // ---- what is shown: the session (lock screen, headset, car), the notification, the page ----
    private int lastChapter = -2;

    /** The state to everyone who shows it; `all`: also the session's metadata and the notification (else only when
     *  the chapter changed: a tick a second updates the place). */
    private void publish(boolean all) {
        if (tl == null) return;
        double t = now();
        int c = tl.chapterAt(t);
        if (all || c != lastChapter) {
            lastChapter = c;
            MediaMetadata.Builder m = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, author)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, c >= 0 ? tl.chapters.get(c).title : "")
                .putLong(MediaMetadata.METADATA_KEY_DURATION, (long) (tl.duration() * 1000));
            if (art != null) m.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
            session.setMetadata(m.build());
            getSystemService(NotificationManager.class).notify(NOTE, notification(c));
        }
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SEEK_TO
                | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
            .setState(playing ? PlaybackState.STATE_PLAYING : !Double.isNaN(going) ? PlaybackState.STATE_BUFFERING : PlaybackState.STATE_PAUSED, (long) (t * 1000), playing ? (float) speed : 0f)
            .build());
        tell(stateJson(t, c));
    }

    /** The page's PlayerState (ui/src/lib/player.svelte.ts). */
    private String stateJson(double t, int c) {
        try {
            JSONObject o = new JSONObject();
            o.put("plugin", plugin);
            o.put("key", new org.json.JSONTokener(reports == null ? "null" : reports.key()).nextValue());
            o.put("title", title).put("author", author).put("cover", cover.startsWith("http") ? cover : "");
            JSONArray cs = new JSONArray();
            for (PlayerTimeline.Chapter ch : tl.chapters) cs.put(new JSONObject().put("start", ch.start).put("end", ch.end).put("title", ch.title));
            o.put("chapters", cs).put("duration", tl.duration()).put("at", t).put("playing", playing).put("speed", speed).put("chapter", c);
            o.put("sleep", sleepAt > 0 ? Math.max(0, sleepAt - System.currentTimeMillis()) : sleepChapter >= 0 ? -1 : 0);
            o.put("error", error);
            if (open != null) o.put("open", open);
            return o.toString();
        } catch (Exception e) { return "null"; }
    }

    private void foreground() {
        Notification n = notification(-1);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTE, n);
    }

    private android.graphics.drawable.Icon icon(int res) { return android.graphics.drawable.Icon.createWithResource(this, res); }

    private PendingIntent action(String what, int code) {
        return PendingIntent.getService(this, code, new Intent(this, MediaService.class).setAction(ACT + what), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** The notification: the book, its chapter, −30 / play-pause / +30, the session's (lock screen) style; a tap opens
     *  the app, a swipe away (paused) closes the player. */
    private Notification notification(int chapter) {
        Intent app = new Intent(this, AtlasActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
            .setContentTitle(title.isEmpty() ? "Opening…" : title)
            .setContentText(chapter >= 0 && tl != null ? tl.chapters.get(chapter).title : author)
            .setContentIntent(PendingIntent.getActivity(this, 0, app, PendingIntent.FLAG_IMMUTABLE))
            .setDeleteIntent(action("close", 4))
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(new Notification.Action.Builder(icon(android.R.drawable.ic_media_rew), "−" + SKIP + " s", action("back", 1)).build())
            .addAction(new Notification.Action.Builder(icon(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play), playing ? "Pause" : "Play", action("toggle", 2)).build())
            .addAction(new Notification.Action.Builder(icon(android.R.drawable.ic_media_ff), "+" + SKIP + " s", action("fwd", 3)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        if (art != null) b.setLargeIcon(art);
        return b.build();
    }
}
