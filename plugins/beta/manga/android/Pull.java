package org.atlas.plugins.manga;

import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.atlas.capture.Host;

/** Pull to refresh around a list (a grid, a list): a finger that drags down while the list is at its top pulls it
 *  down under a line that says what letting go does; let go past `far` it refreshes, the line saying so until `done`
 *  runs. Any other drag is the list's own. No animation on e-ink. */
final class Pull extends FrameLayout {
    /** A refresh: call `done` (any thread) when it has finished. */
    interface Refresh { void run(Runnable done); }

    private final Host host;
    private final View list;
    private final TextView hint;
    private final Refresh refresh;
    private final int slop, far;
    private float downX, downY, pulled;
    private boolean pulling, refreshing;

    Pull(Host host, View list, Refresh refresh) {
        super(host.activity());
        this.host = host;
        this.list = list;
        this.refresh = refresh;
        slop = ViewConfiguration.get(getContext()).getScaledTouchSlop();
        far = host.look().dp(72);
        hint = host.look().label(getContext(), "", 13, host.look().muted);
        hint.setGravity(Gravity.CENTER);
        hint.setAlpha(0);
        addView(hint, new LayoutParams(-1, far, Gravity.TOP));
        addView(list, new LayoutParams(-1, -1));
    }

    /** A refresh started from elsewhere (the bar's button): the line shows it as a pull would. */
    void start() {
        if (refreshing) return;
        refreshing = true;
        place(far * 0.7f);
        hint.setText("Refreshing…");
        refresh.run(() -> post(this::finished));
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: downX = e.getX(); downY = e.getY(); pulling = false; break;
            case MotionEvent.ACTION_MOVE: {
                float dy = e.getY() - downY, dx = e.getX() - downX;
                // down, mostly down, and the list cannot go further up: the pull's
                if (!refreshing && dy > slop && dy > 2 * Math.abs(dx) && !list.canScrollVertically(-1)) { pulling = true; downY = e.getY(); return true; }
                break;
            }
            default: break;
        }
        return false;
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (!pulling) return super.onTouchEvent(e);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                place(Math.max(0, Math.min(far * 1.6f, (e.getY() - downY) * 0.55f)));
                hint.setText(pulled >= far ? "Let go to refresh" : "Pull to refresh");
                return true;
            case MotionEvent.ACTION_UP:
                pulling = false;
                if (pulled >= far) start(); else back();
                return true;
            case MotionEvent.ACTION_CANCEL:
                pulling = false;
                back();
                return true;
            default: return true;
        }
    }

    private void place(float y) {
        pulled = y;
        list.setTranslationY(y);
        hint.setAlpha(Math.min(1, y / far));
        hint.setTranslationY(Math.max(0, y - far) / 2);
    }

    private void back() {
        if (host.eink()) { place(0); return; }
        list.animate().translationY(0).setDuration(150).withEndAction(() -> place(0)).start();
        hint.animate().alpha(0).setDuration(150).start();
    }

    private void finished() {
        refreshing = false;
        back();
        if (host.eink()) post(host::einkRefresh);
    }

    boolean refreshing() { return refreshing; }
}
