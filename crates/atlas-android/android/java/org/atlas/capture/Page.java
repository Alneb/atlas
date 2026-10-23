package org.atlas.capture;

import android.content.Context;
import android.content.pm.PackageManager;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * What the app on screen was showing, read once when the tile or the button is pressed: its views walked in reading order
 * (depth first, at most 600) and handed to Onscreen, which finds the thing's address and title — a browser's page, a YouTube
 * video, a Spotify song, a Letterboxd film, a Wikipedia article — or, in an app it does not know, the title it shows (a
 * guess, so the box offers it off). This class is only the Android side: the recognising is plain Java, tested.
 */
final class Page {
    final String pkg, app;
    final Onscreen.Found found;

    private Page(String pkg, String app, Onscreen.Found found) { this.pkg = pkg; this.app = app; this.found = found; }

    static Page read(Context c, AccessibilityNodeInfo root) {
        if (root == null) return null;
        String pkg = root.getPackageName() == null ? "" : root.getPackageName().toString();
        List<Onscreen.Node> nodes = new ArrayList<>();
        ArrayDeque<AccessibilityNodeInfo> todo = new ArrayDeque<>();
        todo.push(root);
        while (!todo.isEmpty() && nodes.size() < 600) {
            AccessibilityNodeInfo n = todo.pop();
            CharSequence extra = n.getExtras() == null ? null : n.getExtras().getCharSequence("url"); // Chromium's web root
            nodes.add(new Onscreen.Node(str(n.getText()), n.getViewIdResourceName(), str(n.getClassName()), str(n.getContentDescription()),
                str(extra), n.isVisibleToUser()));
            for (int i = n.getChildCount() - 1; i >= 0; i--) { AccessibilityNodeInfo k = n.getChild(i); if (k != null) todo.push(k); } // first child on top
        }
        String app = label(c, pkg);
        Onscreen.Found f = Onscreen.read(pkg, nodes);
        if (f.guess != null && f.guess.equals(app)) f = new Onscreen.Found(null, null, null, null, null, null, false);
        return new Page(pkg, app, f);
    }

    private static String str(CharSequence s) { return s == null ? null : s.toString(); }

    private static String label(Context c, String pkg) {
        try {
            PackageManager pm = c.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return null;
        }
    }
}
