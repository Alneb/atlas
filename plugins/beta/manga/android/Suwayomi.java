package org.atlas.plugins.manga;

import org.atlas.capture.Host;
import org.atlas.capture.Web;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A Suwayomi server (Tachiyomi's; docs/design/DESIGN-libraries-everywhere.md) for the
 * reader: a chapter's series and pages (its library is browsed on the web side, suwayomi.js), and where you are written
 * back to it, so every Mihon-like client sees the same place. Its GraphQL API, checked against a real server
 * — reading state is under `user`; a chapter's pages come from `fetchChapterPages` (JPEG XL, ~3 MB, ~4 s
 * each). Reached as the vault is (Web: Authelia's session; on the VPN directly). Never on the UI thread.
 */
final class Suwayomi {
    private Suwayomi() {}

    /** `suwayomi:<chapter id>/<name>`: a chapter of the server, named for the screens (Library.name takes the name). */
    static final String SCHEME = "suwayomi:";

    static boolean is(String chapterOrSeries) { return chapterOrSeries.startsWith(SCHEME); }

    /** The server's address from the plugin's settings ("" when none). */
    static String base(Host host) { return host.settings().optString("suwayomi", "").trim().replaceAll("/+$", ""); }

    private static JSONObject query(Host host, String q, Map<String, Object> vars) throws IOException {
        if (base(host).isEmpty()) throw new IOException("no Suwayomi server in this vault's Manga settings");
        byte[] got = Web.post(host.activity(), base(host) + "/api/graphql", "application/json", Web.graphql(q, vars));
        try {
            JSONObject o = new JSONObject(new String(got, StandardCharsets.UTF_8));
            JSONArray errors = o.optJSONArray("errors");
            if (errors != null && errors.length() > 0) throw new IOException(said(errors.getJSONObject(0).optString("message")));
            return o.getJSONObject("data");
        } catch (org.json.JSONException e) { throw new IOException("Suwayomi answered something else: " + e.getMessage()); }
    }

    /** Suwayomi's error in one line, without its Java stack trace; a source whose extension is gone says what to do.
     *  suwayomi.js `said` is the web's same rule. */
    static String said(String message) {
        String first = message.split("\\n\\s*\\n|\\n\\s*at |\\n?\\s*suwayomi\\.tachidesk", 2)[0].trim();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("Source not installed: (\\d+)").matcher(first);
        if (m.find()) return "this series' source is not installed in Suwayomi (source " + m.group(1) + "): install its extension in Suwayomi's Extensions, or migrate the series to another source";
        return "Suwayomi: " + first;
    }

    /** `data.field.list`, empty when absent. */
    private static JSONArray list(JSONObject data, String field, String list) {
        JSONObject o = data.optJSONObject(field);
        JSONArray a = o == null ? null : o.optJSONArray(list);
        return a == null ? new JSONArray() : a;
    }

    /** The series a chapter belongs to, with its chapters and where you are (the web library hands over only the
     *  chapter: `suwayomi:<chapter id>/<name>`). */
    static Library.Series series(Host host, String chapter) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", idOf(chapter));
        JSONObject c = query(host, "query($id: Int!) { chapter(id: $id) { manga { id title } } }", v).optJSONObject("chapter");
        JSONObject m = c == null ? null : c.optJSONObject("manga");
        if (m == null) throw new IOException("no chapter " + idOf(chapter) + " on " + base(host));
        Library.Series s = new Library.Series(SCHEME + m.optInt("id"), m.optString("title"));
        s.remote = m.optInt("id");
        chapters(host, s);
        return s;
    }

    /** A series' chapters in reading order (by number, then the source's order: a volume's extras share a number) and
     *  where you are in them, as the screens keep it (Library.reading's shape). */
    static void chapters(Host host, Library.Series s) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", s.remote);
        JSONArray nodes = list(query(host, "query($id: Int!) { chapters(condition: {mangaId: $id}, order: [{by: CHAPTER_NUMBER}, {by: SOURCE_ORDER}]) { nodes { id name user { isRead lastPageRead lastReadAt } } } }", v), "chapters", "nodes");
        JSONObject all = new JSONObject(), reading = new JSONObject();
        long lastAt = -1;
        s.chapters.clear();
        try {
            reading.put("chapters", all);
            for (int i = 0; nodes != null && i < nodes.length(); i++) {
                JSONObject c = nodes.getJSONObject(i), u = c.optJSONObject("user");
                String name = c.optString("name").replace('/', '∕'); // a name is the path's last part
                s.chapters.add(SCHEME + c.optInt("id") + "/" + name);
                boolean read = u != null && u.optBoolean("isRead");
                int page = u == null ? 0 : u.optInt("lastPageRead");
                if (read || page > 0) all.put(name, new JSONObject().put("read", read).put("page", read ? 0 : page));
                long at = u == null ? 0 : Long.parseLong(u.optString("lastReadAt", "0").replaceAll("\\D", "0")); // a LongString
                if (at > lastAt && (read || page > 0)) { lastAt = at; reading.put("last", name); }
            }
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
        s.reading = reading;
    }

    /** A chapter's pages: their addresses on the server. */
    static List<String> pages(Host host, String chapter) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", idOf(chapter));
        JSONArray p = list(query(host, "mutation($id: Int!) { fetchChapterPages(input: {chapterId: $id}) { pages } }", v), "fetchChapterPages", "pages");
        List<String> out = new ArrayList<>();
        for (int i = 0; p != null && i < p.length(); i++) out.add(base(host) + p.optString(i));
        return out;
    }

    /** A page's bytes, kept in the app's cache: a page read once is there offline, and turning back costs nothing.
     *  Written whole or not at all (a fetch cut short must not leave half a picture for next time). */
    static byte[] page(Host host, String chapter, int i, String url) throws IOException {
        File f = new File(host.activity().getCacheDir(), "suwayomi/" + idOf(chapter) + "/" + i);
        if (f.isFile() && f.length() > 0) return java.nio.file.Files.readAllBytes(f.toPath());
        byte[] b = Web.get(host.activity(), url);
        f.getParentFile().mkdirs();
        File part = new File(f.getPath() + "." + Thread.currentThread().getId() + ".part");
        java.nio.file.Files.write(part.toPath(), b);
        if (!part.renameTo(f)) part.delete();
        return b;
    }

    /** Where you are, written back to the server (Mihon's other clients see it). */
    static void mark(Host host, String chapter, int page, boolean read) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", idOf(chapter));
        v.put("page", page);
        v.put("read", read);
        query(host, "mutation($id: Int!, $page: Int!, $read: Boolean!) { updateChapter(input: {id: $id, patch: {lastPageRead: $page, isRead: $read}}) { chapter { id } } }", v);
    }

    static int idOf(String chapter) {
        String rest = chapter.substring(SCHEME.length());
        int slash = rest.indexOf('/');
        return Integer.parseInt(slash < 0 ? rest : rest.substring(0, slash));
    }
}
