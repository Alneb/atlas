package org.atlas.plugins.manga;

import android.view.View;

import org.atlas.capture.Host;
import org.atlas.capture.NativePlugin;

/** The manga plugin's Android side (docs/refactor/REFACTOR-native-plugins.md): a reader app of its own — the library
 *  (`manga:library`: the Suwayomi server's categories and the vault's series), a series (`manga:series/<key>`), and
 *  the reader, which the page also hands a chapter to: a vault .cbz, a vault folder of pictures, or a Suwayomi chapter
 *  (`suwayomi:<chapter id>/<name>`). A chapter opens at the page it was left on. */
public final class Manga implements NativePlugin {
    @Override public String id() { return "manga"; }

    /** The plugin's own places (`manga:`), a .cbz, a Suwayomi chapter, or a folder chapter, which the web side hands
     *  with its trailing "/" (view.js chaptersOf). Nothing else: openPath asks of every path, and an unresolved
     *  `[[Foo]]` has no extension either. */
    @Override public boolean opens(String path) {
        return path.startsWith("manga:") || Chapter.isZip(path) || Suwayomi.is(path) || path.endsWith("/");
    }

    @Override public View view(Host host, String path) { return new MangaScreen(host, path); }

    /** A vault chapter as the series lists it: a folder with its trailing "/". Never on the UI thread (isDir). */
    static String chapterPath(Host host, String path) {
        return Chapter.isZip(path) || path.endsWith("/") || !host.isDir(path) ? path : path + "/";
    }
}
