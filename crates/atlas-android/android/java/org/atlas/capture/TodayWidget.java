package org.atlas.capture;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.View;
import android.widget.RemoteViews;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** The home-screen widget (docs/guides/ANDROID.md, "The home-screen widget"): the day, the last lines of today's log,
 *  what comes next (the Agenda's events and dated tasks of the coming week: Agenda, AgendaRows.next; a tap opens the
 *  Agenda), the open tasks and a Capture button, in the vault's palette. The data is Home's own — the core's `GET /api/today`,
 *  reached as every native screen reaches a vault (VaultFiles.OnServer: the in-app core for a folder, the server for a
 *  server's vault); nothing here reads a task. Resizable: rows past the widget's height are cut by its frame. Drawn
 *  again every 30 minutes (updatePeriodMillis), when the app comes forward or leaves, and when the page reports its
 *  colours (paint). */
public final class TodayWidget extends AppWidgetProvider {
    private static final int MAX_TASKS = 12, MAX_LOG = 4, MAX_NEXT = 4;
    private static final String PREFS = "widget";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        BroadcastReceiver.PendingResult done = goAsync(); // the core may have to start: off the main thread
        Context app = c.getApplicationContext();
        new Thread(() -> {
            try { m.updateAppWidget(ids, draw(app)); }
            catch (RuntimeException e) { android.util.Log.w("AtlasWidget", "not drawn", e); }
            finally { done.finish(); }
        }).start();
    }

    /** Draws every placed widget again (nothing when none is placed, or in the capture app, which has none). */
    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        if (m == null) return; // a device without widgets
        int[] ids = m.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
        if (ids == null || ids.length == 0) return;
        c.sendBroadcast(new Intent(c, TodayWidget.class).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids));
    }

    /** The vault's colours as its page draws them (AtlasActivity Bridge.paper / accent; 0: not this one), kept for the
     *  widget, which has no page; drawn again when one changed. */
    static void paint(Context c, String vault, int bg, int accent) {
        if (vault == null) return;
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor e = p.edit();
        boolean changed = false;
        if (bg != 0 && p.getInt("bg:" + vault, 0) != bg) { e.putInt("bg:" + vault, bg); changed = true; }
        if (accent != 0 && p.getInt("accent:" + vault, 0) != accent) { e.putInt("accent:" + vault, accent); changed = true; }
        if (!changed) return;
        e.apply();
        refresh(c);
    }

    /** The widget for the current vault (Vaults.current, the one the app opens). Network: never on the main thread. */
    private static RemoteViews draw(Context c) {
        Server.init(c);
        Look look = new Look(c);
        Vaults known = new Vaults(c);
        String vault = known.current();
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int bg = vault == null ? look.bg : p.getInt("bg:" + vault, look.bg);
        int accent = vault == null ? look.accent : p.getInt("accent:" + vault, look.accent);
        boolean light = luminance(bg) > 0.4;
        int text = light ? 0xff23272e : 0xffdcdfe5, muted = light ? 0xff5b6270 : 0xff9aa1ad;

        RemoteViews v = new RemoteViews(c.getPackageName(), res(c, "widget_today", "layout"));
        v.setInt(res(c, "widget_bg", "id"), "setColorFilter", bg);
        v.setInt(res(c, "widget_capture_bg", "id"), "setColorFilter", accent);
        v.setTextColor(res(c, "widget_capture_label", "id"), luminance(accent) > 0.4 ? 0xff0b0d12 : 0xffffffff);
        v.setTextViewText(res(c, "widget_date", "id"), android.text.format.DateFormat.format("EEEE d MMMM", System.currentTimeMillis()));
        v.setTextColor(res(c, "widget_date", "id"), text);
        v.setTextViewText(res(c, "widget_vault", "id"), vault == null ? "Atlas" : known.title(vault));
        for (String id : new String[] { "widget_vault", "widget_log_head", "widget_next_head", "widget_tasks_head", "widget_status" }) v.setTextColor(res(c, id, "id"), muted);
        v.setTextColor(res(c, "widget_log", "id"), text);
        // the box, as the tile and the launcher's Capture start it (CaptureTile, Shortcuts)
        v.setOnClickPendingIntent(res(c, "widget_capture", "id"), activity(c, 1, new Intent(c, CaptureActivity.class)));
        v.setOnClickPendingIntent(res(c, "widget_head", "id"), activity(c, 2, Shortcuts.place(c, "home")));
        int tasks = res(c, "widget_tasks", "id");
        v.removeAllViews(tasks);
        if (vault == null) return status(c, v, "Choose a vault in Atlas");
        JSONObject today;
        try { today = new JSONObject(new String(new VaultFiles.OnServer(c, vault).get("/api/today"), StandardCharsets.UTF_8)); }
        catch (Exception e) { return status(c, v, "Not reached: " + e.getMessage()); }

        JSONObject log = today.optJSONObject("log");
        String lines = log == null ? "" : lastLines(log.optString("text", ""));
        v.setTextViewText(res(c, "widget_log", "id"), lines.isEmpty() ? "Nothing yet today" : lines);
        if (log != null && !log.optString("path").isEmpty()) v.setOnClickPendingIntent(res(c, "widget_log", "id"), activity(c, 3, open(c, log.optString("path"), 0)));

        next(c, v, vault, accent, text);

        JSONArray all = today.optJSONArray("tasks");
        int n = all == null ? 0 : all.length();
        v.setTextViewText(res(c, "widget_tasks_head", "id"), n == 0 ? "No open tasks" : "Open tasks · " + n);
        for (int i = 0; i < Math.min(n, MAX_TASKS); i++) {
            JSONObject t = all.optJSONObject(i);
            if (t == null) continue;
            RemoteViews row = new RemoteViews(c.getPackageName(), res(c, "widget_task", "layout"));
            int label = res(c, "widget_task_text", "id");
            SpannableStringBuilder s = new SpannableStringBuilder("○  ");
            s.setSpan(new ForegroundColorSpan(accent), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            s.append(t.optString("text"));
            row.setTextViewText(label, s);
            row.setTextColor(label, text);
            row.setOnClickPendingIntent(label, activity(c, 100 + i, open(c, t.optString("path"), t.optInt("line"))));
            v.addView(tasks, row);
        }
        v.setViewVisibility(res(c, "widget_status", "id"), View.GONE);
        return v;
    }

    /** "Coming up": the next things of the coming week, each a tap to the Agenda; nothing shown when there are none. */
    private static void next(Context c, RemoteViews v, String vault, int accent, int text) {
        int box = res(c, "widget_next", "id"), head = res(c, "widget_next_head", "id");
        v.removeAllViews(box);
        java.time.LocalDate today = java.time.LocalDate.now();
        Agenda.Read r = Agenda.read(c, vault, today, today.plusDays(6));
        List<AgendaRows.Item> next = AgendaRows.next(r.items, java.time.LocalDateTime.now(), MAX_NEXT);
        v.setViewVisibility(head, next.isEmpty() ? View.GONE : View.VISIBLE);
        v.setOnClickPendingIntent(head, activity(c, 4, Shortcuts.place(c, "agenda")));
        boolean h12 = !android.text.format.DateFormat.is24HourFormat(c);
        for (int i = 0; i < next.size(); i++) {
            RemoteViews row = new RemoteViews(c.getPackageName(), res(c, "widget_task", "layout"));
            int label = res(c, "widget_task_text", "id");
            SpannableStringBuilder s = new SpannableStringBuilder("▸  ");
            s.setSpan(new ForegroundColorSpan(accent), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            s.append(AgendaRows.nextLine(next.get(i), today, h12));
            row.setTextViewText(label, s);
            row.setTextColor(label, text);
            row.setOnClickPendingIntent(label, activity(c, 4, Shortcuts.place(c, "agenda")));
            v.addView(box, row);
        }
    }

    private static RemoteViews status(Context c, RemoteViews v, String why) {
        int s = res(c, "widget_status", "id");
        v.setTextViewText(s, why);
        v.setViewVisibility(s, View.VISIBLE);
        return v;
    }

    /** The log's last lines as written, its properties and blank lines left out, a list's `- ` dropped: for showing only. */
    static String lastLines(String note) {
        String body = note.startsWith("---\n") && note.indexOf("\n---", 3) > 0 ? note.substring(note.indexOf("\n---", 3) + 4) : note;
        List<String> kept = new ArrayList<>();
        for (String l : body.split("\n")) {
            String t = l.trim().replaceFirst("^[-*+] ", "");
            if (!t.isEmpty()) kept.add(t);
        }
        return String.join("\n", kept.subList(Math.max(0, kept.size() - MAX_LOG), kept.size()));
    }

    /** Atlas on a vault path (and line), as a notification's click and a plugin's "open this note" do (Host.open). */
    private static Intent open(Context c, String path, int line) {
        return new Intent(c, AtlasActivity.class).putExtra(AtlasActivity.OPEN, path).putExtra(AtlasActivity.LINE, line)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    private static PendingIntent activity(Context c, int code, Intent i) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** A resource of this app by name: the build links resources with no R class (Look.icon does the same). */
    private static int res(Context c, String name, String kind) { return c.getResources().getIdentifier(name, kind, c.getPackageName()); }

    private static double luminance(int c) {
        return (0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff)) / 255;
    }
}
