package org.atlas.capture;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;

/** The vaults the phone knows (folders), and which one captures go to; kept in the app's preferences. */
final class Vaults {
    private final SharedPreferences prefs;

    Vaults(Context c) { prefs = c.getSharedPreferences("atlas", Context.MODE_PRIVATE); }

    List<String> list() {
        List<String> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs.getString("vaults", "[]"));
            for (int i = 0; i < a.length(); i++) if (Server.is(a.getString(i)) || new File(a.getString(i)).isDirectory()) out.add(a.getString(i));
        } catch (Exception e) { /* none */ }
        return out;
    }

    String current() {
        List<String> l = list();
        String c = prefs.getString("current", null);
        if (c != null && l.contains(c)) return c;
        return l.isEmpty() ? null : l.get(0);
    }

    void use(String path) {
        List<String> l = list();
        if (!l.contains(path)) l.add(path);
        prefs.edit().putString("vaults", new JSONArray(l).toString()).putString("current", path).apply();
    }

    /** A folder by its name; a server by its host and vault (`host · notes`). */
    static String name(String dest) {
        if (!Server.is(dest)) return new File(dest).getName();
        String rest = dest.replaceFirst("^https?://", "").replaceAll("/+$", "");
        int v = rest.indexOf("/v/");
        return v < 0 ? rest : rest.substring(0, v) + " · " + rest.substring(v + 3);
    }

    /** Taken off this device's list with all it kept for it (sign-ins, label): the folder or the server itself is
     *  untouched. The next vault becomes the current one. */
    void remove(String path) {
        List<String> l = list();
        l.remove(path);
        android.content.SharedPreferences.Editor e = prefs.edit().putString("vaults", new JSONArray(l).toString());
        for (String k : new String[] {"token:", "cookies:", "gate:", "header:", "open:", "label:"}) e.remove(k + path);
        if (path.equals(prefs.getString("current", null))) e.remove("current");
        e.apply();
    }

    /** The name the user gave it here, else its own (name below). */
    String title(String path) { String l = prefs.getString("label:" + path, ""); return l.isEmpty() ? name(path) : l; }

    void label(String path, String label) { prefs.edit().putString("label:" + path, label == null ? "" : label.trim()).apply(); }

    /** A server that lets anyone in (its probe said so, and the user chose it): nothing to sign in with, remembered. */
    void markOpen(String url, boolean open) { prefs.edit().putBoolean("open:" + url, open).apply(); }

    boolean open(String url) { return prefs.getBoolean("open:" + url, false); }

    /** Every sign-in kept for a server forgotten (the token, the sessions, the header): the next use signs in again. */
    void forgetSignIn(String url) {
        prefs.edit().remove("token:" + url).remove("cookies:" + url).remove("gate:" + url).remove("header:" + url).remove("open:" + url).apply();
    }

    /** Signed in to a server: it is used from now on, unless it is the mirror of the folder in use (a sign-in for the
     *  mirror, from the folder's details), which stays in use. */
    void useServer(String url, String token) {
        prefs.edit().putString("token:" + url, token).apply();
        String now = current();
        if (now != null && !Server.is(now) && url.equals(mirror(now))) return;
        use(url);
    }

    String token(String url) { return prefs.getString("token:" + url, ""); }

    /** The folder's copy on a server (docs/design/DESIGN-mirror-v2.md): the one set for it, else the known server vault of
     *  the same name (~/Notes ↔ https://…/v/notes/); null when none. Files, captures included, are still written in the
     *  folder (docs/design/DESIGN-mirror-v2.md); the mirror is the live rooms' server. */
    String mirror(String folder) {
        String set = prefs.getString("mirror:" + folder, "");
        if (NONE.equals(set)) return null; // turned off (Setup.chooseMirror)
        if (!set.isEmpty()) return set;
        String name = new java.io.File(folder).getName().toLowerCase(java.util.Locale.ROOT);
        for (String p : list()) {
            if (!Server.is(p)) continue;
            String[] parts = p.replaceAll("/+$", "").split("/");
            if (parts.length > 3 && parts[parts.length - 1].equalsIgnoreCase(name)) return p;
        }
        return null;
    }

    /** Whether the user chose this folder's mirror (or none) rather than it being the same-name guess. */
    boolean mirrorChosen(String folder) { return !prefs.getString("mirror:" + folder, "").isEmpty(); }

    /** The server vaults that are a folder's mirror: one vault with that folder, not listed again (Setup). */
    java.util.Set<String> mirrors() {
        java.util.Set<String> out = new java.util.HashSet<>();
        for (String p : list()) if (!Server.is(p)) { String m = mirror(p); if (m != null) out.add(m); }
        return out;
    }

    /** `null`: no mirror, the guess included. */
    void setMirror(String folder, String server) { prefs.edit().putString("mirror:" + folder, server == null ? NONE : server).apply(); }
    private static final String NONE = "none";

    /** Signed in through a WebView: its cookies (the sign-in in front's session) go with every request. */
    void keepCookies(String url, boolean on) { prefs.edit().putBoolean("cookies:" + url, on).apply(); }

    boolean cookies(String url) { return prefs.getBoolean("cookies:" + url, false); }

    /** The gate's session (its cookies, `name=value; …`), handed over by Atlas after a sign-in in the browser. */
    void keepGate(String url, String cookies) { prefs.edit().putString("gate:" + url, cookies).apply(); }

    String gate(String url) { return prefs.getString("gate:" + url, ""); }

    /** An extra header for the server, `Name: value` (a key some front lets through; generic, optional, empty for none). */
    void keepHeader(String url, String header) { prefs.edit().putString("header:" + url, header).apply(); }

    String header(String url) { return prefs.getString("header:" + url, ""); }

    /** How this phone is signed in to a server, in a few words. */
    String how(Context c, String url) {
        String t = token(url).isEmpty() ? "" : "token";
        String via = !gate(url).isEmpty() ? "browser sign-in" : cookies(url) ? "sign-in in the app" : "";
        if (t.isEmpty() && via.isEmpty()) return open(url) ? "no sign-in needed" : "not signed in";
        return via.isEmpty() ? t : t.isEmpty() ? via : via + " + " + t;
    }

    String draft() { return prefs.getString("draft", ""); }

    void keepDraft(String s) { prefs.edit().putString("draft", s).apply(); }
}
