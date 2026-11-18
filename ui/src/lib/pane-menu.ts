// A right-click on the open space of a pane (nothing under the pointer with a menu of its own: no file row, link,
// field or selection) offers what that pane does, not the same four ways to go anywhere in every view: the commands
// of the plugin whose pane it is (a Calendar's "new event", a mail's "check now"…) or of the built-in view (a PDF's
// `pdf.*`), the plugin's settings, the pane's file, then the pane itself (full screen, close). The ways to go anywhere
// stay at the end. lib/app-menu.ts asks for these; a part with its own menu (the editor, tabs, files…) never gets here.
import type { MenuItem } from "./menu";
import { allCommands, keysOf } from "./keymap.svelte";
import { panelAt } from "./dock-panels";
import { ACTION_PREFIX } from "./plugin-commands";
import { plugins } from "./plugin-registry.svelte";
import { closeTab } from "./tabs.svelte";
import type { PaneSpec } from "./panes";

/** The built-in views whose own commands carry a prefix of their kind (actions.ts: `pdf.export-marks`…). */
const KIND_COMMANDS: Partial<Record<PaneSpec["kind"], string>> = { pdf: "pdf.", excalidraw: "draw.", web: "web." };
/** More than this many and the menu is a second palette: the rest are the palette's. */
const MOST = 8;

/** The commands that belong to the pane `spec` shows, as menu rows ("Calendar: New event" said "New event" there). */
function ownCommands(spec: PaneSpec): MenuItem[] {
  const plugin = spec.kind === "plugin" ? plugins.list.find((p) => p.id === spec.id) : undefined;
  const prefix = plugin ? `${ACTION_PREFIX}${plugin.id}.` : KIND_COMMANDS[spec.kind];
  if (!prefix) return [];
  const named = plugin ? new RegExp(`^${plugin.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:·—-]\\s*`, "i") : /^[^:]{1,24}:\s*/;
  const seen = new Set<string>();
  return allCommands()
    .filter((c) => c.id.startsWith(prefix))
    .flatMap((c) => {
      const bare = c.title.replace(named, "");
      const label = bare.charAt(0).toUpperCase() + bare.slice(1);
      // two names for one thing ("Calendar: new event", "New event") said once; its bare "Open" is this very pane
      if (seen.has(label) || (plugin && /^open$/i.test(bare.trim()))) return [];
      seen.add(label);
      return [{ label, icon: typeof c.icon === "function" ? c.icon() : c.icon, hint: keysOf(c.id), run: () => void c.run() }];
    })
    .slice(0, MOST);
}

/** The rows for a right-click in the open space of the pane holding `el`; empty outside any pane. */
export function paneMenuItems(el: Element): MenuItem[] {
  const pane = panelAt(el);
  const spec = pane?.spec;
  if (!pane || !spec) return [];
  const rows: MenuItem[] = [...ownCommands(spec)];
  if (spec.kind === "plugin") {
    const p = plugins.list.find((x) => x.id === spec.id);
    if (p) rows.push("sep", { label: `${p.title} settings…`, icon: "settings", run: () => void import("./plugin-settings.svelte").then((m) => m.openPluginSettings(p.id)) });
  }
  // the pane's file: the rows any file has, where the pane shows one (a PDF, a drawing, a table)
  if ("path" in spec && typeof spec.path === "string" && spec.path) {
    const path = spec.path;
    const link = `[[${path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "")}]]`;
    rows.push("sep",
      { label: "Open with…", icon: "plugin", run: () => void import("./actions").then((m) => m.openWith(path)) },
      { label: "Copy link", icon: "link", detail: link, run: () => void navigator.clipboard.writeText(link).catch(() => {}) });
  }
  rows.push("sep",
    { label: "Full screen", icon: "maximize", hint: keysOf("ui.fullscreen"), run: () => void import("./fullscreen.svelte").then((m) => m.toggleFullscreen()) },
    { label: "Close", icon: "close", hint: keysOf("ui.close"), run: () => closeTab(pane.id) });
  return rows;
}
