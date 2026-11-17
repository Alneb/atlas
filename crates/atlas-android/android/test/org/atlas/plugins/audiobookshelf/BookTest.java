package org.atlas.plugins.audiobookshelf;

import org.atlas.capture.Json;

import java.util.List;

/** A book's details, its play session and chapter at a time (Book), and the times as the screens say them (Clock), on
 *  answers shaped like the stand-in server's (android/test/run.sh). */
public final class BookTest {
    public static void main(String[] a) {
        Book.Details d = Book.details(Json.parse("{\"id\":\"I2\",\"mediaType\":\"book\",\"media\":{\"metadata\":{\"title\":\"Salt Roads\",\"authors\":[{\"name\":\"B. Author\"}],"
            + "\"narrators\":[\"N. One\"],\"series\":[{\"name\":\"Roads\",\"sequence\":\"1\"}],\"description\":\"<p>A <b>long</b> walk.</p>\",\"publishedYear\":\"2001\",\"genres\":[\"Travel\"]},"
            + "\"tracks\":[{\"index\":1,\"startOffset\":0,\"duration\":1800,\"contentUrl\":\"/api/items/I2/file/1\"},{\"index\":2,\"startOffset\":1800,\"duration\":1200,\"contentUrl\":\"/api/items/I2/file/2\"}],"
            + "\"chapters\":[{\"start\":0,\"end\":1000,\"title\":\"One\"},{\"start\":1000,\"end\":3000,\"title\":\"Two\"}],\"ebookFile\":{\"ino\":\"9\",\"ebookFormat\":\"pdf\"}}}"));
        CardsTest.eq("details", "Salt Roads|B. Author|N. One|Roads #1|A long walk.|2001|Travel", String.join("|", d.title, d.author, d.narrator, d.series, d.description, d.year, d.genres));
        CardsTest.eq("the length from the tracks when none is given", "3000.0", d.duration);
        CardsTest.eq("chapters and the ebook", "2 true", d.chapters.size() + " " + d.ebook);

        Book.Session s = Book.session(Json.parse("{\"id\":\"S-I1\",\"libraryItemId\":\"I1\",\"duration\":1,\"currentTime\":0.25,\"displayTitle\":\"The Quiet Hour\",\"displayAuthor\":\"A. Writer\","
            + "\"mediaMetadata\":{\"title\":\"The Quiet Hour\",\"authorName\":\"A. Writer\",\"narratorName\":\"N. Reader\"},"
            + "\"audioTracks\":[{\"contentUrl\":\"/api/items/I1/file/2\",\"startOffset\":1,\"duration\":1},{\"contentUrl\":\"/api/items/I1/file/1\",\"startOffset\":0,\"duration\":1}],\"chapters\":[{\"start\":0,\"end\":1,\"title\":\"One\"}]}"), false);
        CardsTest.eq("a session", "S-I1 0.25 The Quiet Hour|A. Writer · read by N. Reader", s.id + " " + s.at + " " + s.title + "|" + s.author);
        CardsTest.eq("its tracks in the book's order", "/api/items/I1/file/1 /api/items/I1/file/2", s.tracks.get(0).contentUrl + " " + s.tracks.get(1).contentUrl);
        Book.Session e = Book.session(Json.parse("{\"id\":\"S-E1\",\"episodeId\":\"E1\",\"currentTime\":0,\"displayTitle\":\"First light\",\"displayAuthor\":\"Night Shift\",\"audioTracks\":[],\"chapters\":[]}"), true);
        CardsTest.eq("an episode's session", "First light|Night Shift", e.title + "|" + e.author);

        List<Book.Chapter> ch = d.chapters;
        CardsTest.eq("chapter at a time", "0 0 1 1 -1 -1", Book.chapterAt(ch, 0) + " " + Book.chapterAt(ch, 999) + " " + Book.chapterAt(ch, 1000) + " " + Book.chapterAt(ch, 2999) + " " + Book.chapterAt(ch, 3000) + " " + Book.chapterAt(ch, -1));

        CardsTest.eq("a place", "0:05 4:05 1:02:03", Clock.at(5.9) + " " + Clock.at(245) + " " + Clock.at(3723));
        CardsTest.eq("a length", "42m 5h 03m 0m", Clock.length(42 * 60) + " " + Clock.length(5 * 3600 + 180) + " " + Clock.length(-3));
        CardsTest.eq("how far", "finished|1h 00m left|5h 03m|25%|", Clock.howFar(1, 100, 0) + "|" + Clock.howFar(0.5, 7200, 3600) + "|" + Clock.howFar(-1, 5 * 3600 + 180, 0) + "|" + Clock.howFar(0.25, 0, 0) + "|" + Clock.howFar(-1, 0, 0));
        CardsTest.eq("the sleep timer", "|end of chapter|14 min|1 min", Clock.sleep(0) + "|" + Clock.sleep(-1) + "|" + Clock.sleep(13 * 60_000 + 5) + "|" + Clock.sleep(1));

        State p = State.of("{\"plugin\":\"audiobookshelf\",\"key\":{\"item\":\"I1\",\"session\":\"S-I1\",\"device\":\"atlas-x\"},\"title\":\"The Quiet Hour\",\"author\":\"A. Writer\",\"cover\":\"\","
            + "\"chapters\":[{\"start\":0,\"end\":1,\"title\":\"One\"}],\"duration\":1,\"at\":0.5,\"playing\":true,\"speed\":1.25,\"chapter\":0,\"sleep\":-1,\"error\":\"\"}");
        CardsTest.eq("the player's state", "true true false One 1.25× end of chapter", p.ours() + " " + p.plays("I1") + " " + p.plays("I2") + " " + p.chapterTitle() + " " + State.speedLabel(p.speed) + " " + Clock.sleep(p.sleep));
        CardsTest.eq("nothing loaded", "null null", State.of("null") + " " + State.of(""));
        CardsTest.eq("speeds step and wrap", "1.1 0.8 1.0", State.nextSpeed(1) + " " + State.nextSpeed(2.5) + " " + State.nextSpeed(0.8));
        CardsTest.eq("speed labels", "1× 0.8×", State.speedLabel(1) + " " + State.speedLabel(0.8));
        CardsTest.done("BookTest");
    }
}
