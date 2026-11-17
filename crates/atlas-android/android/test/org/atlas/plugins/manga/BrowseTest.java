package org.atlas.plugins.manga;

import org.atlas.capture.Json;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

/** Browse (the server's sources, a source's pages, a series' details, the library's membership and categories) against
 *  cut-down Suwayomi answers in the shape its GraphQL gives them, and the library's tabs in the server's category order
 *  (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class BrowseTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want == null ? got == null : want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) throws Exception {
        json();
        answers();
        sources();
        pages();
        paging();
        details();
        categories();
        System.out.println("BrowseTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }

    static void json() {
        Object o = Json.parse("{\"a\": [1, 2.5, -3e2, true, null, \"x\\\"y\\u00e9\\n\"], \"b\": {\"c\": \"7623458762345876234\"}}");
        eq("an array's values", "[1, 2.5, -300.0, true, null, x\"yé\n]", Json.arr(o, "a").toString());
        eq("a LongString read as a long", 7623458762345876234L, Json.num(Json.obj(o, "b"), "c", 0));
        eq("a missing key", "or", Json.str(o, "zz", "or"));
        eq("an empty object and array", "{}[]", Json.parse("{}").toString() + Json.parse(" [ ] "));
        boolean threw = false;
        try { Json.parse("{\"a\": 1} x"); } catch (IllegalArgumentException e) { threw = true; }
        eq("text after the value is not JSON", true, threw);
    }

    static void answers() throws Exception {
        eq("data", "{x=1}", Browse.data("{\"data\": {\"x\": 1}}").toString());
        String said = null;
        try { Browse.data("{\"data\": null, \"errors\": [{\"message\": \"Source not installed: 42\"}]}"); } catch (Browse.Refused r) { said = r.getMessage(); }
        eq("the server's own error, as it said it", "Source not installed: 42", said);
        boolean io = false;
        try { Browse.data("<html>sign in</html>"); } catch (Browse.Refused r) { io = false; } catch (IOException e) { io = true; }
        eq("a page that is not JSON (a sign-in in front) is a failure, not the server's error", true, io);
        Map<String, Object> v = Browse.fetchVars("1998944621602463790", Browse.Type.SEARCH, 2, "  one piece ");
        eq("a search's variables: the source as text, the words trimmed", "1998944621602463790|SEARCH|2|one piece", v.get("source") + "|" + v.get("type") + "|" + v.get("page") + "|" + v.get("query"));
        eq("popular has no query", false, Browse.fetchVars("1", Browse.Type.POPULAR, 1, "x").containsKey("query"));
        eq("the fetch asks fetchSourceManga with its input", true, Browse.FETCH.contains("fetchSourceManga(input: {source: $source, type: $type, page: $page, query: $query})"));
    }

    static final String SOURCES = "{\"data\":{\"sources\":{\"nodes\":["
        + "{\"id\":\"0\",\"name\":\"Local source\",\"lang\":\"localsourcelang\",\"displayName\":\"Local source\",\"iconUrl\":\"/api/v1/extension/icon/local\",\"isNsfw\":false,\"supportsLatest\":true},"
        + "{\"id\":\"2499283573021220255\",\"name\":\"MangaDex\",\"lang\":\"en\",\"displayName\":\"MangaDex (EN)\",\"iconUrl\":\"/api/v1/extension/icon/a.apk\",\"isNsfw\":false,\"supportsLatest\":true},"
        + "{\"id\":\"1411768577036936240\",\"name\":\"MangaDex\",\"lang\":\"es\",\"displayName\":\"MangaDex (ES)\",\"iconUrl\":null,\"isNsfw\":false,\"supportsLatest\":true},"
        + "{\"id\":\"3\",\"name\":\"Comick\",\"lang\":\"all\",\"displayName\":\"Comick (ALL)\",\"iconUrl\":null,\"isNsfw\":true,\"supportsLatest\":false},"
        + "{\"id\":\"4\",\"name\":\"Asura\",\"lang\":\"en\",\"displayName\":\"Asura (EN)\",\"iconUrl\":null,\"isNsfw\":false,\"supportsLatest\":true}"
        + "]}}}";

    static void sources() throws Exception {
        List<Browse.Source> s = Browse.sources(Browse.data(SOURCES));
        eq("every source", 5, s.size());
        eq("a source id beyond an int, kept as text", "2499283573021220255", s.get(1).id);
        eq("latest and 18+ read", "true false true", s.get(1).latest + " " + s.get(3).latest + " " + s.get(3).nsfw);
        eq("the phone's language first, then all, the others, the server's own last",
            "[English, Asura (EN), MangaDex (EN), All languages, Comick (ALL), Spanish, MangaDex (ES), On the server, Local source]",
            Browse.rows(s, null, "en").toString());
        eq("a phone in Spanish", "Spanish", Browse.rows(s, "", "es").get(0));
        eq("a filter on the name", "[English, MangaDex (EN), Spanish, MangaDex (ES)]", Browse.rows(s, "dex", "en").toString());
        eq("a regional code is its language", "Portuguese (Brazil)", Browse.language("pt-BR"));
    }

    static String page(boolean next, int... ids) {
        StringBuilder b = new StringBuilder("{\"data\":{\"fetchSourceManga\":{\"hasNextPage\":" + next + ",\"mangas\":[");
        for (int i = 0; i < ids.length; i++) {
            if (i > 0) b.append(',');
            b.append("{\"id\":").append(ids[i]).append(",\"title\":\"S").append(ids[i]).append("\",\"thumbnailUrl\":\"/api/v1/manga/").append(ids[i])
                .append("/thumbnail\",\"user\":{\"inLibrary\":").append(ids[i] == 7).append("}}");
        }
        return b.append("]}}}").toString();
    }

    static void pages() throws Exception {
        Browse.Page p = Browse.page(Browse.data(page(true, 5, 7)));
        eq("a page's series", "[S5, S7]", p.mangas.toString());
        eq("one already in the library", "false true", p.mangas.get(0).inLibrary + " " + p.mangas.get(1).inLibrary);
        eq("its cover and key", "/api/v1/manga/7/thumbnail suwayomi:7", p.mangas.get(1).cover + " " + p.mangas.get(1).key());
        eq("more pages", true, p.hasNext);
    }

    static void paging() throws Exception {
        Browse.Paging g = new Browse.Paging();
        g.reset(Browse.Type.POPULAR, "");
        eq("an empty grid wants its first page", true, g.wants(-1));
        int[] t1 = g.ask();
        eq("page 1 asked", 1, t1[1]);
        eq("not twice at once", false, g.wants(100));
        eq("a page added", 3, g.add(t1, Browse.page(Browse.data(page(true, 1, 2, 3)))));
        eq("near the end: the next", true, g.wants(0));
        int[] t2 = g.ask();
        eq("a series listed again on the next page shown once", 1, g.add(t2, Browse.page(Browse.data(page(true, 3, 4)))));
        eq("the list", "[S1, S2, S3, S4]", g.items.toString());
        int[] t3 = g.ask();
        eq("a page with nothing new ends it (a source repeating itself)", 0, g.add(t3, Browse.page(Browse.data(page(true, 4)))));
        eq("no more", false, g.wants(0));

        g.reset(Browse.Type.LATEST, "");
        int[] t4 = g.ask();
        g.reset(Browse.Type.SEARCH, "berserk");
        eq("an answer to the list before is dropped", -1, g.add(t4, Browse.page(Browse.data(page(true, 9)))));
        eq("and the new list is still empty, wanting its first page", "[] true", g.items + " " + g.wants(-1));
        int[] t5 = g.ask();
        g.failed(t5);
        eq("a failed page may be asked again", true, g.wants(-1));
        eq("the last page says so", 2, g.add(g.ask(), Browse.page(Browse.data(page(false, 1, 2)))));
        eq("then nothing more", false, g.wants(0));
        g.reset(Browse.Type.SEARCH, "  ");
        eq("a search with no words asks nothing", false, g.wants(-1));
    }

    static final String MANGA = "{\"id\":12,\"title\":\"Planetes\",\"thumbnailUrl\":\"/api/v1/manga/12/thumbnail\",\"author\":\"Makoto Yukimura\","
        + "\"artist\":\"Makoto Yukimura\",\"description\":\" In 2075… \",\"genre\":[\"Sci-Fi\",\"\",\"Drama\"],\"status\":\"COMPLETED\",\"realUrl\":\"https://example.org/t/12\","
        + "\"initialized\":%s,\"source\":{\"displayName\":\"MangaDex (EN)\"},\"user\":{\"inLibrary\":%s},"
        + "\"categories\":{\"nodes\":[{\"id\":0,\"name\":\"Default\",\"default\":true},{\"id\":2,\"name\":\"Weekly\",\"default\":false}]},\"chapters\":{\"totalCount\":%d}}";

    static void details() throws Exception {
        Browse.Details d = Browse.details(Browse.data("{\"data\":{\"manga\":" + String.format(MANGA, "true", "true", 24) + "}}"));
        eq("the series", "12 Planetes 24", d.id + " " + d.title + " " + d.chapters);
        eq("genres without the empty one", "[Sci-Fi, Drama]", d.genres.toString());
        eq("the description trimmed", "In 2075…", d.description);
        eq("in the library, in its categories but the default", "true [2]", d.inLibrary + " " + d.categories);
        eq("the byline: the author once, the status, the source", "Makoto Yukimura · Completed · MangaDex (EN)", Browse.byline(d));
        eq("a series the server has whole: nothing to fetch", null, Browse.fillVars(d));
        Browse.Details found = Browse.details(Browse.data("{\"data\":{\"manga\":" + String.format(MANGA, "false", "false", 0) + "}}"));
        Map<String, Object> f = Browse.fillVars(found);
        eq("one a listing found: its details and chapters fetched", "12 true true", f.get("id") + " " + f.get("manga") + " " + f.get("chapters"));
        Browse.Details filled = Browse.details(Browse.data("{\"data\":{\"fetchMangaAndChapters\":{\"manga\":" + String.format(MANGA, "true", "false", 30) + "}}}"));
        eq("the fetched answer read the same", "12 30 false", filled.id + " " + filled.chapters + " " + filled.inLibrary);
        eq("statuses in words", "On hiatus|Publishing finished|", Browse.status("ON_HIATUS") + "|" + Browse.status("PUBLISHING_FINISHED") + "|" + Browse.status("UNKNOWN"));
        Map<String, Object> v = Browse.inLibraryVars(12, true);
        eq("add to library", "12 true", v.get("id") + " " + v.get("inLibrary"));
    }

    static void categories() throws Exception {
        // the shape a server answers (ids, names and order as one had them)
        String answer = "{\"data\":{\"categories\":{\"nodes\":[{\"id\":0,\"name\":\"Default\",\"order\":0,\"default\":true},{\"id\":1,\"name\":\"Local\",\"order\":2,\"default\":false},"
            + "{\"id\":2,\"name\":\"Weekly\",\"order\":1,\"default\":false},{\"id\":4,\"name\":\"Read\",\"order\":7,\"default\":false},{\"id\":3,\"name\":\"Later\",\"order\":3,\"default\":false}]}}}";
        List<Browse.Category> cats = Browse.categories(Browse.data(answer));
        eq("by the server's order, the default left out", "[Weekly, Local, Later, Read]", cats.toString());
        eq("the kept library's categories read the same", "[Weekly, Local, Later, Read]",
            Browse.keptCategories("{\"nodes\":[],\"categories\":" + answer.substring(answer.indexOf("{\"nodes\""), answer.length() - 2) + "}").toString());
        eq("an older kept library has none", "[]", Browse.keptCategories("{\"nodes\":[]}").toString());
        eq("add and remove", "[[3, 5], [1]]", Browse.change(new HashSet<>(Arrays.asList(1, 2)), new HashSet<>(Arrays.asList(2, 5, 3))).toString());

        List<Shelf.Item> lib = new ArrayList<>();
        for (String[] s : new String[][] { { "A", "Read" }, { "B", "Weekly" }, { "C", "Local" }, { "D", "Zeta" }, { "E" } }) {
            Shelf.Item i = new Shelf.Item("suwayomi:" + s[0], s[0], Shelf.Origin.SERVER);
            if (s.length > 1) i.categories.add(s[1]);
            lib.add(i);
        }
        eq("the library's tabs in the server's order, Default first, one it does not name after",
            "[Default, Weekly, Local, Read, Zeta]", Shelf.tabs(lib, "S", Browse.names(cats)).toString());
        eq("without an order, by name as before", "[Default, Local, Read, Weekly, Zeta]", Shelf.tabs(lib, "S").toString());
    }
}
