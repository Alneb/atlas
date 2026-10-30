// Workspace plugins (.atlas/plugins/<id>/, docs/guides/PLUGINS.md, docs/refactor/REFACTOR-plugins-v3.md): data + pieces.
// `main.js` registers blocks, commands and entity kinds at startup and again on every save (no rebuild); a pane
// (`view.js`) and a rail button are opt-in. Plugins talk to Atlas only through the PluginApi, so the app never contains
// plugin-specific code. This module starts, reloads and watches them; the list and the ledger of registrations are
// plugin-registry.svelte.ts, commands plugin-commands.ts, what a plugin is handed plugin-host-api.svelte.ts.
import { errText } from "./text";
import { api, forgetRoles } from "./api";
import { getDock } from "./dock-instance";
import { on } from "./bus";
import { toast } from "./state.svelte";
import type { PaneSpec } from "./panes";
import { exists } from "./vault-files";
import { registerOpener } from "./openers";
import { globTest } from "./glob";
import { isIconName } from "./icons";
import { onSettings } from "./settings.svelte";
import { logPlugin } from "./plugin-log.svelte";
import { pluginFileUrl } from "./plugin-files";
import type { PluginApi } from "./plugin-api";
import { depth, disposeAll, INIT_ID, inPhoneApp, own, ownerIds, pluginOn, plugins, starting, type Plugin } from "./plugin-registry.svelte";
import { registerActions } from "./plugin-commands";
import type { PaneAt } from "./plugin-host-api.svelte";

export * from "./plugin-api";
export { plugins, pluginBlocked, pluginOn, pluginSpec, pluginData, setPluginOn, type Plugin } from "./plugin-registry.svelte";
export { runPluginCommand } from "./plugin-commands";
export type { ContextSnapshot, PaneAt, PluginFileSource } from "./plugin-host-api.svelte";

// What a plugin is handed is fetched with the first plugin's code, not at start: it carries CodeMirror
// (`atlas.editor.codemirror`), ~300 KB the start does not need otherwise.
type Host = typeof import("./plugin-host-api.svelte");
let host: Host | null = null;
let hostLoading: Promise<Host> | null = null;
const loadHost = (): Promise<Host> => (hostLoading ??= import("./plugin-host-api.svelte").then((m) => (host = m)));

/** The API a plugin is handed; its module is loaded with the plugin's own (`loadView`, main.js). */
export function pluginApi(p: Plugin, at?: PaneAt): PluginApi {
  if (!host) throw new Error("the plugin API is not loaded yet: loadView first");
  return host.pluginApi(p, at);
}

/** Run a plugin's main.js `register(atlas)` (after undoing its previous registrations). */
// the newest start of each plugin: a start overtaken while it fetched main.js (switched off, reloaded) stops there
const starts = new Map<string, number>();

function startMain(p: Plugin): Promise<void> {
  const s = startMainNow(p);
  starting.set(p.id, s);
  void s.finally(() => { if (starting.get(p.id) === s) starting.delete(p.id); });
  return s;
}
async function startMainNow(p: Plugin): Promise<void> {
  const run = (starts.get(p.id) ?? 0) + 1;
  starts.set(p.id, run);
  disposeAll(p.id);
  delete plugins.errors[p.id];
  if (!pluginOn(p)) {
    if (p.has_helper) void api.stopPluginHelper(p.id).catch(() => {}); // switched off: its program stops too
    return;
  }
  if (p.view && p.opens.length) { // its pane is one more way to open those files, the default for those it claims
    const claims = p.claims.length ? globTest(p.claims) : undefined;
    own(p.id, registerOpener({
      id: `plugin:${p.id}`, title: p.title, icon: p.icon && isIconName(p.icon) ? p.icon : "plugin",
      accepts: globTest(p.opens),
      ...(claims ? { claims } : {}),
      spec: (path, _line, anchor) => ({ kind: "plugin", id: p.id, title: p.title, icon: p.icon, path, ...(anchor ? { anchor } : {}) }),
    }));
  } else if (p.claims.length) logPlugin(p.id, "claims", new Error("`claims` needs a pane (view.js) to open the files in"));
  if (!p.main) return;
  try {
    const [mod] = await Promise.all([importModule(p.main), loadHost()]);
    if (starts.get(p.id) !== run || !pluginOn(p)) return;
    if (typeof mod.register !== "function") throw new Error("main.js has no `export function register(atlas)`");
    const r = await mod.register(pluginApi(p));
    if (typeof r === "function") own(p.id, r); // its own cleanup, run on reload
  } catch (e) {
    plugins.errors[p.id] = `${p.main}: ${errText(e)}`;
    toast(`Plugin ${p.id}: main.js failed`, plugins.errors[p.id], "error", 9000);
    logPlugin(p.id, "main.js register", e);
  }
}

/** A plugin module, imported from its URL (plugin-files.ts): the browser resolves its imports, relative or dynamic, and
 *  a changed file is a new URL, so an edited plugin runs its new code on the next load — no rebuild, ever. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importModule(path: string): Promise<any> {
  const url = pluginFileUrl(path); // first: Vite wraps import() in a plain arrow, where await is refused
  return await import(/* @vite-ignore */ url);
}

/** The plugin's pane module (`view.js`). */
export async function loadView(p: Plugin): Promise<{ default: (host: HTMLElement, api: PluginApi) => void | (() => void) | Promise<void | (() => void)> }> {
  if (!p.view) throw new Error(`plugin ${p.id} has no pane (no view.js)`);
  const [mod] = await Promise.all([importModule(p.view), loadHost()]);
  return mod;
}

