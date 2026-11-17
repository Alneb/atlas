// Jellyfin's page side: the Libraries page's "Films and series" (what you watched or started; the rest in the server's
// own tab, view.js), a film played by the app's player (mpv on the desktop, its own window; the stream through
// `atlas.media`), its note opened beside it for the notes while watching; the sign-in by Quick Connect; and the block
// `jellyfin.watched`. The reports of where you are go to the helper (`[media] progress`). The client is client.js; the
// logic without a page is jf.js (jf.test.mjs).
import { clientHeader } from "./jf.js";
import { chooseEpisode, el, jellyfin, noteOf, watch, yours } from "./client.js";
import { SERVER } from "./view.js";

/** Jellyfin's Quick Connect: a code shown here, approved in Jellyfin (its app or web: the user menu → Quick Connect),
 *  answered with a token kept as the plugin's secret — no password typed into Atlas. */
async function signIn(atlas) {
  const j = jellyfin(atlas);
  if (!j.on) throw new Error("set the Jellyfin address first (Settings → Plugins → Jellyfin)");
  const headers = { Authorization: clientHeader(String(atlas.plugin.settings?.device ?? "atlas"), atlas.plugin.version ?? "0"), accept: "application/json" };
  const ask = async (path, init = {}) => {
    const r = await atlas.fetch(j.base + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Quick Connect is off on this server (Dashboard → General → Quick Connect), or paste an API key in Settings" : `Jellyfin answered ${r.status}`);
    return r.json();
  };
  const started = await ask("/QuickConnect/Initiate", { method: "POST" });
  atlas.toast?.(`Jellyfin code: ${started.Code}`, "In Jellyfin: your user menu → Quick Connect → enter this code. Waiting up to 5 minutes.");
  for (let i = 0; i < 100; i++) {
    await new Promise((ok) => setTimeout(ok, 3000));
    const st = await ask(`/QuickConnect/Connect?secret=${encodeURIComponent(started.Secret)}`);
    if (!st.Authenticated) continue;
    const done = await ask("/Users/AuthenticateWithQuickConnect", { method: "POST", body: { Secret: started.Secret }, headers: { "content-type": "application/json" } });
    if (!done.AccessToken) throw new Error("Jellyfin gave no token");
    await atlas.secrets.set("token", done.AccessToken);
    return true;
  }
  throw new Error("the code was not approved in 5 minutes");
}

export function register(atlas) {
  // the server's own tab: every film and series on it, yours or not (the library lists only what you watched)
  const server = () => atlas.openView(SERVER, { title: "Jellyfin", icon: "film" });
  atlas.registerCommand({ id: "library", title: "Jellyfin: films and series", run: () => atlas.openLibrary("jellyfin") });
  atlas.registerCommand({ id: "server", title: "Jellyfin: the server's films and series", run: server });
  atlas.registerCommand({
    id: "signin", title: "Jellyfin: sign in",
    run: async () => {
      try { if (await signIn(atlas)) atlas.toast?.("Signed in to Jellyfin", "Its token is kept with the plugin's secrets."); }
      catch (e) { atlas.toast?.("Not signed in to Jellyfin", String(e?.message ?? e), "error"); }
    },
  });
  atlas.registerLibrary?.({
    id: "jellyfin", title: "Films and series", icon: "film", noun: "films and series",
    async load() {
      const j = jellyfin(atlas);
      if (!j.on) return [];
      return (await j.all()).map((r) => ({
        id: r.id, title: r.title, sub: [r.year, r.type === "Series" ? (r.unplayed ? `${r.unplayed} to watch` : "series") : r.length ? `${Math.round(r.length / 60)} min` : ""].filter(Boolean).join(" · "),
        cover: () => j.cover(r.id).catch(() => null),
        flags: r.played ? [{ label: "watched" }] : [],
        groups: r.genres.slice(0, 2), tags: [r.type === "Series" ? "series" : "film", ...(r.played ? ["watched"] : r.progress ? ["watching"] : [])],
        text: [r.title, r.year, r.genres.join(" "), r.overview].join(" "),
        sort: { title: r.title, recent: r.lastPlayed, year: r.year ?? 0 }, row: r,
        progress: r.progress, lastUsed: r.lastPlayed || undefined,
        // yours once watched or started; the rest stays in the server's own tab (DESIGN-server-libraries.md)
        ...(yours(r) ? {} : { from: "Jellyfin" }),
      }));
    },
    groupsTitle: "Genres", layouts: ["covers", "list"],
    homes: [{ from: "Jellyfin", label: "Jellyfin", run: server }],
    sorts: [{ id: "recent", label: "last watched", desc: true }, { id: "title", label: "title" }, { id: "year", label: "year", desc: true }],
    search: "Search the films and series…",
    empty: "Nothing watched yet: your Jellyfin's address in Settings → Plugins → Jellyfin, then the command “Jellyfin: sign in”.",
    detail: (item) => ({
      kind: item.row.type === "Series" ? "Series" : "Film", title: item.title,
      lines: [{ text: item.sub ?? "" }, ...(item.row.overview ? [{ text: item.row.overview, muted: true }] : [])],
      actions: [
        { label: item.row.type === "Series" ? "Next episode" : item.progress && item.progress < 1 ? "Go on watching" : "Watch", icon: "film", primary: true, run: () => watch(atlas, item.row) },
        ...(item.row.type === "Series" ? [{ label: "Episodes…", run: () => chooseEpisode(atlas, item.row) }] : []),
        { label: "Its note", run: async () => { const p = await noteOf(atlas, item.row, jellyfin(atlas).base, "asked"); if (p) atlas.open(p); } },
      ],
    }),
    open: (item) => watch(atlas, item.row),
  });

  atlas.registerBlock("jellyfin.watched", (host, block) => {
    const j = jellyfin(atlas);
    if (!j.on) { host.textContent = "Set the Jellyfin address in Settings → Plugins → Jellyfin, then “Jellyfin: sign in”."; return; }
    let gone = false;
    void (async () => {
      try {
        const q = `Filters=IsPlayed&SortBy=DatePlayed&SortOrder=Descending&Recursive=true&IncludeItemTypes=Movie,Episode&Fields=UserData&Limit=${Number(block.options.limit ?? 10)}`;
        const items = (await j.call(`/Users/${await j.user()}/Items?${q}`)).Items ?? [];
        if (gone) return;
        const list = el("ul", "list-style: none; margin: 0; padding: 4px 0");
        for (const it of items) {
          const name = it.Type === "Episode" ? `${it.SeriesName ?? ""} — ${it.Name}` : it.Name;
          const li = el("li", "display: flex; gap: 10px; padding: 2px 0");
          li.append(el("span", "flex: 1; color: var(--text)", name), el("span", "color: var(--text-faint); font-variant-numeric: tabular-nums", String(it.UserData?.LastPlayedDate ?? "").slice(0, 10)));
          list.append(li);
        }
        host.replaceChildren(items.length ? list : el("p", "color: var(--text-faint)", "Nothing watched yet."));
      } catch (e) {
        if (!gone) host.replaceChildren(el("p", "color: var(--red)", String(e.message ?? e)));
      }
    })();
    return () => { gone = true; };
  }, { title: "Jellyfin: watched", options: [{ key: "limit", label: "At most", kind: "number" }] });
}
