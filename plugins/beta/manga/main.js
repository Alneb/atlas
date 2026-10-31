// Manga — the web side's entry: the Libraries page's Comics and a command opening it; a series and its reader are the
// pane (view.js). A .cbz opens in the pane by "Open with…" (plugin.toml `opens`). The Android apps draw their own screens (android/).
import { seriesIn, coverOf } from "./view.js";
import { suwayomi } from "./suwayomi.js";

const SEP = " › "; // a group named as a path shows as a folder tree at the side (the page's GROUP_SEP): Suwayomi › Weekly

export function register(atlas) {
  // the library is the Libraries page's Comics tab, the one place series are listed
  atlas.registerCommand({ id: "library", title: "Manga: library", run: () => atlas.openLibrary("comics") });
  // Suwayomi's own library update, started from here: it runs on the server, new chapters show as unread counts
  atlas.registerCommand({ id: "update", title: "Manga: look for new chapters on Suwayomi", run: async () => {
    const suw = suwayomi(atlas, atlas.plugin.settings?.suwayomi);
    if (!suw.on) return atlas.toast("Manga", "No Suwayomi server set: Settings → Plugins → Manga.", "error");
    try { await suw.updateLibrary(); atlas.toast("Manga", "Suwayomi is looking for new chapters in your library; the Comics page shows them as they come."); }
    catch (e) { atlas.toast("Manga", String(e.message ?? e), "error"); }
  } });
  // the Libraries page's Comics: the folder's series and the user's Suwayomi library; a series opens in the pane
  atlas.registerLibrary?.({
    id: "comics", title: "Comics", icon: "file", noun: "series",
    async load() {
      const S = atlas.plugin.settings ?? {}, suw = suwayomi(atlas, S.suwayomi);
      const mine = await seriesIn(atlas, String(S.folder || "manga").replace(/^\/+|\/+$/g, ""));
      const theirs = suw.on ? await suw.library().catch(() => []) : [];
      const there = suw.offline ? "Suwayomi (offline: as last seen)" : "Suwayomi";
      return [...mine.map((s) => ({ s, where: "In the vault" })), ...theirs.map((s) => ({ s, where: there }))].map(({ s, where }) => ({
        id: s.path, title: s.title, sub: s.remote ? (s.unread ? `${s.unread} unread` : "all read") : `${s.chapters.length} chapter${s.chapters.length === 1 ? "" : "s"}`,
        cover: () => (s.remote ? suw.cover(s) : coverOf(atlas, s)).catch(() => null), groups: s.categories?.length ? s.categories.map((c) => `${where}${SEP}${c}`) : [where],
        text: `${s.title} ${where} ${(s.categories ?? []).join(" ")}`, sort: { title: s.title },
      }));
    },
    groupsTitle: "From", layouts: ["covers", "list"], sorts: [{ id: "title", label: "title" }],
    search: "Search the comics…", empty: "No comics yet: a folder per series in the manga folder, or your Suwayomi in the plugin's settings.",
    detail: (item) => ({ kind: "Comic", title: item.title, lines: [{ text: item.sub ?? "" }], actions: [{ label: "Read", icon: "file", primary: true, run: () => atlas.openView(item.id, { title: item.title, icon: "file" }) }] }),
    open: (item) => atlas.openView(item.id, { title: item.title, icon: "file" }),
  });
}
