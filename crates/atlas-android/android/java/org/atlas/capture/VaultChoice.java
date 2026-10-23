package org.atlas.capture;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.text.InputType;
import android.widget.EditText;
import android.widget.LinearLayout;
import java.io.File;
import java.util.function.Consumer;

/** Choosing where captures go — the folders' permission, an Atlas server, the app's own folder — for the capture box and Settings alike. */
final class VaultChoice {
    private VaultChoice() {}

    static boolean canWriteStorage(Activity a) {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return a.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    /** The system's screen for "all files" (a vault synced to the phone is an ordinary folder), or the old permission. */
    static void askStorage(Activity a) {
        if (Build.VERSION.SDK_INT >= 30) {
            a.startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + a.getPackageName())));
        } else {
            a.requestPermissions(new String[] {android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, 1);
        }
    }

    /** Vault folders on the phone's storage (`.atlas` or `.obsidian` inside), off the main thread: the JSON of Core.findVaults. */
    static void find(Activity a, Consumer<String> found) {
        new Thread(() -> {
            String json = Core.findVaults(Environment.getExternalStorageDirectory().getPath());
            a.runOnUiThread(() -> found.accept(json));
        }).start();
    }

    /** The app's own folder, for captures with no vault on the phone yet. */
    static String inApp(Activity a) {
        File f = new File(a.getFilesDir(), "Phone");
        new File(f, ".atlas").mkdirs();
        return f.getPath();
    }

    /** A server's address; then what answers there decides the ways in offered (signIn). */
    static void askServer(Activity a, Look look, Vaults vaults, Consumer<String> chosen) {
        EditText url = new EditText(a);
        url.setHint("https://atlas.example.org/v/notes");
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        LinearLayout form = new LinearLayout(a);
        form.setPadding(look.dp(20), look.dp(8), look.dp(20), 0);
        form.addView(url, new LinearLayout.LayoutParams(-1, -2));
        new android.app.AlertDialog.Builder(a)
            .setTitle("An Atlas server")
            .setView(form)
            .setPositiveButton("Next", (d, w) -> {
                String u = url.getText().toString().trim();
                if (!u.isEmpty() && !Server.is(u)) u = "https://" + u;
                if (Server.is(u)) signIn(a, look, vaults, u, chosen);
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    /** Looks at what answers at the server, then offers the ways in that fit it (docs/guides/ANDROID.md, "Signing in"). */
    static void signIn(Activity a, Look look, Vaults vaults, String server, Consumer<String> chosen) {
        android.widget.Toast.makeText(a, "Looking at " + Vaults.name(server) + "…", android.widget.Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            SignIn.Probe p = SignIn.probe(a, server, false);
            // the screen may have closed during the probe (up to 18 s): a dialog on it would crash (BadTokenException)
            a.runOnUiThread(() -> { if (!a.isFinishing() && !a.isDestroyed()) offer(a, look, vaults, server, p, chosen); });
        }).start();
    }

    private static void offer(Activity a, Look look, Vaults vaults, String server, SignIn.Probe p, Consumer<String> chosen) {
        java.util.List<String[]> ways = new java.util.ArrayList<>(); // {icon, label, detail}
        java.util.List<Runnable> runs = new java.util.ArrayList<>();
        String says;
        switch (p.front) {
            case DOWN:
                says = "Nothing answered at " + server + " (" + p.why + ").";
                ways.add(new String[] {"server", "Look again", ""});
                runs.add(() -> signIn(a, look, vaults, server, chosen));
                break;
            case OPEN:
                says = "This server lets anyone in.";
                ways.add(new String[] {"check", "Use it", ""});
                runs.add(() -> { vaults.markOpen(server, true); vaults.use(server); chosen.accept(server); }); // remembered: no sign-in asked again
                break;
            case ATLAS:
                says = "This server signs in itself (its password).";
                ways.add(new String[] {"check", "Sign in here", "in the app"});
                runs.add(() -> web(a, server));
                ways.add(new String[] {"link", "Sign in in the browser", ""});
                runs.add(() -> SignIn.atlasInBrowser(a, server));
                break;
            default:
                says = "A sign-in stands in front of this server" + (p.host == null ? "" : " (" + p.host + ")")
                    + ". Here, in the app: its password and a one-time code. In the browser: a security key too.";
                ways.add(new String[] {"check", "Sign in here", "password, code"});
                runs.add(() -> web(a, server));
                ways.add(new String[] {"link", "Sign in in the browser", "security key"});
                runs.add(() -> SignIn.atlasInBrowser(a, server));
        }
        ways.add(new String[] {"plus", "A token or a header…", "by hand"});
        runs.add(() -> manual(a, look, vaults, server, chosen));
        choose(a, look, Vaults.name(server), says, ways, runs);
    }

    /** A dialog saying something, then the ways on from it as rows (an AlertDialog shows only one of message and items). */
    private static void choose(Activity a, Look look, String title, String says, java.util.List<String[]> ways, java.util.List<Runnable> runs) {
        LinearLayout body = new LinearLayout(a);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(look.dp(12), look.dp(4), look.dp(12), 0);
        android.widget.TextView text = look.label(a, says, 14.5f, look.muted);
        text.setLineSpacing(0, 1.2f);
        text.setPadding(look.dp(12), 0, look.dp(12), look.dp(10));
        body.addView(text);
        android.app.AlertDialog d = new android.app.AlertDialog.Builder(a)
            .setTitle(title)
            .setView(body)
            .setNegativeButton("Cancel", null)
            .create();
        for (int i = 0; i < ways.size(); i++) {
            String[] w = ways.get(i);
            Runnable run = runs.get(i);
            LinearLayout r = look.row(a, w[0], w[1], w[2]);
            r.setOnClickListener(v -> { d.dismiss(); run.run(); });
            body.addView(r);
        }
        d.show();
    }

    static void web(Activity a, String server) {
        a.startActivity(new Intent(a, SignInWebActivity.class).putExtra("server", server));
    }

    /** By hand: a device token (`atlas server token phone --scope capture`), and a header some front lets through — any name. */
    static void manual(Activity a, Look look, Vaults vaults, String server, Consumer<String> chosen) {
        LinearLayout form = new LinearLayout(a);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(look.dp(20), look.dp(8), look.dp(20), 0);
        EditText token = new EditText(a), header = new EditText(a);
        token.setHint("atl_… (atlas server token phone --scope capture)");
        token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setText(vaults.token(server));
        header.setHint("optional: Header-Name: value");
        header.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        header.setText(vaults.header(server));
        form.addView(token);
        form.addView(header);
        new android.app.AlertDialog.Builder(a)
            .setTitle("By hand")
            .setView(form)
            .setPositiveButton("Use it", (d, w) -> {
                if (token.length() > 0) vaults.useServer(server, token.getText().toString().trim()); else vaults.use(server);
                vaults.keepHeader(server, header.getText().toString().trim());
                chosen.accept(server);
            })
            .setNegativeButton("Cancel", null)
            .show();
    }
}
