package org.atlas.capture;

import android.app.Activity;
import android.app.StatusBarManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The app's settings (both apps): where captures go, how to capture quickly (the tile, the screen and page service,
 * sharing), and a capture to try. Each row says what it is and what a tap does; nothing is hidden behind a menu.
 */
final class Setup {
    private final Activity a;
    private final Look look;
    private final Vaults vaults;
    final LinearLayout view;
    /** What a Setup draws: everything (the capture app's one screen), or one page of the full app's Settings. */
    enum Part { ALL, VAULTS, CAPTURE }
    private final Part part;

    Setup(Activity a, Look look) { this(a, look, Part.ALL); }

    /** The main screen told at once that the vault in use changed (it opens it there: AtlasActivity.vaultChosen). */
    private void chosen() { if (a instanceof AtlasActivity) ((AtlasActivity) a).vaultChosen(); }

    Setup(Activity a, Look look, Part part) {
        this.a = a;
        this.look = look;
        this.part = part;
        this.vaults = new Vaults(a);
        view = new LinearLayout(a);
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(look.dp(12), 0, look.dp(12), look.dp(24));
        draw();
    }

    /** Again from what is true now (back from a permission screen, a vault chosen). */
    void draw() {
        view.removeAllViews();
        if (part != Part.CAPTURE) vaultSection();
        if (part == Part.VAULTS) return;
        quickSection();
        TextView capture = look.button(a, "New capture", true);
        capture.setOnClickListener(v -> a.startActivity(new Intent(a, CaptureActivity.class)));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.setMargins(look.dp(4), look.dp(22), look.dp(4), 0);
        view.addView(capture, p);
        if (part == Part.ALL) aboutSection();
    }

