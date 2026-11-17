// The app's one player (`atlas.player`, docs/guides/PLUGIN-API.md): a plugin's audio — an audiobook, a podcast — played
// outside any pane, so closing the pane does not stop it, and one thing plays at a time (a second `play` replaces the
// first, which is reported closed). Three engines behind one interface:
//   - the page's own: one <audio> of this module (the desktop app, a browser), with the system's media keys;
//   - the phone app's MediaService (crates/atlas-android/…/MediaService.java), reached through `AtlasNative.player`: it
//     plays on with the screen off and gives the lock screen, the notification and a headset their controls. Its state
//     comes back through `window.__atlasPlayer(json)`;
//   - video on the desktop: mpv in its own window, run by the desktop's core (mpv.rs, `/api/player/mpv`), its state
//     polled (docs/design/DESIGN-video-player.md).
// Where you are is reported to the plugin (`[media] progress` in its manifest, the core's
// `/api/plugins/<id>/media/progress`) every 15 s while playing, on pause, at the end and on close — on the phone by the
// service itself, as the page may be gone. A report's answer may carry a new `key` (the plugin opened a new session on
// its server): the reports after it send that one.
import { api, apiBase, ApiError, type MpvState } from "./api";
import { chapterAt, nextChapter, placeOf, previousChapter, timeLink, type PlayerChapter, type PlayerTrack } from "./player-time";
export { clockOf } from "./player-time";
export type { PlayerChapter, PlayerTrack } from "./player-time";

export interface PlayerItem {
  /** The plugin's own: what its reports are about (Audiobookshelf: the item, the play session, the device). */
  key: unknown;
  title: string;
  author?: string;
  /** An address the page can show (`atlas.fileUrl`). */
  cover?: string;
  tracks: PlayerTrack[];
  chapters?: PlayerChapter[];
  /** Where to start (seconds into the item) and the speed (1 when not said). */
  at?: number;
  speed?: number;
  /** The plugin pane's argument that shows this item: the lower bar's cell opens it. */
  open?: string;
  /** A film, an episode: played by mpv on the desktop (its own window); on the phone, for now, its sound only. */
  video?: boolean;
  /** A file of the vault to play instead of `tracks` (a video kept in the vault). */
  file?: string;
  /** Subtitle files beside a video (a server's external ones): addresses the page can reach (`atlas.media`). */
  subtitles?: string[];
  /** The vault note of the thing (a film's note): time links `[[note#t=1:02:03]]` in it seek this item. */
  note?: string;
}
/** The sleep timer: minutes from now, the end of the current chapter, or off. */
export type Sleep = { minutes: number } | "chapter" | null;
export interface PlayerState {
  plugin: string;
  key: unknown;
  title: string;
  author: string;
  cover: string;
  chapters: PlayerChapter[];
  duration: number;
  /** Seconds into the item. */
  at: number;
  playing: boolean;
  speed: number;
  /** The chapter `at` is in (-1: none). */
  chapter: number;
  /** ms until the sleep timer stops it; -1: at the chapter's end; 0: off. */
  sleep: number;
  /** What went wrong last ("" when nothing): a track that would not load, a report not taken. */
  error: string;
  open?: string;
  video?: boolean;
  note?: string;
  /** The subtitle line shown now (video), for quoting it into a note. */
  subText?: string;
}

export const REPORT_MS = 15_000;
const LOAD_MS = 15_000;

