// A file's live room (core live.rs; docs/design/DESIGN-shared-notes.md §3): the devices with it open send each other
// what changes as it happens. This is the connection only — joining, staying joined (a lost connection comes back),
// who is there, who saves; what the messages say is the pane's (draw-excalidraw.ts: elements and pointers). One device
// saves the file for the room, its writer (core live.rs; docs/design/DESIGN-mirror-v2.md §3): the others' edits reach
// it through the room and come back to their own copy through Syncthing, so two copies are never changed at once.
import { liveSocket } from "./api";
import { inPhoneApp } from "./eink";

export interface LivePeer { peer: number; name: string }
export interface Live {
  send(m: unknown): void;
  /** The other devices heard from (a join, or a message from one there before). */
  peers(): LivePeer[];
  /** How many other devices are in the room, the silent ones there before this one came included. */
  others(): number;
  /** Whether this device saves the file: the room's writer, or alone (or not in a room: offline). */
  writes(): boolean;
  close(): void;
}
export interface LiveHandlers {
  /** A message from another device. */
  message(from: number, m: { t?: string } & Record<string, unknown>): void;
  /** In the room: `others` devices were there already. */
  hello?(others: number): void;
  /** Someone came (send them what they need to catch up) or left. */
  joined?(p: LivePeer): void;
  left?(peer: number): void;
  /** This device became the room's writer (the one before it left): what it holds unsaved is its to save now. */
  writing?(): void;
}

/** What the other devices call this one. */
const deviceName = () => (document.documentElement.classList.contains("eink") ? "Boox" : inPhoneApp() ? "phone" : "desktop");

export function joinLive(path: string, on: LiveHandlers): Live {
  // `unheard`: devices there when this one came that have not spoken yet — counted, or the first to open a file in a
  // room already holding another would never send it anything (the web's edits never reached the Boox, 2026-10-19)
  let ws: WebSocket | null = null, closed = false, retry = 1000, timer = 0, unheard = 0, me = 0, writer = 0;
  const setWriter = (w: number) => { const was = writer === me; writer = w; if (!was && writer === me) on.writing?.(); };
  const peers = new Map<number, LivePeer>();
  const open = () => {
    if (closed) return;
    ws = liveSocket(path, deviceName());
    ws.onmessage = (e) => {
      let d: { t?: string; from?: number; others?: number; peer?: number; writer?: number; m?: { t?: string; name?: string } & Record<string, unknown> };
      try { d = JSON.parse(String(e.data)); } catch { return; }
      if (d.t === "hello") { retry = 1000; unheard = d.others ?? 0; me = Number(d.peer ?? 0); writer = Number(d.writer ?? me); on.hello?.(unheard); return; }
      if (d.t === "writer") { setWriter(Number(d.peer ?? 0)); return; }
      if (d.from === undefined || !d.m) return;
      if (d.m.t === "join") { const p = { peer: d.from, name: String(d.m.name ?? "another device") }; peers.set(d.from, p); on.joined?.(p); return; }
      if (d.m.t === "leave") { if (!peers.delete(d.from)) unheard = Math.max(0, unheard - 1); on.left?.(d.from); return; }
      if (!peers.has(d.from)) { peers.set(d.from, { peer: d.from, name: "another device" }); unheard = Math.max(0, unheard - 1); } // there before this one came
      on.message(d.from, d.m);
    };
    ws.onclose = () => {
      for (const p of peers.keys()) on.left?.(p);
      peers.clear();
      unheard = 0;
      me = writer = 0; // out of the room: this device saves its own copy (an unreachable server's case)
      if (!closed) { timer = window.setTimeout(open, retry); retry = Math.min(retry * 2, 30_000); }
    };
  };
  open();
  return {
    send(m) { if (ws?.readyState === WebSocket.OPEN && peers.size + unheard > 0) ws.send(JSON.stringify(m)); },
    peers: () => [...peers.values()],
    others: () => peers.size + unheard,
    writes: () => writer === me || peers.size + unheard === 0,
    close() { closed = true; clearTimeout(timer); ws?.close(); },
  };
}
