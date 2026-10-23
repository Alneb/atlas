// A drawing shared live (lib/live.ts). Each change goes to the other devices with the drawing open as the elements it changed (by
// version), merged there as Excalidraw's own collaboration merges (reconcileElements), out of the undo history. The
// pointer — and whether the pen is down — goes ~30 times a second and shows as a cursor with the device's name.
import { joinLive, type Live } from "./live";
import { repaintUnderPen, wantPenDrafts } from "./pen-target";

type Lib = typeof import("@excalidraw/excalidraw");
type Api = Parameters<NonNullable<import("@excalidraw/excalidraw/types").ExcalidrawProps["excalidrawAPI"]>>[0];
type El = { id: string; version: number };
type Pointer = { pointer: { x: number; y: number; tool: "pointer" | "laser" }; button: "down" | "up" };

const COLORS = ["#e8590c", "#1971c2", "#2f9e44", "#9c36b5", "#c2255c", "#0c8599"];

export interface LiveDrawing {
  /** The scene changed here: what changed goes out. */
  changed(): void;
  pointer(p: Pointer): void;
  /** The element being drawn here (Excalidraw's `newElement`), or null: it shows on the others as it grows. */
  drafting(el: unknown): void;
  /** How many other devices have the drawing open. */
  others(): number;
  /** Whether this device saves the drawing: the room's writer, or alone (live.ts). */
  writes(): boolean;
  /** A copy from disk (another device's save) merged in, as a message would be. */
  merge(elements: readonly El[]): void;
  close(): void;
}

/** `onPeers`: the names of the other devices, each time they change (the pane shows them). */
export function liveDrawing(path: string, lib: Lib, api: () => Api | null, onPeers?: (names: string[]) => void): LiveDrawing {
  const name = document.documentElement.classList.contains("eink") ? "Boox" : "desktop"; // what the others call this one
  const known = new Map<string, number>(); // element id → the version the others have (sent or received)
  const people = new Map<string, Record<string, unknown>>();
  let sendT = 0, lastPtr = 0, lastButton = "up", lastDraft = 0, drafted = false;
  const DRAFT = "live-draft-"; // another device's stroke in progress: in the scene, never saved nor sent on
  const isDraft = (e: El) => e.id.startsWith(DRAFT);
  const all = () => ((api()?.getSceneElementsIncludingDeleted() ?? []) as unknown as readonly El[]).filter((e) => !isDraft(e));
  /** Another device's stroke in progress shown (or, with null, taken away). */
  const showDraft = (from: number, el: Record<string, unknown> | null) => {
    const a = api();
    if (!a) return;
    const id = `${DRAFT}${from}`;
    const rest = a.getSceneElementsIncludingDeleted().filter((e) => e.id !== id);
    const draft = el && { ...el, id, locked: true, customData: { atlasDraft: true } };
    a.updateScene({ elements: (draft ? [...rest, draft] : rest) as never, captureUpdate: lib.CaptureUpdateAction.NEVER });
    repaintUnderPen();
  };
  const learn = (els: readonly El[]) => { for (const e of els) known.set(e.id, Math.max(known.get(e.id) ?? -1, e.version)); };
  const merge = (els: readonly El[]) => {
    const a = api();
    if (!a || !els.length) return;
    learn(els);
    // nothing newer than what is on screen (the other device's save, after its strokes came live): no redraw — every
    // updateScene repaints the whole drawing, which flashed on each of the Boox's saves
    const have = new Map((a.getSceneElementsIncludingDeleted() as unknown as readonly El[]).map((e) => [e.id, e.version]));
    if (!els.some((e) => (have.get(e.id) ?? -1) < e.version)) return;
    const merged = lib.reconcileElements(a.getSceneElementsIncludingDeleted() as never, els as never, a.getAppState() as never);
    a.updateScene({ elements: merged as never, captureUpdate: lib.CaptureUpdateAction.NEVER });
    repaintUnderPen(); // a Boox: the screen under its quick ink shows it (pen-target.ts)
  };
  const showPeople = () => api()?.updateScene({ collaborators: new Map(people) as never });
  const names = new Map<number, string>();
  const said = (from: number, name: unknown) => {
    const n = typeof name === "string" && name ? name : names.get(from) ?? "another device"; // a message without a name keeps the one known
    if (names.get(from) !== n) { names.set(from, n); peersChanged(); }
  };
  // someone watching: the phone app sends its pen's stroke as it grows (pen-target.ts), else it keeps it to the end
  const peersChanged = () => { onPeers?.([...names.values()]); wantPenDrafts(names.size > 0); };
  const live: Live = joinLive(path, {
    // others here before this device (the computer first, the Boox after): its pen's strokes go out as they grow from
    // the start, not once one of them has spoken ("the stokes do not show up in the computer until i rise the pen")
    hello: (others) => wantPenDrafts(others > 0 || names.size > 0),
    joined: (p) => { said(p.peer, p.name); const els = all(); learn(els); live.send({ t: "els", els, name }); }, // the newcomer catches up
    left: (peer) => { people.delete(String(peer)); showPeople(); showDraft(peer, null); if (names.delete(peer)) peersChanged(); },
    message: (from, m) => {
      said(from, m.name);
      if (m.t === "els" && Array.isArray(m.els)) { merge(m.els as El[]); showDraft(from, null); } // the finished stroke takes the draft's place
      else if (m.t === "draft") showDraft(from, m.el && typeof m.el === "object" ? (m.el as Record<string, unknown>) : null);
      else if (m.t === "ptr") {
        const color = COLORS[from % COLORS.length];
        people.set(String(from), {
          pointer: { x: Number(m.x), y: Number(m.y), tool: m.tool === "laser" ? "laser" : "pointer" }, button: m.button === "down" ? "down" : "up",
          username: String(m.name ?? "another device"), color: { background: color, stroke: color }, id: String(from),
        });
        showPeople();
      }
    },
  });
  return {
    changed() {
      // alone: nothing to send (a newcomer gets the whole scene on joining) — and no walk over every element on each move
      if (!live.others()) return;
      clearTimeout(sendT);
      sendT = window.setTimeout(() => {
        sendT = 0;
        const els = all().filter((e) => (known.get(e.id) ?? -1) < e.version);
        if (!els.length) return;
        learn(els);
        live.send({ t: "els", els, name });
      }, 60);
    },
    pointer(p) {
      const now = performance.now();
      if (now - lastPtr < 33 && p.button === lastButton) return; // the pen going down or up always goes
      lastPtr = now;
      lastButton = p.button;
      live.send({ t: "ptr", x: p.pointer.x, y: p.pointer.y, tool: p.pointer.tool, button: p.button, name });
    },
    drafting(el) {
      if (!el) { if (drafted) { drafted = false; live.send({ t: "draft", el: null }); } return; }
      const now = performance.now();
      if (now - lastDraft < 50) return;
      lastDraft = now;
      drafted = true;
      live.send({ t: "draft", el, name });
    },
    others: () => live.others(),
    writes: () => live.writes(),
    merge,
    close() { clearTimeout(sendT); wantPenDrafts(false); live.close(); },
  };
}
