// node --test plugins/beta/jellyfin/jf.test.mjs — the plugin's logic on cut-down copies of Jellyfin's answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { playItem, thingOf, reportRequests, rowOf, streamPath, subtitlePaths, ticks } from "./jf.js";

const FILM = { Id: "f1", Type: "Movie", Name: "Arrival", ProductionYear: 2016, RunTimeTicks: 6960 * 1e7, Genres: ["Drama"], Overview: "Linguist meets heptapods.",
  ProviderIds: { Tmdb: "329865", Imdb: "tt2543164", Tvdb: "" }, UserData: { PlaybackPositionTicks: 1200 * 1e7, Played: false, LastPlayedDate: "2026-11-10T20:00:00Z" } };
const EP = { Id: "e1", Type: "Episode", Name: "Secrets", SeriesName: "Dark", SeriesId: "s1", ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: 3060 * 1e7, UserData: { Played: true } };

test("an item becomes a row: titles, how far, the catalog's ids", () => {
  const f = rowOf(FILM);
  assert.equal(f.title, "Arrival");
  assert.equal(f.at, 1200);
  assert.ok(Math.abs(f.progress - 1200 / 6960) < 1e-9);
  assert.deepEqual(f.ids, { tmdb: "329865", imdb: "tt2543164" });
  const e = rowOf(EP);
  assert.equal(e.title, "Dark — S01E01 Secrets");
  assert.equal(e.progress, 1);
});

test("it plays from where it was left, from the start when finished or nearly", () => {
  const f = rowOf(FILM);
  const it = playItem(f, "http://127.0.0.1:1/media/t", "films/Arrival (2016).md");
  assert.deepEqual([it.at, it.video, it.tracks[0].duration, it.note, it.key], [1200, true, 6960, "films/Arrival (2016).md", { item: "f1" }]);
  assert.equal(playItem({ ...f, at: 6930 }, "x").at, 0);
  assert.equal(playItem(rowOf(EP), "x").at, 0);
  assert.equal(streamPath("a b"), "/Videos/a%20b/stream?static=true&mediaSourceId=a%20b");
});

test("reports open the play session once, then progress, and stop at the end or a close", () => {
  const first = reportRequests({ key: { item: "f1" }, at: 10, state: "playing" });
  assert.deepEqual(first.requests.map(([p]) => p), ["/Sessions/Playing", "/Sessions/Playing/Progress"]);
  assert.equal(first.requests[1][1].PositionTicks, ticks(10));
  assert.deepEqual(first.key, { item: "f1", started: true });
  const pause = reportRequests({ key: first.key, at: 20, state: "paused" });
  assert.deepEqual(pause.requests.map(([p, b]) => [p, b.IsPaused]), [["/Sessions/Playing/Progress", true]]);
  const stop = reportRequests({ key: first.key, at: 6960, state: "ended" });
  assert.deepEqual(stop.requests.map(([p]) => p), ["/Sessions/Playing/Stopped"]);
  assert.deepEqual(stop.key, { item: "f1" });
  assert.throws(() => reportRequests({ key: {}, at: 0, state: "playing" }));
});

test("a film's note is the catalog's, asked by kind and ids; an episode asks for its series; watching past the start makes it yours", () => {
  const f = rowOf(FILM);
  const t = thingOf(f, "https://media.example.org");
  assert.equal(t.kind, "movie");
  assert.deepEqual(t.ids, { tmdb: "329865", imdb: "tt2543164" });
  assert.equal(t.fields.title, "Arrival");
  assert.equal(t.fields.jellyfin, "https://media.example.org/web/#/details?id=f1");
  assert.equal(thingOf({ ...f, at: 0, played: false }, "").why, "opened");
  assert.deepEqual([thingOf({ ...f, at: 600, length: 6000, played: false }, "").why, thingOf({ ...f, at: 600, length: 6000, played: false }, "").progress], ["progress", 0.1]);
  assert.equal(thingOf(f, "", "asked").why, "asked");
  const ep = thingOf({ ...f, type: "Episode", seriesId: "s1", series: "Severance", title: "Severance — S1E1" }, "");
  assert.deepEqual([ep.kind, ep.fields.title, ep.ids], ["show", "Severance", {}]);
});

test("external subtitle files are asked for by their stream index; the ones in the file need nothing", () => {
  const item = { Id: "f1", MediaSources: [{ Id: "ms1", MediaStreams: [
    { Type: "Video", Index: 0 }, { Type: "Subtitle", Index: 2, IsExternal: false, Codec: "subrip" },
    { Type: "Subtitle", Index: 3, IsExternal: true, Codec: "subrip" }, { Type: "Subtitle", Index: 4, IsExternal: true, Codec: "ass" },
  ] }] };
  assert.deepEqual(subtitlePaths(item), ["/Videos/f1/ms1/Subtitles/3/Stream.srt", "/Videos/f1/ms1/Subtitles/4/Stream.ass"]);
  assert.deepEqual(subtitlePaths({ Id: "x" }), []);
  assert.deepEqual(playItem(rowOf(FILM), "s", undefined, ["a.srt"]).subtitles, ["a.srt"]);
  assert.equal("subtitles" in playItem(rowOf(FILM), "s"), false);
});
