// Manga — the web side's entry: the Libraries page's Comics and a command opening it; a series and its reader are the
// pane (view.js). A .cbz opens in the pane by "Open with…" (plugin.toml `opens`). The Android apps draw their own screens
// (android/): there the command opens the native library (`manga:library`) and a series of Comics its native series
// screen (`manga:series/<id>`); `atlas.openNative` says false on the desktop and in a browser, where the page shows them.
import { seriesIn, coverOf, BROWSE, SERVER } from "./view.js";
import { suwayomi } from "./suwayomi.js";

const SEP = " › "; // a group named as a path shows as a folder tree at the side (the page's GROUP_SEP): Suwayomi › Weekly

/** Where each vault series is, from the series' notes in one query (`chapter_progress`, `last_read`, as both readers
 *  write them; view.js readingOf): the note is the series folder's own, so the map is by its folder. */
async function readingOfAll(atlas) {
  if (!atlas.query) return new Map();
  const keys = ["chapter_progress", "last_read"];
  const yaml = `filters:\n  and:\n    - file.hasProperty("chapter_progress")\nviews:\n  - type: table\n    name: all\n    order:\n${["file.name", ...keys].map((k) => `      - ${JSON.stringify(k)}`).join("\n")}\n`;
  const view = (await atlas.query(yaml).catch(() => null))?.views?.[0];
  if (!view) return new Map();
  const at = (key) => view.columns.findIndex((c) => c.key === key || c.id === key || c.id === `note.${key}`);
  const [ci, li] = keys.map(at);
  return new Map(view.rows.map((r) => {
    const last = Date.parse(String(r.edit?.[li] ?? ""));
    return [r.path.split("/").slice(0, -1).join("/"), { read: readOf(r.edit?.[ci]), lastUsed: Number.isFinite(last) ? last : undefined }];
  }));
}

/** How many chapters `chapter_progress` (JSON text: a chapter's page, or "read") marks read. */
function readOf(text) {
  try { return Object.values(JSON.parse(String(text ?? "{}"))).filter((v) => v === "read").length; } catch { return 0; }
}

export function register(atlas) {
  // the library is the Libraries page's Comics tab, the one place series are listed
  atlas.registerCommand({ id: "library", title: "Manga: library", run: () => atlas.openNative?.("manga:library") || atlas.openLibrary("comics") });
  // Suwayomi's own library update, started from here: it runs on the server, new chapters show as unread counts
  atlas.registerCommand({ id: "update", title: "Manga: look for new chapters on Suwayomi", run: async () => {
    const suw = suwayomi(atlas, atlas.plugin.settings?.suwayomi);
    if (!suw.on) return atlas.toast("Manga", "No Suwayomi server set: Settings → Plugins → Manga.", "error");
    try { await suw.updateLibrary(); atlas.toast("Manga", "Suwayomi is looking for new chapters in your library; the Comics page shows them as they come."); }
    catch (e) { atlas.toast("Manga", String(e.message ?? e), "error"); }
  } });
  // Browse: the server's sources, a series found there added to the library (the pane's browse screens; on the
  // phone, the app's own)
  const browse = () => atlas.openNative?.("manga:browse") || atlas.openView(BROWSE, { title: "Browse Suwayomi", icon: "search" });
  atlas.registerCommand({ id: "browse", title: "Manga: browse Suwayomi's sources", run: () => {
    if (!atlas.plugin.settings?.suwayomi) return atlas.toast("Manga", "No Suwayomi server set: Settings → Plugins → Manga.", "error");
    browse();
  } });
  // the Libraries page's Comics: the folder's series and the user's Suwayomi library; a series opens in the pane (on
  // the phone, in the app's own series screen)
  const server = () => atlas.openNative?.("manga:library") || atlas.openView(SERVER, { title: "Suwayomi", icon: "server" });
  atlas.registerCommand({ id: "server", title: "Manga: Suwayomi's library (its own tab)", run: () => {
    if (!atlas.plugin.settings?.suwayomi) return atlas.toast("Manga", "No Suwayomi server set: Settings → Plugins → Manga.", "error");
    server();
  } });
  const openSeries = (item) => atlas.openNative?.(`manga:series/${item.id}`) || atlas.openView(item.id, { title: item.title, icon: "file" });
  atlas.registerLibrary?.({
    id: "comics", title: "Comics", icon: "file", noun: "series",
    async load() {
      const S = atlas.plugin.settings ?? {}, suw = suwayomi(atlas, S.suwayomi);
      const mine = await seriesIn(atlas, String(S.folder || "manga").replace(/^\/+|\/+$/g, ""));
      const theirs = suw.on ? await suw.library().catch(() => []) : [];
      const there = suw.offline ? "Suwayomi (offline: as last seen)" : "Suwayomi";
      const reading = await readingOfAll(atlas);
      /** How far and when, for a vault series (the Continue row, the bar); a Suwayomi series has only its unread count. */
      const place = (s) => {
        const r = s.remote ? null : reading.get(s.path);
        return r ? { progress: s.chapters.length ? Math.min(1, r.read / s.chapters.length) : undefined, lastUsed: r.lastUsed } : {};
      };
      return [...mine.map((s) => ({ s, where: "In the vault" })), ...theirs.map((s) => ({ s, where: there }))].map(({ s, where }) => ({
        id: s.path, title: s.title, sub: s.remote ? (s.unread ? `${s.unread} unread` : "all read") : `${s.chapters.length} chapter${s.chapters.length === 1 ? "" : "s"}`,
        cover: () => (s.remote ? suw.cover(s) : coverOf(atlas, s)).catch(() => null), groups: s.categories?.length ? s.categories.map((c) => `${where}${SEP}${c}`) : [where],
        text: `${s.title} ${where} ${(s.categories ?? []).join(" ")}`, sort: { title: s.title, recent: place(s).lastUsed ?? 0 },
        ...place(s), ...(s.remote ? { from: "Suwayomi" } : {}), // the server's series under "From Suwayomi", apart from the vault's
      }));
    },
    groupsTitle: "From", layouts: ["covers", "list"],
    // the server's library is its own tab (on the phone the app's own Manga screen): only what is yours is listed here
    homes: atlas.plugin.settings?.suwayomi ? [{ from: "Suwayomi", label: "Suwayomi", run: server }] : [],
    sorts: [{ id: "title", label: "title" }, { id: "recent", label: "last read", desc: true }],
    search: "Search the comics…", empty: "No comics yet: a folder per series in the manga folder, or your Suwayomi in the plugin's settings.",
    detail: (item) => ({ kind: "Comic", title: item.title, lines: [{ text: item.sub ?? "" }], actions: [{ label: "Read", icon: "file", primary: true, run: () => openSeries(item) }] }),
    open: openSeries,
  });
}
