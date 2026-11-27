// node --test plugins/beta/immich/im.test.mjs — the plugin's logic on cut-down copies of Immich's answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forAgent, itemsOf, keptName, listBody, rowOf, sendable, smartBody, subOf, uploadRequest, viewOf } from "./im.js";

const PHOTO = { id: "a1", type: "IMAGE", originalFileName: "beach.jpg", localDateTime: "2026-03-14T16:20:00.000Z", fileCreatedAt: "2026-03-14T15:20:00.000Z",
  exifInfo: { city: "Lisbon", country: "Portugal", make: "Google", model: "Pixel 8", description: "" }, people: [{ id: "p1", name: "Ana" }, { id: "p2", name: "" }], isFavorite: true };

test("an asset becomes a row: taken in local time, its month, place and named people", () => {
  const r = rowOf(PHOTO);
  assert.deepEqual([r.date, r.month, r.monthKey, r.place, r.people, r.camera, r.video], ["2026-03-14", "2026 March", "2026-03", "Lisbon, Portugal", ["Ana"], "Google Pixel 8", false]);
  assert.equal(subOf(r), "2026-03-14 · Lisbon, Portugal · Ana");
  assert.equal(rowOf({ id: "v", type: "VIDEO", fileCreatedAt: "2025-12-01T00:00:00Z" }).month, "2025 December");
  assert.equal(rowOf({ id: "x" }).month, "");
});

test("the listing asks newest first with places and people; the smart search clamps its size", () => {
  assert.deepEqual(listBody(3), { page: 3, size: 250, order: "desc", withExif: true, withPeople: true });
  assert.deepEqual(smartBody("  dog on a beach ", 999), { query: "dog on a beach", size: 250, withExif: true });
  assert.deepEqual(itemsOf({ assets: { items: [PHOTO], nextPage: "2" } }).more, true);
  assert.deepEqual(itemsOf({ assets: { items: [], nextPage: null } }), { items: [], more: false });
});

test("the kept original is named by its file, never a path", () => {
  assert.equal(keptName(rowOf(PHOTO)), "beach.jpg");
  assert.equal(keptName(rowOf({ id: "z", originalFileName: "../../a/b.png" })), "_.._a_b.png");
  assert.equal(keptName(rowOf({ id: "z", type: "VIDEO", originalFileName: "" })), "z.mp4");
});

test("an agent reads what, when, where and who, with the link", () => {
  assert.deepEqual(forAgent(rowOf(PHOTO), "https://photos.example.org"), {
    id: "a1", type: "photo", file: "beach.jpg", taken: "2026-03-14T16:20:00.000Z", place: "Lisbon, Portugal", people: ["Ana"], favorite: true, url: "https://photos.example.org/photos/a1",
  });
});

test("a picture is sent as Immich's upload form, named for this device by its vault path", () => {
  assert.deepEqual(uploadRequest("pictures/cat.HEIC", "laptop", "2026-11-27T10:00:00.000Z"), {
    path: "/api/assets",
    init: { method: "POST", multipart: { file: "pictures/cat.HEIC", field: "assetData", fields: { deviceAssetId: "atlas:pictures/cat.HEIC", deviceId: "laptop", fileCreatedAt: "2026-11-27T10:00:00.000Z", fileModifiedAt: "2026-11-27T10:00:00.000Z" } } },
  });
  assert.equal(sendable("pictures/cat.HEIC"), true);
  assert.equal(sendable("notes/a.md"), false);
});

test("Open fetches the original, or the preview of one a page cannot draw", () => {
  assert.deepEqual(viewOf(rowOf(PHOTO)), { path: "/api/assets/a1/original", name: "beach.jpg" });
  assert.deepEqual(viewOf(rowOf({ id: "h", originalFileName: "IMG_1.HEIC" })), { path: "/api/assets/h/thumbnail?size=preview", name: "IMG_1.jpg" });
});
