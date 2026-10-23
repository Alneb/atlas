// Accounts (docs/design/DESIGN-plugin-settings-v2.md §2): every plugin's records field that says `account = {…}` is a
// list of accounts, shown together on Settings → Accounts with a status from the plugin, Test before saving, presets
// for Add, and its own Save — one card written at a time, the rest of the plugin's settings kept as they are.
import { api } from "./api";
import { plugins, type Plugin } from "./plugins.svelte";
import { savePluginSettings, formFields } from "./plugin-settings.svelte";
import { shown, store, type Card, type RecordsField } from "./block-options";
import type { SettingField } from "./gen/SettingField";
import type { AccountSpec } from "./gen/AccountSpec";

export type AccountState = "ok" | "warn" | "error" | "busy";
export interface AccountStatus { state: AccountState; text: string }

/** A plugin's records field that holds accounts. */
export interface AccountList { plugin: Plugin; setting: SettingField; spec: AccountSpec }

export function accountLists(of?: string): AccountList[] {
  return plugins.list.flatMap((plugin) => plugin.id === of || !of ? plugin.fields.flatMap((setting): AccountList[] =>
    setting.kind === "records" && setting.account ? [{ plugin, setting, spec: setting.account }] : []) : []);
}

/** The records as saved: plain objects, in order (the first is the main one). */
export function savedRecords(l: AccountList): Record<string, unknown>[] {
  const v = (l.plugin.settings ?? {})[l.setting.key];
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

export const recordName = (l: AccountList, r: Record<string, unknown>): string =>
  String(r[l.setting.kind === "records" ? l.setting.name : "name"] ?? "");

/** "{user} · {imap_host}" filled from a record; parts whose field is empty drop out with their separator. */
export function summaryOf(spec: AccountSpec, r: Record<string, unknown>): string {
  if (!spec.summary) return "";
  return spec.summary.split(/\s*·\s*/).map((part) => part.replace(/\{(\w+)\}/g, (_, k) => String(r[k] ?? ""))).filter((x) => x.trim()).join(" · ");
}

// statuses by `<plugin>/<setting>`, then card name; asked when the page shows and after a save
export const statuses = $state<Record<string, Record<string, AccountStatus>>>({});
const keyOf = (l: AccountList) => `${l.plugin.id}/${l.setting.key}`;

export async function refreshStatus(l: AccountList): Promise<void> {
  if (!l.spec.status) return;
  try {
    const r = await api.pluginHelper(l.plugin.id, l.spec.status, { setting: l.setting.key, records: savedRecords(l), settings: l.plugin.settings }, 30);
    if (r && typeof r === "object") statuses[keyOf(l)] = r as Record<string, AccountStatus>;
  } catch (e) {
    statuses[keyOf(l)] = Object.fromEntries(savedRecords(l).map((r) => [recordName(l, r), { state: "warn" as const, text: /no method/.test((e as Error).message) ? "status unknown (update the plugin)" : "status unknown" }]));
  }
}
export const statusOf = (l: AccountList, name: string): AccountStatus | undefined => statuses[keyOf(l)]?.[name];

/** The plugin's Test on a card as typed (not saved yet). */
export async function testAccount(l: AccountList, record: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  if (!l.spec.test) return { ok: false, text: "this plugin has no test" };
  try {
    const r = (await api.pluginHelper(l.plugin.id, l.spec.test, { setting: l.setting.key, record, settings: l.plugin.settings }, 60)) as { ok?: boolean; text?: string } | null;
    return { ok: !!r?.ok, text: String(r?.text ?? (r?.ok ? "works" : "failed")) };
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
}

/** The records field as the form knows it (with which secrets each card has). */
export async function recordsField(l: AccountList): Promise<RecordsField> {
  const names = l.plugin.permissions.secrets ? await api.pluginSecretNames(l.plugin.id).catch(() => [] as string[]) : [];
  return formFields([l.setting], names)[0] as RecordsField;
}

/** Every card as the form holds it, from the saved records. */
export const cardsOf = (f: RecordsField, l: AccountList): Card[] => shown(f, savedRecords(l)) as Card[];

/** Writes the account list with `cards` (one edited, added or removed); the plugin's other settings stay. */
export async function saveCards(l: AccountList, f: RecordsField, cards: Card[]): Promise<boolean> {
  const next: Record<string, unknown> = { ...(l.plugin.settings ?? {}) };
  store(next, f, cards);
  const ok = await savePluginSettings(l.plugin, next);
  const now = accountLists(l.plugin.id).find((x) => x.setting.key === l.setting.key);
  if (ok && now) void refreshStatus(now);
  return ok;
}
