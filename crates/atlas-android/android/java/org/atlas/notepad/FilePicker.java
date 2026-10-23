package org.atlas.notepad;

import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.Look;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.function.Supplier;

/** The vault's files to choose from: browsed folder by folder (folders first, only those holding a file that fits), the recently chosen on
 *  top, or searched across the whole vault by name and folder as you type. `chosen` gets the vault path. */
final class FilePicker {
    private static final int RECENT_MAX = 8, FOUND_MAX = 200, PER_ROW = 3;
    private static final java.util.regex.Pattern PICTURE = java.util.regex.Pattern.compile("(?i).*\\.(png|jpe?g|webp|gif|bmp)$");
    /** The phone's own gallery (the system picker), offered first when not null. */
    private final Runnable gallery;
    /** Thumbnails read once per picker, one at a time off the UI thread. */
    private final java.util.Map<String, android.graphics.Bitmap> thumbs = new java.util.HashMap<>();
    private final java.util.concurrent.ExecutorService reader = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final Host host;
    private final Look look;
    private final Predicate<String> which;
    private final Consumer<String> chosen;
    private final SharedPreferences prefs;
    private final LinearLayout list;
    private final TextView where;
    private final EditText search;
    private List<String> files; // the vault's files that fit, once read (null while reading)
    private String dir = "";
    private AlertDialog dialog;

    static void show(Host host, String title, String hint, Predicate<String> which, Supplier<List<String>> vault, Consumer<String> chosen) {
        new FilePicker(host, title, hint, which, vault, chosen, null);
    }

    /** With the phone's gallery offered first. */
    static void show(Host host, String title, String hint, Predicate<String> which, Supplier<List<String>> vault, Consumer<String> chosen, Runnable gallery) {
        new FilePicker(host, title, hint, which, vault, chosen, gallery);
    }

