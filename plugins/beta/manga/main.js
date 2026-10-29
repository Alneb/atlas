// Manga — the web side's entry: the Libraries page's Comics and a command opening it; a series and its reader are the
// pane (view.js). A .cbz opens in the pane by "Open with…" (plugin.toml `opens`). The Android apps draw their own screens (android/).
import { seriesIn, coverOf } from "./view.js";
import { suwayomi } from "./suwayomi.js";

export function register(atlas) {
  // the library is the Libraries page's Comics tab, the one place series are listed
  atlas.registerCommand({ id: "library", title: "Manga: library", run: () => atlas.openLibrary("comics") });
  // the Libraries page's Comics: the folder's series and the user's Suwayomi library; a series opens in the pane
  atlas.registerLibrary?.({
    id: "comics", title: "Comics", icon: "file", noun: "series",
    async load() {
      const S = atlas.plugin.settings ?? {}, suw = suwayomi(atlas, S.suwayomi);
      const mine = await seriesIn(atlas, String(S.folder || "manga").replace(/^\/+|\/+$/g, ""));
      const theirs = suw.on ? await suw.library().catch(() => []) : [];
      return [...mine.map((s) => ({ s, where: "In the vault" })), ...theirs.map((s) => ({ s, where: "Suwayomi" }))].map(({ s, where }) => ({
        id: s.path, title: s.title, sub: s.remote ? (s.unread ? `${s.unread} unread` : "all read") : `${s.chapters.length} chapter${s.chapters.length === 1 ? "" : "s"}`,
        cover: () => (s.remote ? suw.cover(s) : coverOf(atlas, s)).catch(() => null), groups: [where], text: `${s.title} ${where}`, sort: { title: s.title },
      }));
    },
    groupsTitle: "From", layouts: ["covers", "list"], sorts: [{ id: "title", label: "title" }],
    search: "Search the comics…", empty: "No comics yet: a folder per series in the manga folder, or your Suwayomi in the plugin's settings.",
    detail: (item) => ({ kind: "Comic", title: item.title, lines: [{ text: item.sub ?? "" }], actions: [{ label: "Read", icon: "file", primary: true, run: () => atlas.openView(item.id, { title: item.title, icon: "file" }) }] }),
    open: (item) => atlas.openView(item.id, { title: item.title, icon: "file" }),
  });
}
