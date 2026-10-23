// A note edited live by several devices (docs/design/DESIGN-shared-notes.md §3). The text is a Yjs document shared through the note's live room
// (lib/live.ts): edits merge character by character, the other devices' cursors show with their names. The file stays
// the truth on disk, saved by the room's writer only (Editor.svelte; DESIGN-mirror-v2.md §3).
//
// Joining: the first device in the room seeds the document from the note's text, as every device would (one fixed
// author for that text, so two that start together merge without doubling it); a later one asks those already there
// for the document and takes their text before it edits.
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { yCollab } from "y-codemirror.next";
import { StateEffect } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { joinLive } from "./live";

const SEED_AUTHOR = 1; // the note's text as it was on disk: written by "nobody" on every device alike
const COLORS = ["#e8590c", "#1971c2", "#2f9e44", "#9c36b5", "#c2255c", "#0c8599"];
const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); // no stack overflow
  return btoa(s);
};
const unb64 = (s: unknown) => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0));

export interface LiveNote {
  /** How many other devices have the note open. */
  others(): number;
  /** Whether this device saves the note (the room's writer, or alone). */
  writes(): boolean;
  close(): void;
}

export function liveNote(path: string, view: EditorView, onPeers?: (names: string[]) => void, onWriting?: () => void): LiveNote {
  const doc = new Y.Doc(), text = doc.getText("md"), awareness = new Awareness(doc);
  const name = document.documentElement.classList.contains("eink") ? "Boox" : "desktop";
  const color = COLORS[doc.clientID % COLORS.length];
  awareness.setLocalStateField("user", { name, color, colorLight: `${color}33` });
  const names = new Map<number, string>(), clientsOf = new Map<number, Set<number>>();
  let bound = false, waiting = 0;

  /** The editor joins the document (its text becomes the document's first: what the others have). */
  const bind = () => {
    if (bound) return;
    bound = true;
    clearTimeout(waiting);
    const want = text.toString(), have = view.state.doc.toString();
    if (want !== have) view.dispatch({ changes: { from: 0, to: have.length, insert: want } });
    view.dispatch({ effects: StateEffect.appendConfig.of(yCollab(text, awareness)) });
  };
  /** Alone (or nobody answered): the note's own text, made the same way on every device. */
  const seed = () => {
    if (bound) return;
    if (text.length === 0) {
      const own = doc.clientID;
      doc.clientID = SEED_AUTHOR;
      text.insert(0, view.state.doc.toString());
      doc.clientID = own;
    }
    bind();
  };
  const said = (from: number, n: unknown) => {
    const v = typeof n === "string" && n ? n : names.get(from) ?? "another device"; // a message without a name keeps the one known
    if (names.get(from) !== v) { names.set(from, v); onPeers?.([...names.values()]); }
  };
  const live = joinLive(path, {
    hello: (others) => {
      if (!others) return seed();
      live.send({ t: "sync1", sv: b64(Y.encodeStateVector(doc)), name });
      waiting = window.setTimeout(seed, 3000); // nobody answered: the note as it is here
    },
    joined: (p) => {
      said(p.peer, p.name);
      live.send({ t: "aw", u: b64(encodeAwarenessUpdate(awareness, [doc.clientID])), name });
    },
    writing: () => onWriting?.(),
    left: (peer) => {
      const gone = [...(clientsOf.get(peer) ?? [])];
      if (gone.length) removeAwarenessStates(awareness, gone, "remote");
      clientsOf.delete(peer);
      if (names.delete(peer)) onPeers?.([...names.values()]);
    },
    message: (from, m) => {
      said(from, m.name);
      if (m.t === "sync1" && bound) live.send({ t: "sync2", u: b64(Y.encodeStateAsUpdate(doc, unb64(m.sv))), name });
      else if (m.t === "sync2") { Y.applyUpdate(doc, unb64(m.u), "remote"); bind(); }
      else if (m.t === "up") Y.applyUpdate(doc, unb64(m.u), "remote");
      else if (m.t === "aw") applyAwarenessUpdate(awareness, unb64(m.u), from);
    },
  });
  doc.on("update", (u: Uint8Array, origin: unknown) => { if (origin !== "remote") live.send({ t: "up", u: b64(u), name }); });
  awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (typeof origin === "number") { // a peer's cursor: whose it is, to clear when that device leaves
      const mine = clientsOf.get(origin) ?? new Set<number>();
      for (const c of [...added, ...updated]) mine.add(c);
      clientsOf.set(origin, mine);
      return;
    }
    if (origin === "remote") return;
    const changed = [...added, ...updated, ...removed];
    if (changed.length) live.send({ t: "aw", u: b64(encodeAwarenessUpdate(awareness, changed)), name });
  });
  return {
    others: () => live.others(),
    writes: () => live.writes(),
    close() {
      clearTimeout(waiting);
      removeAwarenessStates(awareness, [doc.clientID], "local");
      live.close();
      doc.destroy();
    },
  };
}