    private FilePicker(Host host, String title, String hint, Predicate<String> which, Supplier<List<String>> vault, Consumer<String> chosen, Runnable gallery) {
        this.host = host;
        this.gallery = gallery;
        this.look = host.look();
        this.which = which;
        this.chosen = chosen;
        this.prefs = host.activity().getSharedPreferences("notepad-picker", 0);
        LinearLayout form = new LinearLayout(host.activity());
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(look.dp(16), look.dp(4), look.dp(16), 0);
        search = new EditText(host.activity());
        search.setSingleLine(true);
        search.setHint(hint + " — or browse below");
        form.addView(search, new LinearLayout.LayoutParams(-1, -2));
        where = look.label(host.activity(), "", 13, look.muted);
        where.setPadding(0, look.dp(6), 0, look.dp(4));
        form.addView(where);
        list = new LinearLayout(host.activity());
        list.setOrientation(LinearLayout.VERTICAL);
        ScrollView scroll = new ScrollView(host.activity());
        scroll.addView(list);
        int tall = Math.round(host.activity().getResources().getDisplayMetrics().heightPixels * 0.55f);
        form.addView(scroll, new LinearLayout.LayoutParams(-1, tall));
        search.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            public void onTextChanged(CharSequence s, int a, int b, int c) {}
            public void afterTextChanged(Editable e) { render(); }
        });
        dialog = new AlertDialog.Builder(host.activity()).setTitle(title).setView(form).setNegativeButton("Cancel", null).create();
        dialog.setOnDismissListener(d -> reader.shutdownNow());
        dialog.show();
        render();
        new Thread(() -> {
            List<String> fit = new ArrayList<>();
            for (String p : vault.get()) if (which.test(p)) fit.add(p);
            host.activity().runOnUiThread(() -> { files = fit; render(); });
        }, "picker-files").start();
    }

    private void render() {
        list.removeAllViews();
        if (files == null) { where.setText("Reading the vault…"); return; }
        String q = search.getText().toString().trim().toLowerCase(Locale.ROOT);
        if (!q.isEmpty()) { found(q); return; }
        where.setText(dir.isEmpty() ? "The vault" : "The vault / " + dir.substring(0, dir.length() - 1).replace("/", " / "));
        if (dir.isEmpty()) {
            if (gallery != null) row("image", "From the phone's gallery…", "photos, screenshots, downloads", () -> { dialog.dismiss(); gallery.run(); });
            List<String> recent = recent();
            if (!recent.isEmpty()) {
                heading("Recent");
                files(recent, true);
                heading("Folders and files");
            }
        } else {
            String up = dir.substring(0, dir.lastIndexOf('/', dir.length() - 2) + 1);
            row("back", "Up", up.isEmpty() ? "the vault" : up, () -> { dir = up; render(); });
        }
        TreeSet<String> folders = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        List<String> here = new ArrayList<>();
        for (String p : files) {
            if (!p.startsWith(dir)) continue;
            int slash = p.indexOf('/', dir.length());
            if (slash >= 0) folders.add(p.substring(dir.length(), slash + 1)); else here.add(p);
        }
        for (String f : folders) row("vault", f.substring(0, f.length() - 1), null, () -> { dir = dir + f; render(); });
        here.sort(String.CASE_INSENSITIVE_ORDER);
        files(here, false);
        if (folders.isEmpty() && here.isEmpty()) heading("Nothing here fits");
    }

    /** The whole vault searched: the name first, then the folder. */
    private void found(String q) {
        List<String> byName = new ArrayList<>(), byFolder = new ArrayList<>();
        for (String p : files) {
            String low = p.toLowerCase(Locale.ROOT), name = low.substring(low.lastIndexOf('/') + 1);
            if (name.contains(q)) byName.add(p); else if (low.contains(q)) byFolder.add(p);
        }
        byName.addAll(byFolder);
        where.setText(byName.isEmpty() ? "No file matches" : byName.size() + " found in the vault");
        files(byName.subList(0, Math.min(FOUND_MAX, byName.size())), true);
    }

    /** Pictures as a gallery (thumbnails, PER_ROW a row), first; the other files as rows. */
    private void files(List<String> ps, boolean withFolder) {
        List<String> pictures = new ArrayList<>();
        for (String p : ps) if (PICTURE.matcher(p).matches()) pictures.add(p); else file(p, withFolder);
        int gap = look.dp(4), side = (list.getWidth() > 0 ? list.getWidth() : look.dp(300)) / PER_ROW - 2 * gap;
        LinearLayout line = null;
        for (int i = 0; i < pictures.size(); i++) {
            if (i % PER_ROW == 0) {
                line = new LinearLayout(host.activity());
                list.addView(line, new LinearLayout.LayoutParams(-1, -2));
            }
            line.addView(tile(pictures.get(i), side), tileAt(side, gap));
        }
    }

    private static LinearLayout.LayoutParams tileAt(int side, int gap) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(side, side);
        lp.setMargins(gap, gap, gap, gap);
        return lp;
    }

    /** A picture's thumbnail (its name until read, and as its description); a tap chooses it. */
    private View tile(String p, int side) {
        android.widget.FrameLayout f = new android.widget.FrameLayout(host.activity());
        f.setBackground(look.round(look.hover, 8, look.border));
        f.setContentDescription(p.substring(p.lastIndexOf('/') + 1));
        android.widget.ImageView img = new android.widget.ImageView(host.activity());
        img.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
        f.addView(img, new android.widget.FrameLayout.LayoutParams(-1, -1));
        TextView name = look.label(host.activity(), p.substring(p.lastIndexOf('/') + 1), 11, look.muted);
        name.setSingleLine(true);
        name.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        name.setPadding(look.dp(4), 0, look.dp(4), look.dp(2));
        f.addView(name, new android.widget.FrameLayout.LayoutParams(-1, -2, android.view.Gravity.BOTTOM));
        android.graphics.Bitmap had = thumbs.get(p);
        if (had != null) img.setImageBitmap(had);
        else if (!reader.isShutdown()) reader.execute(() -> {
            android.graphics.Bitmap b = null;
            try (java.io.InputStream in = host.read(p)) { b = host.decode(org.atlas.capture.Bytes.all(in), side, side); } catch (Exception e) { /* its name stays */ }
            android.graphics.Bitmap got = b;
            if (got != null) host.activity().runOnUiThread(() -> { thumbs.put(p, got); img.setImageBitmap(got); });
        });
        f.setOnClickListener(v -> { remember(p); dialog.dismiss(); chosen.accept(p); });
        f.setOnLongClickListener(v -> { host.toast(p); return true; });
        return f;
    }

    private void file(String p, boolean withFolder) {
        int slash = p.lastIndexOf('/');
        String name = p.substring(slash + 1), low = name.toLowerCase(Locale.ROOT);
        String icon = low.matches(".*\\.(png|jpe?g|webp|gif|svg)$") ? "image" : low.endsWith(".mp3") || low.endsWith(".m4a") || low.endsWith(".ogg") ? "music"
            : low.endsWith(".excalidraw") || low.endsWith(".excalidraw.md") ? "pen" : "note";
        row(icon, name.endsWith(".md") ? name.substring(0, name.length() - 3) : name, withFolder && slash > 0 ? p.substring(0, slash) : null, () -> {
            remember(p);
            dialog.dismiss();
            chosen.accept(p);
        });
    }

    private void row(String icon, String label, String detail, Runnable tap) {
        View r = look.row(host.activity(), icon, label, detail);
        r.setOnClickListener(v -> tap.run());
        list.addView(r, new LinearLayout.LayoutParams(-1, -2));
    }

    private void heading(String s) {
        TextView t = look.label(host.activity(), s, 12.5f, look.faint);
        t.setPadding(look.dp(12), look.dp(10), 0, look.dp(2));
        list.addView(t);
    }

    /** The recently chosen that still exist and fit, newest first. */
    private List<String> recent() {
        List<String> out = new ArrayList<>();
        for (String p : prefs.getString("recent", "").split("\n")) if (!p.isEmpty() && files.contains(p)) out.add(p);
        return out;
    }

    private void remember(String p) {
        List<String> r = new ArrayList<>();
        r.add(p);
        for (String q : prefs.getString("recent", "").split("\n")) if (!q.isEmpty() && !q.equals(p) && r.size() < RECENT_MAX * 3) r.add(q);
        prefs.edit().putString("recent", String.join("\n", r)).apply();
    }
}
