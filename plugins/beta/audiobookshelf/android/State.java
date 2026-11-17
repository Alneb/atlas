package org.atlas.plugins.audiobookshelf;

import org.atlas.capture.Json;

import java.util.ArrayList;
import java.util.List;

/** The app's player as MediaService says it (the page's PlayerState JSON), plain Java (BookTest): what plays, where,
 *  its chapters, speed, sleep, error — and whether it is this plugin's. Null for "null" (nothing loaded). */
final class State {
    String plugin = "", item = "", episode = "", title = "", author = "", error = "";
    double at, duration, speed = 1;
    boolean playing;
    int chapter = -1;
    /** ms left on the sleep timer; -1 the chapter's end; 0 off. */
    long sleep;
    final List<Book.Chapter> chapters = new ArrayList<>();

    static State of(String json) {
        if (json == null || json.trim().isEmpty() || "null".equals(json.trim())) return null;
        Object o;
        try { o = Json.parse(json); } catch (IllegalArgumentException e) { return null; }
        if (!(o instanceof java.util.Map)) return null;
        State s = new State();
        s.plugin = Cards.text(o, "plugin");
        Object key = Json.obj(o, "key");
        s.item = Cards.text(key, "item");
        s.episode = Cards.text(key, "episode");
        s.title = Cards.text(o, "title");
        s.author = Cards.text(o, "author");
        s.error = Cards.text(o, "error");
        s.at = Cards.dbl(o, "at", 0);
        s.duration = Cards.dbl(o, "duration", 0);
        s.speed = Cards.dbl(o, "speed", 1);
        s.playing = Json.yes(o, "playing");
        s.chapter = (int) Json.num(o, "chapter", -1);
        s.sleep = Json.num(o, "sleep", 0);
        s.chapters.addAll(Book.chapters(o));
        return s;
    }

    /** It plays something of this plugin. */
    boolean ours() { return "audiobookshelf".equals(plugin); }

    /** It plays this book (an episode of nothing). */
    boolean plays(String item) { return ours() && item.equals(this.item) && episode.isEmpty(); }

    /** The chapter's title, or "". */
    String chapterTitle() { return chapter >= 0 && chapter < chapters.size() ? chapters.get(chapter).title : ""; }

    /** The next speed in the list after the one playing (wrapping), as the button steps through them. */
    static double nextSpeed(double now) {
        for (double s : SPEEDS) if (s > now + 1e-6) return s;
        return SPEEDS[0];
    }

    static final double[] SPEEDS = { 0.8, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5 };

    /** `1.25×`, `1×`. */
    static String speedLabel(double s) { return (s == Math.floor(s) ? String.valueOf((long) s) : String.valueOf(s)) + "×"; }
}