    private void vaultSection() {
        view.addView(look.heading(a, part == Part.VAULTS ? "Vaults" : "Where captures go"));
        LinearLayout card = look.card(a);
        String current = vaults.current();
        List<String> known = vaults.list();
        if (current == null) card.addView(note("No vault yet: choose one below. A vault is a folder of notes, the one Atlas opens on the computer (synced to the phone, by Syncthing for example)."));
        // a folder and its copy on a server are one vault, as in the desktop's vault switcher (docs/design/DESIGN-mirror.md):
        // the server vault that is a folder's mirror is not listed again, unless it is the one in use
        java.util.Set<String> mirrors = vaults.mirrors();
        for (String v : known) {
            if (Server.is(v) && mirrors.contains(v) && !v.equals(current)) continue;
            String mirror = Server.is(v) ? null : vaults.mirror(v);
            String where = Server.is(v) ? vaults.how(a, v) : v.replace("/storage/emulated/0", "~");
            String detail = (v.equals(current) ? "in use · " : "") + where + (mirror != null ? " · ⇄ " + Web.host(mirror) : "");
            int kept = Server.is(v) ? Outbox.waiting(a, v) + PendingWrites.waiting(a, v) : 0, refused = Server.is(v) ? Outbox.waiting(a, v, true) : 0;
            if (kept + refused > 0) detail = kept + refused + " waiting · " + detail;
            Row r = look.row(a, Server.is(v) ? "server" : "vault", vaults.title(v), detail);
            if (v.equals(current)) r.label.setTextColor(look.accent);
            if (mirror != null) answers(mirror, r, detail);
            // a tap uses it, a folder and a server alike (a server that turns the app away offers its sign-in when it
            // opens); its details — name, mirror, sign-in, remove — behind ⋯ or a long press, as Android's Wi-Fi networks
            r.setOnClickListener(x -> { vaults.use(v); chosen(); draw(); });
            r.setOnLongClickListener(x -> { details(v); return true; });
            ImageView more = new ImageView(a);
            more.setImageDrawable(look.icon(a, "more", look.muted));
            more.setScaleType(ImageView.ScaleType.CENTER);
            more.setContentDescription("Details of " + vaults.title(v));
            more.setOnClickListener(x -> details(v));
            r.addView(more, new LinearLayout.LayoutParams(look.dp(40), look.dp(40)));
            card.addView(r);
            if (kept + refused > 0) card.addView(tap(look.row(a, "repeat", "Send the kept captures now",
                kept + " waiting" + (refused > 0 ? ", " + refused + " refused by the server" : "")), () -> sendKept()));
        }
        if (!VaultChoice.canWriteStorage(a)) {
            card.addView(tap(look.row(a, "check", "Allow access to your folders", "needed for a vault on the phone"), () -> VaultChoice.askStorage(a)));
        } else {
            LinearLayout found = new LinearLayout(a);
            found.setOrientation(LinearLayout.VERTICAL);
            card.addView(found);
            VaultChoice.find(a, json -> {
                try {
                    JSONArray arr = new JSONArray(json);
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject o = arr.getJSONObject(i);
                        String path = o.getString("path");
                        if (known.contains(path)) continue;
                        found.addView(tap(look.row(a, "plus", o.getString("name"), "found · " + o.getString("kind")), () -> { vaults.use(path); chosen(); draw(); }));
                    }
                } catch (Exception e) { /* none found */ }
            });
        }
        card.addView(tap(look.row(a, "server", "An Atlas server…", "its address and a sign-in"), () -> VaultChoice.askServer(a, look, vaults, u -> draw())));
        card.addView(tap(look.row(a, "plus", "A folder in the app", "until a vault is on the phone"), () -> { vaults.use(VaultChoice.inApp(a)); chosen(); draw(); }));
        view.addView(card);
        if (!mirrors.isEmpty() || part == Part.VAULTS) view.addView(note("⇄ a folder's copy on a server: everything is written in the folder; while the server answers, notes and drawings are live with the computer and the other devices. Set it in the folder's ⋯."));
    }

    /** Whether each mirror answers, asked at most once a minute (a probe takes up to 18 s): `{said, at}`. */
    private static final java.util.Map<String, Object[]> ANSWERED = new java.util.concurrent.ConcurrentHashMap<>();

    /** The mirror's state, written into the row's line when known: it answers, wants a sign-in, or is not there. */
    private void answers(String mirror, Row r, String detail) {
        Object[] seen = ANSWERED.get(mirror);
        if (seen != null) r.detail.setText(detail + " · " + seen[0]);
        if (seen != null && System.currentTimeMillis() - (long) seen[1] < 60_000) return;
        new Thread(() -> {
            SignIn.Probe p = SignIn.probe(a, mirror, true);
            String said = p.front == SignIn.Front.OPEN ? "answers" : p.front == SignIn.Front.PROXY ? "sign in to use it"
                : p.front == SignIn.Front.ATLAS ? "its sign-in is refused" : "not answering: the folder is used";
            ANSWERED.put(mirror, new Object[] { said, System.currentTimeMillis() });
            a.runOnUiThread(() -> { if (r.isAttachedToWindow()) r.detail.setText(detail + " · " + said); });
        }).start();
    }

    /** The folder's mirror changed: the open page told (AtlasActivity.mirrorChanged), the list drawn again. */
    private void mirrorSet(String folder, String server) {
        vaults.setMirror(folder, server);
        if (server != null) ANSWERED.remove(server);
        if (a instanceof AtlasActivity) ((AtlasActivity) a).mirrorChanged(folder);
        draw();
    }

    /** Which server vault holds this folder's copy (docs/design/DESIGN-mirror.md): the known server vaults (the guess,
     *  one of the same name, marked), another server signed in to now, or none. */
    private void chooseMirror(String folder) {
        java.util.List<String> servers = new java.util.ArrayList<>();
        for (String p : vaults.list()) if (Server.is(p)) servers.add(p);
        String now = vaults.mirror(folder);
        String[] labels = new String[servers.size() + 2];
        labels[0] = "None: everything stays in the folder";
        int at = 0;
        for (int i = 0; i < servers.size(); i++) {
            labels[i + 1] = vaults.title(servers.get(i)) + (servers.get(i).equals(now) && !vaults.mirrorChosen(folder) ? " (same name)" : "");
            if (servers.get(i).equals(now)) at = i + 1;
        }
        labels[servers.size() + 1] = "Another server…";
        String inUse = vaults.current();
        new android.app.AlertDialog.Builder(a).setTitle("Mirror of " + vaults.title(folder))
            .setSingleChoiceItems(labels, at, (d, w) -> {
                d.dismiss();
                if (w == 0) mirrorSet(folder, null);
                else if (w <= servers.size()) mirrorSet(folder, servers.get(w - 1));
                // a new server, signed in to here; the vault in use stays the one it was
                else VaultChoice.askServer(a, look, vaults, u -> { if (inUse != null) vaults.use(inUse); mirrorSet(folder, u); });
            })
            .setNegativeButton("Cancel", null).show();
    }

    /** A vault's details (Android's Wi-Fi network page, as a dialog): where it is and how this device reaches it, and
     *  what can be done — use it, name it, its mirror (a folder's) or its sign-in (a server's), remove it from this device. */
    private void details(String v) {
        boolean server = Server.is(v);
        String mirror = server ? null : vaults.mirror(v);
        java.util.List<String> labels = new java.util.ArrayList<>();
        java.util.List<Runnable> runs = new java.util.ArrayList<>();
        if (!v.equals(vaults.current())) { labels.add("Use it"); runs.add(() -> { vaults.use(v); chosen(); draw(); }); }
        labels.add("Name it…"); runs.add(() -> rename(v));
        if (server) {
            signInRows(v, "", labels, runs);
            labels.add(copyOf(v) == null ? "Its copy on this device…" : "Its copy on this device: " + vaults.title(copyOf(v)) + "…"); runs.add(() -> chooseCopy(v));
        }
        if (!server) {
            labels.add(mirror == null ? "Mirror on a server…" : "Change the mirror…"); runs.add(() -> chooseMirror(v));
            if (mirror != null) {
                signInRows(mirror, " (" + Web.host(mirror) + ")", labels, runs);
                labels.add("Open the server's copy"); runs.add(() -> { vaults.use(mirror); chosen(); draw(); });
                labels.add("Unlink the mirror"); runs.add(() -> mirrorSet(v, null));
            }
        }
        labels.add("Remove from this device"); runs.add(() -> new android.app.AlertDialog.Builder(a)
            .setTitle("Remove " + vaults.title(v) + "?")
            .setMessage(server ? "The server and its notes stay as they are; this device forgets it and its sign-in." : "The folder and its notes stay as they are; this device only stops listing it.")
            .setPositiveButton("Remove", (d, w) -> { vaults.remove(v); draw(); })
            .setNegativeButton("Cancel", null).show());
        String where = server ? v + "\n" + vaults.how(a, v)
            : v.replace("/storage/emulated/0", "~") + (mirror == null ? "\nno mirror" : "\n⇄ " + mirror + "\n" + vaults.how(a, mirror)
                + (vaults.mirrorChosen(v) ? "" : " · found by its name"));
        // our own rows under the address: a dialog given a message and items draws only the message
        LinearLayout box = new LinearLayout(a);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(look.dp(8), 0, look.dp(8), 0);
        TextView at = look.label(a, where, 13, look.muted);
        at.setPadding(look.dp(16), look.dp(4), look.dp(16), look.dp(8));
        at.setTextIsSelectable(true);
        box.addView(at);
        android.app.AlertDialog d = new android.app.AlertDialog.Builder(a).setTitle(vaults.title(v)).setView(box).setNegativeButton("Close", null).create();
        for (int i = 0; i < labels.size(); i++) {
            Runnable run = runs.get(i);
            box.addView(tap(look.row(a, null, labels.get(i), null), () -> { d.dismiss(); run.run(); }));
        }
        d.show();
    }

    /** The folder of this device whose mirror `server` is, or null. */
    private String copyOf(String server) {
        for (String f : vaults.list()) if (!Server.is(f) && server.equals(vaults.mirror(f))) return f;
        return null;
    }

    /** A server vault's copy on this device (synced by Syncthing: a folder on the device for ~/Notes), from the
     *  server's side: the folders known and found here; the one picked gets this server as its
     *  mirror and is used from then on — notes live with the server while it answers, the folder alone when it does not. */
    private void chooseCopy(String server) {
        java.util.List<String> folders = new java.util.ArrayList<>();
        for (String f : vaults.list()) if (!Server.is(f)) folders.add(f);
        VaultChoice.find(a, json -> {
            try {
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) { String p = arr.getJSONObject(i).getString("path"); if (!folders.contains(p)) folders.add(p); }
            } catch (Exception e) { /* none found */ }
            if (folders.isEmpty()) { Toast.makeText(a, "No vault folder on this device (a folder with .atlas/ in it, synced by Syncthing for example)", Toast.LENGTH_LONG).show(); return; }
            String now = copyOf(server);
            String[] labels = new String[folders.size() + 1];
            int at = 0;
            for (int i = 0; i < folders.size(); i++) {
                labels[i] = Vaults.name(folders.get(i)) + " — " + folders.get(i).replace("/storage/emulated/0", "~");
                if (folders.get(i).equals(now)) at = i;
            }
            labels[folders.size()] = "None";
            new android.app.AlertDialog.Builder(a).setTitle("Copy of " + vaults.title(server) + " on this device")
                .setSingleChoiceItems(labels, now == null ? folders.size() : at, (d, w) -> {
                    d.dismiss();
                    if (now != null) vaults.setMirror(now, null);
                    if (w == folders.size()) { draw(); return; }
                    String folder = folders.get(w);
                    vaults.use(folder);
                    mirrorSet(folder, server);
                    chosen();
                })
                .setNegativeButton("Cancel", null).show();
        });
    }

    /** A server's sign-in rows (the vault's own, or a folder's mirror: `which` names it). */
    private void signInRows(String s, String which, java.util.List<String> labels, java.util.List<Runnable> runs) {
        String inUse = vaults.current(); // a mirror's sign-in leaves the folder in use (Vaults.useServer, VaultChoice's use)
        Runnable again = () -> { if (inUse != null && !which.isEmpty()) vaults.use(inUse); ANSWERED.remove(s); if (!which.isEmpty() && a instanceof AtlasActivity) ((AtlasActivity) a).mirrorChanged(inUse); draw(); };
        labels.add("Look it up again" + which); runs.add(() -> { ANSWERED.remove(s); Server.lookUp(a, s); }); // a new network: found anew
        labels.add("Sign in again" + which); runs.add(() -> VaultChoice.signIn(a, look, vaults, s, u -> again.run()));
        labels.add("A token or a header…" + which); runs.add(() -> VaultChoice.manual(a, look, vaults, s, u -> again.run()));
        labels.add("Forget the sign-in" + which); runs.add(() -> { vaults.forgetSignIn(s); again.run(); });
    }

    private void rename(String v) {
        android.widget.EditText e = new android.widget.EditText(a);
        e.setSingleLine(true);
        e.setText(vaults.title(v));
        e.setSelection(e.length());
        LinearLayout box = new LinearLayout(a);
        box.setPadding(look.dp(20), look.dp(8), look.dp(20), 0);
        box.addView(e, new LinearLayout.LayoutParams(-1, -2));
        new android.app.AlertDialog.Builder(a).setTitle("Name it").setMessage("Shown here only; empty: its own name (" + Vaults.name(v) + ").").setView(box)
            .setPositiveButton("Save", (d, w) -> { vaults.label(v, e.getText().toString()); draw(); })
            .setNegativeButton("Cancel", null).show();
    }

    /** The captures kept on the phone, sent now (refused ones tried again); the outcome said, the list drawn again. */
    private void sendKept() {
        Toast.makeText(a, "Sending…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            int sent = Outbox.retryRefused(a);
            a.runOnUiThread(() -> { Toast.makeText(a, sent > 0 ? "Sent " + sent : "Not sent: the server still does not answer", Toast.LENGTH_LONG).show(); draw(); });
        }).start();
    }

    private void quickSection() {
        view.addView(look.heading(a, "Capture quickly"));
        LinearLayout card = look.card(a);
        // the tile: Android 13 can add it with one tap; before, the user drags it in
        if (Build.VERSION.SDK_INT >= 33) {
            card.addView(tap(look.row(a, "plus", "Add the Capture tile", "to the quick settings, one tap from anywhere"), this::addTile));
        } else {
            card.addView(look.row(a, "plus", "The Capture tile", "edit the quick settings and drag it in"));
        }
        card.addView(look.row(a, "link", "Share to Atlas", "from any app: text, links, pictures, files"));
        view.addView(card);

        // what the box may take by itself: each a switch showing whether it is on; Android grants these only on its
        // own screens, so turning one on (or off) opens that screen and the switch follows when back
        view.addView(look.heading(a, "What the box offers"));
        LinearLayout what = look.card(a);
        boolean screenOn = ScreenService.isOn();
        what.addView(switchRow("image", "The screen you were on", screenOn
            ? "the tile and the accessibility button add a picture of it, and a browser's page address"
            : "turn on \"" + a.getString(a.getResources().getIdentifier("screen_service", "string", a.getPackageName())) + "\" in Accessibility; nothing is read at any other time",
            screenOn, () -> a.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))));
        boolean shots = CaptureActivity.canReadImages(a);
        what.addView(switchRow("image", "The last screenshot", "the newest screenshot of the last half hour, offered in the box",
            shots, () -> { if (!shots) a.requestPermissions(new String[] {CaptureActivity.imagesPermission()}, 2); else openAppSettings(); }));
        boolean hears = Playing.allowed(a);
        what.addView(switchRow("music", "What is playing", hears
            ? "the song or video playing (YouTube Music, Spotify, a podcast), with its link when the app gives one"
            : "needs notification access for \"" + a.getString(a.getResources().getIdentifier("media_listener", "string", a.getPackageName())) + "\" (Android shows media only so); no notification is read",
            hears, () -> a.startActivity(Playing.setup(a))));
        view.addView(what);
    }

    /** A setting Android keeps (a permission, an accessibility service): a Switch showing its state; a tap anywhere on the
     *  row opens Android's screen for it (the switch is never flipped here on its own: it shows what is true). */
    private View switchRow(String icon, String label, String detail, boolean on, Runnable open) {
        Row r = look.row(a, icon, label, detail);
        android.widget.Switch s = new android.widget.Switch(a);
        s.setChecked(on);
        s.setClickable(false); // the row's tap: Android decides, the switch follows when back (onResume → draw)
        s.setFocusable(false);
        r.addView(s);
        r.setOnClickListener(v -> open.run());
        r.setContentDescription(label + (on ? ", on" : ", off"));
        return r;
    }

    /** This app's page in Android's settings (to take a permission back). */
    private void openAppSettings() {
        a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", a.getPackageName(), null)));
    }

    private void aboutSection() { view.addView(about(a, look)); }

    /** The app's name and version, small and centred: the last line of a settings page. */
    static TextView about(Activity a, Look look) {
        String version = "";
        try { version = a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionName; } catch (Exception e) { /* none */ }
        TextView t = look.label(a, a.getApplicationInfo().loadLabel(a.getPackageManager()) + " " + version, 12, look.faint);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, look.dp(24), 0, 0);
        return t;
    }

    private void addTile() {
        if (Build.VERSION.SDK_INT < 33) return;
        StatusBarManager sb = a.getSystemService(StatusBarManager.class);
        sb.requestAddTileService(new ComponentName(a, CaptureTile.class), "Capture", Icon.createWithResource(a, a.getResources().getIdentifier("ic_plus", "drawable", a.getPackageName())),
            a.getMainExecutor(), r -> Toast.makeText(a, r == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED ? "The tile is there already" : r == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED ? "Added: pull the quick settings down" : "Not added", Toast.LENGTH_SHORT).show());
    }

    private View tap(LinearLayout row, Runnable r) {
        row.setOnClickListener(v -> r.run());
        return row;
    }

    private TextView note(String s) {
        TextView t = look.label(a, s, 13, look.muted);
        t.setPadding(look.dp(12), look.dp(6), look.dp(12), look.dp(10));
        t.setLineSpacing(0, 1.2f);
        return t;
    }
}
