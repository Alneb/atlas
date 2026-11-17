package org.atlas.plugins.manga;

/**
 * What a finger on the reader means, decided with no Android in it so every rule is tested on the desktop JVM
 * (GesturesTest, android/test/run.sh). ReaderView feeds it the touch (down, moves, up, a second finger) and does what
 * it answers: a tap's zone, a swipe's turn, a drag left to the page's own scroll or pan, a pinch.
 *
 * The rules, as a reader app does them:
 *  - a tap (the finger stayed within `slop`) acts by its zone (Mihon's layouts, below); right to left flips the sides;
 *  - a swipe along the reading axis (sideways in right to left / left to right, up and down in vertical) turns once
 *    it is long enough (`turnPx`) or quick enough (`flingPxPerMs`); a drag mostly across it is not a swipe;
 *  - fit width: the page scrolls first — a vertical drag is the scroller's, and a swipe or tap that would go past the
 *    page's end turns only when the page is already scrolled to that end (scroll-before-turn);
 *  - zoomed: a drag pans; a swipe turns only when the page was already at that edge when the finger came down;
 *  - two fingers: a pinch (zoom and pan), never a tap or a turn;
 *  - webtoon: the column scrolls by itself; only taps are the reader's.
 */
final class Gestures {
    private Gestures() {}

    /** The reading mode, as far as gestures care. */
    enum Layout {
        RTL, LTR, VERTICAL, WEBTOON;
        /** Whether pages turn sideways. */
        boolean sideways() { return this == RTL || this == LTR; }
    }

    /** A tap zone, named for left to right (`step` flips it for right to left). */
    enum Zone { PREV, NEXT, MENU, NONE }

    /** A move in reading order. */
    enum Step { BACK, ON, NONE }

    /** The tap zone layouts of the settings (plugin.toml `taps`); x and y from 0 to 1 across the reader. */
    static Zone zone(String kind, boolean invert, Layout layout, float x, float y) {
        Zone t;
        switch (kind == null ? "default" : kind) {
            case "off": t = (x > 0.33f && x < 0.66f && y > 0.33f && y < 0.66f) ? Zone.MENU : Zone.NONE; break;
            case "Kindle": t = x < 0.33f ? Zone.PREV : (x < 0.66f && y < 0.33f) ? Zone.MENU : Zone.NEXT; break;
            case "edge": t = x < 0.15f || x > 0.85f ? Zone.NEXT : (y > 0.33f && y < 0.66f ? Zone.MENU : Zone.PREV); break;
            case "right and left": t = x < 0.4f ? Zone.PREV : x > 0.6f ? Zone.NEXT : Zone.MENU; break;
            case "L-shaped": t = (x < 0.33f && y < 0.66f) || (y < 0.33f && x < 0.66f) ? Zone.PREV : (x > 0.33f && x < 0.66f && y > 0.33f && y < 0.66f) ? Zone.MENU : Zone.NEXT; break;
            default:
                // vertical and webtoon read downwards: the top goes back, the bottom on
                if (layout == Layout.VERTICAL || layout == Layout.WEBTOON) t = y < 0.33f ? Zone.PREV : y > 0.66f ? Zone.NEXT : Zone.MENU;
                else t = x < 0.33f ? Zone.PREV : x > 0.66f ? Zone.NEXT : Zone.MENU;
        }
        if (invert && (t == Zone.NEXT || t == Zone.PREV)) t = t == Zone.NEXT ? Zone.PREV : Zone.NEXT;
        return t;
    }

    /** A zone as a move in reading order: right to left, the left side goes on (a manga's next page is to the left). */
    static Step step(Zone z, Layout layout) {
        if (z != Zone.NEXT && z != Zone.PREV) return Step.NONE;
        boolean on = z == Zone.NEXT;
        if (layout == Layout.RTL) on = !on;
        return on ? Step.ON : Step.BACK;
    }

    /** Fit width: whether a step is the page's own scroll (it is not yet at that end) or a turn. */
    enum Move { SCROLL, TURN }

    static Move fitWidth(Step s, boolean canScrollOn, boolean canScrollBack) {
        return s == Step.ON && canScrollOn || s == Step.BACK && canScrollBack ? Move.SCROLL : Move.TURN;
    }

    /** Whether a tap waits a moment for a second one (a double tap zooms): only where zoom exists, and then only in
     *  the middle (a side tap turns at once, the bars come a moment late) or while zoomed (a turn is less urgent than
     *  unzooming). */
    static boolean holds(Zone z, boolean zoomable, boolean zoomed) {
        return zoomable && (zoomed || z == Zone.MENU);
    }

    /** What the gesture so far is. */
    enum Kind { UNDECIDED, TAP, SWIPE, DRAG, PINCH }

    /** One finger's gesture, from down to up. The thresholds are in pixels (and ms) handed in by the view. */
    static final class Touch {
        final Layout layout;
        /** Within this, a finger that moved is still a tap; past it the gesture is decided. */
        final float slop;
        /** A swipe at least this long turns; a shorter one only when quick. */
        final float turnPx;
        /** Pixels per ms that make a short swipe a fling. */
        final float flingPxPerMs;

        private float downX, downY, x, y;
        private long downAt;
        private Kind kind = Kind.UNDECIDED;
        /** What the page could still do when the finger came down: scroll on / back (fit width), pan on / back
         *  along the reading axis (zoomed). */
        private boolean scrollOn, scrollBack, panOn, panBack, zoomed, fitWidth;

