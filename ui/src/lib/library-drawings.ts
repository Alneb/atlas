// The Drawings library (docs/design/DESIGN-libraries-everywhere.md): every drawing of the vault — not a file's ink (`x.pdf.excalidraw` is the
// PDF's notes) — with its companion note's properties (drawing_note.rs: `x.excalidraw` → `x.md`), which the user sets
// (tags, project, topics) to filter by. Its cover is its first page, drawn only when it comes near the view.
import { api } from "./api";
import { on } from "./bus";
import { openPath } from "./dock";
import { movedTabs } from "./gone-files";
import { toast } from "./state.svelte";
import { queryRows, type Row } from "./base-rows";
import { vaultFiles, vaultReady } from "./vault";
import { shownName, basename } from "./paths";
import type { LibraryItem, LibrarySource } from "./library";
import { errText, escapeRegExp } from "./text";

const DRAWING = /\.excalidraw$/i;
/** `chap.pdf.excalidraw`: a file's ink, which belongs to that file (drawing_note.rs `ink_of`). An extension has a
 *  letter: `lecture 14.37.13.excalidraw` (Obsidian's timestamped names) is a drawing. */
const INK = /\.(?=[a-z0-9]{0,7}[a-z])[a-z0-9]{1,8}\.excalidraw$/i;
const noteOf = (drawing: string) => drawing.replace(DRAWING, ".md");

