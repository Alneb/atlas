// What the explorer does to entries: open, delete (asks), make and rename folders, download into the vault, upload from
// this computer or from the vault (asks before replacing). Each takes `Here`, the tab as it is at that moment, and says
// how it went in the tab's status line; panes/Explorer.svelte only wires them to buttons, keys, menus and drops.
import { basename, shownName, shownPath } from "../paths";
import { listVault } from "../vault";
import { openPath } from "../dock";
import { ApiError } from "../api";
import { pick } from "../palette.svelte";
import { toast } from "../state.svelte";
import { joinPath, parentPath, why, receive, chooseVaultFolder, downloadInto, sourceOf, type Entry, type FileSource } from "../file-sources.svelte";
import type { Loc } from "./browse.svelte";
import type { RemoteRow } from "./drag";

export type SayKind = "ok" | "bad" | "";
/** A question in the bar above the list (Delete, Replace): `run` on yes. */
export type Confirm = { text: string; yes: string; danger?: boolean; run: () => unknown };
/** A name being typed in the list: a new folder, or a row renamed. */
export type Editing = { kind: "new" } | { kind: "rename"; name: string };

/** The tab, read when an action runs. */
export interface Here {
  src: FileSource;
  loc: Loc;
  isVault: boolean;
  /** The place's name, for messages. */
  title: string;
  say(text: string, kind?: SayKind, open?: string): void;
  /** Ask in the bar (the status line cleared). */
  ask(c: Confirm): void;
  reload(keep?: string): Promise<void>;
  /** Back to the list (after a question or a typed name). */
  focus(): void;
}

const remote = (h: Here) => !h.isVault;
const many = (files: File[]) => (files.length === 1 ? files[0].name : `${files.length} files`);

export async function openFile(h: Here, path: string): Promise<void> {
  if (remote(h)) h.say(`Fetching ${basename(path)}…`, "");
  try {
    openPath(await h.src.local(h.loc.place, path));
    if (remote(h)) h.say(`${basename(path)}: a local copy, every save goes back to ${h.title}.`, "ok");
  } catch (e) { h.say(why(e), "bad"); }
}

export function askDelete(h: Here, e: Entry): void {
  const remove = h.src.remove;
  if (!remove) return;
  h.ask({
    text: h.isVault ? `Move “${e.name}” to the Trash?` : `Delete ${e.kind === "dir" ? "the folder " : ""}“${e.name}” from ${h.title}? It cannot be undone.`,
    yes: h.isVault ? "Move to Trash" : "Delete", danger: true,
    run: async () => {
      try { const r = await remove.call(h.src, h.loc.place, joinPath(h.loc.path, e.name), e.kind === "dir"); h.say(r || `Deleted ${e.name}.`, "ok"); await h.reload(); }
      catch (err) { h.say(why(err), "bad"); }
      h.focus();
    },
  });
}

/** A typed name done (`ok`: Enter) → the folder made or the row renamed. */
export async function finishEdit(h: Here, ed: Editing, value: string, ok: boolean): Promise<void> {
  const to = value.trim();
  if (!ok || !to || (ed.kind === "rename" && to === ed.name)) { h.focus(); return; }
  if (to.includes("/")) { h.say("A name cannot contain “/”.", "bad"); return; }
  const { src, loc } = h;
  try {
    if (ed.kind === "new") { await src.mkdir!(loc.place, joinPath(loc.path, to)); h.say(`Made the folder ${to}.`); }
    else { await src.rename!(loc.place, joinPath(loc.path, ed.name), joinPath(loc.path, to)); h.say(`Renamed ${ed.name} to ${to}.`); }
    await h.reload(to);
  } catch (err) {
    // a name taken comes back as the server's 409 (nothing is overwritten): say it as the tree does
    h.say(err instanceof ApiError && err.status === 409 ? `“${to}” already exists here.` : why(err), "bad");
  }
  h.focus();
}

/** A remote entry into a vault folder the user picks. */
export async function download(h: Here, e: Entry): Promise<void> {
  if (!remote(h)) return;
  const folder = await chooseVaultFolder(`Download ${e.name} into… (a folder of this vault; type a new one)`, h.title);
  if (folder === null) return;
  h.say(`Downloading ${e.name}…`, "");
  try {
    const saved = await downloadInto(h.src, h.loc.place, joinPath(h.loc.path, e.name), folder, e.kind === "dir");
    h.say(`Downloaded to ${saved}`, "ok", e.kind === "dir" ? undefined : saved);
    toast("Downloaded", `${e.name} → ${saved}`, "success");
  } catch (err) { h.say(why(err), "bad"); }
}

/** A vault file into this folder (or `dir`); asks before replacing. In the vault itself it is a move. */
export async function putVaultFile(h: Here, local: string, dir = h.loc.path, replace = false): Promise<void> {
  const { src } = h, name = basename(local);
  try {
    if (h.isVault) {
      if (parentPath(local) === dir || dir === local || dir.startsWith(local + "/")) return;
      await src.rename!(h.loc.place, local, joinPath(dir, name)); h.say(`Moved ${name} into ${dir || h.title}.`);
    } else {
      if (!src.upload) return h.say(`${src.title} takes no uploads.`, "bad");
      h.say(`Uploading ${name}…`, "");
      if ((await src.upload(h.loc.place, local, dir, replace)) === "exists") {
        h.ask({ text: `${name} is already in ${dir} on ${h.title}. Replace it?`, yes: "Replace", danger: true, run: () => putVaultFile(h, local, dir, true) });
        return;
      }
      h.say(`Uploaded ${name}.`);
    }
    await h.reload(name);
  } catch (err) { h.say(why(err), "bad"); }
}

/** Files from this computer into this folder (or `dir`); asks before replacing. */
export async function putFiles(h: Here, files: File[], dir = h.loc.path, replace = false): Promise<void> {
  if (!files.length) return;
  h.say(`Uploading ${many(files)}…`, "");
  try {
    const exists = await receive(h.src, h.loc.place, dir, files, replace);
    if (exists.length) h.ask({ text: `${exists.map((f) => f.name).join(", ")}: already in ${dir || h.title}. Replace?`, yes: "Replace", danger: true, run: () => putFiles(h, exists, dir, true) });
    else h.say(`Uploaded ${many(files)}.`);
    await h.reload(files[0].name);
  } catch (err) { h.say(why(err), "bad"); }
}

/** A file of this vault, picked from the palette, onto this (remote) folder. */
export async function uploadVaultFile(h: Here): Promise<void> {
  const files = await listVault();
  pick({ placeholder: `A file of this vault to put in ${h.loc.path || "/"} on ${h.title}…`, tag: h.title, icon: "arrow-up",
    items: files.map((f) => ({ value: f, title: shownName(f), detail: shownPath(f) })), onpick: (f) => void putVaultFile(h, f) });
}

/** A remote row dropped on a vault folder of this tab: downloaded there. */
export async function dropRemote(h: Here, from: RemoteRow, dir: string): Promise<void> {
  const s = sourceOf(from.source);
  if (!h.isVault || !s) return h.say("A remote file goes into the vault: drop it on a vault folder.", "bad");
  h.say(`Downloading ${basename(from.path)}…`, "");
  try { const saved = await downloadInto(s, from.place, from.path, dir, from.dir); h.say(`Downloaded to ${saved}`, "ok", from.dir ? undefined : saved); await h.reload(basename(saved)); }
  catch (err) { h.say(why(err), "bad"); }
}
