package org.atlas.plugins.notepad;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.pdf.PdfDocument;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** Pages → Export: the drawing as a PDF (a page per page, A4, with its paper) or the open page as a PNG — written
 *  beside the drawing (`x.excalidraw` → `x.pdf`, `x - page 2.png`), so they are files of the vault like any other,
 *  linkable and synced (PHILOSOPHY §1). Drawn as the canvas draws them: paper, highlighter under, then the rest. */
final class Exporter {
    /** PDF points per scene unit: Excalidraw's CSS pixels are 96 a inch, PDF's points 72. */
    private static final float PT = 72f / 96f;

    private final NotepadView n;
    private final Painter painter = new Painter();

    Exporter(NotepadView n) {
        this.n = n;
        painter.files(n.scene.files);
        // linked PDF pages, rendered and waited for (an export runs off the UI thread), sharp enough to print
        painter.linked((file, page, px) -> org.atlas.capture.PageSource.pageNow(n.host, file, page, Math.max(px, 1600)));
    }

    /** The whole drawing as a PDF beside it; its vault path, or null (said in a toast). */
    String pdf() {
        PdfDocument doc = new PdfDocument();
        List<RectF> sheets = sheets();
        for (int i = 0; i < sheets.size(); i++) {
            RectF r = sheets.get(i);
            PdfDocument.Page page = doc.startPage(new PdfDocument.PageInfo.Builder(Math.round(r.width() * PT), Math.round(r.height() * PT), i + 1).create());
            Canvas c = page.getCanvas();
            c.scale(PT, PT);
            draw(c, r, i < n.scene.pages.size() ? n.scene.pages.get(i) : null, 1);
            doc.finishPage(page);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try { doc.writeTo(out); } catch (IOException e) { doc.close(); n.host.toast("Not exported: " + e.getMessage()); return null; }
        doc.close();
        return write(base() + ".pdf", out.toByteArray());
    }

    /** Page `i` (or everything, in a drawing without pages) as a PNG at twice its size, for sharp print and zoom. */
    String png(int i) {
        List<RectF> sheets = sheets();
        int at = Math.max(0, Math.min(sheets.size() - 1, i));
        RectF r = sheets.get(at);
        float scale = 2;
        Bitmap b = Bitmap.createBitmap(Math.max(1, Math.round(r.width() * scale)), Math.max(1, Math.round(r.height() * scale)), Bitmap.Config.ARGB_8888);
        b.eraseColor(Color.WHITE);
        Canvas c = new Canvas(b);
        c.scale(scale, scale);
        draw(c, r, at < n.scene.pages.size() ? n.scene.pages.get(at) : null, scale);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, out);
        b.recycle();
        String name = n.scene.pages.isEmpty() ? base() + ".png" : base() + " - page " + (at + 1) + ".png";
        return write(name, out.toByteArray());
    }

    /** What is exported: the pages, or with none the box around everything (with a margin). */
    private List<RectF> sheets() {
        List<RectF> out = new ArrayList<>();
        for (Page p : n.scene.pages) out.add(new RectF(p.r));
        if (out.isEmpty()) {
            RectF all = new RectF();
            for (Item it : n.scene.items) if (all.isEmpty()) all.set(it.box); else all.union(it.box);
            if (all.isEmpty()) all.set(0, 0, Page.W, Page.H);
            all.inset(-24, -24);
            out.add(all);
        }
        return out;
    }

    /** The sheet `r` onto `c` (already scaled to the output): white, the page's paper, its items. */
    private void draw(Canvas c, RectF r, Page page, float k) {
        c.save();
        c.translate(-r.left, -r.top);
        c.clipRect(r);
        Paint white = new Paint();
        white.setColor(Color.WHITE);
        c.drawRect(r, white);
        if (page != null) {
            Paint rule = new Paint(Paint.ANTI_ALIAS_FLAG);
            rule.setStyle(Paint.Style.STROKE);
            rule.setColor(0xffd9dde3);
            page.drawPaper(c, rule, k);
        }
        List<Item> on = page != null ? n.scene.itemsOn(page) : n.scene.items;
        for (int pass = 0; pass < 2; pass++) for (Item it : on) if (it.under() == (pass == 0)) it.draw(c, painter);
        c.restore();
    }

    /** The drawing's path without `.excalidraw`. */
    /** The export's name: the drawing's; a PDF's companion (`x.pdf.excalidraw`) gives `x (with notes)` — the PDF and
     *  the ink merged into a new file, the PDF itself untouched. */
    private String base() {
        String b = n.path.replaceAll("\\.excalidraw(\\.md)?$", "");
        return b.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf") ? b.substring(0, b.length() - 4) + " (with notes)" : b;
    }

    private String write(String path, byte[] bytes) {
        try {
            n.host.write(path, bytes);
            return path;
        } catch (IOException e) {
            n.host.toast("Not exported: " + e.getMessage());
            return null;
        }
    }
}
