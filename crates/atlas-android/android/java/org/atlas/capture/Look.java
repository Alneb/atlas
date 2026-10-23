package org.atlas.capture;

import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** The desktop box's look (crates/atlas-capture/src/look.rs, from ui/src/styles/tokens.css): its palette, picked by the phone's night mode, and its shapes. */
public final class Look {
    public final boolean dark;
    /** An e-ink screen (a Boox): black on white, no ripple or elevation — each change is a panel refresh. */
    public final boolean eink;
    public final int bg, app, pop, hover, border, borderStrong, text, muted, faint, accent, accentSoft, purple, green, red, accentFg;
    public final float density;

    /** A file as the app names it, as on the desktop (ui/src/lib/paths.ts `shownName`): a text note without its extension
     *  (`hubbard`), every other file — a PDF, a picture, a drawing — with it. Paths copied, linked
     *  or sent keep the real name. */
    static String shownName(String path) {
        String b = path.replaceAll("/+$", "");
        b = b.substring(b.lastIndexOf('/') + 1);
        return b.matches("(?i).+\\.(md|markdown|txt|page)") && !b.matches("(?i).+\\.excalidraw\\.md") ? b.replaceFirst("(?i)\\.(md|markdown|txt|page)$", "") : b;
    }

    /** Whether the last Look made was e-ink: what `Host.einkScreen` answers, where there is no Context to ask. */
    static volatile boolean einkApp = isEink();

