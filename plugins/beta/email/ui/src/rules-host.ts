// What the rules editor needs (Rules.svelte): the pane's Mail, or the stand-in Settings gives it (main.ts).
import type { Mail } from "./store.svelte";

export type RulesHost = Pick<Mail, "call" | "search"> & {
  toast(text: string, kind?: "info" | "success" | "error"): void;
  atlas: { open(path: string, line?: number, opts?: { beside?: boolean }): void };
};
