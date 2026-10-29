// Layouts as files (docs/guides/SHELL.md). Two kinds, both plain JSON of the dock (which tabs, where):
//   .atlas/cache/layout.json        the current layout, saved as it changes and restored on start —
//                                   per machine, deletable; the browser and the desktop app share it
//   .atlas/workspaces/<name>.json   a named arrangement the user saved ("Read paper", "Write"):
//                                   switching to it restores all the context of a task at once
// Every workspace is also a command (`workspace.<name>`), so it can have a shortcut.
import { errText } from "./text";
import type { Action } from "./actions";
import { api, apiBase, vaultScoped } from "./api";
import { reloadOnChange } from "./reload-on-change";
import { applyLayout, currentLayout, onLayoutChange } from "./dock";
import { fullscreen } from "./fullscreen.svelte";
import { addCommands, setCommands } from "./keymap.svelte";
import { pick } from "./palette.svelte";
import { load, drop, KEYS } from "./prefs";
import { parkAll } from "./registry";
import { toast } from "./state.svelte";
import { exists, readText } from "./vault-files";

const CURRENT = ".atlas/cache/layout.json";
const SESSION = vaultScoped("atlas.session");
// this window's own layout: two windows on one vault (the app and a browser tab) share the file
// above, and a reload must bring back what THIS window showed, not what the other one saved last
const OWN = vaultScoped("atlas.layout.window");
const ownLayout = (): unknown | null => { try { const t = sessionStorage.getItem(OWN); return t ? JSON.parse(t) : null; } catch { return null; } };
const DIR = ".atlas/workspaces";
const fileOf = (name: string) => `${DIR}/${name}.json`;

/** A file's JSON, or null when it is missing or unreadable. */
async function readJson(path: string): Promise<unknown | null> {
  const text = await readText(path);
  try { return text === null ? null : JSON.parse(text); } catch { return null; }
}

/** True when this window was already showing Atlas (a reload), false on a fresh start. */
function sameSession(): boolean {
  try {
    const seen = sessionStorage.getItem(SESSION) === "1";
    sessionStorage.setItem(SESSION, "1");
    return seen;
  } catch { return false; }
}

/** On start: the layout as it was left. `acrossSessions` is the "reopen tabs on start" setting; a
 *  reload of the same window keeps its tabs either way. Before the file existed the layout lived in
 *  the browser's storage; that one is used once, then forgotten. Returns whether one was restored. */
export async function restoreLayout(acrossSessions: boolean): Promise<boolean> {
  const reload = sameSession();
  const legacy = load<unknown>(KEYS.layout, null);
  drop(KEYS.layout);
  if (!acrossSessions && !reload) return false;
  const saved = (reload ? ownLayout() : null) ?? (await readJson(CURRENT)) ?? legacy;
  return saved ? applyLayout(saved) : false;
}

/** From now on, write the layout to its file a moment after it changes. */
export function autosaveLayout(): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  let last = "";
  let dirty = false;
  const put = (text: string, keepalive: boolean) =>
    fetch(`${apiBase()}/api/file`, { method: "PUT", keepalive, headers: { "x-atlas": "1", "content-type": "application/json" }, body: JSON.stringify({ path: CURRENT, text }) });
  const write = () => {
    clearTimeout(t);
    if (!dirty || fullscreen.on) return; // fullscreen hides groups for a look: saved once it is left
    dirty = false;
    const text = JSON.stringify(currentLayout());
    if (text === last) return;
    last = text;
    try { sessionStorage.setItem(OWN, text); } catch { /* the file still has it */ }
    // `keepalive`: the request outlives the page (a save in flight must survive a reload or the window
    // closing). Browsers cap such bodies (~64 kB): a larger layout goes as a normal request.
    void put(text, true).catch(() => put(text, false)).catch((e) => console.warn("[atlas] layout not saved", e));
  };
  const off = onLayoutChange(() => { dirty = true; clearTimeout(t); t = setTimeout(write, 400); });
  const leave = () => write();
  window.addEventListener("pagehide", leave);
  return () => { off(); clearTimeout(t); window.removeEventListener("pagehide", leave); };
}

// --- named workspaces ---------------------------------------------------------------------------

export async function listWorkspaces(): Promise<string[]> {
  const entries = (await exists(DIR)) ? await api.tree(DIR).catch(() => []) : [];
  return entries.filter((e) => e.kind === "file" && e.name.endsWith(".json")).map((e) => e.name.replace(/\.json$/, "")).sort((a, b) => a.localeCompare(b));
}

export async function saveWorkspace(name: string): Promise<void> {
  const clean = name.trim().replace(/[\\/:*?"<>|]/g, "-");
  if (!clean) return;
  try {
    await api.putFile(fileOf(clean), JSON.stringify(currentLayout(), null, 1));
    toast(`Workspace “${clean}” saved`, `Switch to it from the palette, or give it a shortcut (${fileOf(clean)})`, "success");
  } catch (e) { toast("Workspace not saved", errText(e), "error"); }
}

export async function switchWorkspace(name: string): Promise<void> {
  const layout = await readJson(fileOf(name));
  if (!layout) { toast(`No workspace “${name}”`, `${fileOf(name)} is missing or not valid JSON.`, "error"); return; }
  // unsaved text first: the tabs about to close must not take edits with them
  await Promise.race([Promise.allSettled(parkAll()), new Promise((r) => setTimeout(r, 2000))]);
  if (!applyLayout(layout)) toast(`Workspace “${name}” could not be opened`, "Its file does not describe a layout.", "error");
}

function askSave(): void {
  pick({
    placeholder: "Name this arrangement of tabs (e.g. Read paper)…", tag: "Save workspace", icon: "panel-left",
    items: async () => (await listWorkspaces()).map((n) => ({ value: n, title: `Replace “${n}”`, section: "Saved" })),
    typed: (t) => `Save as “${t}”`,
    onpick: (v) => saveWorkspace(v),
  });
}
function askSwitch(): void {
  pick({
    placeholder: "Switch to a workspace…", tag: "Workspace", icon: "panel-left",
    items: async () => {
      const names = await listWorkspaces();
      return names.length ? names.map((n) => ({ value: n, title: n }))
        : [{ value: "", title: "No saved workspaces yet", detail: "Arrange your tabs, then run “Workspace: save current as…”" }];
    },
    onpick: (v) => { if (v) void switchWorkspace(v); },
  });
}

const PREFIX = "workspace.";
const fixed: Action[] = [
  { id: "ui.workspace.save", title: "Workspace: save the current tabs as…", run: askSave },
  { id: "ui.workspace.switch", title: "Workspace: switch to…", keys: "Ctrl+Alt+W", run: askSwitch },
];

/** One command per saved workspace, kept in step with the folder. */
async function syncCommands(): Promise<void> {
  setCommands(PREFIX, (await listWorkspaces()).map((n): Action => ({ id: `${PREFIX}${n}`, title: `Workspace: ${n}`, run: () => switchWorkspace(n) })));
}

export function initWorkspaces(): () => void {
  addCommands(fixed);
  void syncCommands();
  return reloadOnChange(() => void syncCommands(), { wait: 0, wants: (p) => p.startsWith(`${DIR}/`) });
}