    Look(Context c) {
        eink = Edition.of(c) == Edition.BOOX || isEink(); // the Boox app is always e-ink
        einkApp = eink;
        dark = !eink && (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        // e-ink: everything a little larger, its text too (label)
        density = c.getResources().getDisplayMetrics().density * (eink ? EINK_SCALE : 1f);
        if (dark) {
            bg = 0xff1f2229; app = 0xff16181d; pop = 0xff262a32; hover = 0x0bffffff; border = 0x12ffffff; borderStrong = 0x1fffffff;
            text = 0xffdcdfe5; muted = 0xff9aa1ad; faint = 0xff8b919c; accent = 0xff8aa4ff; accentSoft = 0x1f8aa4ff;
            purple = 0xffc4a7ff; green = 0xff86d1a0; red = 0xfff28b8f; accentFg = 0xff0b0d12;
        } else if (eink) {
            bg = 0xffffffff; app = 0xffffffff; pop = 0xffffffff; hover = 0x00000000; border = 0xff8a8a8a; borderStrong = 0xff000000;
            text = 0xff000000; muted = 0xff1f1f1f; faint = 0xff3a3a3a; accent = 0xff000000; accentSoft = 0xffe4e4e4;
            purple = 0xff000000; green = 0xff145c2e; red = 0xff8f1a20; accentFg = 0xffffffff;
        } else {
            bg = 0xffffffff; app = 0xffeceef2; pop = 0xffffffff; hover = 0x0b0f172a; border = 0x160f172a; borderStrong = 0x240f172a;
            text = 0xff23272e; muted = 0xff5b6270; faint = 0xff676c77; accent = 0xff4762d9; accentSoft = 0x1a4864dd;
            purple = 0xff8150d6; green = 0xff2f9e5c; red = 0xffd4464f; accentFg = 0xffffffff;
        }
    }

    // faint and the light accent are a step darker (lighter in dark) than the desktop's tokens: on a phone they carry
    // small text (a row's detail, a section's name), which Android's quality bar wants at 4.5:1 on every surface here
    // (the desktop's faint was 3.5–4.3:1). Measured on the devices; docs/design/DESIGN-android.md.
    static final float EINK_SCALE = 1.12f;

    public int dp(float v) { return Math.round(v * density); }

    /** Boox tablets: Onyx's framework carries its e-ink refresh API (`android.onyx.ViewUpdateHelper`, which Onyx's own
     *  SDK finds the same way — ~/Projects/boox_5c_re docs/ONYX-EPD-PEN.md); else the maker or brand says Onyx. */
    static boolean isEink() {
        try { Class.forName("android.onyx.ViewUpdateHelper"); return true; } catch (ClassNotFoundException | LinkageError e) { /* not a Boox framework */ }
        String m = (android.os.Build.MANUFACTURER + " " + android.os.Build.BRAND).toLowerCase(java.util.Locale.ROOT);
        return m.contains("onyx") || m.contains("boox");
    }

    /** One full (GC16) refresh of the screen, the way Onyx's framework clears ghosts after a scroll: the next update made
     *  a full one, then everything repainted (boox_5c_re ONYX-EPD-PEN.md); else the view's own refresh, full mode 98.
     *  Nothing on other devices. */
    /** A refresh that clears most ghosts without the black-and-white flash: Onyx's REGAL waveform (UI_REGAL_MODE 6,
     *  boox_5c_re ONYX-EPD-PEN.md) — what the app does by itself; the flashing one (fullRefresh) only when asked. The
     *  user: "the app does a full refresh too often and it's strident". */
    static void calmRefresh(android.view.View v) {
        try { android.view.View.class.getMethod("refreshScreen", int.class).invoke(v, 6); }
        catch (ReflectiveOperationException | LinkageError e) { v.invalidate(); } // not Onyx: a plain redraw
    }

    static void fullRefresh(android.view.View v) {
        try {
            Class<?> h = Class.forName("android.onyx.ViewUpdateHelper");
            h.getMethod("applyGCOnce").invoke(null);
            for (String name : new String[] { "repaintEverything", "repaintEveryThing" }) {
                try { h.getMethod(name).invoke(null); v.invalidate(); return; } catch (NoSuchMethodException e) { /* the other spelling */ }
            }
            v.invalidate();
            return;
        } catch (ReflectiveOperationException | LinkageError e) { /* not Onyx's framework, or another version */ }
        try { android.view.View.class.getMethod("refreshScreen", int.class).invoke(v, 98); } catch (ReflectiveOperationException | LinkageError e) { /* not e-ink */ }
    }

    /** Onyx's WebView injects its own e-ink CSS (`!important` colours from the per-app settings) into network pages, and
     *  Atlas's page is one (127.0.0.1): off, so Atlas's own e-ink look is the one shown. Nothing on other devices. */
    static void noInjectedCss(android.webkit.WebView w) {
        try { android.webkit.WebView.class.getMethod("setCssInjectEnabled", boolean.class).invoke(w, false); } catch (ReflectiveOperationException | LinkageError e) { /* not Onyx's WebView */ }
    }

    /** A view's elevation: none on e-ink (a shadow is dither there; the border marks the edge). */
    public float elevation(float v) { return eink ? 0 : dp(v); }

    /** A rounded shape: fill, corner radius (dp), a hairline border (0 = none). */
    public GradientDrawable round(int fill, float radius, int stroke) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(radius));
        if (stroke != 0) g.setStroke(eink ? dp(1.5f) : Math.max(1, (int) density), stroke); // e-ink: lines that read on the panel
        return g;
    }

    /** The shape, with the platform's touch ripple in the box's hover colour. */
    public Drawable pressable(int fill, float radius, int stroke) {
        if (eink) return round(fill, radius, stroke); // a ripple animates: ghosting on e-ink
        int ripple = dark ? 0x33ffffff : 0x220f172a;
        return new RippleDrawable(ColorStateList.valueOf(ripple), round(fill, radius, stroke), round(0xffffffff, radius, 0));
    }

    public TextView label(Context c, String s, float sp, int color) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, eink ? sp * EINK_SCALE : sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER_VERTICAL);
        return t;
    }

    /** One of the box's icons (res/drawable/ic_<name>.xml, generated from the desktop's paths), tinted. */
    public Drawable icon(Context c, String name, int color) {
        int id = c.getResources().getIdentifier("ic_" + name, "drawable", c.getPackageName());
        if (id == 0) { // a name with no icon (phone.rs `every_icon_the_java_asks_for_is_drawn`): blank, never a crash
            android.util.Log.w("AtlasLook", "no icon " + name);
            return new android.graphics.drawable.ColorDrawable(0);
        }
        Drawable d = c.getDrawable(id).mutate();
        d.setTint(color);
        return d;
    }

    /** The widest a column of text runs: ~70 characters of 15 sp body text (DESIGN-android.md, line length). */
    public static final int READABLE_DP = 600;

    /** `content` at most READABLE_DP wide, centred: on a tablet a settings page does not stretch edge to edge; on a
     *  phone it is as wide as the screen. */
    public View readable(Context c, View content) {
        int cap = dp(READABLE_DP);
        FrameLayout f = new FrameLayout(c) {
            @Override protected void onMeasure(int ws, int hs) {
                FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) content.getLayoutParams();
                lp.width = MeasureSpec.getSize(ws) > cap ? cap : ViewGroup.LayoutParams.MATCH_PARENT;
                super.onMeasure(ws, hs);
            }
        };
        f.addView(content, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER_HORIZONTAL));
        return f;
    }

    /** The brand tile: a rounded square, accent to purple, an "A" (look.rs `brand`). */
    TextView brand(Context c, float size) {
        TextView t = label(c, "A", size * 0.55f, accentFg);
        t.setGravity(Gravity.CENTER);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[] {accent, purple});
        g.setCornerRadius(dp(size * 0.28f));
        t.setBackground(g);
        return t;
    }

    /** A short form as the desktop shows it: monospace, on a soft chip. */
    TextView code(Context c, String s) {
        TextView t = label(c, s, 12.5f, text);
        t.setTypeface(Typeface.MONOSPACE);
        t.setPadding(dp(6), dp(2), dp(6), dp(2));
        t.setBackground(pressable(hover, 5, border));
        return t;
    }

    /** A list row as the desktop draws it — icon, label, the detail quiet at the right (under the label when both do not
     *  fit: Row) — at least 48 dp for a finger. */
    public Row row(Context c, String icon, String label, String detail) {
        ImageView i = null;
        LinearLayout.LayoutParams at = null;
        if (icon != null) {
            i = new ImageView(c);
            i.setImageDrawable(icon(c, icon, muted));
            at = new LinearLayout.LayoutParams(dp(19), dp(19));
            at.setMarginEnd(dp(14));
        }
        TextView t = label(c, label, 15.5f, text);
        t.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        TextView d = null;
        if (detail != null && !detail.isEmpty()) {
            d = label(c, detail, 12.5f, faint);
            d.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        }
        Row r = new Row(c, i, at, t, d, dp(10));
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setMinimumHeight(dp(48));
        r.setPadding(dp(12), dp(6), dp(12), dp(6));
        r.setBackground(pressable(0x00000000, 8, 0));
        return r;
    }

    /** A button: the accent filled (the one thing to do on a screen), else outlined. */
    public TextView button(Context c, String s, boolean primary) {
        TextView b = label(c, s, 15, primary ? accentFg : text);
        b.setGravity(Gravity.CENTER);
        b.setMinHeight(dp(44));
        b.setPadding(dp(18), 0, dp(18), 0);
        b.setBackground(pressable(primary ? accent : 0x00000000, 10, primary ? 0 : borderStrong));
        return b;
    }

    /** A section's name over its rows: small, quiet, a little spaced. */
    public TextView heading(Context c, String s) {
        TextView h = label(c, s.toUpperCase(java.util.Locale.ROOT), 11.5f, faint);
        h.setLetterSpacing(0.08f);
        h.setPadding(dp(16), dp(22), dp(16), dp(6));
        return h;
    }

    /** A card holding rows: the box's surface, rounded, a hairline. */
    public LinearLayout card(Context c) {
        LinearLayout k = new LinearLayout(c);
        k.setOrientation(LinearLayout.VERTICAL);
        k.setPadding(dp(4), dp(4), dp(4), dp(4));
        k.setBackground(round(bg, 14, border));
        return k;
    }
}