/** What plays now, for the shell (the lower bar's cell) — the same object the plugins' `on` gets. */
export const nowPlaying = $state<{ s: PlayerState | null }>({ s: null });
const listeners = new Set<(s: PlayerState | null) => void>();
function emit(s: PlayerState | null) {
  nowPlaying.s = s;
  for (const fn of listeners) try { fn(s); } catch (e) { console.error("atlas.player listener", e); }
}
export function onPlayer(fn: (s: PlayerState | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

interface Engine {
  play(plugin: string, item: PlayerItem): Promise<void>;
  resume(): void;
  pause(): void;
  seek(t: number): void;
  speed(s: number): void;
  sleep(s: Sleep): void;
  close(): void;
}

/** One report to the plugin (both page engines): `taken` the listened seconds it took; `off` when the plugin takes
 * no reports (404); a new `key` when its answer brought one. */
async function sendReport(who: { plugin: string; key: unknown }, report: { at: number; duration: number; listened: number; state: string }): Promise<{ taken: number; off?: true; error?: string }> {
  if (!who.plugin) return { taken: 0, off: true }; // the shell's own (a video of the vault): nobody to tell
  try {
    const r = await api.mediaProgress(who.plugin, { key: who.key, ...report });
    if (r && typeof r === "object" && "key" in r && r.key !== undefined) who.key = r.key;
    return { taken: report.listened };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { taken: 0, off: true };
    return { taken: 0, error: `Not synced: ${e instanceof Error ? e.message : e}` };
  }
}

// ---- the phone app's service ----
interface NativeBridge { player?(cmd: string, arg: string): void }
const bridge = (): NativeBridge | undefined => (globalThis as unknown as { AtlasNative?: NativeBridge }).AtlasNative;
const absolute = (u: string) => new URL(u, location.href).href;

/** A cover the service can read: a page's own `blob:` address (`atlas.fileUrl`) as a `data:` one, others absolute. */
async function portable(u: string): Promise<string | undefined> {
  if (!u.startsWith("blob:")) return absolute(u);
  try {
    const blob = await (await fetch(u)).blob();
    return await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
  } catch { return undefined; } // no cover on the lock screen, the book still plays
}

function nativeEngine(b: Required<NativeBridge>): Engine {
  // the service's state, as it changes (and once when the page comes back to a service already playing)
  (globalThis as unknown as { __atlasPlayer?: (s: PlayerState | null) => void }).__atlasPlayer = (s) => emit(s);
  const send = (cmd: string, arg: unknown = null) => b.player(cmd, JSON.stringify(arg));
  return {
    async play(plugin, item) {
      send("play", {
        plugin, item: { ...item, tracks: item.tracks.map((t) => ({ ...t, src: absolute(t.src) })), cover: item.cover ? await portable(item.cover) : undefined },
        report: absolute(`${apiBase()}/api/plugins/${encodeURIComponent(plugin)}/media/progress`),
      });
    },
    resume: () => send("resume"),
    pause: () => send("pause"),
    seek: (t) => send("seek", t),
    speed: (s) => send("speed", s),
    sleep: (s) => send("sleep", s === "chapter" ? -1 : s ? s.minutes : 0),
    close: () => send("close"),
  };
}

// ---- the page's own <audio> ----
function webEngine(): Engine {
  let cur: { plugin: string; item: PlayerItem; key: unknown; reports: boolean } | null = null;
  let audio: HTMLAudioElement | null = null;
  let track = -1, speed = 1, error = "";
  // the seek asked last (an older one finishing late does nothing), the time it goes to while its track loads, whether
  // the audio was asked for again after an error (once, until it plays)
  let wanted = 0, going: number | null = null, retried = false;
  let listened = 0, lastTick = 0, reportT = 0, sleepAt = 0, sleepChapter = -1;
  const tracks = () => cur?.item.tracks ?? [];
  const chapters = () => cur?.item.chapters ?? [];
  const duration = () => tracks().reduce((s, x) => Math.max(s, x.start + x.duration), 0);
  const now = () => going ?? (track >= 0 && audio ? tracks()[track].start + audio.currentTime : cur?.item.at ?? 0);

  function state(): PlayerState | null {
    if (!cur) return null;
    const t = now();
    return {
      plugin: cur.plugin, key: cur.key, title: cur.item.title, author: cur.item.author ?? "", cover: cur.item.cover ?? "",
      chapters: chapters(), duration: duration(), at: t, playing: !!audio && !audio.paused, speed, chapter: chapterAt(chapters(), t),
      sleep: sleepAt ? Math.max(0, sleepAt - Date.now()) : sleepChapter >= 0 ? -1 : 0, error, open: cur.item.open, note: cur.item.note,
    };
  }
  const shown = () => emit(state());

  /** Where you are, to the plugin: the time listened since the last report it took (kept when one fails). */
  async function report(kind: "playing" | "paused" | "ended" | "closed", who = cur) {
    if (!who || !who.reports) return;
    const at = who === cur ? now() : who.item.at ?? 0;
    const r = await sendReport(who, { at, duration: duration(), listened: Math.round(listened), state: kind });
    listened = Math.max(0, listened - r.taken);
    if (r.off) who.reports = false; // the plugin takes no reports
    else if (r.error) error = r.error;
    else if (error.startsWith("Not synced")) error = "";
    if (who === cur) shown();
  }

  function element(): HTMLAudioElement {
    if (audio) return audio;
    const a = (audio = document.createElement("audio"));
    a.preload = "auto";
    a.addEventListener("timeupdate", () => {
      const t = performance.now();
      // the time spent listening, as a server's apps count it: by the clock, whatever the speed
      if (!a.paused && lastTick) listened += Math.min(5, (t - lastTick) / 1000);
      lastTick = t;
      if (sleepAt && Date.now() >= sleepAt) { sleepAt = 0; a.pause(); }
      if (sleepChapter >= 0 && chapterAt(chapters(), now()) !== sleepChapter) { sleepChapter = -1; a.pause(); }
      media();
      shown();
    });
    // a pause of yours (or the sleep timer's) is reported; the element also pauses at a track's end and while a new
    // track loads — those are not pauses
    a.addEventListener("pause", () => { lastTick = 0; shown(); if (!a.ended && going === null) void report("paused"); });
    a.addEventListener("play", () => { lastTick = performance.now(); error = ""; shown(); });
    a.addEventListener("playing", () => { retried = false; });
    // a track ended: the next one from its start; the last: the end, reported
    a.addEventListener("ended", () => { if (track + 1 < tracks().length) void seekTo(tracks()[track + 1].start, true); else void report("ended"); });
    // the address stopped working (the network dropped, the core restarted): asked once more, then said
    a.addEventListener("error", () => {
      if (going !== null || track < 0) return; // a seek's load: said by the seek
      if (retried) { error = "The audio could not be played (the server, or its sign-in)"; shown(); return; }
      retried = true;
      void seekTo(now(), true, true);
    });
    return a;
  }

  /** Track i into the element: resolved once its length is known; an error or 15 s without it rejects. */
  async function load(i: number) {
    const a = element();
    a.src = tracks()[i].src;
    a.defaultPlaybackRate = a.playbackRate = speed; // a new source starts at the default rate
    await new Promise<void>((ok, no) => {
      const done = (f: () => void) => { clearTimeout(late); a.removeEventListener("loadedmetadata", fine); a.removeEventListener("error", bad); f(); };
      const fine = () => done(ok), bad = () => done(() => no(new Error("the audio could not be loaded")));
      const late = setTimeout(() => done(() => no(new Error("the audio did not come in 15 s"))), LOAD_MS);
      a.addEventListener("loadedmetadata", fine);
      a.addEventListener("error", bad);
    });
  }
  /** To time t: its track loaded when another (or `fresh`: asked for again), then the place in it. The last seek wins. */
  async function seekTo(t: number, andPlay = !!audio && !audio.paused, fresh = false) {
    if (!cur || !tracks().length) return;
    const mine = ++wanted;
    t = Math.max(0, Math.min(duration() - 0.5, t));
    const { i, offset } = placeOf(tracks(), t);
    going = t;
    try {
      if (i !== track || fresh) {
        await load(i);
        if (mine !== wanted) return;
        track = i;
      }
      element().currentTime = offset;
      if (andPlay) await element().play().catch(() => {});
    } catch (e) {
      if (mine === wanted) error = `Not played: ${e instanceof Error ? e.message : e}`;
    } finally {
      if (mine === wanted) going = null;
      shown();
    }
  }

  /** The system's media controls (media keys, a headset, where the browser offers them). */
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  const HANDLERS: MediaSessionAction[] = ["play", "pause", "seekbackward", "seekforward", "previoustrack", "nexttrack", "seekto"];
  let mediaChapter = -2;
  function media(force = false) {
    if (!ms || !cur) return;
    const c = chapterAt(chapters(), now());
    try {
      if (force || c !== mediaChapter) {
        mediaChapter = c;
        ms.metadata = new MediaMetadata({ title: cur.item.title, artist: cur.item.author ?? "", album: c >= 0 ? chapters()[c].title : "", artwork: cur.item.cover ? [{ src: cur.item.cover }] : [] });
      }
      if (duration()) ms.setPositionState({ duration: duration(), position: Math.min(duration(), now()), playbackRate: speed });
    } catch { /* a browser without some of it */ }
  }
  function handlers(on: boolean) {
    if (!ms) return;
    const skip = 30;
    const table: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => engine.resume(), pause: () => engine.pause(),
      seekbackward: () => void seekTo(now() - skip), seekforward: () => void seekTo(now() + skip),
      previoustrack: () => { const t = previousChapter(chapters(), now()); if (t !== null) void seekTo(t); },
      nexttrack: () => { const t = nextChapter(chapters(), now()); if (t !== null) void seekTo(t); },
      seekto: (d) => { if (typeof d.seekTime === "number") void seekTo(d.seekTime); },
    };
    for (const h of HANDLERS) try { ms.setActionHandler(h, on ? table[h] ?? null : null); } catch { /* not offered */ }
    if (!on) ms.metadata = null;
  }

  const engine: Engine = {
    async play(plugin, item) {
      if (cur) engine.close();
      cur = { plugin, item: { ...item, tracks: [...item.tracks].sort((p, q) => p.start - q.start) }, key: item.key, reports: true };
      track = -1; speed = item.speed ?? speed; error = ""; listened = 0; sleepAt = 0; sleepChapter = -1;
      handlers(true);
      media(true);
      reportT = window.setInterval(() => { if (audio && !audio.paused) void report("playing"); }, REPORT_MS);
      if (!item.tracks.length) { error = "Nothing to play: no audio"; shown(); return; }
      await seekTo(item.at ?? 0, true);
    },
    resume: () => { void element().play().catch((e) => { error = `Not played: ${e.message ?? e}`; shown(); }); },
    pause: () => audio?.pause(),
    seek: (t) => void seekTo(t),
    speed: (s) => { speed = s; if (audio) audio.defaultPlaybackRate = audio.playbackRate = s; shown(); },
    sleep: (s) => {
      sleepAt = s && s !== "chapter" ? Date.now() + s.minutes * 60_000 : 0;
      sleepChapter = s === "chapter" ? chapterAt(chapters(), now()) : -1;
      shown();
    },
    close: () => {
      const was = cur;
      if (!was) return;
      was.item = { ...was.item, at: now() }; // where it closed, for its last report
      clearInterval(reportT);
      cur = null; track = -1; wanted++;
      if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
      handlers(false);
      void report("closed", was);
      emit(null);
    },
  };
  return engine;
}

// ---- video: mpv, run by the desktop's core ----
const POLL_MS = 500;
function mpvEngine(): Engine {
  let cur: { plugin: string; item: PlayerItem; key: unknown; reports: boolean } | null = null;
  let s: MpvState | null = null;
  let error = "", listened = 0, lastTick = 0, pollT = 0, reportT = 0, sleepAt = 0, sleepChapter = -1, endedSent = false;
  const chapters = () => cur?.item.chapters ?? [];
  const itemLength = () => (cur?.item.tracks ?? []).reduce((m, x) => Math.max(m, x.start + x.duration), 0);
  const now = () => s?.at ?? cur?.item.at ?? 0;
  const length = () => s?.duration || itemLength();
  function state(): PlayerState | null {
    if (!cur) return null;
    return {
      plugin: cur.plugin, key: cur.key, title: cur.item.title, author: cur.item.author ?? "", cover: cur.item.cover ?? "",
      chapters: chapters(), duration: length(), at: now(), playing: !!s?.playing, speed: s?.speed ?? cur.item.speed ?? 1,
      chapter: chapterAt(chapters(), now()), sleep: sleepAt ? Math.max(0, sleepAt - Date.now()) : sleepChapter >= 0 ? -1 : 0,
      error: error || s?.error || "", open: cur.item.open, video: true, note: cur.item.note ?? cur.item.file, subText: s?.sub_text ?? "",
    };
  }
  const shown = () => emit(state());
  async function report(kind: "playing" | "paused" | "ended" | "closed", who = cur) {
    if (!who || !who.reports) return;
    const r = await sendReport(who, { at: who === cur ? now() : who.item.at ?? 0, duration: length(), listened: Math.round(listened), state: kind });
    listened = Math.max(0, listened - r.taken);
    if (r.off) who.reports = false;
    else if (r.error) error = r.error;
    else if (error.startsWith("Not synced")) error = "";
    if (who === cur) shown();
  }
  const send = (cmd: { cmd: string; [k: string]: unknown }) => api.mpv(cmd).catch((e) => { error = e instanceof Error ? e.message : String(e); shown(); return null; });
  async function poll() {
    if (!cur) return;
    const was = s;
    try { s = await api.mpvState(); } catch { return; } // the core restarting: the next poll
    if (!cur) return;
    if (!s.running) { engine.close(); return; } // its window was closed
    const t = performance.now();
    if (s.playing && lastTick) listened += Math.min(5, (t - lastTick) / 1000);
    lastTick = s.playing ? t : 0;
    if (was?.playing && !s.playing && !s.ended) void report("paused");
    if (s.ended && !endedSent) { endedSent = true; void report("ended"); }
    if (!s.ended) endedSent = false;
    if (s.playing && sleepAt && Date.now() >= sleepAt) { sleepAt = 0; void send({ cmd: "pause" }); }
    if (s.playing && sleepChapter >= 0 && chapterAt(chapters(), now()) !== sleepChapter) { sleepChapter = -1; void send({ cmd: "pause" }); }
    shown();
  }
  const engine: Engine = {
    async play(plugin, item) {
      if (cur) engine.close();
      cur = { plugin, item, key: item.key, reports: true };
      s = null; error = ""; listened = 0; lastTick = 0; sleepAt = 0; sleepChapter = -1; endedSent = false;
      // a file of a vault on a server: the desktop's core would look for it in its own vaults
      if (item.file && apiBase()) { error = "A video kept in a server's vault plays from the server's own player for now"; shown(); return; }
      const tracks = item.file ? [{ file: item.file }] : [...item.tracks].sort((p, q) => p.start - q.start).map((t) => ({ src: absolute(t.src), duration: t.duration }));
      shown();
      await send({ cmd: "play", tracks, at: item.at ?? 0, title: item.title, speed: item.speed ?? 1, subs: (item.subtitles ?? []).map(absolute) });
      pollT = window.setInterval(() => void poll(), POLL_MS);
      reportT = window.setInterval(() => { if (s?.playing) void report("playing"); }, REPORT_MS);
    },
    resume: () => void send({ cmd: "resume" }),
    pause: () => void send({ cmd: "pause" }),
    seek: (t) => void send({ cmd: "seek", at: Math.max(0, t) }),
    speed: (v) => void send({ cmd: "speed", speed: v }),
    sleep: (v) => {
      sleepAt = v && v !== "chapter" ? Date.now() + v.minutes * 60_000 : 0;
      sleepChapter = v === "chapter" ? chapterAt(chapters(), now()) : -1;
      shown();
    },
    close: () => {
      const was = cur;
      if (!was) return;
      was.item = { ...was.item, at: now() };
      clearInterval(pollT); clearInterval(reportT);
      cur = null;
      void api.mpv({ cmd: "close" }).catch(() => {});
      void report("closed", was);
      emit(null);
    },
  };
  return engine;
}

let engine: Engine | null = null, video: Engine | null = null;
/** The engine of what plays now (the last `play`'s). */
let current: Engine | null = null;
const theEngine = (): Engine => {
  const b = bridge();
  return (engine ??= b?.player ? nativeEngine(b as Required<NativeBridge>) : webEngine());
};
/** Video goes to mpv where the app is not the phone's (whose service plays its sound for now). */
const engineFor = (item: PlayerItem): Engine => (item.video && !bridge()?.player ? (video ??= mpvEngine()) : theEngine());
const active = (): Engine => current ?? theEngine();

/** `atlas.player` of plugin `plugin`: playing is always on its behalf; the rest acts on whatever plays. */
export function playerFor(plugin: string) {
  const skip = (dt: number) => { const s = nowPlaying.s; if (s) active().seek(s.at + dt); };
  return {
    play: (item: PlayerItem) => { const e = engineFor(item); if (current && current !== e) current.close(); current = e; return e.play(plugin, item); },
    pause: () => active().pause(),
    resume: () => active().resume(),
    toggle: () => (nowPlaying.s?.playing ? active().pause() : active().resume()),
    seek: (t: number) => active().seek(t),
    skip,
    chapter: (dir: -1 | 1) => {
      const s = nowPlaying.s;
      if (!s) return;
      const t = dir < 0 ? previousChapter(s.chapters, s.at) : nextChapter(s.chapters, s.at);
      if (t !== null) active().seek(t);
    },
    speed: (s: number) => active().speed(s),
    sleep: (s: Sleep) => active().sleep(s),
    close: () => active().close(),
    state: () => nowPlaying.s,
    on: onPlayer,
    /** A time as a link into a note, the form the player seeks by (`[[note#t=1:02:03]]`, player-time.ts): `at` and
     *  `note` default to what plays now; with no note, the bare clock. A plugin writing a bookmark into a note uses it. */
    timeLink: (at?: number, note?: string) => timeLink({ at: at ?? nowPlaying.s?.at ?? 0, note: note ?? nowPlaying.s?.note }),
  };
}
export type Player = ReturnType<typeof playerFor>;
/** The shell's own controls (the lower bar's cell) act as any plugin's would. */
export const shellPlayer = playerFor("");

/** On the phone: the service may already be playing when the page (re)loads — it is asked to say so. */
export function attachPlayer() {
  const b = bridge();
  if (b?.player) { theEngine(); b.player("state", "null"); }
}
