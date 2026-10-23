// What went wrong in each plugin, kept per plugin (Settings → Plugins shows it). Every callback a
// plugin hands to Atlas is run through `guard`, so a failure costs that plugin's contribution only.
import { errText } from "./text";
export interface PluginLogLine { at: number; where: string; message: string }
const MOST = 50;
export const pluginLog = $state<Record<string, PluginLogLine[]>>({});

export function logPlugin(id: string, where: string, e: unknown): void {
  const message = errText(e);
  pluginLog[id] ??= [];
  const lines = pluginLog[id]; // read back: the array as the state holds it, not the one just handed in
  const last = lines[lines.length - 1];
  // the same failure again (a block redrawn on every keystroke) is one line, not fifty
  if (last && last.where === where && last.message === message) { last.at = Date.now(); return; }
  lines.push({ at: Date.now(), where, message });
  if (lines.length > MOST) lines.splice(0, lines.length - MOST);
  console.error("[atlas] plugin", id, where, e);
}
export const clearPluginLog = (id: string): void => { delete pluginLog[id]; };

/** Runs a plugin's callback: a throw, or a rejected promise, goes to its log and `fallback` is returned. */
export function guard<T>(id: string, where: string, fn: () => T, fallback: T): T {
  try {
    const r = fn();
    if (r instanceof Promise) r.catch((e) => logPlugin(id, where, e));
    return r;
  } catch (e) { logPlugin(id, where, e); return fallback; }
}
