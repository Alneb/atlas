package org.atlas.capture;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.Gravity;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The phone's Files place, native (docs/design/DESIGN-android-native-app.md §3): a folder of the vault on a PlaceList,
 * breadcrumbs above it. The folder comes from the vault's core (`/api/tree` through VaultFiles: the core in this app
 * for a folder vault, the server for a server's), so it works while the page is still loading or has failed; a file
 * opens the way every file does (Shell.open: a native plugin, else the page's editor). FileRows decides the lines. At
 * the vault's top, what the vault's other devices show comes first (WhereRows, from `GET /api/where`): a tap opens it
 * at its place.
 */
final class FilesScreen {
    /** What the app does for its native places (AtlasActivity). */
    interface Shell {
        /** Opens `path` (at `line`, 1-based; 0 the top) as any file opens: its native plugin, else the page. */
        void open(String path, int line);
        /** The page's "Open with…" list for `path` (only while the page is ready). */
        void openWith(String path);
        /** `[[name]]` on the clipboard. */
        void copyLink(String path);
        boolean pageReady();
        /** The place beside in the bottom bar's order (a sideways fling). */
        void step(int by);
    }

    private final Activity a;
    private final String vault;
    private final Shell shell;
    private Look look;
    private View root;
    private PlaceList list;
    private LinearLayout crumbs;
    private HorizontalScrollView crumbsScroll;
    /** The folder shown ("" the vault's top), and the one last asked of the core (an older answer is dropped). */
    private String dir = "", asked;

    FilesScreen(Activity a, String vault, Shell shell) {
        this.a = a;
        this.vault = vault;
        this.shell = shell;
    }

    /** The screen in `look`'s colours (made again when the page's colours change), its folder read afresh. */
    View view(Look look) {
        if (root == null || this.look != look) build(look);
        load();
        return root;
    }

    /** Back: the folder above, true; false at the vault's top (Back then leaves Files). */
    boolean up() {
        if (dir.isEmpty()) return false;
        go(FileRows.parent(dir));
        return true;
    }

    /** "Show in Files": the folder holding `path`, read when the screen is next shown. */
    void reveal(String path) { dir = FileRows.parent(path); }

    private void build(Look look) {
        this.look = look;
        LinearLayout box = new LinearLayout(a);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(look.app);
        crumbs = new LinearLayout(a);
        crumbs.setGravity(Gravity.CENTER_VERTICAL);
        crumbs.setPadding(look.dp(8), 0, look.dp(8), 0);
        crumbsScroll = new HorizontalScrollView(a);
        crumbsScroll.setHorizontalScrollBarEnabled(false);
        crumbsScroll.setBackgroundColor(look.bg);
        crumbsScroll.addView(crumbs, new HorizontalScrollView.LayoutParams(-2, look.dp(48)));
        box.addView(crumbsScroll, new LinearLayout.LayoutParams(-1, look.dp(48)));
        View line = new View(a);
        line.setBackgroundColor(look.border);
        box.addView(line, new LinearLayout.LayoutParams(-1, Math.max(1, look.dp(0.5f))));
        list = new PlaceList(a, look, new PlaceList.On() {
            public void open(PlaceItem it) { if (it.folder) go(it.path); else if (it.path != null) shell.open(it.path, 0); }
            public void more(PlaceItem it, View anchor) { menu(a, FilesScreen.this.look, vault, it, anchor, shell, FilesScreen.this::load); }
            public void refresh() { load(); }
            public void step(int by) { shell.step(by); }
        });
        box.addView(list, new LinearLayout.LayoutParams(-1, 0, 1f));
        root = box;
    }

    private void go(String folder) {
        dir = FileRows.clean(folder);
        list.toTop();
        load();
    }

    /** The breadcrumbs: the vault's name, then each folder down to this one, the last in the accent; a tap goes there. */
    private void drawCrumbs() {
        crumbs.removeAllViews();
        List<String[]> all = FileRows.crumbs(dir, Vaults.name(vault));
        for (int i = 0; i < all.size(); i++) {
            String[] c = all.get(i);
            boolean last = i == all.size() - 1;
            if (i > 0) crumbs.addView(look.label(a, "›", 15, look.faint));
            TextView t = look.label(a, c[0], 14.5f, last ? look.accent : look.muted);
            if (last) t.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
            t.setPadding(look.dp(8), 0, look.dp(8), 0);
            t.setMinHeight(look.dp(48));
            t.setBackground(look.pressable(0x00000000, 8, 0));
            String to = c[1];
            if (!last) t.setOnClickListener(v -> go(to));
            crumbs.addView(t);
        }
        crumbsScroll.post(() -> crumbsScroll.fullScroll(View.FOCUS_RIGHT)); // the folder itself in view
    }

    /** The folder read from the core, off the main thread; drawn when it is still the one asked for. */
    void load() {
        if (list == null) return;
        String want = dir;
        asked = want;
        drawCrumbs();
        list.setRefreshing(true);
        new Thread(() -> {
            List<FileRows.Entry> entries = new ArrayList<>();
            String error = null;
            List<WhereRows.Place> places = want.isEmpty() ? where() : new ArrayList<>(); // the vault's top only
            try {
                VaultFiles.OnServer f = (VaultFiles.OnServer) VaultFiles.of(a, vault);
                JSONArray tree = new JSONArray(new String(f.get("/api/tree?path=" + VaultFiles.OnServer.q(want)), StandardCharsets.UTF_8));
                for (int i = 0; i < tree.length(); i++) {
                    JSONObject e = tree.getJSONObject(i);
                    entries.add(new FileRows.Entry(e.optString("name"), e.optString("path"), "dir".equals(e.optString("kind")),
                        e.has("size") ? e.optLong("size") : -1, e.optLong("modified", 0), e.optBoolean("ignored"), e.optBoolean("unshown")));
                }
            } catch (Exception e) {
                error = e.getMessage() == null ? e.toString() : e.getMessage();
                android.util.Log.w("AtlasFiles", "tree " + want + ": " + error);
            }
            String why = error;
            a.runOnUiThread(() -> {
                if (!want.equals(asked) || a.isFinishing()) return;
                list.setRefreshing(false);
                if (why != null) { list.setItems(new ArrayList<>(), "Could not read " + (want.isEmpty() ? Vaults.name(vault) : want) + ": " + why + "\n\nPull down to try again."); return; }
                List<PlaceItem> folder = FileRows.rows(entries, Look::shownName, System.currentTimeMillis(), ZoneId.systemDefault(), Locale.getDefault());
                List<PlaceItem> others = WhereRows.rows(places, AtlasActivity.deviceId(a), Look::shownName);
                list.setItems(WhereRows.above(others, folder, Vaults.name(vault)), "Nothing in this folder");
            });
        }, "files").start();
    }

    /** Who is where (`GET /api/where`): the places the vault's other devices show. Off the main thread; a core or
     *  server that does not answer (an older one: 404) lists nobody, said in the log only — Files still shows. */
    private List<WhereRows.Place> where() {
        List<WhereRows.Place> out = new ArrayList<>();
        try {
            VaultFiles.OnServer f = (VaultFiles.OnServer) VaultFiles.of(a, vault);
            JSONArray all = new JSONObject(new String(f.get("/api/where"), StandardCharsets.UTF_8)).optJSONArray("devices");
            for (int i = 0; all != null && i < all.length(); i++) {
                JSONObject d = all.getJSONObject(i);
                out.add(new WhereRows.Place(d.optString("name"), d.optString("device"), d.optString("path"), d.optInt("page"), d.optInt("line")));
            }
        } catch (Exception e) {
            android.util.Log.w("AtlasFiles", "where: " + (e.getMessage() == null ? e : e.getMessage()));
        }
        return out;
    }

    // ---- an item's menu (Files and Search) --------------------------------------------------------------------------

    /** A file's or folder's actions, in the app's menu card (AtlasActivity.menu's look): open, open with (the page's
     *  openers, while the page is ready), rename, copy a link, move to the trash, a folder shown as a library. Renaming, trashing and a library go to the core
     *  (VaultFiles: its rules, the trash in `.atlas/trash/`), so they work without the page; the page follows a file
     *  renamed under an open tab (gone-files.ts). `changed` runs once the vault changed. */
    static void menu(Activity a, Look look, String vault, PlaceItem it, View anchor, Shell shell, Runnable changed) {
        if (it.path == null) return;
        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(look.dp(6), look.dp(6), look.dp(6), look.dp(6));
        card.setBackground(look.round(look.pop, 16, look.border));
        card.setElevation(look.elevation(8));
        PopupWindow pop = new PopupWindow(card, look.dp(244), -2, true);
        pop.setElevation(look.elevation(8));
        pop.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
        String path = it.path;
        if (!it.folder) {
            item(a, look, card, pop, "note", "Open", () -> shell.open(path, it.line));
            if (shell.pageReady()) item(a, look, card, pop, "more", "Open with…", () -> shell.openWith(path));
        }
        // a folder of books, comics, films… as one of the vault's libraries (the core guesses its kind: libraries.rs)
        if (it.folder) item(a, look, card, pop, "library", "Show as a library", () -> inVault(a, vault, "Not shown as a library",
            f -> ((VaultFiles.OnServer) f).send("POST", "/api/libraries/add", "application/json",
                ("{\"folder\":" + org.json.JSONObject.quote(it.path) + "}").getBytes(java.nio.charset.StandardCharsets.UTF_8)),
            "In the Library now: " + it.title, changed));
        item(a, look, card, pop, "pen", "Rename…", () -> rename(a, vault, it, changed));
        if (!it.folder) item(a, look, card, pop, "link", "Copy a link to it", () -> shell.copyLink(path));
        item(a, look, card, pop, "trash", "Move to the trash…", () -> trash(a, vault, it, changed));
        pop.showAsDropDown(anchor, Math.max(0, anchor.getWidth() - look.dp(244)), -look.dp(8), Gravity.START);
    }

    /** One line of a row's menu (the Agenda's too): its icon and words; a tap closes the menu, then runs. */
    static void item(Activity a, Look look, LinearLayout card, PopupWindow pop, String icon, String label, Runnable run) {
        Row r = look.row(a, icon, label, "");
        r.setOnClickListener(v -> { pop.dismiss(); run.run(); });
        card.addView(r);
    }

    private static void rename(Activity a, String vault, PlaceItem it, Runnable changed) {
        android.widget.EditText name = new android.widget.EditText(a);
        String base = it.path.substring(it.path.lastIndexOf('/') + 1);
        String shown = it.folder ? base : Look.shownName(it.path);
        name.setText(shown);
        int dot = shown.equals(base) && !it.folder ? shown.lastIndexOf('.') : -1; // a shown extension stays unselected
        name.setSelection(0, dot > 0 ? dot : name.length());
        name.setSingleLine(true);
        LinearLayout form = new LinearLayout(a);
        int pad = Math.round(20 * a.getResources().getDisplayMetrics().density);
        form.setPadding(pad, pad / 2, pad, 0);
        form.addView(name, new LinearLayout.LayoutParams(-1, -2));
        new AlertDialog.Builder(a).setTitle(it.folder ? "Rename the folder" : "Rename").setView(form)
            .setPositiveButton("Rename", (d, w) -> {
                String to = FileRows.renamed(it.path, name.getText().toString(), it.folder ? p -> base : Look::shownName);
                if (to == null) return;
                inVault(a, vault, "Not renamed", f -> f.move(it.path, to), "Renamed", changed);
            })
            .setNegativeButton("Cancel", null).show();
    }

    private static void trash(Activity a, String vault, PlaceItem it, Runnable changed) {
        new AlertDialog.Builder(a).setTitle("Move to the trash?")
            .setMessage((it.folder ? it.title + " and everything in it go" : Look.shownName(it.path) + " goes") + " to the vault's .atlas/trash/, where it can be taken back.")
            .setPositiveButton("Move to the trash", (d, w) -> inVault(a, vault, "Not moved to the trash", f -> f.trash(it.path), "Moved to the trash", changed))
            .setNegativeButton("Cancel", null).show();
    }

    private interface Change { void run(VaultFiles f) throws Exception; }

    /** A change to the vault off the main thread, said in a toast, then `changed`. */
    private static void inVault(Activity a, String vault, String failed, Change change, String done, Runnable changed) {
        new Thread(() -> {
            String why = null;
            try { change.run(VaultFiles.of(a, vault)); } catch (Exception e) { why = e.getMessage() == null ? e.toString() : e.getMessage(); }
            String said = why == null ? done : failed + ": " + why;
            a.runOnUiThread(() -> {
                Toast.makeText(a, said, Toast.LENGTH_LONG).show();
                changed.run();
            });
        }, "files-change").start();
    }
}
