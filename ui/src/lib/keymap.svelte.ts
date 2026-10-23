// Every command the user can run — UI actions, server built-ins, workspace scripts — with its
// effective shortcut: `.atlas/keys.toml` overrides first, then the command's own default.
// The global key handler, the palette and the Commands pane all read this one list.
import { emitPluginEvent } from "./plugin-events";
import { builtinOn } from "./builtin-plugins";
import { actions, runServerCommand, serverBuiltinToUi, type Action } from "./actions";
import { api } from "./api";
import { parseChord, type Chord } from "./keys";
import type { CommandInfo } from "./types";
import { toast } from "./state.svelte";

export interface Cmd {
  id: string;
  title: string;
  description?: string;
  /** "ui": a UI action; "builtin": an Atlas server command; "script": a workspace script. */
  source: "ui" | "builtin" | "script";
  defaultKeys?: string;
  keys?: string;
  /** Scripts: the manifest file and who added it. */
  file?: string;
  origin?: CommandInfo["origin"];
  schedule?: string;
  lastRun?: CommandInfo["last_run"];
  fromTerminal: boolean;
  alsoKeys?: string[];
  where?: Action["where"];
  yieldTo?: string;
  /** For a toolbar button (lib/toolbar.ts): UI actions that have one. */
  icon?: Action["icon"];
  label?: string;
  run(): void | Promise<void>;
}

export const keymap = $state({ overrides: {} as Record<string, string>, server: [] as CommandInfo[], loaded: false });

export async function loadKeymap(): Promise<void> {
  const [k, cmds] = await Promise.all([api.keys().catch(() => ({ keys: {} })), api.commands().catch(() => [] as CommandInfo[])]);
  keymap.overrides = k.keys;
  keymap.server = cmds;
  keymap.loaded = true;
}

const effective = (id: string, def?: string) => (id in keymap.overrides ? keymap.overrides[id] || undefined : def);

/** Every way of running a command (key, palette, toolbar, bookmark) takes it from `allCommands`,
 *  so this is the one place where plugins are told that it ran. */
const told = <R>(id: string, run: () => R) => (): R => { emitPluginEvent({ type: "command", id }); return run(); };

export function allCommands(): Cmd[] {
  const ui: Cmd[] = actions.filter((a) => !a.plugin || builtinOn(a.plugin)).map((a) => ({
    id: a.id, title: a.title, source: "ui", defaultKeys: a.keys, keys: effective(a.id, a.keys),
    fromTerminal: !!a.fromTerminal, alsoKeys: a.alsoKeys, where: a.where, yieldTo: a.yieldTo, icon: a.icon, label: a.label, run: told(a.id, a.run),
  }));
  const server: Cmd[] = keymap.server
    .filter((c) => !c.needs_args && !(c.id in serverBuiltinToUi)) // needs arguments, or fronted by a UI action
    .map((c) => ({
      id: c.id, title: c.title, description: c.description, source: c.source === "script" ? "script" : "builtin",
      defaultKeys: c.keys, keys: effective(c.id, c.keys), file: c.file, origin: c.origin, schedule: c.schedule, lastRun: c.last_run,
      fromTerminal: false, run: told(c.id, () => runServerCommand(c.id, c.title)),
    }));
  return firstOfEach([...ui, ...server]);
}

/** Every list of commands is keyed by id, and a repeated id crashed them all (Svelte each_key_duplicate: the
 *  command bar and Settings → Commands/Keyboard went blank). The first one wins; the others are said once. */
const toldDupes = new Set<string>();
function firstOfEach(list: Cmd[]): Cmd[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    if (!seen.has(c.id)) { seen.add(c.id); return true; }
    if (!toldDupes.has(c.id)) {
      toldDupes.add(c.id);
      console.error(`Duplicate command id “${c.id}”: “${c.title}” is ignored`);
      // later: this runs inside $derived values, where changing state is refused
      queueMicrotask(() => toast("Duplicate command", `Two commands are called “${c.id}”; only the first is used.`, "error", 9000));
    }
    return false;
  });
}

/** Commands that come and go with files (a workspace, a bookmark): replaces every command whose id
 *  starts with `prefix`. `actions` is a plain array, so the palette and bindings are told to recompute. */
export function setCommands(prefix: string, list: Action[]): void {
  for (let i = actions.length - 1; i >= 0; i--) if (actions[i].id.startsWith(prefix)) actions.splice(i, 1);
  addCommands(list);
}
export function addCommands(list: Action[]): void {
  actions.push(...list.filter((a) => !actions.some((x) => x.id === a.id)));
  keymap.server = [...keymap.server];
}

/** Key → command, first match wins (UI actions before server commands, like the palette order). */
/** Every chord and its command; those that count in one place only come first, so they win there. */
export function bindings(): { chord: Chord; cmd: Cmd }[] {
  const all = allCommands().flatMap((cmd) =>
    [cmd.keys, ...(cmd.alsoKeys ?? [])].flatMap((k) => { const chord = k ? parseChord(k) : null; return chord ? [{ chord, cmd }] : []; }));
  return [...all.filter((b) => b.cmd.where), ...all.filter((b) => !b.cmd.where)];
}

/** Commands that answer to the same key in the same place: only the first of them ever runs. By command
 *  id → the titles of the others. A key that means one thing in notes and another elsewhere is not a clash. */
export function keyClashes(): Map<string, string[]> {
  const byKey = new Map<string, Cmd[]>();
  for (const { chord: c, cmd } of bindings()) {
    const key = `${c.ctrl}|${c.alt}|${c.shift}|${c.meta}|${c.code}|${c.char ?? ""}|${cmd.where ?? ""}`;
    const list = byKey.get(key) ?? [];
    if (!list.includes(cmd)) list.push(cmd);
    byKey.set(key, list);
  }
  const out = new Map<string, string[]>();
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    for (const c of list) out.set(c.id, [...(out.get(c.id) ?? []), ...list.filter((o) => o !== c).map((o) => o.title)]);
  }
  return out;
}

export async function setKey(id: string, keys: string | null): Promise<void> {
  keymap.overrides = (await api.setKey(id, keys)).keys;
}

/** The effective shortcut of one command (for hints: rail tooltips, menus). */
export function keysOf(id: string): string | undefined {
  return allCommands().find((c) => c.id === id)?.keys;
}
