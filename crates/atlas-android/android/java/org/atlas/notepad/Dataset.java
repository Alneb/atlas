package org.atlas.notepad;

import org.atlas.capture.Host;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The user's shapes, kept to train better recognisers: each snap as one JSON line in the vault, a file a day —
 *  `.atlas/datasets/shapes/<date>.jsonl` — the stroke as drawn (scene units, pressure, ms), what it became, which
 *  recogniser, and the user's verdict: kept, or undone (a snap taken back is a "not that shape"). In the vault so it
 *  syncs to the computer, where boox_5c_re's trainers read it; small files, so an append (read + write) stays cheap. */
final class Dataset {
    static final String DIR = ".atlas/datasets/shapes/";
    private static final ExecutorService ONE = Executors.newSingleThreadExecutor(); // in order, off the UI thread
    private final Host host;

    Dataset(Host host) { this.host = host; }

    /** One snap: `samples` as Pad keeps them (x, y, pressure, tiltX, tiltY, tMs each), `wire` the recogniser's answer. */
    JSONObject snap(float[] samples, int stride, String recogniser, float[] wire, String pen) {
        try {
            JSONArray pts = new JSONArray();
            for (int i = 0; i + stride <= samples.length; i += stride)
                pts.put(new JSONArray().put(r2(samples[i])).put(r2(samples[i + 1])).put(r2(samples[i + 2])).put(Math.round(samples[i + 5])));
            JSONArray w = new JSONArray();
            for (float f : wire) w.put(r2(f));
            return new JSONObject().put("kind", "shape").put("at", System.currentTimeMillis()).put("recogniser", recogniser)
                .put("pen", pen).put("points", pts).put("answer", w);
        } catch (JSONException e) { return null; }
    }

    /** The record with the user's verdict, appended to today's file. */
    void keep(JSONObject record, String verdict) {
        if (record == null) return;
        try { record = new JSONObject(record.toString()).put("verdict", verdict).put("verdictAt", System.currentTimeMillis()); } catch (JSONException e) { return; }
        String line = record.toString() + "\n";
        String path = DIR + new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()) + ".jsonl";
        ONE.execute(() -> {
            try {
                String had = host.exists(path) ? host.readText(path) : "";
                host.write(path, ((had == null ? "" : had) + line).getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) { /* a lost sample, never a lost drawing */ }
        });
    }

    private static double r2(float v) { return Math.round(v * 100) / 100.0; }
}
