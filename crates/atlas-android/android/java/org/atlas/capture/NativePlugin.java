package org.atlas.capture;

import android.view.View;

/** The Android side of a plugin (docs/refactor/REFACTOR-native-plugins.md): `plugins/<tier>/<id>/android/*.java`,
 *  compiled into the Atlas apps and listed by `[android] main` in its plugin.toml. Its web side (main.js) serves the
 *  desktop and the server; this one the phone and the Boox, natively. */
public interface NativePlugin {
    /** The plugin's id (its folder's name, as in plugin.toml). */
    String id();

    /** Whether the app opens this vault path with this plugin instead of a web tab (`[android] opens`). */
    boolean opens(String path);

    /** Its screen on `path` (a vault path it opens, or an address of its own: `suwayomi:<id>/<name>`). A reader only:
     *  libraries are the page's, which hands a book over (`atlas.openNative`). */
    View view(Host host, String path);

    /** A plugin's screen with places inside it (a library, a series, the reader): Back goes up one of them first;
     *  false = it is at its top, the app takes Back. */
    interface Back { boolean back(); }
}