/** A plugin's view left open from another time (a saved layout, another vault's) whose plugin is not in this vault or
 *  is off: closed, so no Email tile stands at the top for a plugin that is not installed. A view
 *  opened on a file ("Open with") is a document: left to say what is missing. */
function closeOrphanViews(): void {
  for (const p of getDock()?.panels ?? []) {
    const s = p.params as PaneSpec | undefined;
    if (s?.kind === "plugin" && !s.path && !plugins.list.some((x) => x.id === s.id && pluginOn(x))) p.api.close();
  }
}

let listed = false; // the vault's list was read (a failed read must not close every plugin's view)
// a layout restored after the plugins loaded
addEventListener("atlas-layout", () => { if (listed) closeOrphanViews(); });

const told = new Set<string>();
export async function loadPlugins(): Promise<void> {
  let known = false;
  try {
    plugins.list = await api.plugins(inPhoneApp ? "android" : undefined);
    forgetRoles();
    known = true;
  } catch { plugins.list = []; }
  plugins.loaded = true;
  registerActions(plugins.list);
  listed = known;
  if (known) closeOrphanViews();
  // each broken manifest said once, not again with every re-read of the list (a plugin switched on or off)
  for (const p of plugins.list) if (p.error && !told.has(`${p.id}\n${p.error}`)) { told.add(`${p.id}\n${p.error}`); toast(`Plugin ${p.id} not loaded`, p.error, "error", 9000); }
  for (const id of ownerIds()) if (id !== INIT.id && !plugins.list.some((p) => p.id === id)) disposeAll(id); // deleted plugins
  // a meta plugin's main.js runs before its subplugins' (they may use what it registers), level by level
  const levels = new Map<number, Plugin[]>();
  for (const p of plugins.list) levels.set(depth(p), [...(levels.get(depth(p)) ?? []), p]);
  for (const level of [...levels.keys()].sort((a, b) => a - b)) await Promise.all(levels.get(level)!.map(startMain));
  await startInit();
}

// `.atlas/init.js` (docs/guides/MALLEABLE.md rung 8): the workspace's own startup script — `register(atlas)`
// with the plugin API, no manifest, reloaded on save. A plugin without the ceremony.
const INIT_PATH = ".atlas/init.js";
const INIT: Plugin = { id: INIT_ID, title: "init.js", main: INIT_PATH, rail: false, opens: [], claims: [], has_data: false, settings: {}, fields: [], platforms: [], phone: true, permissions: { net: [], secrets: false, exec: [] }, has_helper: false, requires: [], requires_versions: {}, provides: [], parts: [], gives: [], agents: [] };
async function startInit(): Promise<void> {
  // asked, not fetched: a missing init.js must not log a 404 on every start
  if (await exists(INIT_PATH)) await startMain(INIT);
  else disposeAll(INIT.id);
}

/** Live plugins: a manifest change reloads the list; any other change in a plugin's folder re-runs its
 *  main.js (its blocks redraw with the new code); switching a plugin off undoes all it registered.
 *  Panes reload themselves (Plugin.svelte); a changed helper script stops the helper, so the next call
 *  runs the new code. This is what makes plugin edits apply with no rebuild. */
export function watchPlugins(): () => void {
  let offList = "";
  const offSettings = onSettings((c) => {
    const now = c.plugins.off.join("\n");
    if (now === offList) return;
    offList = now;
    // what can run now is the core's answer (`blocked`), so the list is read again rather than worked out here
    if (plugins.loaded) void loadPlugins();
  });
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const offFs = on("fs", (e) => {
    // a manifest, or a plugin folder appearing / going (copied in whole, its files may beat the watch)
    // a manifest, or a plugin's settings file (.atlas/plugin-settings/<id>.toml: the values live there now)
    if (e.paths.some((p) => /^\.atlas\/plugins\/[^/]+(\/plugin\.toml)?\/?$/.test(p) || /^\.atlas\/plugin-settings\/[^/]+\.toml$/.test(p))) { void loadPlugins(); return; }
    // a main.js or view.js that was not there when the list was read: the plugin just gained that part
    const known = new Set(plugins.list.flatMap((p) => [p.main, p.view]));
    if (e.paths.some((p) => /^\.atlas\/plugins\/[^/]+\/(main|view)\.js$/.test(p) && !known.has(p))) { void loadPlugins(); return; }
    if (e.paths.includes(INIT_PATH)) { clearTimeout(timers.get(INIT.id)); timers.set(INIT.id, setTimeout(() => void startInit(), 200)); }
    const ids = new Set(e.paths.flatMap((p) => /^\.atlas\/plugins\/([^/]+)\/.+\.(m?js|json|css)$/.exec(p)?.[1] ?? []));
    for (const id of ids) {
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => { const p = plugins.list.find((x) => x.id === id); if (p) void startMain(p); }, 200));
    }
    // the helper's own source changed: stop it, the next call starts the new code (its open sessions go)
    const helpers = new Set(e.paths.flatMap((p) => /^\.atlas\/plugins\/([^/]+)\/.+\.(py|sh|bash|rb|pl|lua|jl|r)$/i.exec(p)?.[1] ?? []));
    for (const id of helpers) {
      if (!plugins.list.find((x) => x.id === id)?.has_helper) continue;
      clearTimeout(timers.get(`helper:${id}`));
      timers.set(`helper:${id}`, setTimeout(() => void api.stopPluginHelper(id).catch(() => {}), 300));
    }
  });
  return () => { offSettings(); offFs(); for (const t of timers.values()) clearTimeout(t); };
}
