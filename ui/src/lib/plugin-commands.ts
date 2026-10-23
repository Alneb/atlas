// A plugin's commands in the palette and on keys (`registerCommand`), the palette entry that opens a plugin's pane, and
// running a command by name with an argument (a settings card's button).
import { actions, type Action } from "./actions";
import { open } from "./dock";
import { keymap } from "./keymap.svelte";
import { toast } from "./state.svelte";
import { guard } from "./plugin-log.svelte";
import type { PluginCommand } from "./plugin-api";
import { pluginOn, pluginSpec, starting, type Plugin } from "./plugin-registry.svelte";

const ACTION_PREFIX = "plugin.";

// each plugin's commands by `<plugin>.<command>`, for the buttons that run one with an argument (runPluginCommand)
const commandRuns = new Map<string, (arg?: unknown) => unknown>();
export function addCommand(id: string, c: PluginCommand): () => void {
  const key = `${id}.${c.id}`;
  const run = (arg?: unknown) => guard(id, `command “${c.id}”`, () => c.run(arg), undefined);
  const a: Action = { id: `${ACTION_PREFIX}${key}`, title: c.title, keys: c.keys, run: () => run() };
  if (actions.some((x) => x.id === a.id)) {
    toast(`Plugin ${id}`, `It registered the command “${c.id}” twice; the second is ignored.`, "error", 9000);
    return () => {};
  }
  actions.push(a);
  commandRuns.set(key, run);
  keymap.server = [...keymap.server]; // `actions` is plain: make derived bindings recompute
  return () => {
    const i = actions.indexOf(a); if (i >= 0) actions.splice(i, 1);
    if (commandRuns.get(key) === run) commandRuns.delete(key);
    keymap.server = [...keymap.server];
  };
}

/** Runs plugin `id`'s command `command` with `arg` (a settings card's button); false when it has none such. */
export async function runPluginCommand(id: string, command: string, arg?: unknown): Promise<boolean> {
  let run = commandRuns.get(`${id}.${command}`);
  // right after a save the plugin is being started again (the save, then the file watcher): wait for it
  while (!run && starting.has(id)) {
    await starting.get(id);
    run = commandRuns.get(`${id}.${command}`);
  }
  if (!run) {
    toast(`Plugin ${id}`, `It has no command “${command}” (registerCommand({ id: "${command}", … }) in its main.js).`, "error", 9000);
    return false;
  }
  await run(arg);
  return true;
}

/** The palette entries that open a plugin's pane, one per plugin on that has one. */
export function registerActions(list: Plugin[]): void {
  // only the pane entries (`plugin.<id>`); commands a plugin registered (`plugin.<id>.<cmd>`) are its own
  for (let i = actions.length - 1; i >= 0; i--) if (/^plugin\.[^.]+$/.test(actions[i].id)) actions.splice(i, 1);
  // a palette entry opens the plugin's pane — only plugins that have one
  const mine: Action[] = list.filter((p) => pluginOn(p) && p.view).map((p) => ({
    id: `${ACTION_PREFIX}${p.id}`,
    title: `${p.title}${p.description ? ` — ${p.description}` : ""}`,
    keys: p.keys,
    run: () => { open(pluginSpec(p)); },
  }));
  actions.push(...mine);
  // `actions` is a plain array: touch the keymap state so derived bindings and the palette recompute
  keymap.server = [...keymap.server];
}
