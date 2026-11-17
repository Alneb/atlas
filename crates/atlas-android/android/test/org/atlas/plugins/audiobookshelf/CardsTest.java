package org.atlas.plugins.audiobookshelf;

import org.atlas.capture.Json;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** The native screens' reading of Audiobookshelf's answers (Cards), on cut-down copies shaped like the stand-in server's
 *  (ui/tests/private/audiobookshelf-client.spec.ts) and helper.test.ts's (android/test/run.sh). A failed check prints
 *  what it got and the run exits 1. */
public final class CardsTest {
    private static int failed, ran;

    static void eq(String what, Object want, Object got) {
        ran++;
        if (String.valueOf(want).equals(String.valueOf(got))) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    static final String BOOK = "{\"id\":\"I1\",\"mediaType\":\"book\",\"media\":{\"duration\":3600,\"numTracks\":1,\"metadata\":{\"title\":\"The Quiet Hour\",\"authorName\":\"A. Writer\",\"narratorName\":\"N. Reader\",\"seriesName\":\"Hours #1\"}}}";
    static final String BOOK2 = "{\"id\":\"I2\",\"mediaType\":\"book\",\"media\":{\"duration\":7200,\"ebookFormat\":\"epub\",\"metadata\":{\"title\":\"Salt Roads\",\"authorName\":\"B. Author\"}}}";
    static final String SHOW = "{\"id\":\"P1\",\"mediaType\":\"podcast\",\"media\":{\"numEpisodes\":2,\"metadata\":{\"title\":\"Night Shift\",\"author\":\"Radio Example\"}}}";
    static final String EP1 = "{\"id\":\"E1\",\"index\":1,\"title\":\"First light\",\"publishedAt\":1700000000000,\"duration\":60}";
    static final String EP2 = "{\"id\":\"E2\",\"index\":2,\"title\":\"Second wind\",\"publishedAt\":1700086400000,\"duration\":90}";
    static final String ME = "{\"mediaProgress\":[{\"libraryItemId\":\"I1\",\"progress\":0.25,\"currentTime\":900,\"isFinished\":false,\"lastUpdate\":1},"
        + "{\"libraryItemId\":\"P1\",\"episodeId\":\"E1\",\"progress\":1,\"currentTime\":60,\"isFinished\":true,\"lastUpdate\":2}],"
        + "\"bookmarks\":[{\"libraryItemId\":\"I1\",\"time\":1200,\"title\":\"later\"},{\"libraryItemId\":\"I1\",\"time\":30,\"title\":\"start\"},{\"libraryItemId\":\"I2\",\"time\":5,\"title\":\"other\"}]}";

    static List<String> names(List<Cards.Card> cards) {
        List<String> out = new ArrayList<>();
        for (Cards.Card c : cards) out.add(c.toString());
        return out;
    }

    static List<String> labels(List<Cards.Shelf> shelves) {
        List<String> out = new ArrayList<>();
        for (Cards.Shelf s : shelves) out.add(s.label + "=" + names(s.cards));
        return out;
    }

    public static void main(String[] a) {
        Map<String, Object> progress = Cards.progressMap(Json.parse(ME));

        Cards.Card b = Cards.cardOf(Json.parse(BOOK), progress, null);
        eq("a book's card", "book:I1 The Quiet Hour", b);
        eq("its people and series", "A. Writer|N. Reader|Hours #1", b.author + "|" + b.narrator + "|" + b.series);
        eq("its progress", "0.25 900.0", b.progress + " " + b.at);
        eq("its line", "A. Writer · 45m left", b.detail());
        eq("an ebook carried", true, Cards.cardOf(Json.parse(BOOK2), progress, null).ebook);
        eq("never begun: its length", "B. Author · 2h 00m", Cards.cardOf(Json.parse(BOOK2), progress, null).detail());
        // the expanded form: authors as objects, series as a list
        Cards.Card x = Cards.cardOf(Json.parse("{\"id\":\"I3\",\"media\":{\"metadata\":{\"title\":\"T\",\"authors\":[{\"name\":\"X\"},{\"name\":\"Y\"}],\"series\":[{\"name\":\"S\",\"sequence\":\"2\"}]}}}"), progress, null);
        eq("expanded names and series", "X, Y|S #2", x.author + "|" + x.series);
        Cards.Card show = Cards.cardOf(Json.parse(SHOW), progress, null);
        eq("a podcast", "show:P1 Night Shift|2|Radio Example · 2 episodes", show + "|" + show.count + "|" + show.detail());

        String personalized = "[{\"id\":\"continue-listening\",\"label\":\"Continue Listening\",\"type\":\"book\",\"entities\":[" + BOOK + "]},"
            + "{\"id\":\"recent-series\",\"label\":\"Recent Series\",\"type\":\"series\",\"entities\":[{\"id\":\"S1\",\"name\":\"Hours\",\"books\":[" + BOOK + "]}]},"
            + "{\"id\":\"authors\",\"label\":\"Authors\",\"type\":\"authors\",\"entities\":[{\"id\":\"A1\",\"name\":\"A. Writer\"}]},"
            + "{\"id\":\"empty\",\"label\":\"Empty\",\"type\":\"book\",\"entities\":[]},"
            + "{\"id\":\"newest-episodes\",\"label\":\"Newest Episodes\",\"type\":\"episode\",\"entities\":[" + SHOW.replace("}}}", "}},\"recentEpisode\":" + EP2 + "}") + "]}]";
        List<Cards.Shelf> shelves = Cards.shelvesOf(Json.parse(personalized), progress);
        eq("the home's shelves, authors and empty ones left out", "[Continue Listening=[book:I1 The Quiet Hour], Recent Series=[series:S1 Hours], Newest Episodes=[episode:P1/E2 Second wind]]", labels(shelves));
        eq("a series' books inside, its cover its first book's", "1 book|I1", shelves.get(1).cards.get(0).detail() + "|" + shelves.get(1).cards.get(0).coverItem());
        eq("an episode's line: its podcast", "Night Shift · 1m", shelves.get(2).cards.get(0).detail());

        eq("collections, empty ones left out", "[collection:C1 Desert]", names(Cards.collectionsOf(Json.parse("{\"results\":[{\"id\":\"C1\",\"name\":\"Desert\",\"books\":[" + BOOK2 + "]},{\"id\":\"C2\",\"name\":\"None\",\"books\":[]}]}"), progress)));
        List<Cards.Card> lists = Cards.playlistsOf(Json.parse("{\"results\":[{\"id\":\"PL1\",\"name\":\"Commute\",\"items\":[{\"libraryItemId\":\"I1\",\"libraryItem\":" + BOOK + "},{\"libraryItemId\":\"P1\",\"libraryItem\":" + SHOW + ",\"episode\":" + EP1 + "},{\"libraryItemId\":\"gone\"}]}]}"), progress);
        eq("a playlist's books and episodes in order", "[book:I1 The Quiet Hour, episode:P1/E1 First light]", names(lists.get(0).cards));
        eq("an episode finished in a playlist", "1.0", lists.get(0).cards.get(1).progress);
        eq("the library's series", "[series:S1 Hours]", names(Cards.seriesOf(Json.parse("{\"results\":[{\"id\":\"S1\",\"name\":\"Hours\",\"books\":[" + BOOK + "]}],\"total\":1}"), progress)));
        List<Cards.Card> authors = Cards.authorsOf(Json.parse("{\"authors\":[{\"id\":\"A2\",\"name\":\"B. Author\",\"numBooks\":3}]}"));
        eq("authors with their counts", "[author:A2 B. Author] 3 books", names(authors) + " " + authors.get(0).detail());
        eq("an author's books", "[book:I2 Salt Roads]", names(Cards.authorBooks(Json.parse("{\"id\":\"A2\",\"name\":\"B. Author\",\"libraryItems\":[" + BOOK2 + "]}"), progress)));
        long[] total = { 0 };
        eq("a library's items and total", "[book:I1 The Quiet Hour, book:I2 Salt Roads] 2", names(Cards.itemsOf(Json.parse("{\"results\":[" + BOOK + "," + BOOK2 + "],\"total\":2}"), progress, total)) + " " + total[0]);

        List<Cards.Shelf> hits = Cards.hitsOf(Json.parse("{\"book\":[{\"libraryItem\":" + BOOK2 + "}],\"series\":[{\"series\":{\"id\":\"S1\",\"name\":\"Hours\"},\"books\":[" + BOOK + "]}],\"authors\":[{\"id\":\"A2\",\"name\":\"B. Author\",\"numBooks\":1}]}"), progress);
        eq("search hits as sections", "[Books and podcasts=[book:I2 Salt Roads], Series=[series:S1 Hours], Authors=[author:A2 B. Author]]", labels(hits));
        List<Cards.Shelf> two = Cards.merged(List.of(hits, Cards.hitsOf(Json.parse("{\"podcast\":[{\"libraryItem\":" + SHOW + "}]}"), progress)));
        eq("two libraries' hits made one", "[Books and podcasts=[book:I2 Salt Roads, show:P1 Night Shift], Series=[series:S1 Hours], Authors=[author:A2 B. Author]]", labels(two));
        eq("nothing found", "[]", labels(Cards.hitsOf(Json.parse("{\"book\":[],\"series\":[],\"authors\":[]}"), progress)));

        List<Cards.Card> eps = Cards.episodesOf(Json.parse(SHOW.replace("\"numEpisodes\":2", "\"episodes\":[" + EP1 + "," + EP2 + "]")), progress);
        eq("episodes newest first", "[episode:P1/E2 Second wind, episode:P1/E1 First light]", names(eps));
        eq("an episode's line", "Night Shift · finished", eps.get(1).detail());

        List<Cards.Mark> marks = Cards.bookmarksOf(Json.parse(ME), "I1");
        eq("a book's bookmarks in order", "30.0 start, 1200.0 later", marks.get(0).time + " " + marks.get(0).title + ", " + marks.get(1).time + " " + marks.get(1).title);
        eq("the filter: title, author, series", "[book:I1 The Quiet Hour]", names(Cards.filter(List.of(b, Cards.cardOf(Json.parse(BOOK2), progress, null)), "hours")));

        done("CardsTest");
    }

    static void done(String name) {
        System.out.println(name + ": " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
