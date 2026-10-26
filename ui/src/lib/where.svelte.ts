// Where each device of the vault is — the file it shows and a PDF's page — told to the others through one live room
// (`.atlas/cache/where`, never a file; core live.rs, the server's room for a mirrored vault). Glance mode follows
// another device: what it shows opens here full screen, without the app's bars, and moves when it moves.
import { joinLive, type Live } from "./live";
import { openPath } from "./dock";
import { fullscreen, toggleFullscreen } from "./fullscreen.svelte";
import { closable } from "./back";
import { pick } from "./palette.svelte";
import { toast } from "./state.svelte";
import { shownHooks } from "./registry";

const ROOM = ".atlas/cache/where";
/** A place on a device: the file it shows, and the page when it is a PDF. */
export interface At { path: string; page?: number }

let live: Live | null = null;
let here: At | null = null;
let sendTimer = 0;
/** The other devices' last place, by their peer number in the room. */
const there = new Map<number, At>();
export const glance = $state({ following: 0, name: "" });
let unclose: (() => void) | null = null;

const name = (peer: number) => live?.peers().find((p) => p.peer === peer)?.name ?? "another device";
const same = (a: At | null, b: At) => !!a && a.path === b.path && a.page === b.page;

/** Joins the room for this page's life: answers newcomers with where this device is. */
export function startWhere(): () => void {
  live = joinLive(ROOM, {
    message(from, m) {
      if (m.t !== "at" || typeof m.path !== "string") return;
      const at: At = { path: m.path, page: typeof m.page === "number" ? m.page : undefined };
      there.set(from, at);
      if (glance.following === from) show(at);
    },
    hello: () => send(),
    joined: () => send(),
    left(peer) {
      there.delete(peer);
      if (glance.following === peer) stopGlance(`${glance.name} left`);
    },
  });
  const shown = (path: string) => tellWhere({ path });
  shownHooks.add(shown);
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && glance.following) { e.preventDefault(); stopGlance(); } };
  window.addEventListener("keydown", onKey, true);
  return () => { shownHooks.delete(shown); window.removeEventListener("keydown", onKey, true); live?.close(); live = null; };
}

/** This device now shows `at` (a tab came forward, a PDF turned a page): told to the others, a moment later. */
export function tellWhere(at: At | null): void {
  if (!at || same(here, at)) return;
  here = at;
  if (glance.following) return; // a glancing device shows what it follows: no echo back
  clearTimeout(sendTimer);
  sendTimer = window.setTimeout(send, 250);
}
function send(): void {
  if (here && !glance.following) live?.send({ t: "at", path: here.path, ...(here.page ? { page: here.page } : {}) });
}

function show(at: At): void {
  openPath(at.path, at.page);
}

/** "Glance: follow another device": the one there is, or a choice among them. */
export function followDevice(): void {
  const devices = [...there.entries()];
  if (!devices.length) return void toast("No other device to follow", "Open the vault on another device (the Boox, the phone, another window): it shows up here once it opens a file.");
  if (devices.length === 1) return startGlance(devices[0][0]);
  pick({
    placeholder: "Follow which device…", tag: "Glance", icon: "eye",
    items: devices.map(([peer, at]) => ({ value: String(peer), title: name(peer), detail: at.page ? `${at.path} · page ${at.page}` : at.path })),
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
