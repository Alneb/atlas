package org.atlas.capture;

import android.content.Context;
import java.io.File;
import java.nio.file.Files;
import org.json.JSONObject;

/**
 * The plugin engines for the core inside the full app (docs/guides/ANDROID.md): Android runs programs only
 * from the APK's native-library folder, so each engine compiled for Android (helpers/<abi>/<name>) is there as a lib*.so,
 * and this links them by their names on the helpers' PATH. No Python: a phone's helpers are JavaScript in the core.
 */
final class Helpers {
    private Helpers() {}

    /** Off the main thread: the environment the core gives the helpers it starts ({PATH, LD_LIBRARY_PATH}). */
    static String environment(Context c) {
        String lib = c.getApplicationInfo().nativeLibraryDir;
        File bin = new File(c.getFilesDir(), "bin");
        try {
            delete(new File(c.getFilesDir(), "python")); // an older version's unpacked Python
            link(bin, new File(lib));
            return new JSONObject()
                .put("PATH", bin.getPath() + ":" + System.getenv("PATH"))
                .put("LD_LIBRARY_PATH", lib)
                // the plugins' engines shipped in the APK (build-apk.sh `engines`): a plugin's `run` finds its program here
                .put("ATLAS_PLUGIN_BIN", bin.getPath())
                .toString();
        } catch (Exception e) {
            return "{}"; // the core still runs; the engines say they cannot start
        }
    }

    /** bin/<name> → libhelper_<name>.so: the programs by their own names. */
    private static void link(File bin, File lib) throws Exception {
        delete(bin);
        bin.mkdirs();
        File[] all = lib.listFiles();
        if (all == null) return;
        for (File f : all) {
            String n = f.getName();
            if (n.startsWith("libhelper_") && n.endsWith(".so")) Files.createSymbolicLink(new File(bin, n.substring(10, n.length() - 3)).toPath(), f.toPath());
        }
    }

    private static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null && !Files.isSymbolicLink(f.toPath())) for (File k : kids) delete(k);
        f.delete();
    }
}
