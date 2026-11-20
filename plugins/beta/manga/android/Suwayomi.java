package org.atlas.plugins.manga;

import org.atlas.capture.Host;
import org.atlas.capture.Web;
import org.json.JSONArray;
import org.json.JSONObject;

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
 * What it answered is kept in the vault's cache, shared with the web side (Kept): a chapter read once, or kept with the
 * library's "Keep for offline", opens and reads with the server out of reach.
 */
final class Suwayomi {
    private Suwayomi() {}

    /** `suwayomi:<chapter id>/<name>`: a chapter of the server, named for the screens (Library.name takes the name). */
    static final String SCHEME = Transition.SERVER;

    static boolean is(String chapterOrSeries) { return chapterOrSeries.startsWith(SCHEME); }

    /** The vault's cache for the plugin (Kept), through the vault's files. */
    static Kept kept(Host host) {
        return new Kept(new Kept.Files() {
            @Override public byte[] read(String path) {
                try (java.io.InputStream in = host.read(path)) { return org.atlas.capture.Bytes.all(in); } catch (IOException e) { return null; }
            }
            @Override public void write(String path, byte[] bytes) throws IOException { host.write(path, bytes); }
        });
    }

    private static byte[] utf8(Object o) { return String.valueOf(o).getBytes(StandardCharsets.UTF_8); }

