package org.atlas.plugins.audiobookshelf;

import org.atlas.capture.Json;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * One book as its screen and the player need it, plain Java (BookTest): an expanded item (`/api/items/<id>?expanded=1`:
 * details, chapters, the ebook it carries), a play session (`POST /api/items/<id>/play`: its id, tracks laid over the
 * book's time, chapters, where the server says you are), and which chapter a time falls in.
 */
final class Book {
    private Book() {}

    static final class Chapter {
        final double start, end;
        final String title;
        Chapter(double start, double end, String title) { this.start = start; this.end = end; this.title = title; }
    }

    static final class Track {
        /** The server's address of the file (`/api/items/<id>/file/<ino>`), made playable through the core. */
        final String contentUrl;
        final double start, duration;
        Track(String contentUrl, double start, double duration) { this.contentUrl = contentUrl; this.start = start; this.duration = duration; }
    }

    /** A book's details, for its screen. */
    static final class Details {
        String id = "", title = "", subtitle = "", author = "", narrator = "", series = "", description = "", year = "", publisher = "", genres = "";
        double duration;
        boolean ebook, podcast;
        final List<Chapter> chapters = new ArrayList<>();
    }

    static List<Chapter> chapters(Object o) {
        List<Chapter> out = new ArrayList<>();
        for (Object c : Json.arr(o, "chapters")) out.add(new Chapter(Cards.dbl(c, "start", 0), Cards.dbl(c, "end", 0), Cards.text(c, "title")));
        return out;
    }

    /** An expanded item → its details. */
    @SuppressWarnings("unchecked")
    static Details details(Object item) {
        Details d = new Details();
        Map<String, Object> media = Json.obj(item, "media"), m = Json.obj(media, "metadata");
        d.id = Cards.text(item, "id");
        d.podcast = "podcast".equals(Cards.text(item, "mediaType"));
        d.title = Cards.text(m, "title");
        if (d.title.isEmpty()) d.title = d.id;
        d.subtitle = Cards.text(m, "subtitle");
        Object au = m.get("authors") != null ? m.get("authors") : m.get("authorName") != null ? m.get("authorName") : m.get("author");
        d.author = Cards.names(au);
        d.narrator = Cards.names(m.get("narrators") != null ? m.get("narrators") : m.get("narratorName"));
        d.series = Cards.seriesLine(m);
        d.description = Cards.text(m, "description").replaceAll("<[^>]+>", "").trim(); // the server keeps it as HTML
        d.year = Cards.text(m, "publishedYear");
        d.publisher = Cards.text(m, "publisher");
        Object g = m.get("genres");
        d.genres = g instanceof List ? Cards.names(g) : "";
        d.duration = Cards.dbl(media, "duration", 0);
        d.chapters.addAll(chapters(media));
        if (d.duration == 0) for (Object t : Json.arr(media, "tracks")) d.duration += Cards.dbl(t, "duration", 0);
        d.ebook = media.get("ebookFile") != null || !Cards.text(media, "ebookFormat").isEmpty();
        return d;
    }

    /** A play session the server opened. */
    static final class Session {
        String id = "", title = "", author = "";
        double at;
        final List<Track> tracks = new ArrayList<>();
        final List<Chapter> chapters = new ArrayList<>();
    }

    /** `POST /api/items/<id>/play[/<episode>]`'s answer → the session; `episode`: the author line is the podcast's. */
    static Session session(Object answer, boolean episode) {
        Session s = new Session();
        s.id = Cards.text(answer, "id");
        s.at = Cards.dbl(answer, "currentTime", 0);
        for (Object t : Json.arr(answer, "audioTracks")) s.tracks.add(new Track(Cards.text(t, "contentUrl"), Cards.dbl(t, "startOffset", 0), Cards.dbl(t, "duration", 0)));
        s.tracks.sort((p, q) -> Double.compare(p.start, q.start));
        s.chapters.addAll(chapters(answer));
        Map<String, Object> m = Json.obj(Json.obj(Json.obj(answer, "libraryItem"), "media"), "metadata");
        if (m.isEmpty()) m = Json.obj(answer, "mediaMetadata");
        String title = Cards.text(m, "title"), display = Cards.text(answer, "displayTitle");
        s.title = episode || title.isEmpty() ? display : title;
        if (episode) s.author = Cards.text(answer, "displayAuthor").isEmpty() ? title : Cards.text(answer, "displayAuthor");
        else {
            String who = Cards.text(m, "authorName");
            if (who.isEmpty()) who = Cards.text(answer, "displayAuthor");
            String reader = Cards.text(m, "narratorName");
            s.author = who + (reader.isEmpty() ? "" : (who.isEmpty() ? "" : " · ") + "read by " + reader);
        }
        return s;
    }

    /** The chapter `t` falls in (its index), or -1: the last whose start is at or before t, if t is before its end. */
    static int chapterAt(List<Chapter> chapters, double t) {
        for (int i = chapters.size() - 1; i >= 0; i--) {
            Chapter c = chapters.get(i);
            if (t >= c.start) return t < c.end || i == chapters.size() - 1 && c.end <= c.start ? i : -1;
        }
        return -1;
    }
}
