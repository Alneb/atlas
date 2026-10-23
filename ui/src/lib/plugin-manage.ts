// A vault plugin as Settings shows and manages it — in the list (components/settings/PluginsPanel.svelte) and on its
// own page (components/settings/PluginPage.svelte): what it may do, what it adds, which settings differ from its
// defaults, and switching, installing, updating, removing it (replaced or removed folders go to .atlas/trash/).
import { errText } from "./text";
import { api } from "./api";
import { pick } from "./palette.svelte";
import { toast } from "./state.svelte";
import { settings } from "./settings.svelte";
import { loadPlugins, setPluginOn, type Plugin } from "./plugins.svelte";

export const isOff = (id: string): boolean => (settings.config?.plugins.off ?? []).includes(id);
export const pluginDir = (id: string): string => `.atlas/plugins/${id}`;

export function switchPlugin(id: string, on: boolean): void {
  setPluginOn(id, on).catch((e) => toast("Not saved", errText(e), "error"));
}

/** What a plugin asked to be allowed outside the page, in plain words (its manifest's [permissions] and [helper]). */
export function mayOf(perm: Plugin["permissions"] | undefined, helper: boolean): string {
  return [
    perm?.net?.includes("*") ? "talk to any server on the network" : perm?.net?.length ? `talk to ${perm.net.join(", ")}` : "",
    perm?.secrets ? "keep secrets (outside the vault)" : "",
    helper ? "run a program of its own" : "",
  ].filter(Boolean).join(" · ");
}

/** What it adds to Atlas, as a list of words. */
export const partsOf = (p: Plugin): string[] =>
  [p.view && "a pane", p.main && "blocks / commands", p.has_data && "a data script", p.rail && "a button at the top of the bar", ...(p.parts ?? [])].filter((x): x is string => !!x);

// a list of records (cards) is counted, not printed: the form shows them
const fmt = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) && v.some((x) => x && typeof x === "object") ? `${v.length} card${v.length === 1 ? "" : "s"}` : JSON.stringify(v));
/** The settings changed from their defaults, as the form names them (its labels; a secret never shown). */
export function changedSettings(p: Plugin): { key: string; label: string; value: string }[] {
  const fields = new Map(p.fields.map((f) => [f.key, f]));
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "") || String(a ?? "") === String(b ?? "");
  return Object.entries(p.settings ?? {}).flatMap(([k, v]) => {
    const f = fields.get(k);
    if (f?.kind === "secret" || (f && same(v, f.default))) return [];
    const value = typeof v === "boolean" ? (v ? "on" : "off") : v === "" || v === null || (Array.isArray(v) && !v.length) ? "none" : fmt(v);
    return [{ key: k, label: f?.label ?? k, value }];
  });
}

export function installPlugin(): void {
  pick({
    placeholder: "Install a plugin from… a folder, a git address, or a .zip / .tar.gz file", tag: "Install", icon: "plugin", items: [],
    typed: (t) => `Copy the plugin at ${t} into this vault`,
    onpick: async (from) => {
      try {
        const r = await api.installPlugin(from.trim());
        await loadPlugins();
        const may = mayOf(r.permissions, r.has_helper);
        toast(`Installed ${r.title}`, `It is switched off. ${may ? `It may ${may}. ` : ""}Switch it on here when you have looked at it.`, "success", 12000);
      } catch (e) { toast("Not installed", errText(e), "error", 9000); }
    },
  });
}

export async function updatePlugin(p: Plugin): Promise<void> {
  try {
    const r = await api.updatePlugin(p.id);
    await loadPlugins();
    toast(`Updated ${r.title}${r.version ? ` to v${r.version}` : ""}`, `Your settings were kept. The copy it replaced is in ${r.replaced ?? ".atlas/trash/"}.`, "success", 9000);
  } catch (e) { toast("Not updated", errText(e), "error", 9000); }
}

export function removePlugin(p: Plugin): void {
  pick({
    placeholder: `Remove the plugin “${p.title}” from this vault?`, tag: "Remove", icon: "plugin",
    items: [{ value: "remove", title: `Remove ${p.title}`, detail: "its folder moves to .atlas/trash/ — nothing is deleted" }, { value: "", title: "Keep it" }],
    onpick: async (v) => {
      if (v !== "remove") return;
      try { const r = await api.removePlugin(p.id); await loadPlugins(); toast(`Removed ${p.title}`, `Its folder is in ${r.to}.`, "success", 9000); }
      catch (e) { toast("Not removed", errText(e), "error", 9000); }
    },
  });
}
