package org.atlas.capture;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** A PDF handed to Android's own print dialog (its printers, its options, "Save as PDF"): what `atlas.systemPrint` does on
 *  the phone, where there is no CUPS (`lp`) for the Print plugin's own path. The page gives the PDF's bytes; they are
 *  kept in the app's cache until the system has read them. */
final class SystemPrint {
    private SystemPrint() {}

    /** Shows the print dialog for `pdf` under `title`; must run on the UI thread. */
    static void show(Context c, String title, File pdf) {
        PrintManager pm = (PrintManager) c.getSystemService(Context.PRINT_SERVICE);
        if (pm == null) throw new IllegalStateException("this device has no printing service");
        pm.print(title, new Adapter(title, pdf), new PrintAttributes.Builder().build());
    }

    /** The bytes into a file of the cache (one at a time: the previous one is replaced). */
    static File keep(Context c, byte[] bytes) throws IOException {
        File f = new File(c.getCacheDir(), "print.pdf");
        try (OutputStream o = new FileOutputStream(f)) { o.write(bytes); }
        return f;
    }

    /** The document as it is: one PDF, every page, copied to where the system asks. */
    private static final class Adapter extends PrintDocumentAdapter {
        private final String name;
        private final File pdf;
        Adapter(String title, File pdf) { this.name = title.toLowerCase().endsWith(".pdf") ? title : title + ".pdf"; this.pdf = pdf; }

        @Override public void onLayout(PrintAttributes old, PrintAttributes now, CancellationSignal cancel, LayoutResultCallback cb, Bundle extras) {
            if (cancel.isCanceled()) { cb.onLayoutCancelled(); return; }
            cb.onLayoutFinished(new PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), !now.equals(old));
        }

        @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor to, CancellationSignal cancel, WriteResultCallback cb) {
            try (InputStream in = new FileInputStream(pdf); OutputStream out = new FileOutputStream(to.getFileDescriptor())) {
                byte[] buf = new byte[65536];
                for (int n; (n = in.read(buf)) > 0; ) {
                    if (cancel.isCanceled()) { cb.onWriteCancelled(); return; }
                    out.write(buf, 0, n);
                }
                cb.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
            } catch (IOException e) {
                cb.onWriteFailed(e.getMessage());
            }
        }
    }
}
