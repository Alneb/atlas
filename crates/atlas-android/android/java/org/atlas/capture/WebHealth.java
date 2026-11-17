package org.atlas.capture;

/** The note view's failures and what the app does about each (AtlasActivity; DESIGN-android-native-app.md §7): a
 *  renderer that died, a page that never said ready, a core that stopped answering or came back as another, memory
 *  running low. Every one is logged by its name under one logcat tag (`adb logcat -s AtlasWeb`) and said in a toast.
 *  Plain Java, tested on the JVM (android/test). */
final class WebHealth {
    private WebHealth() {}

    /** The logcat tag of every failure of the note view. */
    static final String TAG = "AtlasWeb";

    enum Failure {
        /** onRenderProcessGone: the WebView is made again, back at the place and its tabs. */
        RENDERER_GONE("renderer-gone", "The page stopped (%s): opened again where you were"),
        /** The renderer died again and again: left on a message with a button, not made again in a loop. */
        RENDERER_LOOP("renderer-loop", "The page keeps stopping: open it again when you are ready"),
        /** The page never said ready: shown as it is. */
        NOT_READY("not-ready", "%s did not finish opening: its page as it is"),
        /** On resume the core did not answer, twice: the page stays, it says itself what it cannot reach. */
        CORE_DOWN("core-down", "%s does not answer: the page may be out of date"),
        /** On resume the core answered as another one (restarted, updated): the page loaded again, once. */
        CORE_RESTARTED("core-restarted", "%s restarted: its page loaded again"),
        /** onTrimMemory: the WebView's caches let go. Logged, not said: nothing for the person to do. */
        MEMORY_LOW("memory-low", null);

        /** The name it is logged by. */
        final String name;
        private final String say;

        Failure(String name, String say) { this.name = name; this.say = say; }

        /** What the toast says (`what`: the vault's name, the renderer's cause), or null for nothing. */
        String says(String what) { return say == null ? null : String.format(say, what); }
    }

    /** At most MAX renderer restarts within WINDOW_MS; beyond, the next one waits for the person (RENDERER_LOOP). */
    static final class Restarts {
        static final int MAX = 3;
        static final long WINDOW_MS = 120_000;
        private final long[] at = new long[MAX];
        private int n;

        /** Whether a restart at `now` may go ahead (and it is counted). */
        boolean allow(long now) {
            int recent = 0;
            for (int i = 0; i < Math.min(n, MAX); i++) if (now - at[i] < WINDOW_MS) recent++;
            if (recent >= MAX) return false;
            at[n++ % MAX] = now;
            return true;
        }
    }

    /** A resume after this long away looks at the core; a shorter one (a permission dialog, the capture box) does not. */
    static final long AWAY_MS = 15_000;

    /** What a resume does once the core was asked. */
    enum Resume { NOTHING, RELOAD, RETRY, SAY_DOWN }

    /** `seen`: the core's answer when the page opened (`/api/version`: version, commit, interface digest); `now`: its
     *  answer on resume, null for none; `retried`: this is the second look. Another answer means another core (it
     *  restarted, or was updated): the page is reloaded once, its live connections and scripts being the old one's.
     *  No answer is looked at once more a few seconds later: an answer then is a core that was restarting (reloaded);
     *  none is said, never reloaded into an error page. `seen` null (not known yet): the caller keeps `now`. */
    static Resume onResume(String seen, String now, boolean retried) {
        if (now == null) return retried ? Resume.SAY_DOWN : Resume.RETRY;
        if (retried) return Resume.RELOAD;
        if (seen == null) return Resume.NOTHING;
        return seen.equals(now) ? Resume.NOTHING : Resume.RELOAD;
    }

    /** What onTrimMemory does. */
    enum Trim { NOTHING, CACHES }

    /** ComponentCallbacks2 levels: RUNNING_LOW = 10 and RUNNING_CRITICAL = 15 (the app in view, the phone short of
     *  memory), UI_HIDDEN = 20 (just left), BACKGROUND = 40 and above (in the background, next in line to be ended). The
     *  page's caches go when memory runs low in view, or once the app is in the background; not merely on leaving. */
    static Trim trim(int level) {
        return level >= 40 || level == 10 || level == 15 ? Trim.CACHES : Trim.NOTHING;
    }
}
