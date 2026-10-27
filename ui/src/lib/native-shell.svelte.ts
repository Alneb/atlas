// The phone app's native shell (docs/guides/ANDROID.md, "The native shell"): inside atlas.apk this page is the note view of a
// native app. The app draws its bars, the open files' sheet, its menu and the phone's settings; this page shows
// everything else — Home, Files, Search, the open files, any view. Only files are tabs: the rest is a "view", one at a time. This module hides the page's own
// phone bars, reports the tabs to the app and takes its orders. Without the app's bridge it does nothing.
import { allCommands } from "./keymap.svelte";
import { navigate, open, openPath, restorePath, setNativeOpener } from "./dock";
import { activate, closeTab, revealInTree, tabs } from "./tabs.svelte";
import { dismiss } from "./back";
import { api } from "./api";
import { keepExt } from "./paths";
import { toast } from "./state.svelte";
import { movedTabs } from "./gone-files";
import { openersFor } from "./openers";
import { resolveOrBeside } from "./vault";
import { wikiTarget } from "./draw-pages";
import { loadPlugins } from "./plugins.svelte";
import { deliverPenDraft, deliverPenStroke } from "./pen-target";
import { openPluginSettings } from "./plugin-settings.svelte";

/** What the app injects (AtlasActivity's `addJavascriptInterface`); strings only, as the bridge requires. */
interface Bridge {
  ready(): void;
  tabs(json: string): void;
  /** the phone's font size (1 = the default); older apps lack it */
  fontScale?(): string;
  /** "true" when a native plugin of the app opens this vault path (docs/refactor/REFACTOR-native-plugins.md) */
  nativeOpens?(path: string): string;
  openNative?(path: string): void;
  /** a service's gate, signed in in the app's own window and handed to the in-app core (service-signin.ts) */
  signInDoor?(url: string): void;
  /** the app's own readers with a place of their own (Books, Manga): `[{ plugin, title }]`, and opening one */
}

const bridge = (globalThis as unknown as { AtlasNative?: Bridge }).AtlasNative;
export const nativeShell = { on: !!bridge };

/** The app signs in to a service's gate itself (a browser tab can't hand its cookies over); false without that app. */
export function nativeSignInDoor(url: string): boolean {
  if (!bridge?.signInDoor) return false;
  bridge.signInDoor(url);
  return true;
}

/** A tab as the app needs it: `file` tabs are listed; the others are the one view. */
export interface NativeTab { id: string; title: string; path: string | null; icon: string; active: boolean; file: boolean }

/** Starts the bridge (App.svelte, once the dock exists): the tabs reported on every change, the app's orders exposed. */
export function attachNativeShell(): () => void {
  if (!bridge) return () => {};
  document.documentElement.classList.add("native-shell");
  // the phone's text size scales the whole interface, boxes with their words (base.css; the WebView's text zoom is off)
  const font = Math.min(1.3, Math.max(0.85, Number(bridge.fontScale?.() ?? 1) || 1));
  document.documentElement.style.setProperty("--system-font", String(font));
  // the app's orders that put something in front, counted: one still loading when a later one came gives way (Home
  // looks its document up first; a Files tapped meanwhile was then covered by Home a moment later)
  let asked = 0;
  const front = <A extends unknown[], R>(f: (...a: A) => R) => (...a: A): R => { asked += 1; return f(...a); };
  (globalThis as unknown as { atlasShell: unknown }).atlasShell = {
    open: front((path: string, line?: number) => openPath(path, line || undefined)),
    /** the tabs the app kept for this vault, back behind the shown view (AtlasActivity.pageReady) */
    restore: (path: string) => restorePath(path),
    /** AtlasActivity's PenCatcher: a stroke caught natively over the drawing (pen-target.ts). */
    penStroke: (json: string) => deliverPenStroke(json),
    /** the stroke so far (null: it ended), while another device watches (pen-target.ts wantPenDrafts) */
    penDraft: (json: string | null) => deliverPenDraft(json),
    /** a `[[note]]` link followed from vault file `from` (a native screen's element link: Notepad), resolved as the
     *  desktop's drawing pane resolves it */
    link: front((link: string, from: string) => {
      const target = wikiTarget(link) ?? link.trim();
      if (target) openPath(resolveOrBeside(target, from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : ""));
    }),
    // the vault's home document (`home` in its config: Home.page), as the desktop opens it; Today when it has none
    home: front(() => { const mine = asked; void import("./actions").then((m) => m.openHome(() => asked === mine)); }),
    view: front((kind: "files" | "search" | "settings" | "graph" | "outline" | "library" | "libraries" | "commands" | "git") => open({ kind })),
    plugin: front((id: string, arg?: string) => open({ kind: "plugin", id, arg })),
    /** a plugin's settings form (the app's "Built into this app": it may have just added the plugin to the vault) */
    pluginSettings: async (id: string) => { await loadPlugins(); await openPluginSettings(id); },
    activate: front((id: string) => activate(id)),
    close: (id: string) => closeTab(id),
    back: () => navigate(-1),
    /** a command by id (the + → "ui.new") */
    command: (id: string) => allCommands().find((c) => c.id === id)?.run(),
    /** the system Back, first: closes what is open over the page (lib/back.ts); false when nothing was */
    dismiss: () => dismiss(),
    // the ⋮ menu's file actions (AtlasActivity.menu); a tab follows a rename and closes with its file (gone-files.ts)
    reveal: (path: string) => revealInTree(path),
    rename: async (path: string, name: string) => {
      // the phone shows the name without its extension: it stays (keepExt)
      const to = `${path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : ""}${keepExt(path, name)}`;
      if (!name || name.includes("/") || to === path) return;
      try { const follow = movedTabs(path, to); await api.move(path, to); for (const p of follow) openPath(p); }
      catch (e) { toast("Not renamed", String(e), "error"); }
    },
    trash: async (path: string) => {
      try { toast("Moved to the trash", (await api.trash(path)).to); } catch (e) { toast("Not moved to the trash", String(e), "error"); }
    },
    /** JSON [{id, title, isDefault}]: the views that can open `path` ("Open with…") */
    openers: (path: string) => JSON.stringify(openersFor(path).map(({ id, title, isDefault }) => ({ id, title, isDefault }))),
    openWith: front((path: string, id: string) => { const o = openersFor(path).find((x) => x.id === id); if (o) open(o.spec(path)); }),
  };
  const stop = $effect.root(() => {
    $effect(() => {
      const all: NativeTab[] = tabs.groups.flatMap((g) => g.tabs).map((t) => ({
        id: t.id, title: t.title, path: t.path ?? null, icon: t.icon, active: t.active, file: !!t.path,
      }));
      // one view at a time: a view left behind when another tab or view comes up is closed
      const shown = all.find((t) => t.active);
      for (const t of all) if (!t.file && !t.active && shown && t.id !== shown.id) queueMicrotask(() => closeTab(t.id));
      bridge.tabs(JSON.stringify(all.filter((t) => t.file || t.active)));
    });
  });
  // a file a native plugin of the app opens (a .cbz, an .epub): the app shows it, no web tab
  setNativeOpener((path) => {
    if (bridge.nativeOpens?.(path.split("#")[0]) !== "true") return false; // `x.excalidraw#Page 2`: asked of the file
    bridge.openNative?.(path);
    return true;
  });
  bridge.ready();
  return () => { stop(); setNativeOpener(null); document.documentElement.classList.remove("native-shell"); };
}
