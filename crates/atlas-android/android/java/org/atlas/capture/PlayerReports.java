package org.atlas.capture;

/** The phone player's reports to the plugin (the core's `/api/plugins/<id>/media/progress`, the plugin's `[media]
 *  progress`): the time listened by the clock, kept until a report is taken (a failed one loses nothing), and the item's
 *  key, which a report's answer may replace (Audiobookshelf: a new play session). The same rules as the page's player
 *  (ui/src/lib/player.svelte.ts `report`). Plain Java: tested on the desktop JVM (android/test, PlayerReportsTest). */
final class PlayerReports {
    enum State {
        PLAYING("playing"), PAUSED("paused"), ENDED("ended"), CLOSED("closed");
        final String word;
        State(String word) { this.word = word; }
    }

    /** The key as JSON text, as the page gave it. */
    private String key;
    private double listened;
    /** False once the plugin said it takes no reports (404): none sent after. */
    private boolean taken = true;

    PlayerReports(String keyJson) { this.key = keyJson == null || keyJson.isEmpty() ? "null" : keyJson; }

    synchronized String key() { return key; }

    /** Seconds of listening (wall clock, whatever the speed), added as they pass; a long gap (the phone asleep, a
     *  stall) counts at most 5 s, as the page's player counts it. */
    synchronized void listened(double seconds) { if (seconds > 0) listened += Math.min(5, seconds); }

    synchronized boolean sending() { return taken; }

    /** A report's body, and the listened seconds it carries (to give back to `took`). */
    synchronized Report report(double at, double duration, State state) {
        long sent = Math.round(listened);
        String body = "{\"key\":" + key + ",\"at\":" + num(at) + ",\"duration\":" + num(duration) + ",\"listened\":" + sent + ",\"state\":\"" + state.word + "\"}";
        return new Report(body, sent);
    }

    /** The plugin took report `r`; `newKey` (JSON text, null when the answer had none) replaces the key. */
    synchronized void took(Report r, String newKey) {
        listened = Math.max(0, listened - r.listened);
        if (newKey != null && !newKey.isEmpty() && !newKey.equals("null")) key = newKey;
    }

    /** The plugin takes no reports (it has no `[media] progress`). */
    synchronized void refused() { taken = false; }

    static final class Report {
        final String body;
        final long listened;
        Report(String body, long listened) { this.body = body; this.listened = listened; }
    }

    /** A number as JSON (never NaN or Infinity, which JSON has not). */
    private static String num(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return "0";
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(Math.round(v * 1000) / 1000.0);
    }
}
