package org.atlas.capture;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** An item's time as the phone's player (MediaService) plays it: its tracks laid over the item by their start, its
 *  chapters — the same rules as the page's player (ui/src/lib/player-time.ts), plain Java so they are tested on the
 *  desktop JVM (android/test, PlayerTimelineTest, with the cases of ui/tests/player.spec.ts). */
final class PlayerTimeline {
    static final class Track {
        final String src;
        final double start, duration;
        Track(String src, double start, double duration) { this.src = src; this.start = start; this.duration = duration; }
    }

    static final class Chapter {
        final double start, end;
        final String title;
        Chapter(double start, double end, String title) { this.start = start; this.end = end; this.title = title; }
    }

    /** Where time t is: track i, `offset` seconds into it. */
    static final class Place {
        final int i;
        final double offset;
        Place(int i, double offset) { this.i = i; this.offset = offset; }
        @Override public String toString() { return i + "@" + offset; }
    }

    final List<Track> tracks;
    final List<Chapter> chapters;

    PlayerTimeline(List<Track> tracks, List<Chapter> chapters) {
        List<Track> sorted = new ArrayList<>(tracks);
        sorted.sort((p, q) -> Double.compare(p.start, q.start));
        this.tracks = Collections.unmodifiableList(sorted);
        this.chapters = Collections.unmodifiableList(new ArrayList<>(chapters));
    }

    /** The item's length: the end of its last track. */
    double duration() {
        double d = 0;
        for (Track t : tracks) d = Math.max(d, t.start + t.duration);
        return d;
    }

    /** The track holding time t and where in it; before the first, its start; past the end, the last track's end. */
    Place placeOf(double t) {
        int i = -1;
        for (int k = 0; k < tracks.size(); k++) if (t >= tracks.get(k).start && t < tracks.get(k).start + tracks.get(k).duration) { i = k; break; }
        if (i < 0) i = tracks.isEmpty() || t < tracks.get(0).start ? 0 : tracks.size() - 1;
        double start = tracks.isEmpty() ? 0 : tracks.get(i).start;
        return new Place(i, Math.max(0, t - start));
    }

    /** The chapter time t is in, -1 when none. */
    int chapterAt(double t) {
        for (int k = 0; k < chapters.size(); k++) if (t >= chapters.get(k).start && t < chapters.get(k).end) return k;
        return -1;
    }

    /** Where "previous" goes: the chapter's start, or the one before when within its first 3 s; NaN without chapters. */
    double previousChapter(double t) {
        int c = chapterAt(t);
        if (c < 0) return Double.NaN;
        return t - chapters.get(c).start > 3 || c == 0 ? chapters.get(c).start : chapters.get(c - 1).start;
    }

    /** The next chapter's start; NaN in the last one or without chapters. */
    double nextChapter(double t) {
        int c = chapterAt(t);
        return c >= 0 && c + 1 < chapters.size() ? chapters.get(c + 1).start : Double.NaN;
    }
}
