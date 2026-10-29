// MusicBrainz's answers (cut down) as the catalog sees them — offline.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import "./helper";
import { cleanArtist, cleanTitle, firstAlbum } from "./music";

const RG = { id: "b1392450-e666-3926-a536-22c65f834433", title: "OK Computer", "first-release-date": "1997-05-21",
  "artist-credit": [{ name: "Radiohead" }], genres: [{ name: "alternative rock", count: 9 }, { name: "art rock", count: 7 }],
  releases: [{ media: [{ "track-count": 12 }] }] };
const REC = { id: "rec-1", title: "Never Gonna Give You Up", length: 213000, "first-release-date": "1987-07-27",
  "artist-credit": [{ name: "Rick Astley" }], genres: [],
  releases: [{ title: "Big Tunes", date: "1990", status: "Official", "release-group": { "primary-type": "Album", "secondary-types": ["Compilation"] } },
    { title: "Whenever You Need Somebody", date: "1987-11-16", status: "Official", "release-group": { "primary-type": "Album", "secondary-types": [] } }] };

/** Answers by a piece of the address (the first that matches), anything else a 404. */
const web = (answers: Record<string, object>) => { harness.web = (url) => Object.entries(answers).find(([k]) => url.includes(k))?.[1] ?? null; };
const asked = () => harness.asked.map((r) => r.url);

beforeEach(() => harness.reset());

test("a video's name and a channel's name become the song's and the artist's", () => {
  assert.equal(cleanTitle("Rick Astley - Never Gonna Give You Up (Official Video) [4K Remaster]"), "Never Gonna Give You Up");
  assert.equal(cleanTitle("Bohemian Rhapsody (Remastered 2011)"), "Bohemian Rhapsody");
  assert.deepEqual(["Queen - Topic", "RickAstleyVEVO", "Radiohead Official"].map(cleanArtist), ["Queen", "Rick Astley", "Radiohead"]);
});

test("a song's album is its first studio album, not a compilation", () => {
  assert.equal(firstAlbum(REC.releases), "Whenever You Need Somebody");
});

test("an album by its link relation gives artist, year, tracks, genres and cover", async () => {
  web({ "/url?resource=": { relations: [{ "release-group": { id: RG.id } }] }, [`/release-group/${RG.id}`]: RG });
  const r = await harness.call("music", { kind: "album", url: "https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE" });
  assert.deepEqual(r.ids, { musicbrainz: RG.id });
  const f = r.fields;
  assert.deepEqual([f.title, f.artist, f.year, f.tracks], ["OK Computer", "Radiohead", 1997, 12]);
  assert.deepEqual(f.genres, ["Alternative Rock", "Art Rock"]);
  assert.ok(f.cover.endsWith(`/release-group/${RG.id}/front-500`));
  assert.ok(asked()[0].includes("open.spotify.com"));
  assert.ok(asked()[0].includes("resource=https%3A%2F%2Fopen.spotify.com"), "the whole address escaped");
});

test("a song is searched only with its artist, and the earliest exact title wins", async () => {
  web({});
  assert.deepEqual(await harness.call("music", { kind: "song", hints: { title: "Never Gonna Give You Up" } }), { fields: {}, skipped: "MusicBrainz has no sure match" });
  const hits = { recordings: [
    { id: "live", title: "Never Gonna Give You Up", score: 100, "first-release-date": "2010", disambiguation: "live" },
    { id: "cover", title: "Never Gonna Give You Up (cover)", score: 95, "first-release-date": "1999" },
    { id: "rec-1", title: "Never Gonna Give You Up", score: 100, "first-release-date": "1987-07-27" },
    { id: "late", title: "Never Gonna Give You Up", score: 100, "first-release-date": "2019" }] };
  harness.reset();
  web({ "/recording?query=": hits, "/recording/rec-1": REC });
  const r = await harness.call("music", { kind: "song", hints: { title: "Rick Astley - Never Gonna Give You Up (Official Video)", channel: "RickAstleyVEVO" } });
  assert.deepEqual(r.ids, { musicbrainz: "rec-1" });
  assert.deepEqual([r.fields.duration, r.fields.album], ["3:33", "Whenever You Need Somebody"]);
  assert.ok(asked()[0].includes("artist%3A%22Rick%20Astley%22"), asked()[0]);
});

test("nothing to go on waits for the page, and an unsure hit is not filed", async () => {
  web({});
  assert.deepEqual(await harness.call("music", { kind: "album" }), { later: true });
  web({ "/release-group?query=": { "release-groups": [{ id: "x", title: "OK Computer", score: 72 }] } });
  assert.ok((await harness.call("music", { kind: "album", hints: { title: "OK Computer", artist: "Radiohead" } })).skipped);
  assert.ok((await harness.call("music", { kind: "video" })).skipped);
});
