// A vault plugin as Settings shows and manages it — in the list (components/settings/PluginsPanel.svelte) and on its
// own page (components/settings/PluginPage.svelte): what it may do, what it adds, which settings differ from its
// defaults, and switching, installing, updating, removing it (replaced or removed folders go to .atlas/trash/).
import { errText } from "./text";
import { api } from "./api";
import { pick, type PickItem } from "./palette.svelte";
import { toast } from "./state.svelte";
import { settings } from "./settings.svelte";
import { loadPlugins, pluginOn, plugins, setPluginOn, type Plugin } from "./plugins.svelte";
import type { Platform } from "./gen/Platform";
import type { Support } from "./gen/Support";
import type { Available } from "./gen/Available";

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
    perm?.exec?.length ? `run ${perm.exec.join(", ")}` : "",
    helper ? "run a program of its own" : "",
  ].filter(Boolean).join(" · ");
}

export const PLATFORM_NAMES: Record<Platform, string> = { linux: "Linux", macos: "macOS", windows: "Windows", android: "Android", server: "Server" };
export const SUPPORT_WORDS: Record<Support, string> = { works: "works", untested: "untested", no: "does not run" };

/** What it adds to Atlas, as a list of words — with what it gives the plugins that run (`gives`). */
export const partsOf = (p: Plugin): string[] =>
  [p.view && "a pane", p.main && "blocks / commands", p.has_data && "a data script", p.rail && "a button at the top of the bar", ...(p.parts ?? []),
    ...giftsOf(p).filter((g) => g.runs).map((g) => `${g.what.join(", ")} for ${g.title}`)].filter((x): x is string => !!x);

/** What `p` gives each plugin it contributes to (`[contributes.<id>]`), and whether that plugin is here and runs: a
 *  plugin's page says what turning the other one on would add. */
export function giftsOf(p: Plugin): { to: string; title: string; what: string[]; here: boolean; runs: boolean }[] {
  return (p.gives ?? []).map((g) => {
    const to = plugins.list.find((x) => x.id === g.to);
    return { to: g.to, title: to?.title ?? g.to, what: g.what, here: !!to, runs: !!to && pluginOn(to) };
  });
}

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

/** The release's plugins as picker rows: the ones not here first, by tier; what does not run here or is installed says so. */
async function releaseRows(): Promise<PickItem[]> {
  let offered: Available[];
  try { offered = await api.availablePlugins(); }
  catch (e) { return [{ value: "", title: "The release's plugins could not be read", detail: errText(e), section: "From the release" }]; }
  const order = (a: Available) => (a.installed !== undefined ? 2 : 0) + (a.tier === "stable" ? 0 : 1);
  return [...offered].sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title)).map((a) => ({
    value: a.url,
    title: `${a.title}${a.version ? ` ${a.version}` : ""}`,
    detail: [
      a.tier,
      a.installed !== undefined ? `installed${a.installed ? ` (${a.installed})` : ""}: update it from its page` : "",
      a.runs_here ? "" : "not built for this computer",
    ].filter(Boolean).join(" · "),
    icon: "plugin" as const,
    section: a.tier === "stable" ? "From the release · stable" : "From the release · beta",
  }));
}

export function installPlugin(): void {
  pick({
    placeholder: "Install a plugin: one from the release, or type a folder, a git address, a .zip / .tar.gz file or its web address",
    tag: "Install", icon: "plugin", items: releaseRows,
    typed: (t) => `Copy the plugin at ${t} into this vault`,
    onpick: async (from) => {
      if (!from.trim()) return;
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