        Touch(Layout layout, float slop, float turnPx, float flingPxPerMs) {
            this.layout = layout;
            this.slop = slop;
            this.turnPx = turnPx;
            this.flingPxPerMs = flingPxPerMs;
        }

        /** A finger down. `fitWidth`: the page is in a scroller that can still go on / back; `zoomed`: the page is
         *  zoomed and can still pan on / back along the reading axis (in reading order). */
        void down(float x, float y, long t, boolean fitWidth, boolean scrollOn, boolean scrollBack, boolean zoomed, boolean panOn, boolean panBack) {
            downX = this.x = x; downY = this.y = y; downAt = t;
            kind = Kind.UNDECIDED;
            this.fitWidth = fitWidth; this.scrollOn = scrollOn; this.scrollBack = scrollBack;
            this.zoomed = zoomed; this.panOn = panOn; this.panBack = panBack;
        }

        /** A second finger: a pinch for the rest of the gesture. */
        void pointers(int n) { if (n >= 2) kind = Kind.PINCH; }

        /** Along the reading axis in reading order: positive is towards the next page. */
        private float along(float dx, float dy) {
            if (layout == Layout.VERTICAL || layout == Layout.WEBTOON) return -dy;
            return layout == Layout.RTL ? dx : -dx;
        }

        private float across(float dx, float dy) { return layout == Layout.VERTICAL || layout == Layout.WEBTOON ? dx : dy; }

        /** The finger moved; what the gesture is now. Decided once, at the first move past `slop`. */
        Kind move(float x, float y) {
            this.x = x; this.y = y;
            if (kind != Kind.UNDECIDED) return kind;
            float dx = x - downX, dy = y - downY;
            if (Math.hypot(dx, dy) < slop) return kind;
            kind = decide(dx, dy);
            return kind;
        }

        private Kind decide(float dx, float dy) {
            if (layout == Layout.WEBTOON) return Kind.DRAG; // the column scrolls
            float a = along(dx, dy), c = across(dx, dy);
            boolean onAxis = Math.abs(a) >= 1.5f * Math.abs(c);
            if (!onAxis) return Kind.DRAG; // across: a fit-width page's scroll, a zoomed page's pan, else nothing
            boolean on = a > 0;
            if (zoomed && (on ? panOn : panBack)) return Kind.DRAG;            // pan to the edge first
            if (fitWidth && !layout.sideways() && (on ? scrollOn : scrollBack)) return Kind.DRAG; // scroll to the end first
            return Kind.SWIPE;
        }

        /** How far the page follows the finger while it swipes (pixels along the reading axis, screen direction:
         *  dx in the sideways modes, dy in vertical); 0 when it is no swipe. */
        float slide() {
            if (kind != Kind.SWIPE) return 0;
            return layout.sideways() ? x - downX : y - downY;
        }

        /** What a gesture's end means. */
        static final class End {
            final Kind kind;
            /** A swipe's turn (NONE: too short, the page goes back); a tap's comes from its zone. */
            final Step step;
            End(Kind kind, Step step) { this.kind = kind; this.step = step; }
        }

        /** The finger up at (x, y), time t. */
        End up(float x, float y, long t) {
            Kind k = move(x, y);
            if (k == Kind.UNDECIDED) return new End(Kind.TAP, Step.NONE);
            if (k != Kind.SWIPE) return new End(k, Step.NONE);
            float a = along(x - downX, y - downY);
            long ms = Math.max(1, t - downAt);
            boolean far = Math.abs(a) >= turnPx;
            boolean quick = Math.abs(a) >= 2 * slop && Math.abs(a) / ms >= flingPxPerMs;
            return new End(Kind.SWIPE, far || quick ? (a > 0 ? Step.ON : Step.BACK) : Step.NONE);
        }

        Kind kind() { return kind; }
    }

    /** A tap held for a possible second one (double tap). */
    static final class Taps {
        /** The second tap must come within this long, this near. */
        final long doubleMs;
        final float doublePx;
        private float x, y;
        private long at;
        private boolean waiting;

        Taps(long doubleMs, float doublePx) { this.doubleMs = doubleMs; this.doublePx = doublePx; }

        enum Answer {
            /** Act on this tap now. */
            NOW,
            /** Hold it: act after `doubleMs` unless a second comes (`fire`). */
            WAIT,
            /** The second of a double tap: zoom; the held one is forgotten. */
            DOUBLE,
            /** A held tap elsewhere: act on the held one first (`held`), then on this one now. */
            HELD_THEN_NOW,
            /** A held tap elsewhere, and this one is held in its place: act on the held one first. */
            HELD_THEN_WAIT
        }

        /** A tap at (x, y), time t; `hold`: it may wait (Gestures.holds). */
        Answer tap(float x, float y, long t, boolean hold) {
            if (waiting && t - at <= doubleMs && Math.hypot(x - this.x, y - this.y) <= doublePx) { waiting = false; return Answer.DOUBLE; }
            boolean had = waiting;
            waiting = hold;
            if (hold) { this.x = x; this.y = y; this.at = t; }
            return had ? (hold ? Answer.HELD_THEN_WAIT : Answer.HELD_THEN_NOW) : (hold ? Answer.WAIT : Answer.NOW);
        }

        /** The time for a second tap ran out: whether a tap was still held (act on it). */
        boolean fire() { boolean w = waiting; waiting = false; return w; }

        /** Forget a held tap (a swipe or pinch came instead). */
        void clear() { waiting = false; }
    }
}