/** A property's value as names: a link's text, a list's items, `#` taken off a tag. */
function names(v: unknown): string[] {
  const one = (x: unknown) => String(x ?? "").replace(/^\[\[|\]\]$/g, "").split("|").pop()!.replace(/^#/, "").trim();
  return (Array.isArray(v) ? v.map(one) : v == null || v === "" ? [] : [one(v)]).filter((x) => x && x !== "null");
}

const covers = new Map<string, Promise<string | null>>();
/** The first page as a picture (the whole drawing when it has no pages); one per drawing and version. */
function coverOf(path: string, version: string): () => Promise<string | null> {
  return () => {
    const key = `${path}@${version}`;
    if (!covers.has(key)) covers.set(key, (async () => {
      const { sceneJson, sceneSvg } = await import("./draw-excalidraw");
      const json = await sceneJson((await api.file(path)).text);
      const svg = await sceneSvg(json, false, "Page 1").catch(() => sceneSvg(json, false));
      svg.setAttribute("style", "background:#fff");
      return URL.createObjectURL(new Blob([svg.outerHTML], { type: "image/svg+xml" }));
    })().catch(() => null));
    return covers.get(key)!;
  };
}

/** A drawing renamed in its folder (`.excalidraw` kept); its open tabs follow it. */
async function rename(path: string, name: string): Promise<void> {
  const clean = name.trim().replace(/[\\/]/g, "-").replace(/\.excalidraw$/i, "");
  if (!clean) throw new Error("a name is needed");
  const to = `${path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : ""}${clean}.excalidraw`;
  if (to === path) return;
  const follow = movedTabs(path, to);
  await api.move(path, to);
  for (const p of follow) openPath(p);
}

/** The Obsidian Excalidraw plugin's drawings (`x.excalidraw.md`), outside hidden folders. */
const OBSIDIAN = /\.excalidraw\.md$/i;
const obsidianDrawings = () => [...vaultFiles()].filter((p) => OBSIDIAN.test(p) && !p.split("/").some((s) => s.startsWith(".")));

/** Links naming `x.excalidraw.md` itself retargeted to `x.excalidraw` in the notes that link it; Obsidian's
 *  usual `[[x.excalidraw]]` needs nothing. Each note written over the version read. → links changed. */
async function retarget(md: string, to: string): Promise<number> {
  const old = basename(md), now = basename(to);
  const esc = escapeRegExp(old);
  // inside [[…]] (any folder before it, a #heading or |alias after) or a markdown link's (…)
  const re = new RegExp(`(\\[\\[(?:[^\\]|#]*/)?)${esc}(?=[\\]|#])|(\\]\\((?:[^)]*/)?)${esc.replace(/ /g, "(?: |%20)")}(?=[)#])`, "g");
  const sources = [...new Set((await api.backlinks(md).catch(() => null))?.links.map((l) => l.source) ?? [])];
  let n = 0;
  for (const src of sources) {
    const f = await api.file(src);
    const text = f.text.replace(re, (_m, a?: string, b?: string) => { n++; return a !== undefined ? `${a}${now}` : `${b}${now.replace(/ /g, "%20")}`; });
    if (text !== f.text) await api.putFile(src, text, f.mtime);
  }
  return n;
}

/** Each Obsidian drawing made Atlas's: its scene saved as `x.excalidraw` — the name its `[[x.excalidraw]]` links already use —
 *  whose save makes the companion note `x.md` (drawing_note.rs), and the old file to the Trash. Never over a file:
 *  one whose `x.excalidraw` or `x.md` is there is left, and said. */
async function fromObsidian(): Promise<void> {
  const { sceneJson } = await import("./draw-excalidraw");
  const left: string[] = [];
  let done = 0, relinked = 0;
  for (const md of obsidianDrawings()) {
    const to = md.replace(/\.md$/i, "");
    try {
      if (vaultFiles().has(noteOf(to))) throw new Error(`${noteOf(to)} is there already`);
      const json = await sceneJson((await api.file(md)).text);
      JSON.parse(json); // a scene, or the old file stays
      if (!(await api.createFile(to, json)).written) throw new Error(`${to} is there already`);
      relinked += await retarget(md, to);
      await api.trash(md);
      done++;
    } catch (e) {
      left.push(`${shownName(basename(md))}: ${errText(e)}`);
    }
  }
  toast(`${done} Obsidian drawing${done === 1 ? "" : "s"} converted`, [left.length ? `Left as they are:\n${left.join("\n")}` : "The old files are in the Trash.", relinked ? `${relinked} link${relinked === 1 ? "" : "s"} to them now name the new drawing.` : ""].filter(Boolean).join(" "), left.length ? "error" : "success");
}

/** A drawing to the Trash, with its note when the note is its own (its `drawing:` names it). */
async function remove(path: string, quiet = false): Promise<void> {
  const note = noteOf(path);
  const own = await api.file(note).then((f) => f.text.includes(`[[${path.split("/").pop()}]]`), () => false);
  await Promise.all([api.trash(path), own ? api.trash(note) : null]);
  if (!quiet) toast("Moved to the Trash", shownName(basename(path)));
}

/** Several to the Trash at once, six at a time, one notice (one by one, each with its own, felt slow). */
async function removeMany(paths: string[]): Promise<void> {
  const queue = [...paths], failed: string[] = [];
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) await remove(p, true).catch((e) => failed.push(`${shownName(basename(p))}: ${errText(e)}`));
  }));
  const done = paths.length - failed.length;
  toast(`${done} drawing${done === 1 ? "" : "s"} moved to the Trash`, failed.length ? `Left:\n${failed.join("\n")}` : "", failed.length ? "error" : "success");
}

