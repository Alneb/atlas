package org.atlas.capture;

import android.os.Build;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * This phone's log in the vault, where Syncthing takes it to the desktop: `.atlas/device-logs/<phone>.txt` — the app's own logcat (an app may read its own without a
 * permission) and the end of each plugin's log (`.atlas/cache` is per machine, never synced). Rewritten, not appended.
 */
final class DeviceLog {
    private static final int TAIL = 80;

    private DeviceLog() {}

    static void write(String vault) {
        if (vault == null || Server.is(vault)) return;
        try {
            StringBuilder out = new StringBuilder("# Atlas on " + Build.MANUFACTURER + " " + Build.MODEL + ", " + new java.util.Date() + "\n\n");
            File plugins = new File(vault, ".atlas/cache/plugins");
            File[] logs = plugins.listFiles((d, n) -> n.endsWith(".log"));
            if (logs != null) for (File f : logs) {
                java.util.List<String> lines = Files.readAllLines(f.toPath(), StandardCharsets.UTF_8);
                out.append("## ").append(f.getName()).append("\n");
                for (String l : lines.subList(Math.max(0, lines.size() - TAIL), lines.size())) out.append(l).append('\n');
                out.append('\n');
            }
            Process p = new ProcessBuilder("logcat", "-d", "-t", "600", "--pid=" + android.os.Process.myPid()).redirectErrorStream(true).start();
            try (InputStream in = p.getInputStream()) { out.append("## logcat\n").append(new String(Bytes.all(in), StandardCharsets.UTF_8)); }
            File dir = new File(vault, ".atlas/device-logs");
            dir.mkdirs();
            String name = (Build.MODEL == null ? "phone" : Build.MODEL).replaceAll("[^A-Za-z0-9_-]+", "-");
            Files.write(new File(dir, name + ".txt").toPath(), out.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            android.util.Log.w("AtlasDeviceLog", "not written: " + e);
        }
    }
}
