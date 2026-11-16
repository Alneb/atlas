package org.atlas.capture;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.File;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The capture box on the phone: the desktop box's card (look.rs) floating above the keyboard over a dimmed screen, with a real
 * text field. The keyboard's action saves (Enter saves on the desktop); the short forms, completions and "what it becomes" are
 * the desktop's own (Core → Rust). Leaving keeps the text as a draft; saving clears it.
 * Held by a frame: CaptureActivity (its own screen) or CaptureOverlay (a window over the app you were in, which keeps
 * running — a video plays on); the box is a Context over the frame's, so its views are the frame's.
 */
final class CaptureBox extends android.content.ContextWrapper {
    /** Where the box lives. */
    interface Frame {
        /** The activity holding the box; null when it floats over another app. */
        Activity activity();
        /** Leaves (the draft kept). */
        void close();
    }

    private final Frame frame;
    /** What opened the box: what it is reopened with when it moves into an activity (moveIn). */
    private Intent opened;
    private Look look;
    private Vaults vaults;
    private String vault;
    private EditText edit;
    private TextView status;
    private LinearLayout list, shots;
    /** The vault list's "Send to an Atlas server…": vaults found on the phone go in just above it. */
    private View foundBefore;
    private Flow guides;
    private Flow chips;
    private TextView pill, save;
    private String clip, link, app;
    /** The link was found by a search (a likely match): the chip says so. */
    private boolean linkSearched;
    /** The screen's app (package) and, when it showed no address, what to look up (Onscreen.resolve). */
    private String screenPkg;
    private Onscreen.Found find;
    /** readPlaying's latest ask: an older answer arriving late is dropped. */
    private int asked;
    /** A non-browser app's title, read from its screen (a guess, offered off); what is playing (offered off). */
    private String seen;
    private Playing playing;
    /** Every player with something (Playing.all): one chip each; `playing` is the one chosen. */
    private java.util.List<Playing> players = new java.util.ArrayList<>();
    private boolean seenOn, playingOn;
    /** The files a capture can carry: the screen taken, the last screenshot, files shared in. The ones on are attached on save. */
    private final java.util.List<Piece> pieces = new java.util.ArrayList<>();
    private boolean clipOn, linkOn, saving;
    /** "Catalogue it" (server vaults): the capture's links also go to the vault's catalog, whose plugins act on them —
     *  TubeArchivist archives a video, the Downloader sends a song ( hand-off). Off until chosen. */
    private boolean catalogOn;
    private java.util.List<String> catalogLinks = java.util.Collections.emptyList(); // read on the main thread at Save
    private final Handler ui = new Handler(Looper.getMainLooper());
    /** This box's timings (logcat, tag AtlasCapture). */
    private CaptureClock clock;
    /** refresh's latest ask (the hint and the completions come from the core thread): an older answer is dropped. */
    private volatile int hinted;
    /** The screen this box waits for (Screens): a newer gesture's replaces it, a late older one is dropped. */
    private String screenAsked;
    private boolean focusedOnce;

    /** The core's calls the box makes while it is open — the hint and the completions at every keystroke, a share's
     *  text, the vault's names read — on one thread of their own, in order, never the UI's: the first call loads the
     *  native library (the full app's is tens of megabytes), and a hint reads the vault's settings and its plugins'
     *  manifests now and then (a vault on shared storage is slow to read). Saving has its own thread (save). */
    private static Handler core;

    static synchronized Handler core() {
        if (core == null) {
            android.os.HandlerThread t = new android.os.HandlerThread("capture-core");
            t.start();
            core = new Handler(t.getLooper());
        }
        return core;
    }

    /** Loads the core's library ahead of the box (a gesture, CaptureActivity's start), so its first hint is quick. */
    static void warm() {
        core().post(() -> {
            long t = CaptureClock.now();
            Core.describe("", "");
            android.util.Log.i(CaptureClock.TAG, "core ready in " + (CaptureClock.now() - t) + " ms");
        });
    }

    CaptureBox(Context base, Frame frame) {
        super(base);
        this.frame = frame;
    }

