// A plugin's settings: its page in Settings (components/settings/PluginPage.svelte, opened by
// `atlas.plugin.openSettings()` too), its fields as the form's fields, its secrets' names and suggestions, and saving.
// The schema is the plugin's `[[setting]]` (core: plugin_settings.rs).
import { errText } from "./text";
import { api } from "./api";
import { toast } from "./state.svelte";
import { plugins, loadPlugins, runPluginCommand, type Plugin } from "./plugins.svelte";
import { secretHint, type OptionField } from "./block-options";
import { openSettingsAt, pluginPageId } from "./settings-nav.svelte";
import type { SettingField } from "./gen/SettingField";

/** The group `advanced = true` fields fold into, closed, at the end of the form. */
export const ADVANCED = "Advanced";

export const hasSecrets = (fields: SettingField[]): boolean => fields.some((f) => f.kind === "secret" || (f.kind === "records" && hasSecrets(f.fields)));

/** A plugin's settings (and its details, problems, actions) are a page of Settings (components/settings/PluginPage.svelte). */
export async function openPluginSettings(id: string): Promise<void> {
  const p = plugins.list.find((x) => x.id === id);
  if (!p) return toast("Settings", `No plugin ${id} in this vault.`, "error");
  openSettingsAt(pluginPageId(id));
}

/** The names of a plugin's stored secrets (never their values). */
export const secretNames = (p: Plugin): Promise<string[]> =>
  hasSecrets(p.fields) && p.permissions.secrets ? api.pluginSecretNames(p.id).catch(() => []) : Promise.resolve([]);

/** What its helper suggests for the fields that `suggest`, each as it answers (a helper that fails leaves the box). */
export function loadSuggestions(p: Plugin, got: (key: string, options: { value: string; label: string }[]) => void): void {
  for (const f of p.fields) {
    if (!f.suggest) continue;
    void api.pluginHelper(p.id, f.suggest, null, 20).catch(() => null).then((r) => {
      if (Array.isArray(r)) got(f.key, r.filter((o): o is { value: string; label: string } => typeof o?.value === "string").map((o) => ({ value: o.value, label: String(o.label ?? o.value) })));
    });
  }
}

/** The core's fields as the form's: a secret says whether it is set (`secrets`: the stored names; null inside a
 *  card, whose secrets are `<key>.<card>.<field>` and told by the card itself through `secretsOf`). */
export function formFields(fields: SettingField[], secrets: string[] | null, suggestions: Record<string, { value: string; label: string }[]> = {}): OptionField[] {
  // `hidden` fields are the plugin's own page's to write; `advanced` ones fold into a last group
  const shownFields = fields.filter((f) => !f.hidden);
  return [...shownFields.filter((f) => !f.advanced), ...shownFields.filter((f) => f.advanced)].map((f): OptionField => {
    const base = { key: f.key, label: f.label, hint: f.hint, when: f.when as OptionField["when"], group: f.advanced ? ADVANCED : f.group, readonly: f.readonly, default: f.default };
    switch (f.kind) {
      case "choice": return { ...base, kind: "choice", choices: f.choices };
      case "secret": {
        if (!secrets) return { ...base, kind: "secret" };
        const set = secrets.includes(f.key);
        return { ...base, kind: "secret", isSet: set, hint: secretHint(set, f.readonly, f.hint) };
      }
      case "records": return {
        ...base, kind: "records", fields: formFields(f.fields, null, suggestions), add: f.add, name: f.name, actions: f.actions.map((a) => ({ ...a, when: a.when as OptionField["when"] })), listActions: f.list_actions,
        secretsOf: (card) => (secrets ?? []).filter((s) => s.startsWith(`${f.key}.${card}.`)).map((s) => s.slice(`${f.key}.${card}.`.length)),
      };
      case "text": return { ...base, kind: "text", suggestions: secrets ? suggestions[f.key] : undefined };
      case "longtext": case "number": case "toggle": case "list": return { ...base, kind: f.kind };
    }
  });
}

/** Saves what the form handed back; true when it was written. Every field is sent: an emptied one as null (its
 *  default applies again), a switch as true or false, a records field as its whole list. */
export async function savePluginSettings(p: Plugin, next: Record<string, unknown>): Promise<boolean> {
  const values = Object.fromEntries(p.fields.map((f) => [f.key, f.kind === "toggle" ? next[f.key] === true : f.kind === "records" ? (next[f.key] ?? []) : (next[f.key] ?? null)]));
  try {
    await api.pluginSettings(p.id, values);
    await loadPlugins();
    return true;
  } catch (e) {
    toast("Settings not saved", errText(e), "error", 9000);
    return false;
  }
}

/** A card's or list's button: the form is saved first (the command must see what was typed), then the command runs. */
export async function runSettingsAction(p: Plugin, command: string, arg: Record<string, unknown>, next: Record<string, unknown>): Promise<void> {
  if (await savePluginSettings(p, next)) await runPluginCommand(p.id, command, arg);
}
