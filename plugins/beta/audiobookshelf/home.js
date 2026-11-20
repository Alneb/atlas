// The pane's home (opened with no book): the server's own shelves for you, per library — Continue listening, Recently
// added, Continue series, Discover, Listen again, Newest episodes (`/api/libraries/<id>/personalized`) — then your
// collections and playlists, your listening (the server's stats), and the server's own search over every library. A card opens its book in the player, a
// podcast in its episodes; a series, a collection or a playlist opens as a sheet of its cards here.
import { cardOf, collectionsOf, hitsOf, playlistsOf, progressMap, shelvesOf, statsOf } from "./shelf.js";
import { clock } from "./abs.js";
import { el, rowEl, cardEl, notLoaded } from "./cards.js";

export function home(root, atlas, a) {
  root.className = "abs-home";
  const bar = el("div", "abs-home-bar"), search = el("input", "abs-search"), libBtn = el("button", "atlas-btn", "Library");
  Object.assign(search, { type: "search", placeholder: "Search Audiobookshelf…" });
  search.setAttribute("aria-label", "Search Audiobookshelf");
  libBtn.title = "Every audiobook, on the Libraries page";
  libBtn.onclick = () => atlas.openLibrary("audiobooks");
  bar.append(search, libBtn);
  const status = el("div", "abs-status"), body = el("div", "abs-home-body"), extra = el("div", "abs-home-extra");
  root.append(bar, status, body, extra);

  const cover = (id) => a.cover(id);
  let progress = new Map();
  /** A card's click: a book or an episode in the player, a podcast in its episodes, a group as a sheet here. */
  const open = (c) => {
    if (c.cards) return sheet(c);
    atlas.openView(c.open, { title: c.title, icon: "headphones" });
  };

  // ---- the shelves ----
  let shelves = [];
  async function load() {
    status.textContent = "Loading the shelves…";
    try {
      const [libs, me] = await Promise.all([a.libraries(), a.me().catch(() => ({}))]);
      progress = progressMap(me);
      shelves = await Promise.all(libs.map(async (l) => {
        const [pers, cols, lists] = await Promise.all([a.personalized(l.id).catch(() => []), a.collections(l.id).catch(() => ({})), a.playlists(l.id).catch(() => ({}))]);
        return { lib: l, rows: shelvesOf(pers, progress), collections: collectionsOf(cols, progress), playlists: playlistsOf(lists, progress) };
      }));
      status.textContent = shelves.some((s) => s.rows.length) ? "" : "Nothing on the shelves yet.";
      if (!search.value.trim()) draw();
    } catch (e) { notLoaded(status, atlas, e, load); }
  }
  function draw() {
    const many = shelves.length > 1;
    body.replaceChildren(...shelves.flatMap(({ lib, rows, collections, playlists }) => [
      ...(many && (rows.length || collections.length || playlists.length) ? [el("h2", "abs-lib-title", lib.name ?? "")] : []),
      ...rows.map((r) => rowEl(r.label, r.cards, cover, open)),
      ...(collections.length ? [rowEl("Collections", collections, cover, open)] : []),
      ...(playlists.length ? [rowEl("Playlists", playlists, cover, open)] : []),
    ]));
  }
  /** A series, a collection or a playlist: its cards, with the way back. */
  function sheet(g, back = () => (search.value.trim() ? void find() : draw())) {
    const head = el("div", "abs-sheet-head"), b = el("button", "atlas-btn", "‹ Back"), grid = el("div", "abs-grid");
    b.onclick = back;
    head.append(b, el("h3", "", g.title));
    grid.append(...g.cards.map((c) => cardEl(c, cover, open)));
    body.replaceChildren(head, grid);
  }

  // ---- your listening: the server's own stats (every app's sessions counted), drawn under the shelves ----
  async function listening() {
    const st = statsOf(await a.stats().catch(() => null));
    if (!st.total) { extra.replaceChildren(); return; }
    const sec = el("section", "abs-row abs-stats"), tiles = el("div", "abs-stat-tiles"), days = el("div", "abs-days");
    const tile = (v, label) => { const t = el("div", "abs-stat"); t.append(el("b", "", v), el("span", "", label)); return t; };
    tiles.append(tile(clock(st.today, true), "today"), tile(clock(st.weekTotal, true), "these 7 days"), tile(clock(st.total, true), "in all"));
    const most = Math.max(1, ...st.week.map((d) => d.seconds));
    days.setAttribute("role", "img");
    days.setAttribute("aria-label", `Listening in the last 7 days: ${st.week.map((d) => clock(d.seconds, true)).join(", ")}`);
    for (const d of st.week) {
      const col = el("div", "abs-day"), barEl = el("div");
      barEl.style.height = `${Math.round((d.seconds / most) * 100)}%`;
      col.title = `${d.day}: ${clock(d.seconds, true)}`;
      col.append(barEl, el("span", "", new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })));
      days.append(col);
    }
    const top = el("ol", "abs-top");
    top.append(...st.top.map((x) => { const li = el("li"); li.append(el("span", "", x.title), el("span", "abs-dim", clock(x.seconds, true))); return li; }));
    sec.append(el("h3", "abs-row-title", "Your listening"), tiles, days, ...(st.top.length ? [el("h3", "abs-row-title", "Listened to most"), top] : []));
    extra.replaceChildren(sec);
  }

  // ---- the server's search, every library at once (after a pause in typing) ----
  let asked = 0, wait = 0;
  async function find() {
    const q = search.value.trim(), mine = ++asked;
    extra.hidden = !!q; // the hits alone while searching
    if (!q) { status.textContent = ""; draw(); return; }
    status.textContent = "Searching…";
    try {
      const libs = await a.libraries();
      const all = await Promise.all(libs.map((l) => a.search(l.id, q).then((r) => hitsOf(r, progress)).catch(() => ({ cards: [], groups: [], authors: [] }))));
      if (mine !== asked) return; // a later search is on its way
      const cards = all.flatMap((h) => h.cards), groups = all.flatMap((h) => h.groups), authors = all.flatMap((h) => h.authors);
      const parts = [];
      if (cards.length) parts.push(rowEl("Books and podcasts", cards, cover, open));
      if (groups.length) parts.push(rowEl("Series", groups, cover, open));
      if (authors.length) {
        const sec = el("section", "abs-row"), list = el("div", "abs-authors");
        for (const au of authors) {
          const b = el("button", "abs-mini", au.books ? `${au.name} · ${au.books}` : au.name);
          b.onclick = async () => {
            const r = await a.author(au.id).catch(() => null);
            sheet({ kind: "collection", id: au.id, title: au.name, cards: (r?.libraryItems ?? []).map((it) => cardOf(it, progress)) });
          };
          list.append(b);
        }
        sec.append(el("h3", "abs-row-title", "Authors"), list);
        parts.push(sec);
      }
      body.replaceChildren(...parts);
      status.textContent = parts.length ? "" : `Nothing found for “${q}”.`;
    } catch (e) { if (mine === asked) status.textContent = `Not searched: ${e.message ?? e}`; }
  }
  search.oninput = () => { clearTimeout(wait); wait = setTimeout(() => void find(), 300); };
  search.onkeydown = (e) => { if (e.key === "Enter") { clearTimeout(wait); void find(); } };

  void load();
  void listening();
  return { extra, reload: () => Promise.all([load(), listening()]), dispose: () => clearTimeout(wait) };
}
