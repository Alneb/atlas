package org.atlas.plugins.audiobookshelf;

import android.view.View;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;

/** The Audiobookshelf plugin's Android side: a listening app of its own (AbsScreen) over the user's server, its
 *  requests and audio through the vault's core (the token added there), the audio in the app's one player
 *  (MediaService). Its places, which anything in the app may open (`Host.openPlugin`, the page's `atlas.openNative`,
 *  the phone's Library): `audiobookshelf:home`, `audiobookshelf:library`, `audiobookshelf:book/<item id>`,
 *  `audiobookshelf:playing`, and `audiobookshelf:play/<item id>` (a book played at once from where you were, its
 *  screen under the player: the Books reader's ▶ opens it over itself, Host.openOver). */
public final class Audiobookshelf implements NativePlugin {
    static final String SCHEME = "audiobookshelf:";
    static final String HOME = SCHEME + "home", LIBRARY = SCHEME + "library", BOOK = SCHEME + "book/", PLAYING = SCHEME + "playing", PLAY = SCHEME + "play/";

    @Override public String id() { return "audiobookshelf"; }

    /** Only its own places: a vault file is never an audiobook here. */
    @Override public boolean opens(String path) { return path.startsWith(SCHEME); }

    /** Offered to other plugins (Host.offers) only once its server's address is set (Abs.on). */
    @Override public boolean ready(org.json.JSONObject settings) { return !settings.optString("server", "").trim().isEmpty(); }

    @Override public View view(Host host, String path) { return new AbsScreen(host, path.isEmpty() ? HOME : path); }
}
