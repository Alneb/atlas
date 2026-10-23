package org.atlas.capture;

import android.content.Context;
import android.os.Build;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONObject;

/**
 * Python and the plugin helpers for the core inside the full app (docs/guides/ANDROID.md, "Python and helpers"): Android runs
 * programs only from the APK's native-library folder, so `python3` (python/launcher.c) and each helper compiled for
 * Android (helpers/<abi>/<name>) are there as lib*.so, and this links them by their names on the helpers' PATH. The
 * standard library is unpacked from the APK once per version, where Python's extension modules may be loaded.
 */
final class Helpers {
    private Helpers() {}

    /** Off the main thread: the environment the core gives the helpers it starts ({PATH, PYTHONHOME, LD_LIBRARY_PATH}). */
    static String environment(Context c) {
        String lib = c.getApplicationInfo().nativeLibraryDir;
        File bin = new File(c.getFilesDir(), "bin"), home = new File(c.getFilesDir(), "python");
        try {
            unpack(c, home);
            link(bin, new File(lib));
            return new JSONObject()
                .put("PATH", bin.getPath() + ":" + System.getenv("PATH"))
                .put("PYTHONHOME", home.getPath())
                .put("LD_LIBRARY_PATH", lib)
                // the plugins' engines shipped in the APK (build-apk.sh `engines`): a plugin's `run` finds its program here
                .put("ATLAS_PLUGIN_BIN", bin.getPath())
                .toString();
        } catch (Exception e) {
            return "{}"; // the core still runs; helpers needing Python say they cannot start
        }
    }

    /** The standard library for this phone's ABI, once per app version (the version's code as the stamp). */
    private static void unpack(Context c, File home) throws Exception {
        String abi = Build.SUPPORTED_ABIS[0];
        long version = c.getPackageManager().getPackageInfo(c.getPackageName(), 0).getLongVersionCode();
        File stamp = new File(home, ".unpacked");
        if (stamp.exists() && new String(Files.readAllBytes(stamp.toPath())).equals(abi + "@" + version)) return;
        delete(home);
        File lib = new File(home, "lib");
        lib.mkdirs();
        try (InputStream in = c.getAssets().open("python-" + abi + ".zip"); ZipInputStream z = new ZipInputStream(in)) {
            byte[] buf = new byte[1 << 16];
            for (ZipEntry e; (e = z.getNextEntry()) != null; ) {
                File f = new File(lib, e.getName());
                if (!f.getCanonicalPath().startsWith(lib.getCanonicalPath() + File.separator)) continue; // never outside
                if (e.isDirectory()) { f.mkdirs(); continue; }
                f.getParentFile().mkdirs();
                try (FileOutputStream out = new FileOutputStream(f)) { for (int n; (n = z.read(buf)) > 0; ) out.write(buf, 0, n); }
            }
        }
        Files.write(stamp.toPath(), (abi + "@" + version).getBytes());
    }

    /** bin/python3 → libpython3exe.so, bin/<name> → libhelper_<name>.so: the programs by their own names. */
    private static void link(File bin, File lib) throws Exception {
        delete(bin);
        bin.mkdirs();
        File python = new File(lib, "libpython3exe.so");
        if (python.exists()) {
            Files.createSymbolicLink(new File(bin, "python3").toPath(), python.toPath());
            Files.createSymbolicLink(new File(bin, "python").toPath(), python.toPath());
        }
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
