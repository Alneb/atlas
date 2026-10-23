package org.atlas.capture;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/** The one file a camera app writes a photo into for `Host.takePhoto` (`content://<package>.photos/photo.jpg`, the
 *  cache's photo.jpg): what androidx's FileProvider would do, in a few lines, as this app has no libraries. Not
 *  exported; the camera gets a one-off grant on the Intent. */
public final class PhotoProvider extends ContentProvider {
    static final String NAME = "photo.jpg";

    static File file(android.content.Context c) { return new File(c.getCacheDir(), NAME); }

    static Uri uri(android.content.Context c) { return Uri.parse("content://" + c.getPackageName() + ".photos/" + NAME); }

    @Override public boolean onCreate() { return true; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!NAME.equals(uri.getLastPathSegment())) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(file(getContext()), ParcelFileDescriptor.parseMode(mode) | ParcelFileDescriptor.MODE_CREATE);
    }

    @Override public String getType(Uri uri) { return "image/jpeg"; }
    @Override public Cursor query(Uri uri, String[] p, String s, String[] a, String o) { return null; }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
