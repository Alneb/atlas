// What the rules editor needs (Rules.svelte): the pane's Mail, or the stand-in Settings and the Rules dialog give it.
import { call, type PluginApi } from "./api";
import { openMail } from "./open-mail";
import type { Mail } from "./store.svelte";

export type RulesHost = Pick<Mail, "call" | "search"> & {
  toast(text: string, kind?: "info" | "success" | "error"): void;
  atlas: { open(path: string, line?: number, opts?: { beside?: boolean }): void };
};

/** The editor's host outside the pane: the helper called directly, a search opening the pane on it. */
export const standIn = (atlas: PluginApi): RulesHost => ({
  call: <T>(method: string, params: Record<string, unknown> = {}, timeout = 120) => call<T>(atlas, method, params, timeout),
  search: (q: string) => openMail(atlas, { search: q }),
  toast: (text, kind = "info") => atlas.toast("Email", text, kind),
  atlas: { open: (path, line, opts) => atlas.open(path, line, opts) },
}) as RulesHost;

/** The pane's arg that opens the rules dialog (view.ts). */
export const RULES_DIALOG = JSON.stringify({ dialog: "rules" });

/** The pane's arg that opens the Thunderbird dialog (view.ts): its accounts as cards, its local mail as notes. */
export const THUNDERBIRD_DIALOG = JSON.stringify({ dialog: "thunderbird" });
