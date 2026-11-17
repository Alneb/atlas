package org.atlas.plugins.audiobookshelf;

/** Times as the screens say them, plain Java (BookTest): the page's abs.js `clock` rules — `1:02:03` / `4:05` for a
 *  place, `5h 03m` / `42m` for a length — and how far you are in a book. */
final class Clock {
    private Clock() {}

    /** `1:02:03`, `4:05` (a place in a book). */
    static String at(double s) {
        long t = (long) Math.floor(Math.max(0, s));
        long h = t / 3600, m = (t % 3600) / 60, sec = t % 60;
        return h > 0 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", h, m, sec) : String.format(java.util.Locale.ROOT, "%d:%02d", m, sec);
    }

    /** `5h 03m`, `42m` (a length). */
    static String length(double s) {
        long t = (long) Math.floor(Math.max(0, s));
        long h = t / 3600, m = (t % 3600) / 60;
        return h > 0 ? String.format(java.util.Locale.ROOT, "%dh %02dm", h, m) : m + "m";
    }

    /** What a card says of a book's progress: "finished", "2h 10m left", "5h 03m" (never begun), "" (nothing known). */
    static String howFar(double progress, double duration, double at) {
        if (progress >= 1) return "finished";
        if (progress > 0 && duration > 0) return length(Math.max(0, duration - (at > 0 ? at : progress * duration))) + " left";
        if (progress > 0) return Math.round(progress * 100) + "%";
        return duration > 0 ? length(duration) : "";
    }

    /** What the sleep timer has left, as the state says it (ms; -1 the chapter's end; 0 off): "", "end of chapter", "14 min". */
    static String sleep(long ms) {
        if (ms == 0) return "";
        if (ms < 0) return "end of chapter";
        return Math.max(1, (ms + 59_999) / 60_000) + " min";
    }
}
