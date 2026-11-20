package org.atlas.plugins.manga;

import java.util.ArrayList;
import java.util.List;

/**
 * The reader's page work in the order it is wanted, as Mihon preloads: the page on screen first, then the next ones in
 * the way you are reading, the one or two behind, and near a chapter's end the next chapter's first pages — nearest
 * first, never more than CAP waiting. A page you turned away from is dropped from the queue before it costs anything
 * (a Suwayomi page is a few MB fetched over the network). One queue for fetching, one for decoding (Pages); both read
 * the same focus. Pure, so the order is tested on the desktop JVM (PrefetchTest, android/test/run.sh); thread-safe:
 * workers block in take().
 */
final class Prefetch<T> {
    /** Pages worked on ahead (the way you read) and behind; the next chapter's first pages, from AHEAD before the end. */
    static final int AHEAD = 5, BEHIND = 2, NEXT = 3;
    /** At most this many waiting: the farthest is dropped first. */
    static final int CAP = 24;

    /** Where the reader is: the chapter (by path: a chapter opened again is a new object), its page and size, whether
     *  the last turn went on (false: back, the pages behind are then the ones ahead), the next chapter (null: none
     *  opened yet, or the series' last). */
    static final class Focus {
        final String chapter, next;
        final int page, size;
        final boolean forward;
        Focus(String chapter, int page, int size, boolean forward, String next) {
            this.chapter = chapter; this.page = page; this.size = size; this.forward = forward; this.next = next;
        }
    }

    /** How soon page `page` of `chapter` is wanted: 0 now (on screen), larger later, -1 not at all. Ahead k → 2k;
     *  behind k → 2k + 3 (the one behind comes between the second and the third ahead); the next chapter's page j as if
     *  it were that many pages on past the end. */
    static int rank(Focus f, String chapter, int page) {
        if (f == null || chapter == null || page < 0) return -1;
        if (chapter.equals(f.chapter)) {
            if (page >= f.size) return -1;
            int on = f.forward ? page - f.page : f.page - page;
            if (on == 0) return 0;
            if (on > 0) return on <= AHEAD ? 2 * on : -1;
            return -on <= BEHIND ? 2 * -on + 3 : -1;
        }
        if (chapter.equals(f.next) && f.forward && page < NEXT) {
            int left = f.size - 1 - f.page; // pages still to read here
            if (left > AHEAD) return -1;
            return 2 * (left + 1 + page);
        }
        return -1;
    }

    /** This chapter's pages to ask for around `page`, soonest first (the page itself left out). */
    static List<Integer> around(int page, int size, boolean forward) {
        Focus f = new Focus("", page, size, forward, null);
        List<Integer> out = new ArrayList<>();
        for (int r = 1; r <= 2 * Math.max(AHEAD, BEHIND) + 3; r++)
            for (int p = page - BEHIND - AHEAD; p <= page + BEHIND + AHEAD; p++) if (rank(f, "", p) == r) out.add(p);
        return out;
    }

    /** Whether the next chapter should be opened now (its page list asked for, its first pages queued). */
    static boolean nearEnd(int page, int size) { return size - 1 - page <= AHEAD; }

    /** The percentage a progress indicator shows: rounded down to a step (on e-ink 25, so the screen is redrawn four
     *  times, not a hundred), -1 while the size is unknown. */
    static int shown(int percent, boolean eink) {
        if (percent < 0) return -1;
        int step = eink ? 25 : 5;
        return Math.min(100, percent / step * step);
    }

    // ---- the queue ----

    /** Told of a job dropped unstarted (no longer wanted, the queue full or closed): its waiters are answered. */
    interface Dropped<T> { void dropped(T job); }

    private static final class Entry<T> {
        final String chapter; final int page; final T job; final long seq;
        Entry(String chapter, int page, T job, long seq) { this.chapter = chapter; this.page = page; this.job = job; this.seq = seq; }
    }

    private final List<Entry<T>> jobs = new ArrayList<>();
    private final Dropped<T> dropped;
    private Focus focus;
    private boolean closed;
    private long seq;

    Prefetch(Dropped<T> dropped) { this.dropped = dropped; }

    /** Where the reader is now: jobs no longer wanted are dropped. */
    void focus(Focus f) {
        List<T> gone;
        synchronized (this) { focus = f; gone = prune(); notifyAll(); }
        tell(gone);
    }

    synchronized boolean wanted(String chapter, int page) { return !closed && rank(focus, chapter, page) >= 0; }

    /** `job` for page `page` of `chapter` queued (false, and dropped: not wanted, or closed). */
    boolean add(String chapter, int page, T job) {
        List<T> gone = new ArrayList<>();
        boolean in;
        synchronized (this) {
            in = !closed && rank(focus, chapter, page) >= 0;
            if (in) {
                jobs.add(new Entry<>(chapter, page, job, seq++));
                if (jobs.size() > CAP) gone.add(jobs.remove(worst()).job);
                notifyAll();
            }
        }
        if (!in) gone.add(job);
        tell(gone);
        return in;
    }

    /** The job wanted soonest, or null when none waits (the unwanted ones dropped on the way). */
    T poll() {
        List<T> gone;
        T best;
        synchronized (this) { gone = prune(); best = closed ? null : takeBest(); }
        tell(gone);
        return best;
    }

    /** As poll(), waiting for one; null once closed. */
    T take() throws InterruptedException {
        while (true) {
            List<T> gone;
            T best;
            synchronized (this) {
                gone = prune();
                best = closed ? null : takeBest();
                if (best == null && gone.isEmpty() && !closed) wait();
            }
            tell(gone);
            if (best != null || closed) return best;
        }
    }

    /** No more work: what waits is dropped, take() answers null. */
    void close() {
        List<T> gone = new ArrayList<>();
        synchronized (this) {
            closed = true;
            for (Entry<T> e : jobs) gone.add(e.job);
            jobs.clear();
            notifyAll();
        }
        tell(gone);
    }

    synchronized int size() { return jobs.size(); }

    private List<T> prune() {
        List<T> gone = new ArrayList<>();
        for (int i = jobs.size() - 1; i >= 0; i--) if (rank(focus, jobs.get(i).chapter, jobs.get(i).page) < 0) gone.add(0, jobs.remove(i).job);
        return gone;
    }

    private T takeBest() {
        int best = -1, bestRank = 0;
        for (int i = 0; i < jobs.size(); i++) {
            int r = rank(focus, jobs.get(i).chapter, jobs.get(i).page);
            if (best < 0 || r < bestRank || r == bestRank && jobs.get(i).seq < jobs.get(best).seq) { best = i; bestRank = r; }
        }
        return best < 0 ? null : jobs.remove(best).job;
    }

    /** The farthest job (the newest of equals): the one a full queue lets go. */
    private int worst() {
        int worst = 0;
        for (int i = 1; i < jobs.size(); i++) {
            int r = rank(focus, jobs.get(i).chapter, jobs.get(i).page), w = rank(focus, jobs.get(worst).chapter, jobs.get(worst).page);
            if (r > w || r == w && jobs.get(i).seq > jobs.get(worst).seq) worst = i;
        }
        return worst;
    }

    private void tell(List<T> gone) { for (T j : gone) dropped.dropped(j); }
}
