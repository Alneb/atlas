// Every command the user can run — UI actions, server built-ins, workspace scripts — with its
// effective shortcut: `.atlas/keys.toml` overrides first, then the command's own default.
// The global key handler, the palette and the Commands pane all read this one list.
import { emitPluginEvent } from "./plugin-events";
import { builtinOn } from "./builtin-plugins";
import { actions, runServerCommand, serverBuiltinToUi, type Action } from "./actions";
import { api } from "./api";
import { keySystem, onThisSystem, parseChord, sameChord, type Chord, type KeySystem } from "./keys";
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
  return forThisSystem(firstOfEach([...ui, ...server]));
}

const hasSuper = (k: string) => onThisSystem(k, "windows") !== k;
const withShift = (k: string) => (parseChord(k)?.shift ? k : k.replace(/\+([^+]+|\+)$/, "+Shift+$1"));

/** The keys as this system types them (keys.ts `onThisSystem`: Super is Ctrl+Cmd on a Mac, Ctrl+Alt on Windows). On
 *  Windows a default already on Ctrl+Alt that a Super key now takes (Super+P open file over Ctrl+Alt+P pin tab) moves
 *  to Ctrl+Alt+Shift: the everyday app keys keep the shorter form. A key set by hand (`.atlas/keys.toml`) never moves. */
export function forThisSystem(list: Cmd[], sys: KeySystem = keySystem()): Cmd[] {
  if (sys === "linux") return list;
  const keysOf = (c: Cmd) => [c.keys, ...(c.alsoKeys ?? [])].filter((k): k is string => !!k);
  const taken = list.flatMap(keysOf).filter(hasSuper).map((k) => onThisSystem(k, sys));
  const every = list.flatMap(keysOf).map((k) => onThisSystem(k, sys));
  const free = (k: string) => !every.some((t) => sameChord(t, k));
  // a moved key whose Shift form is taken too (Ctrl+Alt+B add bookmark, Super+Shift+B browse) is left without a key
  // here, to be given one on the Keyboard page, rather than two commands answering it
  const fix = (k: string | undefined, movable: boolean) =>
    !k ? k : hasSuper(k) ? onThisSystem(k, sys) : movable && taken.some((t) => sameChord(t, k)) ? (free(withShift(k)) ? withShift(k) : undefined) : k;
  return list.map((c) => ({ ...c, keys: fix(c.keys, c.keys === c.defaultKeys), defaultKeys: fix(c.defaultKeys, true), alsoKeys: c.alsoKeys?.flatMap((k) => fix(k, true) ?? []) }));
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

/** A control's tooltip: what it does, then the key of the command it runs ("Search · Super+F"); no key, the text alone. */
export function tipFor(text: string, id: string): string {
  const k = keysOf(id);
  return k ? `${text} · ${k}` : text;
}
