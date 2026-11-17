package org.atlas.capture;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * The Agenda's data, from the vault's core as the page's Calendar reads it (plugins/stable/dav/ui/src/store.svelte.ts
 * `load`): the events of the plugin that provides the calendar (its helper's `range`, the user's zone given, through
 * `POST /api/plugins/@calendar/helper`) and the core's dated tasks and notes (`POST /api/view`, `from: deadlines`,
 * `scheduled: true`). A task is ticked by the core (`POST /api/task/tick`). Each part fails on its own: no calendar in
 * the vault (a vault on the phone runs no Calendar engine) still lists the tasks. Network: never on the main thread.
 */
final class Agenda {
    private Agenda() {}

    /** What was read: the items, and why a part is missing (null: it was read). */
    static final class Read {
        final List<AgendaRows.Item> items = new ArrayList<>();
        String noEvents, noTasks;
    }

    static Read read(Context c, String vault, LocalDate from, LocalDate to) {
        Read r = new Read();
        VaultFiles.OnServer f = new VaultFiles.OnServer(c, vault);
        try {
            JSONObject params = new JSONObject().put("from", from.toString()).put("to", to.toString()).put("tz", ZoneId.systemDefault().getId());
            JSONObject call = new JSONObject().put("method", "range").put("params", params).put("timeout_secs", 60);
            JSONObject a = new JSONObject(new String(f.send("POST", "/api/plugins/@calendar/helper", "application/json", call.toString().getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8));
            JSONArray evs = a.optJSONArray("events");
            for (int i = 0; evs != null && i < evs.length(); i++) {
                JSONObject e = evs.getJSONObject(i);
                if ("CANCELLED".equals(e.optString("status"))) continue;
                AgendaRows.Item it = AgendaRows.Item.event(e.optString("summary"), e.optString("start"), e.optString("end"), e.optBoolean("all_day"));
                it.location = e.optString("location");
                it.calendar = e.optString("calendar_name");
                it.source = e.optString("source");
                r.items.add(it);
            }
        } catch (Exception e) {
            String why = e.getMessage() == null ? e.toString() : e.getMessage();
            r.noEvents = why.contains("provides the role") ? "No calendar in this vault: its tasks only." : "Events not read: " + why;
            android.util.Log.w("AtlasAgenda", "events: " + why);
        }
        try {
            JSONObject q = new JSONObject().put("path", "").put("src", "type: list\nfrom: deadlines\nscheduled: true\n");
            JSONObject a = new JSONObject(new String(f.send("POST", "/api/view", "application/json", q.toString().getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8));
            JSONArray rows = a.optJSONArray("rows");
            String first = from.toString(), last = to.toString();
            for (int i = 0; rows != null && i < rows.length(); i++) {
                JSONObject t = rows.getJSONObject(i);
                JSONObject props = t.optJSONObject("props");
                String kind = props == null ? "" : props.optString("from");
                String date = t.optString("date"), path = t.isNull("path") ? "" : t.optString("path");
                // the deadline calendars' events are already among the events (as on the desktop's grid)
                if ("event".equals(kind) || t.optBoolean("done") || path.isEmpty() || date.length() != 10) continue;
                if (date.compareTo(first) < 0 || date.compareTo(last) > 0) continue;
                r.items.add(AgendaRows.Item.due(t.optString("title"), date, path, t.isNull("line") ? 0 : t.optInt("line"), "note".equals(kind)));
            }
        } catch (Exception e) {
            r.noTasks = "Tasks not read: " + (e.getMessage() == null ? e.toString() : e.getMessage());
            android.util.Log.w("AtlasAgenda", r.noTasks);
        }
        return r;
    }

    /** Ticks the task as Home does (its ✅ date, a repeating one's next occurrence); null when done, else why not. */
    static String tick(Context c, String vault, AgendaRows.Item t) {
        try {
            JSONObject ref = new JSONObject().put("path", t.path).put("line", t.line);
            new VaultFiles.OnServer(c, vault).send("POST", "/api/task/tick", "application/json", ref.toString().getBytes(StandardCharsets.UTF_8));
            return null;
        } catch (Exception e) {
            return e.getMessage() == null ? e.toString() : e.getMessage();
        }
    }
}
