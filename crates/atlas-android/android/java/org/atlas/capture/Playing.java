package org.atlas.capture;

import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Build;
import android.provider.Settings;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What is playing now (docs/design/DESIGN-capture-from-apps.md): the song or video of the system's media sessions — YouTube Music,
 * Spotify, a podcast app — read when the box opens. Android shows the sessions only to an app given notification access
 * (MediaListener); without it, nothing is read. The link is found by shape, not by a list of apps: an address in the
 * metadata, a `spotify:track:…` URI, a YouTube video id from a YouTube app. A YouTube app's item always ends with its address
 *: when the session carries none, YouTube's own search
 * for "title artist" gives it, and the chip says it was found that way.
 */
final class Playing {
    final String title, artist, app, pkg, url;
    /** The address came from a search, not from the session: most likely the right one, not certainly. */
    final boolean searched;

    private Playing(String title, String artist, String app, String pkg, String url, boolean searched) {
        this.title = title; this.artist = artist; this.app = app; this.pkg = pkg; this.url = url; this.searched = searched;
    }

    private static final Pattern WEB = Pattern.compile("https?://\\S+");
    private static final Pattern SPOTIFY = Pattern.compile("spotify:(track|episode|album|show):([A-Za-z0-9]+)");
    /** A video id: the whole string, or after `v=` — never any 11 letters inside a longer id. */
    private static final Pattern YOUTUBE_ID = Pattern.compile("(?:^|[?&]v=)([A-Za-z0-9_-]{11})(?:$|&)");

    static ComponentName listener(Context c) { return new ComponentName(c, MediaListener.class); }

    /** Whether the user gave notification access (once, in system settings). */
    static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT >= 27) return c.getSystemService(NotificationManager.class).isNotificationListenerAccessGranted(listener(c));
        String on = Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
        return on != null && on.contains(listener(c).flattenToString());
    }

    /** The system screen where the access is given: this app's own row when Android has one. */
    static Intent setup(Context c) {
        if (Build.VERSION.SDK_INT >= 30) {
            return new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, listener(c).flattenToString());
        }
        return new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
    }

    /** The session playing, else the one paused most recently; null without access or when nothing has a title. */
    static Playing now(Context c) {
        List<Playing> all = all(c);
        return all.isEmpty() ? null : all.get(0);
    }

    /** Every app with something to play, the playing ones first, then in the system's order; at most 3. Off the main thread (a YouTube item's link is
     *  searched). */
    static List<Playing> all(Context c) {
        List<Playing> out = new java.util.ArrayList<>();
        if (!allowed(c)) return out;
        try {
            List<MediaController> playing = new java.util.ArrayList<>(), rest = new java.util.ArrayList<>();
            for (MediaController m : c.getSystemService(MediaSessionManager.class).getActiveSessions(listener(c))) {
                if (m.getMetadata() == null || m.getMetadata().getString(MediaMetadata.METADATA_KEY_TITLE) == null) continue;
                PlaybackState s = m.getPlaybackState();
                (s != null && s.getState() == PlaybackState.STATE_PLAYING ? playing : rest).add(m);
            }
            playing.addAll(rest);
            for (MediaController m : playing.subList(0, Math.min(3, playing.size()))) out.add(of(c, m).withAddress());
        } catch (SecurityException e) {
            // access taken back meanwhile
        }
        return out;
    }

    private static Playing of(Context c, MediaController m) {
        MediaMetadata md = m.getMetadata();
        String title = md.getString(MediaMetadata.METADATA_KEY_TITLE).trim();
        String artist = first(md.getString(MediaMetadata.METADATA_KEY_ARTIST), md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST), md.getString(MediaMetadata.METADATA_KEY_AUTHOR));
        String pkg = m.getPackageName();
        String app = pkg;
        try { app = c.getPackageManager().getApplicationLabel(c.getPackageManager().getApplicationInfo(pkg, 0)).toString(); } catch (Exception e) { /* the package name */ }
        String[] carried = {
            md.getString(MediaMetadata.METADATA_KEY_MEDIA_ID),
            md.getDescription() == null || md.getDescription().getMediaUri() == null ? null : md.getDescription().getMediaUri().toString(),
            md.getDescription() == null ? null : md.getDescription().getMediaId(),
        };
        return new Playing(title, artist, app, pkg, link(pkg, carried), false);
    }

    private static boolean youtube(String pkg) { return pkg != null && pkg.contains("youtube"); }

    private static String watch(String pkg, String id) {
        return (pkg.contains("music") ? "https://music.youtube.com/watch?v=" : "https://www.youtube.com/watch?v=") + id;
    }

    /** A YouTube app's item without an address: the first video of YouTube's search (network; off the main thread). */
    private Playing withAddress() {
        if (url != null || !youtube(pkg)) return this;
        String u = Onscreen.youtubeSearch(artist == null ? title : title + " " + artist, pkg.contains("music"));
        return u == null ? this : new Playing(title, artist, app, pkg, u, true); // offline: the chip says there is no link
    }

    /** The session of the app on screen (its package), if it has one: what that app is showing. */
    static Playing of(List<Playing> all, String pkg) {
        if (pkg != null) for (Playing p : all) if (pkg.equals(p.pkg)) return p;
        return null;
    }

    /** The item's address from what the session carries; null when nothing in it names one. */
    static String link(String pkg, String[] carried) {
        for (String s : carried) {
            if (s == null) continue;
            Matcher w = WEB.matcher(s);
            if (w.find()) return w.group();
            Matcher sp = SPOTIFY.matcher(s);
            if (sp.find()) return "https://open.spotify.com/" + sp.group(1) + "/" + sp.group(2);
        }
        if (youtube(pkg)) {
            for (String s : carried) {
                if (s == null) continue;
                Matcher y = YOUTUBE_ID.matcher(s);
                if (y.find()) return watch(pkg, y.group(1));
            }
        }
        return null;
    }

    private static String first(String... s) {
        for (String x : s) if (x != null && !x.trim().isEmpty()) return x.trim();
        return null;
    }

    /** "Song — Artist", as the chip shows it. */
    String label() { return artist == null ? title : title + " — " + artist; }

    /** As it goes into the capture: a Markdown link when an address was found, the app named after it. */
    String markdown() {
        String t = label().replace("]", ")");
        return (url == null ? t : "[" + t + "](" + url + ")") + " (" + app + ")";
    }
}
