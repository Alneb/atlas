// Where each device of the vault is — the file it shows, a PDF's page, a note's line — told to the others through one
// live room (`.atlas/cache/where`, never a file; core live.rs, the server's room for a mirrored vault). The core keeps
// each device's last place, so `GET /api/where` answers a client with no socket in the room (the phone app's native
// Files). `elsewhere` lists what the other devices show (the status bar's chips, "Open what another device shows": one
// click opens it at its place). `[ui] share_place` off: this device says nothing (and `nowhere` once, so it is no longer
// listed), but still sees the others. Glance mode follows another device: what it shows opens here full screen,
// without the app's bars, and moves when it moves.
import { joinLive, type Live } from "./live";
import { settings, onSettings } from "./settings.svelte";
import { load, save } from "./prefs";
import { openPath } from "./dock";
import { fullscreen, toggleFullscreen } from "./fullscreen.svelte";
import { closable } from "./back";
import { pick } from "./palette.svelte";
import { toast } from "./state.svelte";
import { shownHooks, placeHooks } from "./registry";

const ROOM = ".atlas/cache/where";
/** A place on a device: the file it shows, and the page when it is a PDF, the caret's line (1-based) in a note. */
export interface At { path: string; page?: number; line?: number }

/** This device's id in the room, stable: the phone app's own (its native Files leaves itself out of the list by it),
 *  else one made once for this browser and vault. */
function deviceId(): string {
  const native = (globalThis as unknown as { AtlasNative?: { deviceId?(): string } }).AtlasNative?.deviceId?.();
  if (native) return native;
  let id = load<string>("atlas.where.device", "");
  if (!id) save("atlas.where.device", (id = Math.random().toString(36).slice(2, 12)));
  return id;
}
const sharing = () => settings.config?.ui.share_place ?? true;

let live: Live | null = null;
let here: At | null = null;
let sendTimer = 0;
/** The other devices' last place, by their peer number in the room. */
const there = new Map<number, At>();
export const glance = $state({ following: 0, name: "" });
/** What each other device shows now, but what this one shows too: where a click takes you. */
export const elsewhere = $state<{ peer: number; name: string; at: At }[]>([]);
function listed(): void {
  const now = [...there.entries()].filter(([, at]) => !same(here, at) && !(here && here.path === at.path)).map(([peer, at]) => ({ peer, name: name(peer), at }));
  elsewhere.splice(0, elsewhere.length, ...now);
}
let unclose: (() => void) | null = null;

const name = (peer: number) => live?.peers().find((p) => p.peer === peer)?.name ?? "another device";
const same = (a: At | null, b: At) => !!a && a.path === b.path && a.page === b.page && a.line === b.line;

/** Joins the room for this page's life: answers newcomers with where this device is. */
export function startWhere(): () => void {
  live = joinLive(ROOM, {
    message(from, m) {
      if (m.t === "nowhere") { there.delete(from); listed(); if (glance.following === from) stopGlance(`${glance.name} stopped sharing its place`); return; }
      if (m.t !== "at" || typeof m.path !== "string") return;
      const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);
      const at: At = { path: m.path, page: num(m.page), line: num(m.line) };
      there.set(from, at);
      listed();
      if (glance.following === from) show(at);
    },
    hello: () => send(),
    joined: () => { send(); listed(); }, // its name, which may come after its first message
    left(peer) {
      there.delete(peer);
      listed();
      if (glance.following === peer) stopGlance(`${glance.name} left`);
    },
  });
  const shown = (path: string) => tellWhere({ path });
  shownHooks.add(shown);
  placeHooks.add(notePlace);
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && glance.following) { e.preventDefault(); stopGlance(); } };
  window.addEventListener("keydown", onKey, true);
  // the switch turned: said at once (nowhere, or where this device is)
  let shared = sharing();
  const offSettings = onSettings(() => { if (sharing() === shared) return; shared = sharing(); if (shared) send(); else live?.send({ t: "nowhere" }); });
  return () => { shownHooks.delete(shown); placeHooks.delete(notePlace); offSettings(); window.removeEventListener("keydown", onKey, true); live?.close(); live = null; };
}

/** This device now shows `at` (a tab came forward, a PDF turned a page): told to the others, a moment later. */
export function tellWhere(at: At | null): void {
  if (!at || same(here, at)) return;
  if (here && at.path === here.path && at.line === undefined && at.page === undefined) return; // the tab again: its line stays
  here = at;
  listed();
  if (glance.following) return; // a glancing device shows what it follows: no echo back
  clearTimeout(sendTimer);
  sendTimer = window.setTimeout(send, 250);
}
/** The caret of the note `path` moved to `line` (editor/create.ts, as it keeps the note's place): said when that note
 *  is what this device shows. */
export function notePlace(path: string, line: number): void {
  if (here?.path === path && here.line !== line) tellWhere({ path, line });
}

function send(): void {
  if (!here || glance.following || !sharing()) return;
  live?.send({ t: "at", path: here.path, device: deviceId(), ...(here.page ? { page: here.page } : {}), ...(here.line ? { line: here.line } : {}) });
}

/** Where `d` is, opened here: a PDF at its page, a note at its line. */
const openAt = (at: At) => openPath(at.path, at.page ?? at.line);
/** The supporting words for a place: its file, and the page or line. */
export const placeDetail = (at: At) => `${at.path}${at.page ? ` · page ${at.page}` : at.line ? ` · line ${at.line}` : ""}`;

function show(at: At): void {
  openAt(at);
}

/** What another device shows, opened here once (its page for a PDF): the one there is, or a choice among them. */
export function openElsewhere(peer?: number): void {
  const pickFrom = peer !== undefined ? elsewhere.filter((d) => d.peer === peer) : elsewhere;
  if (!pickFrom.length) return void toast("No other device shows anything else", "Open the vault on another device (the Boox, the phone, another window): what it shows is listed here.");
  if (pickFrom.length === 1) return void openAt(pickFrom[0].at);
  pick({
    placeholder: "Open what which device shows…", tag: "Devices", icon: "eye",
    items: pickFrom.map((d) => ({ value: String(d.peer), title: d.name, detail: placeDetail(d.at) })),
    onpick: (v) => { const d = pickFrom.find((x) => String(x.peer) === v); if (d) openAt(d.at); },
  });
}

/** "Glance: follow another device": the one there is, or a choice among them. */
export function followDevice(): void {
  const devices = [...there.entries()];
  if (!devices.length) return void toast("No other device to follow", "Open the vault on another device (the Boox, the phone, another window): it shows up here once it opens a file.");
  if (devices.length === 1) return startGlance(devices[0][0]);
  pick({
    placeholder: "Follow which device…", tag: "Glance", icon: "eye",
    items: devices.map(([peer, at]) => ({ value: String(peer), title: name(peer), detail: placeDetail(at) })),
    onpick: (v) => startGlance(Number(v)),
  });
}

function startGlance(peer: number): void {
  const at = there.get(peer);
  if (!at) return;
  glance.following = peer;
  glance.name = name(peer);
  document.documentElement.classList.add("glance");
  show(at);
  if (!fullscreen.on) void toggleFullscreen(true);
  unclose = closable(() => stopGlance()); // a phone's Back leaves it too
  toast(`Following ${glance.name}`, "What it shows opens here. Esc stops.");
}

export function stopGlance(why?: string): void {
  if (!glance.following) return;
  glance.following = 0;
  document.documentElement.classList.remove("glance");
  unclose?.();
  unclose = null;
  if (fullscreen.on) void toggleFullscreen(true);
  if (why) toast("Glance ended", why);
  send();
}
