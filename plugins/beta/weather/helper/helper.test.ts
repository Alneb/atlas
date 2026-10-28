// The helper through the SDK's harness: Open-Meteo's answers (cut down) as a template and a day's log see them.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness, Status } from "atlas-helper/testing";
import "./helper";

const GEO = { results: [{ name: "Oslo", admin1: "Oslo", country: "Norway", latitude: 59.91, longitude: 10.75 }] };
const FORECAST = {
  current: { temperature_2m: 9.6, apparent_temperature: 6.8, relative_humidity_2m: 81, wind_speed_10m: 14.2, weather_code: 61 },
  daily: { temperature_2m_max: [12.1], temperature_2m_min: [4.4], sunrise: ["2026-10-17T07:08"], sunset: ["2026-10-17T18:02"], precipitation_sum: [3.2] },
};
const web = (url: string) => (url.includes("geocoding") ? GEO : url.includes("forecast") ? FORECAST : { city: "Massy", latitude: 48.7, longitude: 2.28 });

const d = new Date();
const TODAY = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const LOG = `notes/log/${TODAY}.md`;

/** A vault of `files` (path → text); the properties written land in `written`. */
function vault(files: Record<string, string>, written: Record<string, string> = {}) {
  harness.api = (verb, path, body) => {
    if (verb === "GET" && path.startsWith("/api/file")) {
      const p = decodeURIComponent(path.split("path=")[1] ?? "");
      if (!(p in files)) throw new Status(404, "no such file");
      return { text: files[p] };
    }
    if (verb === "GET" && path.startsWith("/api/today")) return { log: { path: LOG } };
    if (verb === "PUT" && path === "/api/property") return void (written[body.key] = body.text);
    throw new Status(404, `${verb} ${path}`);
  };
  return written;
}

beforeEach(() => {
  harness.reset();
  harness.web = web;
});

test("the place set gives a summary in the vault's language", async () => {
  const w = await harness.call("now", { settings: { place: "Oslo", language: "es" } });
  assert.deepEqual([w.city, w.temperature, w.condition], ["Oslo", "10 °C", "lluvia ligera"]);
  assert.equal(w.summary, "10 °C, lluvia ligera, 4 °C / 12 °C");
  assert.deepEqual([w.sunrise, w.rain, w.humidity, w.icon], ["07:08", "3.2 mm", "81 %", "🌧"]);
});

test("without a place the machine's address is used", async () => {
  const w = await harness.call("now", { settings: {} });
  assert.deepEqual([w.city, w.condition], ["Massy", "light rain"]);
  assert.ok(harness.asked[0].url.startsWith("https://api.seeip.org"));
});

test("an unknown place says so", async () => {
  harness.web = (url) => (url.includes("geocoding") ? { results: [] } : FORECAST);
  await assert.rejects(harness.call("now", { settings: { place: "Nowhere" } }), /no place called "Nowhere"/);
});

test("the day's weather on today's log, once, and never an old day's", async () => {
  const written = vault({ [LOG]: "---\ndate: x\n---\n" });
  const p = { path: LOG, settings: { place: "Oslo" } };
  assert.deepEqual(await harness.call("log_day", p), { skipped: "weather noted" });
  assert.equal(written.weather, "🌧 10 °C, light rain, 4 °C / 12 °C · Oslo · ↑07:08 ↓18:02");
  vault({ [LOG]: "weather: 4 °C" }, {});
  assert.equal((await harness.call("log_day", p)).skipped, "the day has its weather");
  assert.equal((await harness.call("log_day", { path: "notes/log/2020-01-01.md" })).skipped, "not today's log");
  assert.equal((await harness.call("log_day", { path: "notes/idea.md" })).skipped, "not a day's log");
});

test("today's log is filled once it is there", async () => {
  vault({});
  assert.deepEqual(await harness.call("fill_today", { settings: { place: "Oslo" } }), { skipped: "no log today yet" });
  const written = vault({ [LOG]: "---\ndate: x\n---\n" });
  await harness.call("fill_today", { settings: { place: "Oslo" } });
  assert.ok(written.weather.startsWith("🌧 10 °C"), written.weather);
});
