package org.atlas.capture;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import java.util.ArrayList;
import java.util.List;

/** The launcher icon's long-press menu (docs/guides/ANDROID.md, " "): Capture, Search, Files. Dynamic, not static
 *  ones: a static shortcut clears the task, which would restart the note view; these bring the running app forward. */
final class Shortcuts {
    private Shortcuts() {}

    /** The extra naming the place an `AtlasActivity` intent opens: "search" or "files". */
    static final String PLACE = "org.atlas.place";

    static void publish(Context c, Look look) {
        ShortcutManager sm = c.getSystemService(ShortcutManager.class);
        if (sm == null) return;
        List<ShortcutInfo> all = new ArrayList<>();
        all.add(make(c, look, "capture", "Capture", "plus", new Intent(c, CaptureActivity.class)));
        all.add(make(c, look, "search", "Search", "search", place(c, "search")));
        all.add(make(c, look, "files", "Files", "vault", place(c, "files")));
        try { sm.setDynamicShortcuts(all); } catch (RuntimeException e) { /* a launcher's rate limit: next start */ }
    }

    private static Intent place(Context c, String where) {
        return new Intent(c, AtlasActivity.class).putExtra(PLACE, where)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP); // the running one gets onNewIntent
    }

    private static ShortcutInfo make(Context c, Look look, String id, String label, String icon, Intent i) {
        i.setAction(Intent.ACTION_VIEW); // a shortcut's intent must have one
        return new ShortcutInfo.Builder(c, id).setShortLabel(label).setIcon(glyph(c, look, icon)).setIntent(i).build();
    }

    /** The app's icon in the accent on its soft tile, as an adaptive icon (the launcher's mask shapes it). */
    private static Icon glyph(Context c, Look look, String name) {
        int size = 216, inner = 84; // adaptive: 108 dp with the middle 72 dp kept; the glyph inside that
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas k = new Canvas(b);
        k.drawColor(look.dark ? 0xff262a32 : 0xffe8ecfb);
        Drawable d = look.icon(c, name, look.accent);
        if (d != null) {
            int o = (size - inner) / 2;
            d.setBounds(o, o, o + inner, o + inner);
            d.draw(k);
        }
        return Icon.createWithAdaptiveBitmap(b);
    }
}