    private static JSONObject json(byte[] b) throws IOException {
        try { return new JSONObject(new String(b, StandardCharsets.UTF_8)); } catch (org.json.JSONException e) { throw new IOException("a kept answer is spoilt: " + e.getMessage()); }
    }

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
        JSONObject m;
        try {
            JSONObject c = query(host, "query($id: Int!) { chapter(id: $id) { manga { id title } } }", v).optJSONObject("chapter");
            m = c == null ? null : c.optJSONObject("manga");
        } catch (IOException offline) {
            // out of reach: the series kept that lists this chapter, as last seen
            Library.Series s = keptSeries(host, idOf(chapter));
            if (s == null) throw offline;
            host.toast(base(host) + " cannot be reached: the chapters as last seen");
            return s;
        }
        if (m == null) throw new IOException("no chapter " + idOf(chapter) + " on " + base(host));
        Library.Series s = new Library.Series(SCHEME + m.optInt("id"), m.optString("title"));
        s.remote = m.optInt("id");
        chapters(host, s);
        return s;
    }

    /** The server's library for the native library: a series each, with its unread count, its categories (the
     *  server's own default left out) and when it was last read (from its chapters as last listed here: Kept.series).
     *  Kept (Kept.library): with the server out of reach the library as last seen, and `offline[0]` says why. */
    static List<Shelf.Item> library(Host host, String[] offline, List<Browse.Category> categories) throws IOException {
        Kept kept = kept(host);
        byte[] b = kept.fresh(Kept.library(), () -> {
            JSONObject data = query(host, "{ mangas(condition: {inLibrary: true}) { nodes { id title thumbnailUrl downloadCount user { unreadCount } categories { nodes { name default } } } } " + Browse.CATEGORIES_FIELD + " }", new HashMap<>());
            JSONObject cats = data.optJSONObject("categories");
            try { return utf8(new JSONObject().put("nodes", list(data, "mangas", "nodes")).put("categories", cats == null ? new JSONObject() : cats)); } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
        });
        if (offline != null && offline.length > 0) offline[0] = kept.offline;
        if (categories != null) categories.addAll(Browse.keptCategories(new String(b, StandardCharsets.UTF_8))); // the tabs' order
        JSONArray nodes = json(b).optJSONArray("nodes");
        List<Shelf.Item> out = new ArrayList<>();
        for (int i = 0; nodes != null && i < nodes.length(); i++) {
            JSONObject m = nodes.optJSONObject(i);
            if (m == null) continue;
            Shelf.Item it = new Shelf.Item(SCHEME + m.optInt("id"), m.optString("title"), Shelf.Origin.SERVER);
            JSONObject u = m.optJSONObject("user");
            it.unread = u == null ? 0 : u.optInt("unreadCount");
            it.downloaded = m.optInt("downloadCount", -1);
            it.cover = m.optString("thumbnailUrl", null);
            JSONObject cats = m.optJSONObject("categories");
            JSONArray cn = cats == null ? null : cats.optJSONArray("nodes");
            for (int k = 0; cn != null && k < cn.length(); k++) {
                JSONObject c = cn.optJSONObject(k);
                if (c != null && !c.optBoolean("default")) it.categories.add(c.optString("name"));
            }
            it.lastRead = keptLastRead(kept, m.optInt("id"));
            out.add(it);
        }
        return out;
    }

    // ---- Browse: the server's sources, a source's series, a series' details, the library's membership ----

    /** A question whose answer is read by the plain side (Browse): its `data`, or the server's error in one line. */
    private static java.util.Map<String, Object> ask(Host host, String q, Map<String, Object> vars) throws IOException {
        if (base(host).isEmpty()) throw new IOException("no Suwayomi server in this vault's Manga settings");
        byte[] got = Web.post(host.activity(), base(host) + "/api/graphql", "application/json", Web.graphql(q, vars));
        try { return Browse.data(new String(got, StandardCharsets.UTF_8)); }
        catch (Browse.Refused r) { throw new IOException(said(r.getMessage())); }
    }

    /** The sources installed in the server (its extensions'), with its own folder of manga (the Local source). */
    static List<Browse.Source> sources(Host host) throws IOException { return Browse.sources(ask(host, Browse.SOURCES, new HashMap<>())); }

    /** One page of a source's popular series, latest updates, or search results (`page` from 1). */
    static Browse.Page browse(Host host, String source, Browse.Type type, int page, String query) throws IOException {
        return Browse.page(ask(host, Browse.FETCH, Browse.fetchVars(source, type, page, query)));
    }

    /** A series' details; one a source only listed so far (no details, no chapters on the server) fetched from its
     *  source first, so its screen has its description and chapters. */
    static Browse.Details details(Host host, int manga) throws IOException {
        Browse.Details d = Browse.details(ask(host, Browse.DETAILS, Browse.idVars(manga)));
        if (d.id == 0) throw new IOException("no series " + manga + " on " + base(host));
        Map<String, Object> fill = Browse.fillVars(d);
        return fill == null ? d : Browse.details(ask(host, Browse.FILL, fill));
    }

    /** The series added to (or removed from) the server's library. */
    static void setInLibrary(Host host, int manga, boolean in) throws IOException { ask(host, Browse.SET_IN_LIBRARY, Browse.inLibraryVars(manga, in)); }

    /** The series' categories changed from `had` to `want` (ids; the server's default is none of them). */
    static void setCategories(Host host, int manga, java.util.Set<Integer> had, java.util.Set<Integer> want) throws IOException {
        List<List<Integer>> c = Browse.change(had, want);
        if (c.get(0).isEmpty() && c.get(1).isEmpty()) return;
        ask(host, Browse.SET_CATEGORIES, Browse.categoryVars(manga, c.get(0), c.get(1)));
    }

    /** The library's categories in the server's order, its default left out. */
    static List<Browse.Category> categories(Host host) throws IOException { return Browse.categories(ask(host, Browse.CATEGORIES, new HashMap<>())); }

    /** When a series was last read, from its chapters as last listed (0: never, or never listed here). */
    private static long keptLastRead(Kept kept, int manga) {
        byte[] b = kept.readOrNull(Kept.series(manga));
        if (b == null) return 0;
        try {
            JSONArray nodes = json(b).optJSONArray("nodes");
            long last = 0;
            for (int i = 0; nodes != null && i < nodes.length(); i++) {
                JSONObject u = nodes.optJSONObject(i) == null ? null : nodes.optJSONObject(i).optJSONObject("user");
                if (u == null || !(u.optBoolean("isRead") || u.optInt("lastPageRead") > 0)) continue;
                last = Math.max(last, Shelf.millis(longOf(u.optString("lastReadAt", "0"))));
            }
            return last;
        } catch (IOException spoilt) { return 0; }
    }

    /** A LongString (digits, maybe quoted) as a long; 0 when it is none. */
    private static long longOf(String s) {
        try { return Long.parseLong(s.replaceAll("\\D", "")); } catch (NumberFormatException e) { return 0; }
    }

    /** A series of the server by its manga id, with its chapters and where you are (kept: offline as last seen;
     *  `s.offline` then says why). */
    static Library.Series series(Host host, int manga, String title) throws IOException {
        Library.Series s = new Library.Series(SCHEME + manga, title);
        s.remote = manga;
        chapters(host, s);
        return s;
    }

    /** The series as the catalog's `note` tool takes it (Thing; suwayomi.js `thing`): its stable id, what the server
     *  says of it. Throws when the server cannot say: the note waits for the next change. */
    static JSONObject thing(Host host, int manga) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", manga);
        JSONObject m = query(host, "query($id: Int!) { manga(id: $id) { title sourceId url author description } }", v).optJSONObject("manga");
        if (m == null) throw new IOException("Suwayomi does not know series " + manga);
        try {
            JSONObject fields = new JSONObject().put("title", m.optString("title"));
            for (String k : new String[] { "author", "description" }) if (!m.optString(k, "").isEmpty() && !m.isNull(k)) fields.put(k, m.optString(k));
            return new JSONObject().put("kind", "manga").put("ids", new JSONObject().put("suwayomi", Thing.suwayomiId(m.optString("sourceId"), m.optString("url")))).put("fields", fields);
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
    }

    /** A series' title (a series handed over by its id alone); offline, the title kept with its chapters. */
    static String title(Host host, int manga) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", manga);
        try {
            JSONObject m = query(host, "query($id: Int!) { manga(id: $id) { title } }", v).optJSONObject("manga");
            if (m != null) return m.optString("title");
        } catch (IOException offline) {
            byte[] b = kept(host).readOrNull(Kept.series(manga));
            if (b == null) throw offline;
            return json(b).optString("title");
        }
        throw new IOException("no series " + manga + " on " + base(host));
    }

    /** The series' chapters fetched again from its source by the server (new ones found), then listed again. */
    static void refresh(Host host, Library.Series s) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", s.remote);
        query(host, "mutation($id: Int!) { fetchMangaAndChapters(input: {id: $id, fetchManga: false, fetchChapters: true}) { clientMutationId } }", v);
        chapters(host, s);
    }

    /** These chapters queued in the server's own downloads (Suwayomi's Downloads, kept on the server), the ones it has
     *  already left out → how many were queued. suwayomi.js `download` is the page's same call. */
    static int download(Host host, Library.Series s, List<String> chapters) throws IOException {
        List<Integer> ids = new java.util.ArrayList<>();
        for (String ch : chapters) if (!s.onServer.contains(idOf(ch))) ids.add(idOf(ch));
        if (ids.isEmpty()) return 0;
        Map<String, Object> v = new HashMap<>();
        v.put("ids", new JSONArray(ids));
        query(host, "mutation($ids: [Int!]!) { enqueueChapterDownloads(input: {ids: $ids}) { clientMutationId } }", v);
        return ids.size();
    }

    /** The server's update of its whole library started (it fetches each series' source in the background; new
     *  chapters show in the unread counts as it goes). */
    static void updateLibrary(Host host) throws IOException {
        query(host, "mutation { updateLibrary(input: {}) { clientMutationId } }", new HashMap<>());
    }

    /** A series' cover, kept (Kept.cover, shared with the web side). */
    static byte[] cover(Host host, int manga, String url) throws IOException {
        return kept(host).once(Kept.cover(manga), () -> Web.get(host.activity(), url.startsWith("http") ? url : base(host) + url));
    }

    /** A source's icon, kept (Kept.icon). */
    static byte[] icon(Host host, Browse.Source s) throws IOException {
        if (s.icon == null || s.icon.isEmpty()) return null;
        return kept(host).once(Kept.icon(s.id), () -> Web.get(host.activity(), s.icon.startsWith("http") ? s.icon : base(host) + s.icon));
    }

    /** Which chapters have every page kept on this device (opened or kept for offline): their ids. One listing of the
     *  cache, then one per chapter that has anything kept. Never on the UI thread. */
    static java.util.Set<Integer> keptChapters(Host host) {
        java.util.Set<Integer> out = new java.util.HashSet<>();
        Kept kept = kept(host);
        String dir = Kept.DIR.substring(0, Kept.DIR.length() - 1);
        if (!host.isDir(dir)) return out;
        for (String e : host.list(dir)) {
            String name = e.replaceAll("/+$", "");
            name = name.substring(name.lastIndexOf('/') + 1);
            if (!name.matches("\\d+")) continue;
            int id = Integer.parseInt(name);
            byte[] list = kept.readOrNull(Kept.pages(id));
            if (list == null) continue;
            try {
                int n = new JSONArray(new String(list, StandardCharsets.UTF_8)).length(), have = 0;
                for (String f : host.list(Kept.chapterDir(id))) if (f.replaceAll(".*/", "").matches("\\d+")) have++;
                if (n > 0 && have >= n) out.add(id);
            } catch (org.json.JSONException spoilt) { /* not kept */ }
        }
        return out;
    }

    /** Every page of a chapter fetched into the cache (Kept), so it opens offline; `progress` after each page. */
    static void keep(Host host, String chapter, java.util.function.IntConsumer progress) throws IOException {
        List<String> urls = pages(host, chapter);
        for (int i = 0; i < urls.size(); i++) {
            if (Thread.currentThread().isInterrupted()) return;
            page(host, chapter, i, urls.get(i));
            if (progress != null) progress.accept(i + 1);
        }
    }

    /** The kept series that lists chapter `id` (Kept.series), its chapters filled; null when none does. */
    private static Library.Series keptSeries(Host host, int id) {
        Kept kept = kept(host);
        for (String name : host.list(Kept.seriesDir())) {
            byte[] b = kept.readOrNull(Kept.seriesDir() + "/" + name.substring(name.lastIndexOf('/') + 1));
            if (b == null) continue;
            try {
                JSONObject o = json(b);
                JSONArray nodes = o.optJSONArray("nodes");
                boolean lists = false;
                for (int i = 0; nodes != null && i < nodes.length() && !lists; i++) lists = nodes.optJSONObject(i) != null && nodes.optJSONObject(i).optInt("id") == id;
                if (!lists) continue;
                Library.Series s = new Library.Series(SCHEME + o.optInt("id"), o.optString("title"));
                s.remote = o.optInt("id");
                fill(s, nodes);
                return s;
            } catch (IOException spoilt) { /* the next one */ }
        }
        return null;
    }

    /** A series' chapters in reading order (by number, then the source's order: a volume's extras share a number) and
     *  where you are in them, as the screens keep it (Library.reading's shape). */
    static void chapters(Host host, Library.Series s) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", s.remote);
        Kept kept = kept(host);
        byte[] b = kept.fresh(Kept.series(s.remote), () -> {
            JSONArray nodes = list(query(host, "query($id: Int!) { chapters(condition: {mangaId: $id}, order: [{by: CHAPTER_NUMBER}, {by: SOURCE_ORDER}]) { nodes { id name isDownloaded user { isRead lastPageRead lastReadAt } } } }", v), "chapters", "nodes");
            try { return utf8(new JSONObject().put("id", s.remote).put("title", s.title).put("nodes", nodes)); } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
        });
        fill(s, json(b).optJSONArray("nodes"));
        s.offline = kept.offline;
    }

    /** The series' chapters and where you are in them from the server's chapter nodes. */
    private static void fill(Library.Series s, JSONArray nodes) throws IOException {
        JSONObject all = new JSONObject(), reading = new JSONObject();
        long lastAt = -1;
        s.chapters.clear();
        s.onServer.clear();
        try {
            reading.put("chapters", all);
            for (int i = 0; nodes != null && i < nodes.length(); i++) {
                JSONObject c = nodes.getJSONObject(i), u = c.optJSONObject("user");
                String name = c.optString("name").replace('/', '∕'); // a name is the path's last part
                s.chapters.add(SCHEME + c.optInt("id") + "/" + name);
                // `isDownloaded`: deprecated for `user.isDownloaded` on newer servers, answered by every one
                if (c.optBoolean("isDownloaded")) s.onServer.add(c.optInt("id"));
                boolean read = u != null && u.optBoolean("isRead");
                int page = u == null ? 0 : u.optInt("lastPageRead");
                if (read || page > 0) all.put(name, new JSONObject().put("read", read).put("page", read ? 0 : page));
                long at = u == null ? 0 : Long.parseLong(u.optString("lastReadAt", "0").replaceAll("\\D", "0")); // a LongString
                if (at > lastAt && (read || page > 0)) { lastAt = at; reading.put("last", name); }
            }
        } catch (org.json.JSONException e) { throw new IOException(e.getMessage()); }
        s.reading = reading;
    }

    /** A chapter's pages: their addresses on the server. The list kept (Kept.pages) when there is one: a chapter's
     *  pages do not change, and it opens offline. */
    static List<String> pages(Host host, String chapter) throws IOException {
        Map<String, Object> v = new HashMap<>();
        v.put("id", idOf(chapter));
        byte[] b = kept(host).once(Kept.pages(idOf(chapter)), () -> {
            JSONArray got = list(query(host, "mutation($id: Int!) { fetchChapterPages(input: {chapterId: $id}) { pages } }", v), "fetchChapterPages", "pages");
            if (got.length() == 0) throw new IOException("Suwayomi lists no pages for this chapter");
            return utf8(got);
        });
        JSONArray p;
        try { p = new JSONArray(new String(b, StandardCharsets.UTF_8)); } catch (org.json.JSONException e) { throw new IOException("a kept page list is spoilt: " + e.getMessage()); }
        List<String> out = new ArrayList<>();
        for (int i = 0; p != null && i < p.length(); i++) out.add(base(host) + p.optString(i));
        return out;
    }

    /** A page's bytes, kept in the vault's cache (Kept.page, where the web side keeps it too): a page read once is
     *  there offline, and turning back costs nothing. The bytes are answered as soon as they are here and written
     *  behind (BEHIND): writing a 3 MB page into a server's vault before showing it cost seconds a page. */
    static byte[] page(Host host, String chapter, int i, String url) throws IOException { return page(host, chapter, i, url, null); }

    /** As page(), `progress` told how far the download has come (Web.get). */
    static byte[] page(Host host, String chapter, int i, String url, java.util.function.IntConsumer progress) throws IOException {
        return kept(host).once(Kept.page(idOf(chapter), i), () -> Web.get(host.activity(), url, progress), BEHIND);
    }

    /** The cache's writes of pages, one at a time behind the reader at a low priority; with a few waiting, the next one
     *  is written by the thread that fetched it (a "keep for offline" never piles up pages in memory). */
    private static final java.util.concurrent.ThreadPoolExecutor BEHIND = behind();

    private static java.util.concurrent.ThreadPoolExecutor behind() {
        java.util.concurrent.ThreadPoolExecutor e = new java.util.concurrent.ThreadPoolExecutor(1, 1, 30, java.util.concurrent.TimeUnit.SECONDS,
            new java.util.concurrent.ArrayBlockingQueue<>(4), r -> {
                Thread t = new Thread(() -> { android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND); r.run(); }, "manga-keep-behind");
                t.setDaemon(true);
                return t;
            }, new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        e.allowCoreThreadTimeOut(true);
        return e;
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