export function drawingsSource(): LibrarySource {
  const props = new Map<string, Row>(); // a drawing's path → its note's row
  let tops: string[] = []; // the top folders holding drawings: the tabs
  return {
    id: "drawings", title: "Drawings", icon: "edit", noun: "drawings",
    async load() {
      await vaultReady();
      const rows = await queryRows(`filters:\n  and:\n    - file.hasProperty("drawing")\nviews:\n  - type: table\n    name: all\n    order:\n${["file.name", "file.mtime", "tags", "project", "topics", "pages"].map((p) => `      - ${JSON.stringify(p)}`).join("\n")}\n`).catch(() => [] as Row[]);
      const byNote = new Map(rows.map((r) => [r.path, r]));
      props.clear();
      const items: LibraryItem[] = [];
      for (const path of vaultFiles()) {
        if (!DRAWING.test(path) || INK.test(path)) continue;
        const row = byNote.get(noteOf(path));
        if (row) props.set(path, row);
        const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        const pages = Number(row?.pages) || 0;
        const changed = String(row?.["file.mtime"] ?? row?.mtime ?? "");
        items.push({
          id: path, note: path, title: shownName(basename(path)),
          sub: [folder, pages > 1 ? `${pages} pages` : ""].filter(Boolean).join(" · "),
          cover: coverOf(path, changed),
          tab: folder.split("/")[0] || "",
          groups: [...names(row?.project), ...names(row?.topics)],
          tags: names(row?.tags),
          text: [path, ...names(row?.project), ...names(row?.topics), ...names(row?.tags)].join(" "),
          sort: { title: shownName(basename(path)), changed },
        });
      }
      tops = [...new Set(items.map((i) => i.tab ?? ""))].sort();
      return items;
    },
    // the top folders, when the drawings are in more than one
    tabs: () => tops.map((t) => ({ id: t, title: t || "The vault's root" })),
    groupsTitle: "Projects and topics",
    layouts: ["covers", "list"],
    sorts: [{ id: "changed", label: "last changed", desc: true }, { id: "title", label: "title" }],
    search: "Search the drawings…",
    empty: "No drawings yet: New… → Drawing, or the notepad on the Boox.",
    detail(item) {
      const row = props.get(item.id);
      return {
        kind: "Drawing", title: item.title,
        lines: [{ text: item.id, muted: true }],
        fields: [["Tags", names(row?.tags).join(", ")], ["Project", names(row?.project).join(", ")], ["Topics", names(row?.topics).join(", ")]].filter(([, v]) => v) as [string, string][],
        actions: [
          { label: "Open", icon: "edit", primary: true, run: () => openPath(item.id) },
          // its properties are its note's: set there, they become the filters at the side
          { label: "Properties", icon: "file-text", title: "The drawing's note: its tags, project and topics are this library's filters", run: () => openPath(noteOf(item.id)) },
          // managed here as in the file explorer: its note goes with it (the core's move, drawing_note.rs `moved`)
          { label: "Rename", icon: "edit", edit: { fields: [{ key: "name", label: "Name", value: shownName(basename(item.id)) }], save: (v) => rename(item.id, v.name) } },
          { label: "Delete", icon: "close", danger: true, confirm: { title: `Move ${item.title} to the Trash?`, hint: "Its note goes with it; both can be taken back from the Trash.", button: "Delete" }, run: () => remove(item.id) },
        ],
      };
    },
    tools: async () => {
      await vaultReady();
      const old = obsidianDrawings().length;
      return [
        { label: "New drawing", icon: "plus", primary: true, title: "Its pages and paper asked first", run: () => import("./draw-new").then((m) => m.newExcalidraw()) },
        ...(old ? [{ label: `Convert ${old} Obsidian drawing${old === 1 ? "" : "s"}`, icon: "refresh" as const, title: "Each x.excalidraw.md becomes x.excalidraw with its note x.md; the old files go to the Trash",
          confirm: { title: `Convert ${old} Obsidian drawing${old === 1 ? "" : "s"}?`, hint: "Each becomes x.excalidraw with its note x.md (links to x.excalidraw keep working); the old .excalidraw.md files go to the Trash.", button: "Convert" },
          run: fromObsidian }] : []),
      ];
    },
    // a drawing, or a drawing's note (its properties), not every note saved
    watch: (reload) => on("fs", (e) => { if (!e.paths.length || e.paths.some((p) => DRAWING.test(p) || (p.endsWith(".md") && vaultFiles().has(p.replace(/\.md$/, ".excalidraw"))))) reload(); }),
    open: (item) => openPath(item.id),
    many: (items) => [{
      label: `Delete ${items.length}…`, icon: "close", danger: true,
      confirm: { title: `Move ${items.length} drawings (with their own notes) to the Trash?`, hint: "They can be brought back from .atlas/trash.", button: "Move to the Trash" },
      run: () => removeMany(items.map((i) => i.id)),
    }],
  };
}
