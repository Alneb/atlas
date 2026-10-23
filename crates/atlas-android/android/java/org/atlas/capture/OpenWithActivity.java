package org.atlas.capture;

import android.app.Activity;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Another app's file — a book, a comic, a PDF from a file manager, a download, a mail — read in this app's own reader
 * ("Open with → Atlas"; docs/design/DESIGN-libraries-everywhere.md, step 7: "an easy to use ebook reader, comic reader,
 * pdf reader"). The file is copied into the app's folder `Opened/`, a vault of its own, so the reader keeps its place
 * and notes beside it as in any vault; then the native plugin that reads its kind opens it. No window of its own.
 */
public final class OpenWithActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri uri = getIntent().getData();
        if (uri == null) { finish(); return; }
        File dir = new File(getFilesDir(), "Opened");
        new File(dir, ".atlas").mkdirs(); // a vault: what the readers write about it (its notes, its place) goes here
        new Thread(() -> {
            String name = nameOf(uri), why = null;
            File f = new File(dir, name);
            try {
                long size = sizeOf(uri);
                if (!f.isFile() || size < 0 || f.length() != size) copy(uri, f); // the same file again: kept, with its notes
            } catch (Exception e) { why = e.getMessage(); }
            String failed = why;
            runOnUiThread(() -> {
                NativePlugin p = Natives.forPath(name, id -> true);
                if (failed != null) Toast.makeText(this, "Not opened: " + failed, Toast.LENGTH_LONG).show();
                else if (p == null) Toast.makeText(this, "This app has no reader for " + name, Toast.LENGTH_LONG).show();
                else PluginActivity.start(this, p.id(), name, dir.getPath());
                finish();
            });
        }, "open-with").start();
    }

    /** The file's own name (the provider's), made safe as a file name; a dated one when it has none. */
    private String nameOf(Uri uri) {
        String n = null;
        try (Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) n = c.getString(0);
        } catch (RuntimeException e) { /* a provider without names */ }
        if (n == null || n.isEmpty()) n = uri.getLastPathSegment();
        if (n == null || n.isEmpty()) n = "opened-" + System.currentTimeMillis();
        return n.replaceAll("[/\\\\:*?\"<>|]", "-");
    }

    private long sizeOf(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (RuntimeException e) { /* unknown */ }
        return -1;
    }

    /** Copied whole into a part file first, then put in place: never half a book. */
    private void copy(Uri uri, File to) throws java.io.IOException {
        File part = new File(to.getPath() + ".part");
        try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(part)) {
            if (in == null) throw new java.io.IOException("the other app gave nothing to read");
            byte[] buf = new byte[1 << 16];
            for (int r; (r = in.read(buf)) > 0; ) out.write(buf, 0, r);
        }
        if (!part.renameTo(to)) throw new java.io.IOException("could not keep " + to.getName());
    }
}
