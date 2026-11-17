package org.atlas.plugins.manga;

import org.atlas.plugins.manga.Gestures.Kind;
import org.atlas.plugins.manga.Gestures.Layout;
import org.atlas.plugins.manga.Gestures.Step;
import org.atlas.plugins.manga.Gestures.Taps;
import org.atlas.plugins.manga.Gestures.Touch;
import org.atlas.plugins.manga.Gestures.Zone;

import java.util.List;

/** The manga reader's gestures (Gestures), its zoom (Zoom) and the page between chapters (Transition), on the desktop
 *  JVM (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class GesturesTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    // a phone's numbers: slop 8 dp, a turn 56 dp, a fling 0.5 px/ms, at 2.75 px per dp
    static final float SLOP = 22, TURN = 154, FLING = 0.5f;

    /** A one-finger gesture from (x0, y0) to (x1, y1) in `ms`, moving in ten steps; the page as `page` says. */
    static Touch.End swipe(Layout l, float x0, float y0, float x1, float y1, long ms, boolean fitWidth, boolean scrollOn, boolean scrollBack, boolean zoomed, boolean panOn, boolean panBack) {
        Touch t = new Touch(l, SLOP, TURN, FLING);
        t.down(x0, y0, 0, fitWidth, scrollOn, scrollBack, zoomed, panOn, panBack);
        for (int i = 1; i < 10; i++) t.move(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10);
        return t.up(x1, y1, ms);
    }

    static Touch.End swipe(Layout l, float dx, float dy, long ms) { return swipe(l, 500, 1000, 500 + dx, 1000 + dy, ms, false, false, false, false, false, false); }

    static String end(Touch.End e) { return e.kind + " " + e.step; }

    public static void main(String[] a) {
        zones();
        swipes();
        fitWidth();
        zoomed();
        taps();
        zoom();
        numbers();
        transitions();
        System.out.println("GesturesTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }

    static void zones() {
        // the default layout: thirds; right to left, the left third goes on
        eq("LTR: right third is next", Zone.NEXT, Gestures.zone("default", false, Layout.LTR, 0.9f, 0.5f));
        eq("LTR: left third is back", Zone.PREV, Gestures.zone("default", false, Layout.LTR, 0.1f, 0.5f));
        eq("the middle shows the bars", Zone.MENU, Gestures.zone("default", false, Layout.LTR, 0.5f, 0.5f));
        eq("LTR: right goes on", Step.ON, Gestures.step(Gestures.zone("default", false, Layout.LTR, 0.9f, 0.5f), Layout.LTR));
        eq("RTL: left goes on", Step.ON, Gestures.step(Gestures.zone("default", false, Layout.RTL, 0.1f, 0.5f), Layout.RTL));
        eq("RTL: right goes back", Step.BACK, Gestures.step(Gestures.zone("default", false, Layout.RTL, 0.9f, 0.5f), Layout.RTL));
        eq("the menu is no step", Step.NONE, Gestures.step(Zone.MENU, Layout.RTL));
        // vertical and webtoon: the bottom goes on, the top back, whatever the side
        eq("vertical: bottom on", Step.ON, Gestures.step(Gestures.zone("default", false, Layout.VERTICAL, 0.1f, 0.9f), Layout.VERTICAL));
        eq("webtoon: top back", Step.BACK, Gestures.step(Gestures.zone("default", false, Layout.WEBTOON, 0.9f, 0.1f), Layout.WEBTOON));
        // inverted: the sides swap, the menu stays
        eq("inverted: right is back", Zone.PREV, Gestures.zone("default", true, Layout.LTR, 0.9f, 0.5f));
        eq("inverted RTL: right goes on", Step.ON, Gestures.step(Gestures.zone("default", true, Layout.RTL, 0.9f, 0.5f), Layout.RTL));
        eq("inverted: menu stays", Zone.MENU, Gestures.zone("default", true, Layout.LTR, 0.5f, 0.5f));
        // the other layouts
        eq("Kindle: the left third back", Zone.PREV, Gestures.zone("Kindle", false, Layout.LTR, 0.2f, 0.8f));
        eq("Kindle: the top middle is the menu", Zone.MENU, Gestures.zone("Kindle", false, Layout.LTR, 0.5f, 0.2f));
        eq("Kindle: the bottom middle goes on", Zone.NEXT, Gestures.zone("Kindle", false, Layout.LTR, 0.5f, 0.8f));
        eq("edge: both edges go on", Zone.NEXT, Gestures.zone("edge", false, Layout.LTR, 0.05f, 0.5f));
        eq("edge: the middle band back", Zone.PREV, Gestures.zone("edge", false, Layout.LTR, 0.5f, 0.1f));
        eq("L-shaped: top left back", Zone.PREV, Gestures.zone("L-shaped", false, Layout.LTR, 0.1f, 0.1f));
        eq("L-shaped: bottom right on", Zone.NEXT, Gestures.zone("L-shaped", false, Layout.LTR, 0.9f, 0.9f));
        eq("right and left: 40 / 60", Zone.MENU, Gestures.zone("right and left", false, Layout.LTR, 0.45f, 0.1f));
        eq("off: no side turns", Zone.NONE, Gestures.zone("off", false, Layout.LTR, 0.9f, 0.5f));
        eq("off: the middle still shows the bars", Zone.MENU, Gestures.zone("off", false, Layout.LTR, 0.5f, 0.5f));
        eq("an unknown layout is the default", Zone.NEXT, Gestures.zone("something new", false, Layout.LTR, 0.9f, 0.5f));
    }

    static void swipes() {
        // left to right: a finger towards the left goes on; right to left the other way
        eq("LTR: swipe left turns on", "SWIPE ON", end(swipe(Layout.LTR, -300, 10, 300)));
        eq("LTR: swipe right turns back", "SWIPE BACK", end(swipe(Layout.LTR, 300, 0, 300)));
        eq("RTL: swipe right turns on", "SWIPE ON", end(swipe(Layout.RTL, 300, 0, 300)));
        eq("RTL: swipe left turns back", "SWIPE BACK", end(swipe(Layout.RTL, -300, 20, 300)));
        // too short and slow: no turn (the page goes back to its place); short and quick: a fling turns
        eq("short slow: no turn", "SWIPE NONE", end(swipe(Layout.LTR, -80, 0, 600)));
        eq("short quick: a fling turns", "SWIPE ON", end(swipe(Layout.LTR, -80, 0, 90)));
        eq("within the slop: a tap", "TAP NONE", end(swipe(Layout.LTR, 10, 8, 120)));
        // mostly across the reading axis: no swipe
        eq("LTR: vertical drag is no swipe", "DRAG NONE", end(swipe(Layout.LTR, 40, 400, 300)));
        eq("LTR: a diagonal mostly down is no swipe", "DRAG NONE", end(swipe(Layout.LTR, 200, 260, 300)));
        // vertical paged: up goes on, sideways nothing
        eq("vertical: swipe up turns on", "SWIPE ON", end(swipe(Layout.VERTICAL, 0, -300, 300)));
        eq("vertical: swipe down turns back", "SWIPE BACK", end(swipe(Layout.VERTICAL, 10, 300, 300)));
        eq("vertical: sideways is no swipe", "DRAG NONE", end(swipe(Layout.VERTICAL, -300, 0, 300)));
        // webtoon: every drag is the column's scroll
        eq("webtoon: a drag scrolls", "DRAG NONE", end(swipe(Layout.WEBTOON, 0, -300, 300)));
        eq("webtoon: a tap is the reader's", "TAP NONE", end(swipe(Layout.WEBTOON, 3, 3, 80)));
        // the page follows the finger while it swipes
        Touch t = new Touch(Layout.LTR, SLOP, TURN, FLING);
        t.down(500, 500, 0, false, false, false, false, false, false);
        t.move(450, 505);
        eq("the slide follows dx", -50f, t.slide());
        eq("decided once", Kind.SWIPE, t.move(450, 900)); // a later turn of the finger does not undo it
        // a second finger: a pinch, never a turn
        Touch p = new Touch(Layout.LTR, SLOP, TURN, FLING);
        p.down(500, 500, 0, false, false, false, false, false, false);
        p.pointers(2);
        p.move(100, 500);
        eq("a pinch is no turn", "PINCH NONE", end(p.up(100, 500, 200)));
    }

    static void fitWidth() {
        // fit width, sideways modes: a vertical drag is the page's scroll, a sideways swipe still turns
        eq("fit width LTR: vertical drag scrolls", "DRAG NONE", end(swipe(Layout.LTR, 500, 1000, 520, 600, 300, true, true, false, false, false, false)));
        eq("fit width LTR: sideways swipe turns", "SWIPE ON", end(swipe(Layout.LTR, 500, 1000, 150, 1030, 300, true, true, true, false, false, false)));
        eq("fit width RTL: sideways swipe turns", "SWIPE ON", end(swipe(Layout.RTL, 200, 1000, 550, 990, 300, true, true, true, false, false, false)));
        // fit width, vertical: the page scrolls to its end before an up swipe turns
        eq("fit width vertical: scrolls before turning", "DRAG NONE", end(swipe(Layout.VERTICAL, 500, 1000, 500, 600, 300, true, true, false, false, false, false)));
        eq("fit width vertical: at the end it turns", "SWIPE ON", end(swipe(Layout.VERTICAL, 500, 1000, 500, 600, 300, true, false, true, false, false, false)));
        eq("fit width vertical: at the top a down swipe turns back", "SWIPE BACK", end(swipe(Layout.VERTICAL, 500, 600, 500, 1000, 300, true, true, false, false, false, false)));
        // a tap or a key: scroll first, turn at the end
        eq("tap on, page not at its end: scroll", Gestures.Move.SCROLL, Gestures.fitWidth(Step.ON, true, false));
        eq("tap on, at its end: turn", Gestures.Move.TURN, Gestures.fitWidth(Step.ON, false, true));
        eq("tap back, page at its top: turn", Gestures.Move.TURN, Gestures.fitWidth(Step.BACK, true, false));
        eq("tap back, scrolled down: scroll", Gestures.Move.SCROLL, Gestures.fitWidth(Step.BACK, true, true));
    }

    static void zoomed() {
        // zoomed: a drag pans until the page's edge; at the edge (when the finger came down) a swipe turns
        eq("zoomed: a swipe pans first", "DRAG NONE", end(swipe(Layout.LTR, 800, 1000, 300, 1000, 300, false, false, false, true, true, true)));
        eq("zoomed at its right edge: a left swipe turns on", "SWIPE ON", end(swipe(Layout.LTR, 800, 1000, 300, 1000, 300, false, false, false, true, false, true)));
        eq("zoomed RTL at its left edge: a right swipe turns on", "SWIPE ON", end(swipe(Layout.RTL, 200, 1000, 700, 1000, 300, false, false, false, true, false, true)));
        eq("zoomed: across the axis pans", "DRAG NONE", end(swipe(Layout.LTR, 500, 1000, 500, 500, 300, false, false, false, true, false, false)));
        eq("holds: a side tap does not wait", false, Gestures.holds(Zone.NEXT, true, false));
        eq("holds: the middle waits for a double tap", true, Gestures.holds(Zone.MENU, true, false));
        eq("holds: zoomed, every tap waits", true, Gestures.holds(Zone.NEXT, true, true));
        eq("holds: no zoom (fit width, webtoon), nothing waits", false, Gestures.holds(Zone.MENU, false, false));
    }

    static void taps() {
        Taps t = new Taps(300, 60);
        eq("a side tap: now", Taps.Answer.NOW, t.tap(900, 500, 0, false));
        eq("a middle tap: wait", Taps.Answer.WAIT, t.tap(500, 500, 1000, true));
        eq("a second near and soon: double", Taps.Answer.DOUBLE, t.tap(510, 495, 1200, true));
        eq("nothing held after a double", false, t.fire());
        eq("a middle tap again: wait", Taps.Answer.WAIT, t.tap(500, 500, 2000, true));
        eq("the time ran out: act on it", true, t.fire());
        eq("then nothing held", false, t.fire());
        t.tap(500, 500, 3000, true);
        eq("a held tap, then a side tap far away: both, the held first", Taps.Answer.HELD_THEN_NOW, t.tap(950, 500, 3100, false));
        t.tap(500, 500, 4000, true);
        eq("too late for a double: the held one, then this one held", Taps.Answer.HELD_THEN_WAIT, t.tap(500, 500, 4400, true));
        t.clear();
        eq("cleared by a swipe", false, t.fire());
    }

    static void zoom() {
        Zoom z = new Zoom();
        z.size(1000, 2000, 800, 1200); // a page 800 × 1200 on a 1000 × 2000 reader: fitted 1000 × 1500, centred
        eq("fitted width", 1000f, z.width());
        eq("centred vertically", 250f, z.top());
        eq("not zoomed", false, z.zoomed());
        z.toggle(500, 1000);
        eq("double tap zooms", Zoom.DOUBLE, z.scale());
        eq("about the tap", 500f, z.left() + z.width() / 2);
        eq("can pan right", true, z.canPan(-10, 0));
        z.pan(-100000, 0);
        eq("panned to the right edge, no gap", 1000f, z.left() + z.width());
        eq("at the right edge: no more", false, z.canPan(-10, 0));
        eq("but back", true, z.canPan(10, 0));
        z.scaleBy(100, 0, 0);
        eq("never past MAX", Zoom.MAX, z.scale());
        z.scaleBy(0.0001f, 0, 0);
        eq("never below fitted", 1f, z.scale());
        eq("fitted again: centred", 250f, z.top());
        z.toggle(100, 100);
        z.toggle(100, 100);
        eq("a double tap zoomed: back to the page", false, z.zoomed());
    }

    static void numbers() {
        eq("Ch. 12", 12.0, Transition.number("manga/X/Ch. 12.cbz"));
        eq("Chapter 12.5: a title", 12.5, Transition.number("suwayomi:88/Chapter 12.5: The Return"));
        eq("Vol.3 Ch.15", 15.0, Transition.number("manga/X/Vol.3 Ch.15 - Title 2.cbz"));
        eq("a folder chapter", 7.0, Transition.number("manga/X/c007/"));
        eq("a bare number", 12.0, Transition.number("manga/Berserk/Berserk 012.cbz"));
        eq("a volume alone is no chapter", -1.0, Transition.number("manga/X/Vol. 2 Extras.cbz"));
        eq("a comma decimal", 4.5, Transition.number("manga/X/Chapitre ch 4,5.cbz"));
        eq("episode", 3.0, Transition.number("suwayomi:2/Episode 3"));
        eq("a hash", 21.0, Transition.number("suwayomi:2/#21 Night"));
        eq("no number", -1.0, Transition.number("manga/X/Oneshot.cbz"));
        eq("12 → 13 misses none", 0, Transition.missing("Ch 12.cbz", "Ch 13.cbz"));
        eq("12 → 12.5 misses none", 0, Transition.missing("Ch 12.cbz", "Ch 12.5.cbz"));
        eq("12.5 → 13 misses none", 0, Transition.missing("Ch 12.5.cbz", "Ch 13.cbz"));
        eq("12 → 15 misses two", 2, Transition.missing("Ch 12.cbz", "Ch 15.cbz"));
        eq("backwards too", 2, Transition.missing("Ch 15.cbz", "Ch 12.cbz"));
        eq("unknown numbers miss none", 0, Transition.missing("Oneshot.cbz", "Ch 15.cbz"));
        eq("which: two", "13–14", Transition.which("Ch 12.cbz", "Ch 15.cbz"));
        eq("which: one", "13", Transition.which("Ch 12.cbz", "Ch 14.cbz"));
    }

    static void transitions() {
        List<String> on = Transition.lines("manga/X/Ch 12.cbz", "manga/X/Ch 13.cbz", true);
        eq("finished, next", "[Finished: Ch 12, Next: Ch 13]", on.toString());
        eq("a gap is warned", "[Finished: Ch 12, Next: Ch 15, ⚠ 2 chapters are missing (13–14)]", Transition.lines("manga/X/Ch 12.cbz", "manga/X/Ch 15.cbz", true).toString());
        eq("one missing", "⚠ 1 chapter is missing (13)", Transition.lines("suwayomi:1/Ch 12", "suwayomi:2/Ch 14", true).get(2));
        eq("the series' end", "[Finished: Ch 12, That was the last chapter.]", Transition.lines("manga/X/Ch 12.cbz", null, true).toString());
        eq("back: current, previous", "[Current: Ch 13, Previous: Ch 12]", Transition.lines("manga/X/Ch 13.cbz", "manga/X/Ch 12.cbz", false).toString());
        eq("the series' start", "[Current: Ch 1, This is the first chapter.]", Transition.lines("manga/X/Ch 1/", null, false).toString());
    }
}
