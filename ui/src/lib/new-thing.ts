// New…: one list of everything that can be
// made, each kind placing what it makes itself — a blank note (beside the note in use, else [notes] dir), a note from
// each template (its `create_in:`), a drawing ([draw] dir), and what plugins add (`atlas.registerNew`: a lecture for a
// course, a meeting…). The phone app's + opens it (native-shell `atlasShell.command("ui.new")`).
// The kinds used last come first ("better templates, chosen well", 2026-10-18), and each says where its note goes.
import { pick, type PickItem } from "./palette.svelte";
import { nameAndCreate, templateChoices, templateLabel } from "./notes-system";
import { load, save } from "./prefs";
import type { IconName } from "./panes";

/** A kind of new thing a plugin offers; `run` makes it (asking what it needs) and opens it. */
export interface NewKind { id: string; title: string; detail?: string; icon?: IconName; plugin: string; run(): void | Promise<void> }

const kinds = new Map<string, NewKind>();
/** plugins.svelte.ts (`atlas.registerNew`) → the remover. */
export function addNewKind(k: NewKind): () => void {
  kinds.set(k.id, k);
  return () => { if (kinds.get(k.id) === k) kinds.delete(k.id); };
}

/** The values picked last, newest first (per device: a convenience, not vault state). */
const RECENT_KEY = "atlas.new.recent", RECENT_SHOWN = 3;
const recent = (): string[] => load<string[]>(RECENT_KEY, []).filter((v) => typeof v === "string");
const used = (v: string): void => save(RECENT_KEY, [v, ...recent().filter((r) => r !== v)].slice(0, 12));

async function items(): Promise<PickItem[]> {
  const templates = (await templateChoices()).list;
  const all: PickItem[] = [
    { value: "note", title: "Note", detail: "blank, beside the note you are in", icon: "file-text", section: "Notes" },
    ...templates.map((t): PickItem => ({
      value: `template:${t.name}`, title: t.title ?? `${templateLabel(t)} note`, icon: "file-text", section: "Notes",
      detail: [t.folder ? `into ${t.folder}` : "beside the note you are in", t.prompts.length ? `asks ${t.prompts.join(", ")}` : ""].filter(Boolean).join(" · "),
    })),
    { value: "drawing", title: "Drawing", detail: "Excalidraw", icon: "edit", section: "Drawings" },
    ...[...kinds.values()].map((k): PickItem => ({ value: `kind:${k.id}`, title: k.title, detail: k.detail ?? k.plugin, icon: k.icon ?? "plugin", section: k.plugin })),
  ];
  // the last few used move to the top; one that no longer exists (a template deleted) is skipped
  const top = recent().map((v) => all.find((i) => i.value === v)).filter((i): i is PickItem => !!i).slice(0, RECENT_SHOWN);
  return [...top.map((i) => ({ ...i, section: "Recent" })), ...all.filter((i) => !top.includes(i))];
}

export function newThing(): void {
  pick({
    placeholder: "New…", tag: "New", icon: "plus", items,
    onpick: async (v) => {
      used(v);
      if (v === "note") nameAndCreate();
      else if (v.startsWith("template:")) nameAndCreate(v.slice(9));
      else if (v === "drawing") await (await import("./draw-new")).newExcalidraw();
      else if (v.startsWith("kind:")) await kinds.get(v.slice(5))?.run();
    },
  });
}
