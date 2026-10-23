// The note system's commands (docs/guides/NOTES-SYSTEM.md): a new note from a template, and installing the
// starter kit — files copied into the vault, only the ones that are not there, after the user says so.
import { errText } from "./text";
import type { Action } from "./actions";
import { api } from "./api";
import { context } from "./context.svelte";
import { openPath } from "./dock";
import { pick, type PickItem } from "./palette.svelte";
import { settings } from "./settings.svelte";
import { toast } from "./state.svelte";
import { exists } from "./vault-files";
import type { TemplateInfo } from "./gen/TemplateInfo";
/** The folder of the note the user is in (undefined: not in a note, or at the vault's root). */
const nearDir = (): string | undefined => { const p = context.active?.path ?? ""; return /\.md$/i.test(p) && p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : undefined; };

/** Creates a note and opens it. The core fills the template in, never replaces a file, and decides
 *  the folder: `dir` when given, else the template's `create_in:`, else beside the note the user is
 *  in, else `[notes] dir` — never the vault's root by accident. */
export async function createNote(title: string, template?: string, dir?: string, values?: Record<string, string>): Promise<void> {
  try {
    const r = await api.newNote({ title, template, dir, near: nearDir(), values });
    openPath(r.path, r.line);
  } catch (e) { toast("The note was not created", errText(e), "error"); }
}

/** The templates a list offers (`[notes] templates`, default templates/): every one but the vault's default — a plain
 *  note is already made from it. */
export async function templateChoices(): Promise<{ dir: string; list: TemplateInfo[] }> {
  const dir = (settings.config?.notes.templates ?? "templates").replace(/^\/+|\/+$/g, "");
  return { dir, list: (await api.templates().catch(() => [])).filter((t) => !t.default) };
}

/** A template's name in the lists: its `template_title:`, else its file name made readable ("my-report" → "My report"). */
export const templateLabel = (t: { name: string; title?: string }): string => {
  if (t.title) return t.title;
  const s = t.name.replace(/^\d+[_-]/, "").replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Name the new note (from `template`, or blank), then create it where it belongs. */
export function nameAndCreate(template?: string): void {
  pick({
    placeholder: template ? `Name of the new ${templateLabel({ name: template })} note…` : "Name of the new note…", tag: template ? templateLabel({ name: template }) : "Note", icon: "file-text",
    items: [],
    typed: (name) => `Create “${name}”`,
    onpick: async (name) => {
      const prompts = template ? (await api.templates().catch(() => [])).find((t) => t.name === template)?.prompts ?? [] : [];
      void askPrompts(prompts, {}, (values) => void createNote(name, template, undefined, values));
    },
  });
}

/** Asks a template's `{{prompt:…}}` questions one after another, then hands the answers on. */
function askPrompts(prompts: string[], values: Record<string, string>, done: (values: Record<string, string>) => void): void {
  const [q, ...rest] = prompts;
  if (q === undefined) return done(values);
  pick({
    placeholder: `${q}…`, tag: q, icon: "file-text", items: [],
    typed: (answer) => `“${answer}”`,
    onpick: (answer) => askPrompts(rest, { ...values, [q]: answer }, done),
  });
}

/** New note from a template…: choose the template, then name the note. */
function newFromTemplate(): void {
  pick({
    placeholder: "New note from which template?", tag: "Template", icon: "file-text",
    items: async (): Promise<PickItem[]> => {
      const { dir, list } = await templateChoices();
      return list.length ? list.map((t) => ({ value: t.name, title: templateLabel(t), detail: t.path }))
        : [{ value: "", title: `No templates in ${dir}/ yet`, detail: "Write a note there, or run “Starter kit: add the note system’s files…”" }];
    },
    onpick: (t) => { if (t) nameAndCreate(t); },
  });
}

// --- the starter kit ----------------------------------------------------------------------------------

// the kit's files, bundled as text (kits/flap/ in the Atlas repository): path in the vault → content.
// Its pages go to `.atlas/pages/` (the vault's root stays the user's; the core lists that folder, so
// links and quick open find them); `exhaustive` because a glob skips dot-folders otherwise.
const KIT = Object.fromEntries(Object.entries(import.meta.glob("../../../kits/flap/**/*", { query: "?raw", import: "default", eager: true, exhaustive: true }) as Record<string, string>)
  .map(([p, text]) => [p.slice(p.indexOf("kits/flap/") + "kits/flap/".length), text]));
const PAGES = ".atlas/pages/";
/** Where a kit file may already be: its path, or (a page) the vault's root, where older kits put it. */
const START = "Start here.md";
/** Where a kit file is written: as in the kit, except its one root note, which goes to the notes folder. */
const kitPlace = (p: string): string => { const d = (settings.config?.notes.dir ?? "notes").replace(/^\/+|\/+$/g, ""); return p === START && d ? `${d}/${p}` : p; };
const placesOf = (p: string): string[] => (p.startsWith(PAGES) ? [p, p.slice(PAGES.length)] : p === START ? [kitPlace(p), p] : [p]);
const present = async (p: string): Promise<string | null> => { for (const at of placesOf(p)) if (await exists(at)) return at; return null; };

/** Lists what the kit would add; writes only the files that are not in the vault, and only when asked. */
async function installKit(): Promise<void> {
  const paths = Object.keys(KIT).sort();
  const there = new Map((await Promise.all(paths.map(async (p) => [p, await present(p)] as const))).filter((e): e is [string, string] => !!e[1]));
  const missing = paths.filter((p) => !there.has(p));
  pick({
    placeholder: missing.length ? `The starter kit would add ${missing.length} file${missing.length === 1 ? "" : "s"} (nothing is replaced)` : "Every file of the starter kit is already in this vault", tag: "Starter kit", icon: "file-text",
    items: [
      ...(missing.length ? [{ value: "install", title: `Add the ${missing.length} missing file${missing.length === 1 ? "" : "s"}`, icon: "plus" as const, section: "Confirm" }] : []),
      { value: "cancel", title: missing.length ? "Cancel" : "Close", section: "Confirm" },
      ...paths.map((p) => ({ value: there.has(p) ? `open:${there.get(p)}` : `new:${p}`, title: kitPlace(p), detail: there.has(p) ? `already in the vault${there.get(p) === p ? "" : ` (${there.get(p)})`} — kept as it is` : "new", icon: "file-text" as const, section: "Files" })),
    ],
    onpick: async (v) => {
      if (v.startsWith("open:")) return openPath(v.slice(5));
      if (v !== "install") return;
      try {
        // checked again at the moment of writing: a file made meanwhile is still never replaced
        for (const p of missing) if (!(await present(p))) await api.putFile(kitPlace(p), KIT[p]);
        toast("Starter kit added", `${missing.length} files. “Start here” explains them.`, "success");
        openPath(kitPlace(START));
      } catch (e) { toast("The starter kit was not fully added", errText(e), "error", 9000); }
    },
  });
}

export const notesActions: Action[] = [
  { id: "ui.note.new", title: "New note from a template…", keys: "Super+N", alsoKeys: ["Alt+N"], run: newFromTemplate },
  { id: "ui.kit.install", title: "Starter kit: add the note system's files (inbox, next actions, templates)…", run: () => void installKit() },
];
