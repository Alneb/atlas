// Outlook's sign-in: SignIn.svelte in a dialog over the app (API 20; a tab of its own on an older one). Started from
// the command, from an account's card in Settings (the "atlas-email:signin" event) and when the engine asks.
import type { PluginApi } from "./api";

type Card = { name: string; auth?: string; user?: string };

/** The pane's arg that opens the sign-in for `account` (or a card not saved yet), or asks which one (view.ts). */
export const signinDialog = (account?: string, record?: Card) => JSON.stringify({ dialog: "signin", account, record });

export function signin(atlas: PluginApi, name?: string | Card): void {
  const record = typeof name === "object" ? name : undefined;
  const arg = signinDialog(typeof name === "string" ? name : record?.name, record);
  if (typeof atlas.openDialog === "function") void atlas.openDialog(arg, { title: "Sign in to Outlook", width: 560, height: 360 });
  else atlas.openView(arg, { title: "Outlook sign-in", icon: "mail" });
}