    /** The box's view, for the frame to show. */
    View open(Intent intent) {
        opened = intent;
        clock = CaptureClock.of(intent);
        clock.mark("opening");
        warm(); // queued first on the core thread: everything below that asks the core waits behind it, off the UI
        look = new Look(this);
        vaults = new Vaults(this);
        Server.init(this);
        vault = vaults.current();
        FrameLayout root = new FrameLayout(this);
        // a tap on the dimmed screen does nothing: on a tall e-ink screen most of it is "outside". Back or the card's ✕ leave (draft kept).
        if (Build.VERSION.SDK_INT >= 30) { // the frame's window is drawn edge to edge
            final boolean[] keyboard = {false};
            root.setOnApplyWindowInsetsListener((v, in) -> {
                android.graphics.Insets i = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom); // never under the bars or the keyboard
                if (!keyboard[0] && in.isVisible(WindowInsets.Type.ime())) { keyboard[0] = true; clock.mark("keyboard up"); }
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setClickable(true); // taps on the card stay on the card
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(look.dp(4), look.dp(4), look.dp(4), look.dp(4));
        list.setBackground(look.round(look.pop, 10, look.borderStrong));
        list.setElevation(look.elevation(6));
        list.setVisibility(View.GONE);
        column.addView(list, lp(-1, -2, 0, 0, 0, 6));
        column.addView(card(), lp(-1, -2, 0, 0, 0, 0));
        FrameLayout.LayoutParams at = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        at.setMargins(look.dp(10), 0, look.dp(10), look.dp(10));
        root.addView(column, at);
        // the draft at once (Java's own preferences); a share's text joins it from the core thread (shareIn)
        edit.setText(vaults.draft());
        edit.setSelection(edit.length());
        edit.requestFocus(); // the window's first focus: the keyboard comes with the window (stateAlwaysVisible)
        firstFrame(root);
        column.setTranslationY(look.dp(24));
        column.setAlpha(0f);
        column.animate().translationY(0).alpha(1f).setDuration(140).start();
        takeScreen(intent);
        takeFiles(intent);
        shareIn(intent);
        lastScreenshot();
        readPlaying();
        drawChips();
        if (vault == null) showVaultChoice(); else prepare(vault);
        new Thread(() -> Outbox.send(this)).start(); // captures kept while a server did not answer
        refresh();
        clock.mark("box built");
        return root;
    }

    /** Logs the box's first frame on screen (the dimmed screen and the card; the keyboard is logged when it is up). */
    private void firstFrame(View root) {
        android.view.ViewTreeObserver.OnDrawListener[] once = new android.view.ViewTreeObserver.OnDrawListener[1];
        once[0] = () -> {
            if (once[0] == null) return;
            android.view.ViewTreeObserver.OnDrawListener me = once[0];
            once[0] = null;
            clock.mark("first frame");
            root.post(() -> root.getViewTreeObserver().removeOnDrawListener(me)); // not from inside onDraw
        };
        root.getViewTreeObserver().addOnDrawListener(once[0]);
    }

    /** The vault's note names and tags read for the completions (the core reads them on a thread of its own). */
    private void prepare(String v) {
        if (v != null && !Server.is(v)) core().post(() -> Core.prepare(v));
    }

    /** A share's or a selection's text, made by the core's rule (share.rs) on the core thread, then put under what is
     *  in the box (never over a draft). A box moved into its activity carries its share in its draft already. */
    private void shareIn(Intent i) {
        Shared raw = Shared.of(i);
        if (raw == null) return;
        core().post(() -> {
            String t = raw.quote != null ? Core.shareQuote(raw.quote) : Core.shareText(raw.subject, raw.text);
            if (t == null || t.isEmpty()) return;
            ui.post(() -> {
                String now = edit.getText().toString();
                String merged = Core.underDraft(now, t); // the library is loaded: the core thread just used it
                if (merged.equals(now)) return;
                edit.setText(merged);
                edit.setSelection(edit.length());
                clock.mark("shared text in");
            });
        });
    }

    /** Open already (one box at a time): a new tap of the tile brings a new screen. */
    void again(Intent i) {
        opened = i;
        clock = CaptureClock.of(i);
        clock.mark("opened again (the box was open)");
        takeScreen(i);
        lastScreenshot();
        readPlaying();
        drawChips();
        shareIn(i);
        takeFiles(i);
    }

    /** SEND / SEND_MULTIPLE with files: each copied into the cache off the main thread, then a chip. */
    private void takeFiles(Intent i) {
        java.util.List<Uri> uris = new java.util.ArrayList<>();
        if (Intent.ACTION_SEND.equals(i.getAction()) && i.getParcelableExtra(Intent.EXTRA_STREAM) instanceof Uri) uris.add(i.getParcelableExtra(Intent.EXTRA_STREAM));
        if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction()) && i.getParcelableArrayListExtra(Intent.EXTRA_STREAM) != null) {
            for (Object o : i.getParcelableArrayListExtra(Intent.EXTRA_STREAM)) if (o instanceof Uri) uris.add((Uri) o);
        }
        if (uris.isEmpty()) return;
        new Thread(() -> {
            File dir = new File(getCacheDir(), "shared");
            dir.mkdirs();
            java.util.Set<String> taken = new java.util.HashSet<>(); // two shared files of one name (or none) must not overwrite each other
            for (Uri u : uris) {
                String name = "shared";
                try (android.database.Cursor c = getContentResolver().query(u, new String[] {android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
                } catch (Exception e) { /* the plain name */ }
                name = name.replace('/', '_');
                int dot = name.lastIndexOf('.') > 0 ? name.lastIndexOf('.') : name.length();
                String base = name.substring(0, dot), ext = name.substring(dot);
                for (int k = 2; !taken.add(name); k++) name = base + " (" + k + ")" + ext;
                File f = new File(dir, name);
                try (java.io.InputStream in = getContentResolver().openInputStream(u); java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                    byte[] b = new byte[65536];
                    for (int n; (n = in.read(b)) > 0; ) out.write(b, 0, n);
                    Piece p = new Piece(Piece.Kind.SHARED, Look.shownName(f.getName()), f, true);
                    p.thumb(); // decoded here, off the main thread
                    ui.post(() -> { pieces.add(p); drawChips(); refresh(); });
                } catch (Exception e) { /* not readable: left out */ }
            }
        }).start();
    }

    /** From the tile or the button: the screen you were on, and what it showed — its address when known (on by default),
     *  else what to look up (`find`: a known app showing no address; readPlaying does it). */
    private void takeScreen(Intent i) {
        String s = i.getStringExtra("screen");
        if (s != null) { drop(Piece.Kind.SCREEN); screenAsked = s; screen(s); }
        if (s != null || i.getStringExtra("link") != null) { link = i.getStringExtra("link"); linkOn = link != null; linkSearched = false; } // a new screen, a new thing
        find = null;
        screenPkg = i.getStringExtra("pkg");
        try {
            if (i.getStringExtra("site") != null) find = new Onscreen.Found(Onscreen.Site.valueOf(i.getStringExtra("site")), null, i.getStringExtra("query"), i.getStringExtra("query"), i.getStringExtra("year"), null, false);
        } catch (IllegalArgumentException e) { /* a site this version does not know */ }
        if (s != null || i.getStringExtra("link") != null || i.getStringExtra("seen") != null) { seen = i.getStringExtra("seen"); seenOn = false; }
        app = i.getStringExtra("app");
    }

    /** The screen's picture once ScreenService has written it (Screens): its tile then, offered off. The box is open
     *  and typing before that; the thumbnail comes from the pixels in memory, else it is decoded here off the UI. */
    private void screen(String path) {
        Screens.when(path, (f, thumb) -> new Thread(() -> {
            if (f == null) return; // not written: the box goes on without it
            Piece p = new Piece(Piece.Kind.SCREEN, "Screen", f, false, thumb);
            p.thumb();
            ui.post(() -> {
                if (!path.equals(screenAsked)) return; // a newer screen came meanwhile
                drop(Piece.Kind.SCREEN);
                pieces.add(p);
                drawChips();
                clock.mark("screen shown");
            });
        }, "capture-screen-tile").start());
    }

    /** The song or video playing (Playing), off the main thread; the chip comes when it is known. When the screen's app
     *  showed no address (`find`), its own media session is what it shows (YouTube's video, Spotify's song): that becomes
     *  the link, on, and leaves the players' chips; else the site is asked (Onscreen.resolve); else its title is offered. */
    private void readPlaying() {
        final int ask = ++asked;
        final Onscreen.Found want = find;
        final String pkg = screenPkg;
        new Thread(() -> {
            java.util.List<Playing> all = new java.util.ArrayList<>(Playing.all(this));
            Onscreen.Found got = null;
            boolean sure = true; // a search from a title guessed on the screen is offered off; the session's title is the app's own
            if (want != null) {
                Playing mine = Playing.of(all, pkg);
                if (mine != null && mine.url != null) {
                    all.remove(mine);
                    got = want.withUrl(mine.url, mine.label(), mine.searched);
                } else {
                    got = Onscreen.resolve(want, languages());
                    sure = !got.searched;
                }
            }
            final Onscreen.Found found = got;
            final boolean on = sure;
            ui.post(() -> {
                if (ask != asked) return;
                Playing p = all.isEmpty() ? null : all.get(0);
                boolean same = p != null && playing != null && p.markdown().equals(playing.markdown());
                players = all;
                playing = p;
                if (!same) playingOn = false;
                if (found != null && found.url != null) { link = found.markdown(); linkOn = on; linkSearched = found.searched; }
                else if (found != null && found.query != null) { seen = found.query; seenOn = false; }
                drawChips();
                refresh();
            });
        }).start();
    }

    /** Wikipedia's languages to try: the phone's, then English. */
    private static java.util.List<String> languages() {
        java.util.List<String> out = new java.util.ArrayList<>();
        android.os.LocaleList l = android.os.LocaleList.getDefault();
        for (int k = 0; k < l.size(); k++) if (!out.contains(l.get(k).getLanguage())) out.add(l.get(k).getLanguage());
        if (!out.contains("en")) out.add("en");
        return out;
    }

    private void drop(Piece.Kind kind) {
        for (java.util.Iterator<Piece> it = pieces.iterator(); it.hasNext(); ) if (it.next().kind == kind) it.remove();
    }

    /** The newest picture in a Screenshots folder, if taken in the last half hour: offered (off) as "Last screenshot". */
    private void lastScreenshot() {
        new Thread(() -> {
            if (!canReadImages(this)) return; // asks the system: off the UI too
            Uri images = android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            String[] cols = {android.provider.MediaStore.Images.Media._ID, android.provider.MediaStore.Images.Media.DISPLAY_NAME, android.provider.MediaStore.Images.Media.DATE_ADDED};
            String where = Build.VERSION.SDK_INT >= 29 ? android.provider.MediaStore.Images.Media.RELATIVE_PATH + " LIKE ?" : android.provider.MediaStore.Images.Media.DATA + " LIKE ?";
            try (android.database.Cursor c = getContentResolver().query(images, cols, where, new String[] {"%Screenshots%"}, android.provider.MediaStore.Images.Media.DATE_ADDED + " DESC")) {
                if (c == null || !c.moveToFirst()) return;
                if (System.currentTimeMillis() / 1000 - c.getLong(2) > 30 * 60) return;
                String name = c.getString(1);
                File dir = new File(getCacheDir(), "last");
                dir.mkdirs();
                File f = new File(dir, name.replace('/', '_'));
                if (!f.exists()) {
                    for (File old : dir.listFiles()) old.delete();
                    try (java.io.InputStream in = getContentResolver().openInputStream(android.content.ContentUris.withAppendedId(images, c.getLong(0)));
                         java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                        byte[] b = new byte[65536];
                        for (int n; (n = in.read(b)) > 0; ) out.write(b, 0, n);
                    }
                }
                Piece p = new Piece(Piece.Kind.LAST_SCREENSHOT, "Last screenshot", f, false);
                p.thumb();
                ui.post(() -> {
                    for (Piece q : pieces) if (q.kind == p.kind && q.file.equals(f)) return;
                    drop(p.kind);
                    pieces.add(p);
                    drawChips();
                });
            } catch (Exception e) { /* no screenshot offered */ }
        }).start();
    }

    static boolean canReadImages(Context a) {
        if (Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager()) return true;
        return a.checkSelfPermission(imagesPermission()) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    static String imagesPermission() { return Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_IMAGES" : android.Manifest.permission.READ_EXTERNAL_STORAGE; }

    void permitted(int code) {
        if (code == 2) { lastScreenshot(); drawChips(); }
    }

    /** A picture's tile (dp height): the picture itself, dimmed when it is left out; its corner says in or out. */
    private static final int TILE = 72;

    private View tile(Piece p) {
        android.graphics.Bitmap thumb = p.thumb();
        int h = look.dp(TILE), w = Math.max(look.dp(44), Math.min(look.dp(130), h * thumb.getWidth() / Math.max(1, thumb.getHeight())));
        FrameLayout f = new FrameLayout(this);
        ImageView img = new ImageView(this);
        img.setImageBitmap(thumb);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setClipToOutline(true);
        img.setBackground(look.round(look.hover, 8, 0));
        img.setAlpha(p.on ? 1f : 0.45f);
        f.addView(img, new FrameLayout.LayoutParams(w, h));
        f.setForeground(look.round(0, 8, p.on ? look.accent : look.border));
        f.setContentDescription(shown(p));
        f.setOnClickListener(v -> view(p)); // see it large; in or out from there
        ImageView badge = new ImageView(this); // a quick in / out without opening it
        badge.setImageDrawable(look.icon(this, p.on ? "check" : "plus", p.on ? look.accentFg : look.text));
        badge.setBackground(look.round(p.on ? look.accent : look.bg, 12, p.on ? 0 : look.borderStrong));
        badge.setPadding(look.dp(4), look.dp(4), look.dp(4), look.dp(4));
        // the circle stays small on the picture; the finger's target around it is 48 dp (Touch_Target_Size)
        FrameLayout hit = new FrameLayout(this);
        hit.addView(badge, new FrameLayout.LayoutParams(look.dp(24), look.dp(24), Gravity.TOP | Gravity.END));
        hit.setPadding(0, look.dp(4), look.dp(4), 0);
        hit.setContentDescription((p.on ? "Leave out " : "Put in ") + shown(p));
        hit.setOnClickListener(v -> { p.on = !p.on; drawChips(); refresh(); });
        f.addView(hit, new FrameLayout.LayoutParams(look.dp(48), look.dp(48), Gravity.TOP | Gravity.END));
        return f;
    }

    /** The ink over picture `p` flattened into a copy of it (at most 2400 px a side), which replaces `p` in the capture.
     *  The ink is in the view's pixels: the preview's image matrix, inverted, maps it onto the preview, then scaled up. */
    private void marked(Piece p, ImageView under, PenView pen) {
        try {
            android.graphics.Bitmap ink = pen.ink();
            android.graphics.drawable.Drawable shown = under.getDrawable();
            if (ink == null || pen.isEmpty() || shown == null) return;
            android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
            o.inSampleSize = Piece.sample(p.file, 2400);
            o.inMutable = true;
            android.graphics.Bitmap full = android.graphics.BitmapFactory.decodeFile(p.file.getPath(), o);
            if (full == null) return;
            android.graphics.Matrix m = new android.graphics.Matrix();
            if (!under.getImageMatrix().invert(m)) return;
            m.postScale(full.getWidth() / (float) shown.getIntrinsicWidth(), full.getHeight() / (float) shown.getIntrinsicHeight());
            new android.graphics.Canvas(full).drawBitmap(ink, m, new android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG));
            String stamp = new java.text.SimpleDateFormat("yyyy-MM-dd-HHmmss", java.util.Locale.ROOT).format(new java.util.Date());
            File f = new File(getCacheDir(), "marked-" + stamp + ".png");
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) { full.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out); }
            full.recycle();
            int at = pieces.indexOf(p);
            Piece q = new Piece(p.kind, p.label, f, true);
            if (at >= 0) pieces.set(at, q); else pieces.add(q);
            drawChips();
            refresh();
        } catch (Exception e) {
            status.setVisibility(View.VISIBLE);
            status.setTextColor(look.red);
            status.setText("The marked picture could not be kept: " + e.getMessage());
        }
    }

    private String shown(Piece p) { return p.kind == Piece.Kind.SCREEN && app != null ? "Screen · " + app : p.label; }

    /** The picture over everything, as large as the screen allows, with what can be done with it: in or out of the capture,
     *  removed when it was shared or drawn here, or just closed (a tap on the picture). */
    private void view(Piece p) {
        android.app.Dialog d = above(new android.app.Dialog(this, android.R.style.Theme_DeviceDefault_NoActionBar_Fullscreen));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setBackgroundColor(0xf0000000);
        ImageView v = new ImageView(this);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
        o.inSampleSize = Piece.sample(p.file, getResources().getDisplayMetrics().heightPixels);
        android.graphics.Bitmap big = android.graphics.BitmapFactory.decodeFile(p.file.getPath(), o);
        v.setImageBitmap(big != null ? big : p.thumb()); // a drawing's file is a scene: its thumbnail then
        v.setContentDescription(shown(p)); // a tap on it does nothing: Close or Back leave (a stray tap closed it)
        col.addView(v, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(look.dp(16), look.dp(10), look.dp(16), look.dp(16));
        TextView name = new TextView(this);
        name.setText(shorten(shown(p), 40));
        name.setTextColor(0xffdcdfe5);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        name.setSingleLine(true);
        name.setOnLongClickListener(x -> { whole(shown(p)); return true; });
        bar.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
        TextView shut = look.button(this, "Close", false);
        shut.setTextColor(0xffdcdfe5);
        shut.setOnClickListener(x -> d.dismiss());
        bar.addView(shut, lp(-2, -2, look.dp(8), 0, 0, 0));
        if (p.removable) {
            TextView remove = look.button(this, "Remove", false);
            remove.setTextColor(0xffdcdfe5);
            remove.setOnClickListener(x -> { pieces.remove(p); drawChips(); refresh(); d.dismiss(); });
            bar.addView(remove, lp(-2, -2, look.dp(8), 0, 0, 0));
        }
        if (p.kind != Piece.Kind.DRAWING && big != null) { // a picture: draw on it (marked up, it replaces the picture)
            TextView mark = look.button(this, "Draw on it", false);
            mark.setTextColor(0xffdcdfe5);
            mark.setOnClickListener(x -> { d.dismiss(); draw(p); });
            bar.addView(mark, lp(-2, -2, look.dp(8), 0, 0, 0));
        }
        TextView in = look.button(this, p.on ? "Leave out" : "Add to capture", !p.on);
        if (p.on) in.setTextColor(0xffdcdfe5);
        in.setOnClickListener(x -> { p.on = !p.on; drawChips(); refresh(); d.dismiss(); });
        bar.addView(in, lp(-2, -2, look.dp(8), 0, 0, 0));
        col.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        if (Build.VERSION.SDK_INT >= 30) col.setOnApplyWindowInsetsListener((x, insets) -> {
            android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars());
            x.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsets.CONSUMED;
        });
        d.setContentView(col);
        d.show();
    }

    /** The pen canvas over the whole screen (PenView: the pen's pressure, its eraser end, Onyx's instant ink on a Boox).
     *  Done: the drawing joins the capture as an .excalidraw beside today's log, embedded like the screen is. `onto`: a
     *  picture of the capture drawn on instead (a screenshot marked up): Done flattens the ink into a copy of it, which
     *  takes its place. */
    private void draw(Piece onto) {
        android.app.Dialog d = above(new android.app.Dialog(this, android.R.style.Theme_DeviceDefault_Light_NoActionBar_Fullscreen));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setBackgroundColor(look.app);
        // below the status bar and above the navigation bar (the bar sat under the clock before)
        if (Build.VERSION.SDK_INT >= 30) col.setOnApplyWindowInsetsListener((v, in) -> {
            android.graphics.Insets i = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsets.CONSUMED;
        });
        else col.setFitsSystemWindows(true);
        PenView pen = new PenView(this, look.eink);
        if (onto != null) pen.overPicture(); // the screenshot shows through (the pen's white paper hid it)
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(look.dp(4), look.dp(6), look.dp(12), look.dp(6));
        ImageView cancel = new ImageView(this);
        cancel.setImageDrawable(look.icon(this, "close", look.text));
        cancel.setScaleType(ImageView.ScaleType.CENTER);
        cancel.setBackground(look.pressable(0x00000000, 22, 0));
        cancel.setContentDescription("Cancel");
        if (Build.VERSION.SDK_INT >= 26) cancel.setTooltipText("Cancel");
        bar.addView(cancel, lp(look.dp(48), look.dp(48), 0, 0, look.dp(4), 0));
        TextView title = look.label(this, onto == null ? "Drawing" : "Drawing on " + shorten(shown(onto), 24), 17, look.text);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        TextView undo = look.button(this, "Undo", false), clear = look.button(this, "Clear", false), done = look.button(this, "Done", true);
        for (TextView b : new TextView[] {undo, clear}) { b.setBackground(look.pressable(0x00000000, 10, 0)); b.setPadding(look.dp(12), 0, look.dp(12), 0); }
        // Pen / Eraser: a pen without an eraser end, or a finger, erases too
        ImageView penTool = toolButton("pen", "Pen"), eraserTool = toolButton("eraser", "Eraser");
        Runnable tools = () -> {
            penTool.setBackground(look.pressable(pen.eraser() ? 0x00000000 : look.accentSoft, 12, 0));
            eraserTool.setBackground(look.pressable(pen.eraser() ? look.accentSoft : 0x00000000, 12, 0));
        };
        penTool.setOnClickListener(v -> { pen.eraser(false); tools.run(); });
        eraserTool.setOnClickListener(v -> { pen.eraser(true); tools.run(); });
        tools.run();
        bar.addView(penTool, lp(look.dp(48), look.dp(48), 0, 0, 0, 0));
        bar.addView(eraserTool, lp(look.dp(48), look.dp(48), 0, 0, look.dp(4), 0));
        bar.addView(undo, lp(-2, look.dp(48), 0, 0, look.dp(2), 0));
        bar.addView(clear, lp(-2, look.dp(48), 0, 0, look.dp(8), 0));
        bar.addView(done, lp(-2, look.dp(48), 0, 0, 0, 0));
        Runnable state = () -> {
            boolean empty = pen.isEmpty();
            for (TextView b : new TextView[] {undo, clear, done}) { b.setEnabled(!empty); b.setAlpha(empty ? 0.4f : 1f); }
        };
        state.run();
        pen.onChange = state;
        cancel.setOnClickListener(v -> d.dismiss());
        undo.setOnClickListener(v -> pen.undo());
        clear.setOnClickListener(v -> pen.clear());
        ImageView under = new ImageView(this); // the picture drawn on, fitted in the paper; the ink above it
        done.setOnClickListener(v -> {
            if (onto != null) { marked(onto, under, pen); d.dismiss(); return; }
            try {
                String stamp = new java.text.SimpleDateFormat("yyyy-MM-dd-HHmmss", java.util.Locale.ROOT).format(new java.util.Date());
                File f = new File(getCacheDir(), "drawing-" + stamp + ".excalidraw");
                try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(pen.toExcalidraw().getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
                pieces.add(new Piece(f, pen.thumbnail(look.dp(TILE))));
                drawChips();
                refresh();
            } catch (Exception e) {
                status.setVisibility(View.VISIBLE);
                status.setTextColor(look.red);
                status.setText("The drawing could not be kept: " + e.getMessage());
            }
            d.dismiss();
        });
        col.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        // the sheet of paper: white, rounded, framed, a margin of the app's background around it
        FrameLayout paper = new FrameLayout(this);
        paper.setBackground(look.round(0xffffffff, 14, look.eink ? look.borderStrong : look.border));
        paper.setClipToOutline(true);
        paper.setElevation(look.elevation(2));
        int edge = look.dp(look.eink ? 2 : 1);
        if (onto != null) {
            android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
            o.inSampleSize = Piece.sample(onto.file, getResources().getDisplayMetrics().heightPixels);
            under.setImageBitmap(android.graphics.BitmapFactory.decodeFile(onto.file.getPath(), o));
            under.setScaleType(ImageView.ScaleType.FIT_CENTER);
            paper.addView(under, new FrameLayout.LayoutParams(-1, -1));
        }
        paper.addView(pen, new FrameLayout.LayoutParams(-1, -1));
        paper.setPadding(edge, edge, edge, edge);
        col.addView(paper, lp(-1, 0, look.dp(12), look.dp(4), look.dp(12), 0));
        ((LinearLayout.LayoutParams) paper.getLayoutParams()).weight = 1;
        TextView hint = look.label(this, "Pen: the pen or a finger draws · Eraser: takes away whole strokes (so does the pen's other end)", 12.5f, look.faint);
        hint.setGravity(Gravity.CENTER);
        col.addView(hint, lp(-1, look.dp(36), 0, 0, 0, 0));
        d.setContentView(col);
        d.show();
    }

    /** An icon tool of the drawing's bar, 48 dp, named for TalkBack and a long press. */
    private ImageView toolButton(String icon, String name) {
        ImageView b = new ImageView(this);
        b.setImageDrawable(look.icon(this, icon, look.text));
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setContentDescription(name);
        if (Build.VERSION.SDK_INT >= 26) b.setTooltipText(name);
        return b;
    }

    private View card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(look.dp(14), look.dp(12), look.dp(14), look.dp(10));
        card.setBackground(look.round(look.bg, 16, (look.accent & 0x00ffffff) | 0x8c000000)); // the focused box's accent edge
        card.setElevation(look.elevation(10));
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.TOP);
        row.addView(look.brand(this, 22), lp(look.dp(22), look.dp(22), 0, look.dp(3), look.dp(10), 0));
        edit = new EditText(this);
        edit.setBackground(null);
        edit.setPadding(0, 0, 0, 0);
        edit.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        edit.setTextColor(look.text);
        edit.setHintTextColor(look.faint);
        edit.setHint("Capture a thought, a to-do, a link…");
        // wraps without the multi-line flag, so the keyboard shows its action (save) instead of a new line
        edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_AUTO_CORRECT);
        edit.setHorizontallyScrolling(false);
        edit.setMaxLines(8);
        edit.setImeOptions(EditorInfo.IME_ACTION_SEND);
        edit.setOnEditorActionListener((v, id, ev) -> { save(); return true; });
        edit.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            public void onTextChanged(CharSequence s, int a, int b, int c) {}
            public void afterTextChanged(Editable s) { refresh(); }
        });
        row.addView(edit, new LinearLayout.LayoutParams(0, -2, 1f));
        ImageView close = new ImageView(this);
        close.setImageDrawable(look.icon(this, "close", look.muted));
        close.setScaleType(ImageView.ScaleType.CENTER);
        close.setBackground(look.pressable(0x00000000, 20, 0));
        close.setContentDescription("Close (the text stays as a draft)");
        if (Build.VERSION.SDK_INT >= 26) close.setTooltipText("Close");
        close.setOnClickListener(v -> frame.close());
        // 48 dp to the finger (Android's touch target), placed where the 40 dp one was
        row.addView(close, lp(look.dp(48), look.dp(48), 0, look.dp(-12), look.dp(-10), 0));
        card.addView(row);
        HorizontalScrollView scroll = new HorizontalScrollView(this); // the pictures, large enough to see and to tap
        scroll.setHorizontalScrollBarEnabled(false);
        shots = new LinearLayout(this);
        scroll.addView(shots);
        card.addView(scroll, lp(-1, -2, look.dp(32), look.dp(10), 0, 0));
        chips = new Flow(this, look.dp(6), 0); // rows apart by the chips' own 48 dp targets
        card.addView(chips, lp(-1, -2, look.dp(32), 0, 0, 0));
        // one row of tools a finger hits (48 dp each): the four forms insert their start, then a photo and a drawing.
        // Icons, not the code chips and words they replaced: those took two rows and a tile of their own for Draw.
        guides = new Flow(this, look.dp(2), 0);
        // {shown, starts, what}: atlas_core::capture::GUIDES (atlas-capture's tests compare)
        String[][] forms = {{"[]", "[] ", "to-do"}, {"@fri", "@", "date"}, {"[[", "[[", "link"}, {"#", "#", "tag"}};
        String[] icons = {"check", "calendar", "link", "tag"};
        for (int k = 0; k < forms.length; k++) {
            String[] f = forms[k];
            guides.addView(tool(icons[k], "Insert " + f[2] + ": " + f[0], v -> insert(f[1])));
        }
        if (hasCamera(this)) guides.addView(tool("image", "Take a photo", v -> photo()));
        guides.addView(tool("pen", "Draw", v -> draw(null)));
        card.addView(guides, lp(-1, -2, look.dp(26), look.dp(4), 0, 0));
        status = look.label(this, "", 12.5f, look.muted);
        card.addView(status, lp(-1, -2, look.dp(32), look.dp(2), 0, 0));
        View line = new View(this);
        line.setBackgroundColor(look.border);
        card.addView(line, lp(-1, Math.max(1, (int) look.density), 0, look.dp(8), 0, look.dp(8)));
        LinearLayout foot = new LinearLayout(this);
        foot.setGravity(Gravity.CENTER_VERTICAL);
        pill = look.label(this, "", 13.5f, look.muted);
        pill.setCompoundDrawablesRelativeWithIntrinsicBounds(look.icon(this, "vault", look.muted), null, null, null);
        pill.setCompoundDrawablePadding(look.dp(6));
        pill.setPadding(look.dp(10), 0, look.dp(12), 0);
        pill.setBackground(look.target(look.pressable(look.hover, 15, look.border)));
        // a tap goes to the next vault, as the desktop box's does; a long press lists them (and adds one)
        pill.setOnClickListener(v -> nextVault(1));
        pill.setOnLongClickListener(v -> { toggleVaults(); return true; });
        foot.addView(pill, lp(-2, look.dp(48), look.dp(32), 0, 0, 0));
        foot.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
        save = look.label(this, "Save", 15, look.accentFg);
        save.setGravity(Gravity.CENTER);
        save.setBackground(look.target(look.pressable(look.accent, 9, 0)));
        save.setOnClickListener(v -> save());
        foot.addView(save, lp(look.dp(88), look.dp(48), 0, 0, 0, 0));
        card.addView(foot);
        return card;
    }

    /** The text as it is now: the guides or what it becomes, the completions, the vault, whether it can be saved. */
    private void refresh() {
        String t = edit.getText().toString();
        boolean empty = t.trim().isEmpty() && !clipOn && !linkOn && !seenOn && !playingOn && onPieces().isEmpty();
        status.setVisibility(t.trim().isEmpty() ? View.GONE : View.VISIBLE);
        pill.setText(vault == null ? "Choose a vault" : Vaults.name(vault));
        save.setAlpha(empty || vault == null ? 0.45f : 1f);
        hint(t);
    }

    /** What the text becomes and the completions at the caret, asked on the core thread; the answer is shown only
     *  while the text, the caret and the vault are still the ones asked about (keys typed meanwhile ask again). */
    private void hint(String t) {
        final int ask = ++hinted, caret = edit.getSelectionStart();
        final String v = vault;
        core().post(() -> {
            if (ask != hinted) return; // a newer keystroke is queued behind this one
            String says = Core.describe(v == null ? "" : v, t);
            String offers = v == null ? "[]" : Core.suggest(v, t, caret);
            ui.post(() -> {
                if (ask != hinted || !t.equals(edit.getText().toString()) || !java.util.Objects.equals(v, vault)) return;
                if (caret != edit.getSelectionStart()) { hint(t); return; } // moved after the ask (a completion taken): asked again where it is
                if (!saving) { status.setTextColor(look.muted); status.setText(says); }
                if (list.getTag() == null) completions(v == null ? "[]" : offers); // the vault list stays while it is open
            });
        });
    }

    private void completions(String json) {
        list.removeAllViews();
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < Math.min(a.length(), 7); i++) {
                JSONObject s = a.getJSONObject(i);
                list.addView(row(s.optString("icon"), s.optString("label"), s.optString("detail"), v -> take(s)), lp(-1, look.dp(48), 0, 0, 0, 0)); // a row a finger hits: 48 dp
            }
        } catch (Exception e) { /* no completions */ }
        list.setVisibility(list.getChildCount() > 0 ? View.VISIBLE : View.GONE);
    }

    private void take(JSONObject s) {
        if (s.optBoolean("newLine")) { save(); return; }
        Editable e = edit.getText();
        int from = Math.min(s.optInt("from"), e.length()), to = Math.min(s.optInt("to"), e.length());
        e.replace(from, to, s.optString("insert"));
        edit.setSelection(from + s.optString("insert").length());
    }

    /** A row of the list over the card (Look.row), at the list's own height. */
    private View row(String icon, String label, String detail, View.OnClickListener tap) {
        LinearLayout r = look.row(this, icon, label, detail);
        r.setMinimumHeight(0);
        r.setPadding(look.dp(10), 0, look.dp(10), 0);
        r.setOnClickListener(tap);
        return r;
    }

    private void insert(String s) {
        int at = Math.max(0, edit.getSelectionStart());
        edit.getText().insert(at, s);
        edit.requestFocus();
    }

    /** The vault `step` after this one among the known ones; with fewer than two (or the list open), the list. */
    private void nextVault(int step) {
        List<String> known = vaults.list();
        if (known.size() < 2 || list.getTag() != null) { toggleVaults(); return; }
        int n = known.size(), at = Math.max(0, known.indexOf(vault));
        choose(known.get(((at + step) % n + n) % n));
    }

    /** Super+V / Super+Shift+V from a keyboard: the next or the one before. */
    boolean key(int code, android.view.KeyEvent e) {
        if (code == android.view.KeyEvent.KEYCODE_V && e.isMetaPressed()) { nextVault(e.isShiftPressed() ? -1 : 1); return true; }
        return false;
    }

    /** The vault list in place of the completions: the known ones, then "Add a vault…". */
    private void toggleVaults() {
        if (list.getVisibility() == View.VISIBLE && list.getTag() != null) { list.setTag(null); refresh(); return; }
        showVaultChoice();
    }

    private void showVaultChoice() {
        list.removeAllViews();
        list.setTag("vaults");
        for (String p : vaults.list()) list.addView(row(Server.is(p) ? "server" : "vault", Vaults.name(p), p.replace("/storage/emulated/0", "~"), v -> choose(p)), lp(-1, look.dp(48), 0, 0, 0, 0)); // a row a finger hits: 48 dp
        if (!VaultChoice.canWriteStorage(this)) {
            list.addView(row("check", "Allow access to your folders", "once", v -> askStorage()), lp(-1, look.dp(48), 0, 0, 0, 0)); // a row a finger hits: 48 dp
        } else {
            VaultChoice.find(this::addFound);
        }
        foundBefore = row("server", "Send to an Atlas server…", "", v -> { Activity a = activity(Then.SERVER); if (a != null) VaultChoice.askServer(a, look, vaults, this::choose); });
        list.addView(foundBefore, lp(-1, look.dp(48), 0, 0, 0, 0)); // a row a finger hits: 48 dp
        list.addView(row("plus", "Keep captures in the app", "", v -> choose(VaultChoice.inApp(this))), lp(-1, look.dp(48), 0, 0, 0, 0)); // a row a finger hits: 48 dp
        list.setVisibility(View.VISIBLE);
    }

    private void addFound(String json) {
        if (list.getTag() == null) return;
        try {
            JSONArray a = new JSONArray(json);
            List<String> known = vaults.list();
            for (int i = 0; i < a.length(); i++) {
                JSONObject v = a.getJSONObject(i);
                String p = v.getString("path");
                // in place, after the known ones: put at the top, they pushed the list down as they arrived
                int at = foundBefore != null && foundBefore.getParent() == list ? list.indexOfChild(foundBefore) : list.getChildCount();
                if (!known.contains(p)) list.addView(row("plus", v.getString("name"), "found · " + v.getString("kind"), x -> choose(p)), at, lp(-1, look.dp(48), 0, 0, 0, 0)); // a row a finger hits: 48 dp
            }
        } catch (Exception e) { /* none found */ }
    }

    private void choose(String p) {
        vaults.use(p);
        vault = p;
        list.setTag(null);
        list.setVisibility(View.GONE); // the completions come back with the next hint
        prepare(p);
        refresh();
    }

    /** Back in front (from the permission screen). */
    void resumed() {
        if (list.getTag() != null) showVaultChoice(); // back from the permission screen
    }

    /** The clipboard can be read only once the window has the focus (Android 10+). */
    void focused() {
        if (!focusedOnce) { focusedOnce = true; clock.mark("window focused"); }
        edit.requestFocus();
        ((InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(edit, 0);
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData c = cm.getPrimaryClip();
        String now = c != null && c.getItemCount() > 0 && c.getItemAt(0).getText() != null ? c.getItemAt(0).getText().toString().trim() : null;
        if (now != null && !now.isEmpty() && !now.equals(clip)) { clip = now; clipOn = false; drawChips(); }
    }

    /** The choices in the user's order: what was shared, the screen, the clipboard, the link, what is playing, the rest. */
    private void drawChips() {
        chips.removeAllViews();
        shots.removeAllViews();
        // the screen service and the screenshots permission are set up in Settings, not offered here: fewer choices in the box
        pieces.sort(java.util.Comparator.comparingInt(p -> p.kind.ordinal())); // stable: shared files keep their order
        for (Piece p : pieces) {
            if (p.thumb() != null) { shots.addView(tile(p), lp(-2, look.dp(TILE), 0, 0, look.dp(8), 0)); continue; }
            addChip(p.on, p.on ? "check" : "note", p.label, v -> { p.on = !p.on; drawChips(); refresh(); }); // on or off, never gone at a tap
        }
        if (clip != null) addChip(clipOn, clipOn ? "check" : "clipboard", clip, v -> { clipOn = !clipOn; drawChips(); refresh(); });
        if (link != null) addChip(linkOn, "link", linkText(link) + (linkSearched ? " · by search" : ""), v -> { linkOn = !linkOn; drawChips(); refresh(); });
        for (Playing p : players) {
            String how = p.url == null ? " · no link" : p.searched ? " · link by search" : "";
            boolean on = playingOn && p == playing;
            addChip(on, "music", shorten(p.label(), players.size() > 1 ? 22 : 28) + how, v -> {
                if (on) playingOn = false; else { playing = p; playingOn = true; } // one of them at a time
                drawChips(); refresh();
            });
        }
        // the title the app on screen showed (no address there): said as such, else a bare phrase puzzled
        if (seen != null) addChip(seenOn, seenOn ? "check" : "note", (app != null ? app + ": " : "On screen: ") + seen, v -> { seenOn = !seenOn; drawChips(); refresh(); });
        if (vault != null && Server.is(vault) && !links().isEmpty())
            addChip(catalogOn, catalogOn ? "check" : "tag", "Catalogue it", v -> { catalogOn = !catalogOn; drawChips(); });
        ((View) shots.getParent()).setVisibility(shots.getChildCount() > 0 ? View.VISIBLE : View.GONE); // Draw is a tool now
        chips.setVisibility(chips.getChildCount() > 0 ? View.VISIBLE : View.GONE);
    }

    private void addChip(boolean on, String icon, String text, View.OnClickListener tap) {
        LinearLayout c = chip(on, tap);
        c.addView(iconView(icon, on ? look.accent : look.muted));
        TextView t = look.label(this, shorten(text.replace('\n', ' '), 36), 13, look.text); // off shows by its muted icon and plain edge; the words stay readable (a link was near invisible)
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        c.addView(t);
        c.setOnLongClickListener(v -> { whole(text); return true; });
        chips.addView(c, lp(-2, look.dp(48), 0, 0, 0, 0));
    }

    /** A long press on a shortened piece: all of it, selectable (a link to copy, a long clipboard). */
    private void whole(String text) {
        TextView t = look.label(this, text, 15, look.text);
        t.setTextIsSelectable(true);
        t.setPadding(look.dp(20), look.dp(12), look.dp(20), look.dp(4));
        android.widget.ScrollView sv = new android.widget.ScrollView(this);
        sv.addView(t);
        above(new android.app.AlertDialog.Builder(this).setView(sv).setPositiveButton("Close", null).create()).show();
    }

    /** A note's path without `.md`, as the desktop's boxes show where a capture went (paths.ts shownPath). */
    private static String shownPath(String p) { return p.endsWith(".md") ? p.substring(0, p.length() - 3) : p; }
    private static String shorten(String s, int n) { return s.length() > n ? s.substring(0, n) + "…" : s; }

    /** A Markdown link shown by its title, a bare address by its host and path. */
    private static String linkText(String md) {
        if (md.startsWith("[") && md.contains("](")) return md.substring(1, md.lastIndexOf("]("));
        return md.replaceFirst("^https?://(www\\.)?", "");
    }

    private java.util.List<Piece> onPieces() {
        java.util.List<Piece> on = new java.util.ArrayList<>();
        for (Piece p : pieces) if (p.on) on.add(p);
        return on;
    }

    /** A choice to add to the capture: soft when off, accent-edged when on. */
    private LinearLayout chip(boolean on, View.OnClickListener tap) {
        LinearLayout c = new LinearLayout(this);
        c.setGravity(Gravity.CENTER_VERTICAL);
        c.setPadding(look.dp(8), 0, look.dp(12), 0);
        c.setBackground(look.target(look.pressable(on ? look.accentSoft : look.hover, 15, on ? look.accent : look.border), 32)); // 32 dp drawn, 48 dp to touch
        c.setOnClickListener(tap);
        return c;
    }

    /** A tool of the row under the text: an icon, 48 dp square, its words for TalkBack and a long press. */
    private View tool(String icon, String words, View.OnClickListener tap) {
        ImageView b = new ImageView(this);
        b.setImageDrawable(look.icon(this, icon, look.muted));
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setBackground(look.pressable(0x00000000, 12, 0));
        b.setContentDescription(words);
        if (Build.VERSION.SDK_INT >= 26) b.setTooltipText(words);
        b.setOnClickListener(tap);
        b.setLayoutParams(new ViewGroup.LayoutParams(look.dp(48), look.dp(48)));
        return b;
    }

    private static final int TAKE_PHOTO = 41;
    /** Whether a camera app answers: asked of the system once per process (a box opens many times; the answer stays). */
    private static Boolean camera;

    private static boolean hasCamera(Context c) {
        if (camera == null) camera = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).resolveActivity(c.getPackageManager()) != null;
        return camera;
    }

    /** The camera app; its photo joins the pictures (onActivityResult), as a shared one does. */
    private void photo() {
        PhotoProvider.file(this).delete();
        Intent shoot = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, PhotoProvider.uri(this))
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Activity a = activity(Then.PHOTO);
        if (a == null) return;
        try { a.startActivityForResult(shoot, TAKE_PHOTO); }
        catch (android.content.ActivityNotFoundException | SecurityException e) { android.widget.Toast.makeText(this, "No camera here", android.widget.Toast.LENGTH_SHORT).show(); }
    }

    void result(int request, int code) {
        if (request != TAKE_PHOTO || code != Activity.RESULT_OK) return;
        File shot = PhotoProvider.file(this);
        if (!shot.isFile() || shot.length() == 0) return;
        new Thread(() -> {
            File dir = new File(getCacheDir(), "shared");
            dir.mkdirs();
            File f = new File(dir, "Photo " + new java.text.SimpleDateFormat("yyyy-MM-dd HHmmss", java.util.Locale.ROOT).format(new java.util.Date()) + ".jpg");
            if (!shot.renameTo(f)) return;
            Piece p = new Piece(Piece.Kind.SHARED, Look.shownName(f.getName()), f, true);
            p.thumb(); // decoded here, off the main thread
            ui.post(() -> { pieces.add(p); drawChips(); refresh(); });
        }, "capture-photo").start();
    }

    private ImageView iconView(String name, int color) {
        ImageView i = new ImageView(this);
        i.setImageDrawable(look.icon(this, name, color));
        i.setLayoutParams(lp(look.dp(16), look.dp(16), 0, 0, look.dp(6), 0));
        return i;
    }

    private void save() {
        String t = edit.getText().toString().trim();
        if (linkOn && link != null) t = t.isEmpty() ? link : t + " " + link;
        if (seenOn && seen != null) { String s = app == null ? seen : seen + " (" + app + ")"; t = t.isEmpty() ? s : t + " " + s; }
        if (playingOn && playing != null) t = t.isEmpty() ? playing.markdown() : t + " " + playing.markdown();
        if (clipOn && clip != null) t = t.isEmpty() ? clip : t + "\n" + clip;
        java.util.List<Piece> on = onPieces();
        if ((t.isEmpty() && on.isEmpty()) || vault == null || saving) return;
        saving = true;
        if (t.isEmpty()) t = on.get(0).label;
        final String typed = t, to = vault, mirror = Server.is(vault) ? null : vaults.mirror(vault);
        final String token = vaults.token(mirror != null ? mirror : vault);
        // a folder on the phone's storage is written only with "All files access", which a reinstall takes away while
        // the chosen vault stays: say so and open the system's screen, the text kept, instead of a bare io error
        if (!Server.is(to) && mirror == null && needsStorage(to) && !VaultChoice.canWriteStorage(this)) {
            saving = false;
            status.setVisibility(View.VISIBLE);
            status.setTextColor(look.red);
            status.setText("Not saved: Atlas may not write in " + Vaults.name(to) + " — allow \"All files access\", then save again");
            askStorage();
            return;
        }
        catalogLinks = catalogOn ? links() : java.util.Collections.emptyList();
        final java.util.List<String> attach = new java.util.ArrayList<>();
        for (Piece p : on) attach.add(p.file.getPath());
        status.setText("Saving…");
        final long asked = CaptureClock.now();
        clock.mark("saving (" + attach.size() + " files)");
        new Thread(() -> {
            String r = Server.is(to) ? toServer(to, token, typed, attach)
                : mirror != null ? toMirror(to, mirror, token, typed, attach)
                : toFolder(to, typed, attach);
            ui.post(() -> { clock.mark("saved in " + (CaptureClock.now() - asked) + " ms"); saved(r); });
        }, "capture-save").start();
    }

    /** Whether a folder vault lies outside the app's own storage (there no permission is needed). */
    private boolean needsStorage(String folder) {
        String own = getFilesDir().getParent();
        return own == null || !new File(folder).getAbsolutePath().startsWith(own);
    }

    /** A mirrored folder's capture goes to the server first, so the other devices have it at once (Syncthing brings
     *  it back here); only when the server cannot be reached does the in-app core write it (DESIGN-android.md). */
    private String toMirror(String folder, String server, String token, String text, java.util.List<String> attach) {
        Sent s = send(server, token, text, attach);
        if (!s.answer.optBoolean("retry")) return s.answer.toString();
        // the files already sent stay embedded (they arrive with Syncthing); the rest are attached here
        String here = toFolder(folder, s.text, s.left);
        try { return new JSONObject(here).put("here", s.answer.optString("error")).toString(); } catch (Exception e) { return here; }
    }

    private static String toFolder(String vault, String text, java.util.List<String> attach) {
        for (String shot : attach) {
            try {
                JSONObject a = new JSONObject(Core.attach(vault, new File(shot).getName(), shot));
                if (a.has("error")) return a.toString();
                text = text + "\n" + a.getString("embed");
            } catch (Exception e) { /* the text alone */ }
        }
        return Core.save(vault, text);
    }

    private static final java.util.regex.Pattern URL = java.util.regex.Pattern.compile("https?://[^\\s<>\"')\\]]+");

    /** The addresses this capture carries: the page's, what is playing, and any in the text — each once. */
    private java.util.List<String> links() {
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<>();
        String all = (linkOn && link != null ? link + " " : "") + (playingOn && playing != null && playing.url != null ? playing.url + " " : "") + (edit == null ? "" : edit.getText());
        java.util.regex.Matcher m = URL.matcher(all);
        while (m.find()) out.add(m.group());
        return new java.util.ArrayList<>(out);
    }

    /** Each address to the server's catalog (its `add` tool): → what it made, or why not, for the status line. */
    /** The links to the catalog's `add` tool (Outbox too, for a capture kept offline): what came of them, in words. */
    static String catalogue(String server, String token, java.util.List<String> urls) {
        java.util.List<String> made = new java.util.ArrayList<>();
        for (String u : urls) {
            try {
                JSONObject r = Server.post(server, token, "/api/plugins/catalog/tools/add", "application/json", new JSONObject().put("text", u).toString().getBytes("UTF-8"));
                if (r.has("error")) {
                    String why = r.optString("error");
                    return made.isEmpty() ? (why.contains("403") ? "this phone's sign-in may only capture: catalogue from the full app" : why) : "catalogued " + made.size() + ", then: " + why;
                }
                String path = r.optString("path", "");
                made.add(path.isEmpty() ? u : Look.shownName(path));
            } catch (Exception e) { return String.valueOf(e.getMessage()); }
        }
        return "catalogued: " + String.join(", ", made);
    }

    /** What a send to a server came to: its answer, the text with the embeds of the files it took, the files left. */
    private static final class Sent {
        final JSONObject answer; final String text; final java.util.List<String> left;
        Sent(JSONObject answer, String text, java.util.List<String> left) { this.answer = answer; this.text = text; this.left = left; }
    }

    /** The files, then the text, to a server — behind captures still in its Outbox, so they arrive in the order made. */
    private Sent send(String server, String token, String text, java.util.List<String> attach) {
        java.util.List<String> left = new java.util.ArrayList<>(attach);
        JSONObject r = new JSONObject();
        if (Outbox.waiting(this, server) > 0) Outbox.send(this);
        if (Outbox.waiting(this, server) > 0) r = queued("older captures are still waiting");
        while (!r.has("error") && !left.isEmpty()) {
            JSONObject a = Server.attach(server, token, new File(left.get(0)));
            if (a.has("error")) { r = a; break; }
            text = text + "\n" + a.optString("embed");
            left.remove(0);
        }
        if (!r.has("error")) r = Server.capture(server, token, text);
        if (!r.has("error") && catalogOn) {
            try { r.put("catalog", catalogue(server, token, catalogLinks)); } catch (Exception e) { /* the capture stands */ }
        }
        return new Sent(r, text, left);
    }

    /** To a server vault; when it cannot be reached (or wants a sign-in), the capture waits in the Outbox. */
    private String toServer(String server, String token, String text, java.util.List<String> attach) {
        Sent s = send(server, token, text, attach);
        if (!s.answer.optBoolean("retry")) return s.answer.toString();
        try {
            Outbox.keep(this, server, s.text, s.left, catalogOn ? catalogLinks : java.util.Collections.emptyList()); // catalogued when sent
            return new JSONObject().put("queued", s.answer.optString("error")).toString();
        } catch (Exception e) {
            return s.answer.toString(); // not even kept: said as the error it is
        }
    }

    private static JSONObject queued(String why) {
        try { return new JSONObject().put("error", why).put("retry", true); } catch (Exception e) { return new JSONObject(); }
    }

    private void saved(String json) {
        guides.setVisibility(View.GONE);
        status.setVisibility(View.VISIBLE);
        try {
            JSONObject o = new JSONObject(json);
            if (o.has("error")) {
                saving = false;
                status.setTextColor(look.red);
                String why = o.getString("error");
                boolean denied = why.toLowerCase(java.util.Locale.ROOT).contains("permission denied") && !VaultChoice.canWriteStorage(this);
                status.setText("Not saved: " + (denied ? "Atlas may not write in this folder — allow \"All files access\", then save again" : why));
                if (denied) askStorage();
                return;
            }
            boolean later = o.has("queued");
            status.setTextColor(later ? look.text : look.green);
            status.setText(later
                ? "Kept on the phone: sent to " + Vaults.name(vault) + " when it answers (" + o.getString("queued") + ")"
                : "Saved to " + Vaults.name(vault) + " · " + shownPath(o.optString("path")) + ":" + o.optInt("line") + (o.has("catalog") ? " · " + o.optString("catalog") : "")
                    + (o.has("here") ? " · written on the phone, the server did not answer (" + o.optString("here") + ")" : ""));
            vaults.keepDraft("");
            edit.setText("");
            // kept offline: the phone may say when it went out — asked here, the first time it matters (Android 13+)
            if (later) CaptureWays.askToNotify(frame.activity()); // floating: asked by the app itself (Notices)
            ui.postDelayed(frame::close, later ? 2200 : 650); // long enough to read where it went
        } catch (Exception e) {
            saving = false;
            status.setText("Not saved: " + json);
        }
    }

    /** Leaving, or only out of sight: the text stays as the draft. */
    void leaving() {
        if (!saving) vaults.keepDraft(edit.getText().toString());
    }

    /** Back: closes the vault list first; false when the box itself should go. */
    boolean back() {
        if (list.getVisibility() == View.VISIBLE) { list.setTag(null); list.setVisibility(View.GONE); return true; }
        return false;
    }

    /** What only an activity can do, asked while the box floats: done once the box has moved into its own (moveIn). */
    enum Then { STORAGE, SERVER, PHOTO }

    /** The activity for `then`; floating, null: the box moves into CaptureActivity, the text kept, and `then` runs there. */
    private Activity activity(Then then) {
        Activity a = frame.activity();
        if (a != null) return a;
        vaults.keepDraft(edit.getText().toString());
        frame.close();
        // the share is in the draft now: the reopened box must not add it again (Shared.DRAFTED)
        startActivity(new Intent(opened).setClass(this, CaptureActivity.class).putExtra("then", then.name()).putExtra(Shared.DRAFTED, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        return null;
    }

    /** From CaptureActivity, after a move in: what was asked. */
    void then(String what) {
        if (what == null) return;
        try {
            switch (Then.valueOf(what)) {
                case STORAGE: askStorage(); break;
                case SERVER: showVaultChoice(); VaultChoice.askServer(frame.activity(), look, vaults, this::choose); break;
                case PHOTO: photo(); break;
            }
        } catch (IllegalArgumentException e) { /* an older box's ask */ }
    }

    private void askStorage() {
        Activity a = activity(Then.STORAGE);
        if (a != null) VaultChoice.askStorage(a);
    }

    /** A dialog over the box: floating, it must be a window of the same kind, else it opens under the app. */
    private <D extends android.app.Dialog> D above(D d) {
        if (frame.activity() == null && d.getWindow() != null) d.getWindow().setType(CaptureOverlay.TYPE);
        return d;
    }

    /** What a share or a selection hands the box, read from wherever the other app put it — by shape, not by app:
     *  the text (and a styled text's link targets the words hide), the HTML text's links when there is no plain one,
     *  every text of a SEND_MULTIPLE, the ClipData items' texts and web addresses, the subject (else the title the share
     *  sheet shows). The core makes the box's text of it (Core.shareText: tracking off, the subject as a title). */
    static final class Shared {
        final String subject, text, quote;
        private Shared(String subject, String text, String quote) { this.subject = subject; this.text = text; this.quote = quote; }

        /** Extra set on the intent a box moved into its activity reopens with: its share is in the draft already. */
        static final String DRAFTED = "org.atlas.capture.drafted";

        static Shared of(Intent i) {
            if (i == null || i.getBooleanExtra(DRAFTED, false)) return null;
            // text selected in another app (its selection menu): a quote, as the desktop box's selection chip
            if (Intent.ACTION_PROCESS_TEXT.equals(i.getAction())) {
                CharSequence q = i.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
                return q == null || q.toString().trim().isEmpty() ? null : new Shared("", "", q.toString());
            }
            if (!Intent.ACTION_SEND.equals(i.getAction()) && !Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) return null;
            java.util.List<String> texts = new java.util.ArrayList<>();
            try {
                CharSequence t = i.getCharSequenceExtra(Intent.EXTRA_TEXT);
                addText(texts, t);
                if (t == null) {
                    java.util.ArrayList<CharSequence> many = i.getCharSequenceArrayListExtra(Intent.EXTRA_TEXT);
                    if (many != null) for (CharSequence m : many) addText(texts, m);
                }
                if (texts.isEmpty()) for (String href : Shares.hrefs(i.getStringExtra(Intent.EXTRA_HTML_TEXT))) texts.add(href);
                ClipData clip = i.getClipData();
                if (clip != null) for (int k = 0; k < clip.getItemCount(); k++) {
                    ClipData.Item it = clip.getItemAt(k);
                    addText(texts, it.getText());
                    Uri u = it.getUri();
                    if (u != null && ("http".equals(u.getScheme()) || "https".equals(u.getScheme()))) texts.add(u.toString());
                }
            } catch (RuntimeException e) { /* a malformed extra (another app's parcel): what was read so far */ }
            CharSequence subject = i.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
            if (subject == null) subject = i.getCharSequenceExtra(Intent.EXTRA_TITLE);
            String text = Shares.join(texts);
            String sub = subject == null ? "" : subject.toString();
            return text.isEmpty() && sub.trim().isEmpty() ? null : new Shared(sub, text, null);
        }

        /** A text and, when it is styled, the addresses its links point to that its words do not show. */
        private static void addText(java.util.List<String> out, CharSequence t) {
            if (t == null) return;
            out.add(t.toString());
            if (t instanceof android.text.Spanned) {
                android.text.Spanned sp = (android.text.Spanned) t;
                for (android.text.style.URLSpan u : sp.getSpans(0, sp.length(), android.text.style.URLSpan.class)) if (Shares.isWeb(u.getURL())) out.add(u.getURL());
            }
        }
    }

    /** A file the capture can carry; its thumbnail decoded once, small. */
    private static final class Piece {
        final String label;
        final File file;
        final Kind kind;
        final boolean removable;
        boolean on;
        private android.graphics.Bitmap thumb;
        private boolean decoded;

        /** What a piece is, in the order the box offers them. */
        enum Kind { SHARED, SCREEN, LAST_SCREENSHOT, DRAWING }

        Piece(Kind kind, String label, File file, boolean on) {
            this.kind = kind; this.label = label; this.file = file; this.on = on;
            this.removable = kind == Kind.SHARED || kind == Kind.DRAWING; // brought here: removable; offered: only in or out
        }

        /** A piece whose picture is given (a drawing: its file is an Excalidraw scene, not a picture). */
        Piece(File file, android.graphics.Bitmap thumb) { this(Kind.DRAWING, "Drawing", file, true, thumb); }

        /** A piece whose thumbnail is made already (the screen's, from its pixels in memory); null: decoded when asked. */
        Piece(Kind kind, String label, File file, boolean on, android.graphics.Bitmap thumb) {
            this(kind, label, file, on);
            if (thumb != null) { this.thumb = thumb; this.decoded = true; }
        }

        /** Null when the file is not a picture. */
        synchronized android.graphics.Bitmap thumb() {
            if (!decoded) {
                decoded = true;
                android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                o.inSampleSize = sample(file, 240); // a tile is 72 dp: crisp at 3x
                thumb = android.graphics.BitmapFactory.decodeFile(file.getPath(), o);
            }
            return thumb;
        }

        /** The power-of-two step that brings the picture's height near `height` pixels (1 when it is not a picture). */
        static int sample(File f, int height) {
            android.graphics.BitmapFactory.Options b = new android.graphics.BitmapFactory.Options();
            b.inJustDecodeBounds = true;
            android.graphics.BitmapFactory.decodeFile(f.getPath(), b);
            int s = 1;
            while (b.outHeight / (s * 2) >= height) s *= 2;
            return s;
        }
    }

    private static LinearLayout.LayoutParams lp(int w, int h, int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, h);
        p.setMargins(l, t, r, b);
        return p;
    }
}
