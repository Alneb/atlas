// The catalog's blocks (docs/design/DESIGN-collections.md), drawn from the vault's files:
//   catalog.library      a collection's base as shelves, a covers grid or a table, with search, filters and sort
//   catalog.item         the top of a catalogued note: cover, key fields, shelf chips, rating, the services holding it
//   catalog.collections  every collection as a tile, and a box to capture into them (preview first, then add)
// Rows come from Atlas's Bases engine (atlas.query over the collection's .base), so the files stay Obsidian's.

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const linkText = (s) => String(s ?? "").replace(/^\[\[|\]\]$/g, "").split("|").pop();
const human = (s) => { const t = linkText(s).replace(/[-_]+/g, " ").trim(); return t ? t[0].toUpperCase() + t.slice(1) : ""; };
const isUrl = (s) => /^https?:\/\//i.test(String(s ?? ""));
// A block is an app inside the note: a press on its cards, rows or headers is its own, not the editor's (which would
// put the caret there and show the block's source).
const own = (root) => { root.addEventListener("mousedown", (e) => e.stopPropagation()); return root; };

// What a cell says, as text (lists joined, links by their name).
function cellText(c) {
  if (!c) return "";
  switch (c.t) {
    case "text": case "date": return c.value ?? c.text ?? "";
    case "num": return String(c.value);
    case "bool": return c.value ? "yes" : "";
    case "link": return c.text ?? "";
    case "list": return (c.items ?? []).map(cellText).filter(Boolean).join(", ");
    default: return "";
  }
}

// An <img> address for a cover: a vault file through the core's thumbnails, an address as it is.
async function coverUrl(atlas, c) {
  if (!c) return null;
  if (c.t === "link" && c.path) return atlas.thumbUrl(c.path, 360);
  const t = cellText(c).trim();
  if (!t) return null;
  if (isUrl(t)) return t;
  return atlas.thumbUrl(linkText(t), 360);
}

// The services a note's properties point at: any address is a button (shape-based), and known IDs become addresses.
const ID_LINKS = {
  imdb: (v) => `https://www.imdb.com/title/${v}/`,
  letterboxd: (v) => `https://letterboxd.com/film/${v}/`,
  tmdb: (v, p) => `https://www.themoviedb.org/${p.type === "show" ? "tv" : "movie"}/${v}`,
  doi: (v) => `https://doi.org/${v}`,
  arxiv: (v) => `https://arxiv.org/abs/${v}`,
  youtube: (v) => `https://www.youtube.com/watch?v=${v}`,
  musicbrainz: (v, p) => `https://musicbrainz.org/${p.type === "artist" ? "artist" : "release-group"}/${v}`,
  discogs: (v, p) => `https://www.discogs.com/${p.type === "artist" ? "artist" : "master"}/${v}`,
  anilist: (v, p) => `https://anilist.co/${p.type === "anime" ? "anime" : "manga"}/${v}`,
  openlibrary: (v) => `https://openlibrary.org/works/${v}`,
};
const NAMES = { linkwarden: "Linkwarden", jellyfin: "Jellyfin", wikipedia: "Wikipedia", wikidata: "Wikidata", source: "Source", pdf: "PDF", imdb: "IMDb", tmdb: "TMDB", letterboxd: "Letterboxd", doi: "DOI", arxiv: "arXiv", youtube: "YouTube", musicbrainz: "MusicBrainz", discogs: "Discogs", anilist: "AniList", openlibrary: "Open Library", openalex: "OpenAlex" };
function services(props) {
  const out = [];
  const seen = new Set();
  const add = (label, url) => { if (!seen.has(url)) { seen.add(url); out.push({ label, url }); } };
  for (const [k, v] of Object.entries(props)) {
    const vals = Array.isArray(v) ? v : [v];
    for (const x of vals) {
      if (typeof x !== "string" && typeof x !== "number") continue;
      const s = String(x).trim();
      if (isUrl(s)) add(NAMES[k] ?? (() => { try { return new URL(s).hostname.replace(/^www\./, ""); } catch { return k; } })(), s);
      else if (ID_LINKS[k] && s) add(NAMES[k] ?? human(k), ID_LINKS[k](s, props));
    }
  }
  return out;
}

// The kinds the catalog knows (their library look), asked once per page and again when a kind file changes.
let kindsAsk = null;
function kinds(atlas) {
  kindsAsk ??= atlas.helper.call("kinds").then((r) => (r?.kinds ?? []).map((k) => k.kind)).catch((e) => { kindsAsk = null; throw e; });
  return kindsAsk;
}
const titleOf = (k) => k.library?.title ?? String(k.folder).replace(/\/+$/, "").split("/").pop();
const indexOf = (k) => `${String(k.folder).replace(/\/+$/, "")}/${titleOf(k)}.md`;
const kindFor = (list, type) => list.find((k) => (k.type ?? k.name) === type);

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
.cat { font: inherit; color: var(--text); }
/* a press on a card, a header or a field must not put the text caret in the block (the editor would show its source) */
.cat, .cat-item { user-select: none; -webkit-user-select: none; }
.cat input, .cat-capture input { user-select: text; -webkit-user-select: text; }
.cat-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 10px; }
.cat-bar input { flex: 1 1 160px; min-width: 120px; padding: 5px 9px; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); background: var(--bg); color: var(--text); font: inherit; }
.cat-bar .count { color: var(--text-faint); font-size: .85em; margin-left: auto; }
.cat-seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); overflow: hidden; }
.cat-seg button, .cat-chip, .cat-btn { font: inherit; font-size: .85em; border: 0; background: var(--bg-alt); color: var(--text-muted); padding: 4px 9px; cursor: pointer; }
.cat-seg button + button { border-left: 1px solid var(--border); }
.cat-seg button.on, .cat-chip.on { background: var(--accent-soft); color: var(--accent-strong, var(--accent)); }
.cat-chip, .cat-btn { border: 1px solid var(--border); border-radius: 999px; }
.cat-btn { border-radius: var(--radius-sm, 6px); }
.cat-chip:hover, .cat-btn:hover, .cat-seg button:hover { background: var(--bg-hover); color: var(--text); }
.cat-shelf { margin: 0 0 16px; }
.cat-shelf h4 { display: flex; gap: 8px; align-items: baseline; margin: 0 0 6px; font-size: .95em; color: var(--heading, var(--text)); }
.cat-shelf h4 span { color: var(--text-faint); font-weight: normal; font-size: .9em; }
.cat-row { display: grid; grid-auto-flow: column; grid-auto-columns: 128px; gap: 12px; overflow-x: auto; padding: 2px 2px 8px; scroll-snap-type: x proximity; }
.cat-row.drop { outline: 2px dashed var(--accent); outline-offset: 2px; border-radius: var(--radius-sm, 6px); }
.cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 14px 12px; }
.cat-card { display: flex; flex-direction: column; gap: 4px; cursor: pointer; scroll-snap-align: start; min-width: 0; }
.cat-cover { aspect-ratio: 2 / 3; width: 100%; border-radius: var(--radius-sm, 6px); background: var(--bg-alt); border: 1px solid var(--border); object-fit: cover; display: grid; place-items: center; color: var(--text-faint); font-size: 1.6em; overflow: hidden; transition: transform .12s var(--ease, ease), box-shadow .12s; }
.cat-initial { font-size: 2.4em; font-weight: 650; border-color: transparent; }
.cat-card:hover .cat-cover { transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.cat-card b { font-size: .88em; font-weight: 600; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.cat-card small { color: var(--text-faint); font-size: .78em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cat-table { width: 100%; border-collapse: collapse; font-size: calc(13px * var(--ui-scale, 1)); line-height: 1.35; }
.cat-table td.short { white-space: nowrap; width: 1%; }
.cat-table td.long > span { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cat-table th { text-align: left; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border-strong, var(--border)); padding: 4px 8px; cursor: pointer; white-space: nowrap; }
.cat-table td { border-bottom: 1px solid var(--border); padding: 5px 8px; vertical-align: top; }
.cat-table tr:hover td { background: var(--bg-hover); cursor: pointer; }
.cat-menu { position: fixed; z-index: 1000; min-width: 160px; display: flex; flex-direction: column; padding: 4px; background: var(--bg-elev, var(--bg)); border: 1px solid var(--border-strong, var(--border)); border-radius: var(--radius-sm, 6px); box-shadow: var(--shadow-pop); }
.cat-menu small { color: var(--text-faint); padding: 3px 8px; font-size: .78em; }
.cat-menu button { font: inherit; text-align: left; border: 0; background: none; color: var(--text); padding: 5px 8px; border-radius: 4px; cursor: pointer; }
.cat-menu button:hover, .cat-menu button:focus { background: var(--bg-hover); outline: none; }
.cat-empty, .cat-err { color: var(--text-faint); margin: 6px 0; }
.cat-err { color: var(--red); }
.cat-item { display: grid; grid-template-columns: 150px 1fr; gap: 18px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm, 8px); background: var(--bg-alt); }
.cat-item .cat-cover { aspect-ratio: auto; max-height: 230px; }
.cat-item h2 { margin: 0 0 4px; font-size: 1.35em; color: var(--heading, var(--text)); }
.cat-item h2 small { color: var(--text-faint); font-weight: normal; margin-left: 6px; }
.cat-item dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 8px 0; font-size: .9em; }
.cat-item dt { color: var(--text-faint); }
.cat-item dd { margin: 0; }
.cat-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.cat-stars button { border: 0; background: none; padding: 0 1px; font-size: 1.15em; cursor: pointer; color: var(--text-faint); }
.cat-stars button.on { color: var(--accent); }
.cat-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.cat-tile { border: 1px solid var(--border); border-radius: var(--radius-sm, 8px); padding: 10px; background: var(--bg-alt); cursor: pointer; }
.cat-tile:hover { border-color: var(--accent); }
.cat-tile h4 { margin: 0 0 8px; display: flex; justify-content: space-between; }
.cat-tile h4 span { color: var(--text-faint); font-weight: normal; }
.cat-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
.cat-strip .cat-cover { font-size: 1em; }
.cat-capture { display: flex; gap: 6px; margin: 0 0 14px; }
.cat-capture input { flex: 1; padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); background: var(--bg); color: var(--text); font: inherit; }
.cat-preview { border: 1px solid var(--accent); border-radius: var(--radius-sm, 8px); padding: 10px; margin: 0 0 14px; display: grid; grid-template-columns: 90px 1fr; gap: 12px; }
.cat-preview .steps { color: var(--text-faint); font-size: .8em; margin: 6px 0 0; padding-left: 16px; }
@media (max-width: 560px) { .cat-item { grid-template-columns: 1fr; } .cat-item .cat-cover { max-height: 300px; justify-self: center; width: 60%; } .cat-row { grid-auto-columns: 108px; } }
`;
  document.head.append(s);
}

// The properties a cover goes by in notes from anywhere (the catalog's `cover`, an Obsidian film's `poster`…).
const COVER_KEYS = ["cover", "poster", "image", "thumbnail", "artwork"];
const EMBEDDED = /!\[\[([^\]|#]+?\.(?:png|jpe?g|gif|webp|avif|bmp))(?:[|#][^\]]*)?\]\]|!\[[^\]]*\]\((\S+?\.(?:png|jpe?g|gif|webp|avif|bmp)(?:\?\S*)?)\)/i;
// A note's cover when its kind's property is empty: another of the usual properties, else the first picture shown in
// it
async function noteCover(atlas, path) {
  const props = await atlas.noteProps(path).catch(() => ({}));
  for (const k of COVER_KEYS) {
    const v = Array.isArray(props[k]) ? props[k][0] : props[k];
    if (v !== null && v !== undefined && String(v).trim() && String(v) !== "null") return { t: "text", value: String(v) };
  }
  const text = await atlas.readText(path).catch(() => "");
  const m = EMBEDDED.exec(text);
  if (m) return { t: "text", value: m[1] ?? m[2] };
  // only its PDF (a paper, a scanned book): the page draws the PDF's first page
  for (const v of Object.values(props).flat()) if (typeof v === "string" && /\.pdf(\]\])?$/i.test(v.trim())) return { t: "text", value: v.trim() };
  const pdf = /!?\[\[([^\]|#]+?\.pdf)(?:[|#][^\]]*)?\]\]/i.exec(text);
  return pdf ? { t: "text", value: pdf[1] } : null;
}

// A cover: the picture when it loads, else a tile tinted by the title with its initial (no empty frame for the many
// items without a picture, or one that does not load). `path`: the note, asked when `cell` holds nothing.
function coverBox(atlas, cell, title, path) {
  const t = String(title ?? "").trim();
  const box = el("div", "cat-cover cat-initial", t[0]?.toUpperCase() ?? "·");
  const hue = [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  box.style.background = `hsl(${hue} 32% 50% / .22)`;
  box.style.color = `hsl(${hue} 40% 42%)`;
  box.setAttribute("aria-hidden", "true");
  const empty = !cell || !cellText(cell).trim() || cellText(cell).trim() === "null";
  void (empty && path ? noteCover(atlas, path) : Promise.resolve(cell)).then((c) => coverUrl(atlas, c)).then((src) => {
    if (!src) return;
    const img = el("img", "cat-cover");
    img.alt = t;
    // not lazy: it stays out of the page until it loads, and a lazy picture out of the page never loads (the covers
    // stayed initials); the address is a thumbnail already fetched anyway
    img.onload = () => box.replaceWith(img);
    img.src = src;
  }, () => {});
  return box;
}

// ---- catalog.library ----------------------------------------------------------------------------------------------
function libraryBlock(atlas) {
  return (host, block) => {
    style();
    const o = block.options ?? {};
    const basePath = String(o.base ?? "").trim();
    const state = { layout: String(o.layout ?? "grid"), q: "", facet: null, sort: null, desc: false };
    const shelvesOrder = (Array.isArray(o.shelves) ? o.shelves : []).map(String);
    const coverKey = o.cover ? String(o.cover) : null;
    const keyFields = (Array.isArray(o.key) ? o.key : []).map(String);
    const group = o.group ? String(o.group) : null;
    let data = null;
    let gone = false;

    if (!basePath) { host.replaceChildren(el("p", "cat-err", "This library has no base: add `base: Films/Films.base` to its options.")); return; }

    const load = async () => {
      const yaml = await atlas.readText(basePath);
      const r = await atlas.query(yaml, block.note);
      // the view for the layout: Shelves / Covers / Table when the base has them, else its first
      const pick = (name) => r.views.find((v) => v.name === name) ?? r.views[0];
      data = { shelves: pick("Shelves"), covers: pick("Covers"), table: pick("Table") };
    };

    const colIndex = (view, key) => view.columns.findIndex((c) => c.key === key || c.id === key || c.id === `note.${key}`);
    const rowsOf = (view) => {
      const q = state.q.toLowerCase();
      let rows = view.rows.filter((r) => !q || r.cells.some((c) => cellText(c).toLowerCase().includes(q)));
      if (state.facet) rows = rows.filter((r) => linkText(r.group ?? cellText(r.cells[colIndex(view, group)])) === state.facet);
      if (state.sort !== null) {
        const i = state.sort;
        rows = [...rows].sort((a, b) => cellText(a.cells[i]).localeCompare(cellText(b.cells[i]), undefined, { numeric: true }) * (state.desc ? -1 : 1));
      }
      return rows;
    };

    const card = (view, row) => {
      const c = el("div", "cat-card");
      const title = cellText(row.cells[0]) || row.path.split("/").pop().replace(/\.md$/, "");
      const ci = coverKey ? colIndex(view, coverKey) : -1;
      c.append(coverBox(atlas, ci >= 0 ? row.cells[ci] : null, title, row.path), el("b", "", title));
      const sub = keyFields.slice(0, 2).map((k) => { const i = colIndex(view, k); return i >= 0 ? cellText(row.cells[i]) : ""; }).filter(Boolean).join(" · ");
      if (sub) c.append(el("small", "", sub));
      c.title = keyFields.map((k) => { const i = colIndex(view, k); const t = i >= 0 ? cellText(row.cells[i]) : ""; return t ? `${human(k)}: ${t}` : ""; }).filter(Boolean).join("\n");
      c.onclick = () => atlas.open(row.path);
      c.draggable = !!group;
      c.ondragstart = (e) => e.dataTransfer?.setData("text/atlas-catalog", row.path);
      // the same move without dragging: right-click (or the context-menu key) → a shelf
      if (group) c.oncontextmenu = (e) => { e.preventDefault(); shelfMenu(c, row.path); };
      return c;
    };

    const move = (path, name) => atlas.writeProperty(path, group, `[[${name}]]`).then(refresh, (err) => atlas.toast("Not moved", String(err?.message ?? err), "error"));
    const shelfMenu = (anchor, path) => {
      document.querySelector(".cat-menu")?.remove();
      const m = el("div", "cat-menu");
      m.setAttribute("role", "menu");
      m.append(el("small", "", "Move to shelf"));
      for (const s of shelvesOrder) {
        const b = el("button", "", human(s));
        b.setAttribute("role", "menuitem");
        b.onclick = () => { m.remove(); void move(path, s); };
        m.append(b);
      }
      const r = anchor.getBoundingClientRect();
      m.style.left = `${Math.min(r.left + 8, innerWidth - 180)}px`;
      m.style.top = `${Math.min(r.top + 24, innerHeight - 40 - 30 * shelvesOrder.length)}px`;
      document.body.append(m);
      setTimeout(() => document.addEventListener("pointerdown", (e) => { if (!m.contains(e.target)) m.remove(); }, { once: true }));
      m.querySelector("button")?.focus();
    };

    const shelves = (view) => {
      const by = new Map();
      for (const row of rowsOf(view)) {
        const g = linkText(row.group ?? cellText(row.cells[colIndex(view, group)])) || "";
        if (!by.has(g)) by.set(g, []);
        by.get(g).push(row);
      }
      const names = [...shelvesOrder, ...[...by.keys()].filter((g) => !shelvesOrder.includes(g)).sort()];
      const out = el("div");
      for (const name of names) {
        const rows = by.get(name) ?? [];
        // an empty shelf of the kind's own order stays as a place to drop onto; others only when they hold something
        if (!rows.length && !shelvesOrder.includes(name)) continue;
        const sec = el("section", "cat-shelf");
        const h = el("h4", "", name ? human(name) : "No shelf");
        h.append(el("span", "", String(rows.length)));
        const row = el("div", "cat-row");
        rows.forEach((r) => row.append(card(view, r)));
        if (!rows.length) row.append(el("p", "cat-empty", "Drop a cover here."));
        if (group && name) {
          row.ondragover = (e) => { e.preventDefault(); row.classList.add("drop"); };
          row.ondragleave = () => row.classList.remove("drop");
          row.ondrop = (e) => {
            e.preventDefault();
            row.classList.remove("drop");
            const path = e.dataTransfer?.getData("text/atlas-catalog");
            if (path) void move(path, name);
          };
        }
        sec.append(h, row);
        out.append(sec);
      }
      return out;
    };

    const grid = (view) => { const g = el("div", "cat-grid"); rowsOf(view).forEach((r) => g.append(card(view, r))); return g; };

    const table = (view) => {
      const t = el("table", "cat-table");
      const head = el("tr");
      view.columns.forEach((c, i) => {
        const th = el("th", "", c.label + (state.sort === i ? (state.desc ? " ▾" : " ▴") : ""));
        th.onclick = () => { state.desc = state.sort === i ? !state.desc : false; state.sort = i; draw(); };
        head.append(th);
      });
      t.append(el("thead"), el("tbody"));
      t.tHead.append(head);
      for (const r of rowsOf(view)) {
        const tr = el("tr");
        // a short value (a year, a status) keeps one line; a long one (authors, a title) at most two
        r.cells.forEach((c) => { const text = cellText(c); const td = el("td", String(text).length <= 14 ? "short" : "long"); td.append(el("span", "", text)); tr.append(td); });
        tr.onclick = () => atlas.open(r.path);
        t.tBodies[0].append(tr);
      }
      return t;
    };

    const bar = (view) => {
      const b = el("div", "cat-bar");
      const search = el("input");
      search.placeholder = "Search this collection…";
      search.value = state.q;
      search.oninput = () => { state.q = search.value; drawBody(); };
      const seg = el("div", "cat-seg");
      for (const [id, label] of [["shelves", "Shelves"], ["grid", "Covers"], ["table", "Table"]]) {
        if (id === "shelves" && !group) continue;
        const btn = el("button", state.layout === id ? "on" : "", label);
        btn.onclick = () => { state.layout = id; state.sort = null; draw(); };
        seg.append(btn);
      }
      b.append(search, seg);
      // the shelves as filter chips (in the grid and the table)
      if (group && state.layout !== "shelves") {
        const values = [...new Set(view.rows.map((r) => linkText(r.group ?? cellText(r.cells[colIndex(view, group)]))).filter(Boolean))];
        for (const v of [...shelvesOrder.filter((s) => values.includes(s)), ...values.filter((v) => !shelvesOrder.includes(v))]) {
          const chip = el("button", `cat-chip${state.facet === v ? " on" : ""}`, human(v));
          chip.onclick = () => { state.facet = state.facet === v ? null : v; drawBody(); draw(); };
          b.append(chip);
        }
      }
      b.append(el("span", "count", `${view.count} ${view.count === 1 ? "item" : "items"}`));
      return b;
    };

    let body = el("div");
    const viewFor = () => (state.layout === "shelves" ? data.shelves : state.layout === "table" ? data.table : data.covers);
    const drawBody = () => {
      const view = viewFor();
      const next = view.rows.length
        ? state.layout === "shelves" ? shelves(view) : state.layout === "table" ? table(view) : grid(view)
        : el("p", "cat-empty", "Nothing here yet: capture something of this kind and it lands here.");
      body.replaceWith(next);
      body = next;
    };
    const draw = () => {
      if (gone || !data) return;
      const root = own(el("div", "cat"));
      body = el("div");
      root.append(bar(viewFor()), body);
      host.replaceChildren(root);
      drawBody();
    };
    const refresh = () => load().then(draw, (e) => { if (!gone) host.replaceChildren(el("p", "cat-err", `The library could not be read: ${e?.message ?? e}`)); });

    host.replaceChildren(el("p", "cat-empty", "Loading the collection…"));
    void refresh();
    // the collection's folder changed (a capture, an edit, another program): read again, at most every 400 ms
    const folder = basePath.split("/").slice(0, -1).join("/");
    let timer = 0;
    const off = atlas.onFilesChanged((paths) => {
      if (!paths.some((p) => p === basePath || p.startsWith(`${folder}/`))) return;
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 400);
    });
    return () => { gone = true; clearTimeout(timer); off?.(); };
  };
}

// ---- catalog.item -------------------------------------------------------------------------------------------------
function itemBlock(atlas) {
  return (host, block) => {
    style();
    let gone = false;
    const draw = async () => {
      const props = (await block.props()) ?? {};
      const list = await kinds(atlas).catch(() => []);
      const kind = kindFor(list, String(props.type ?? ""));
      const lib = kind?.library ?? {};
      const root = own(el("div", "cat-item"));
      const title = String(props.title ?? block.note.split("/").pop().replace(/\.md$/, ""));
      const cover = lib.cover ? props[lib.cover] : null;
      root.append(coverBox(atlas, cover ? { t: "text", value: String(Array.isArray(cover) ? cover[0] : cover) } : null, title, block.note));

      const main = el("div");
      const h = el("h2", "", title);
      if (props.year) h.append(el("small", "", String(props.year)));
      main.append(h);

      // the shelves, one click each
      if (lib.group && lib.shelves?.length) {
        const now = linkText(props[lib.group]);
        const line = el("div", "cat-line");
        for (const s of lib.shelves) {
          const chip = el("button", `cat-chip${now === s ? " on" : ""}`, human(s));
          chip.onclick = () => void atlas.writeProperty(block.note, lib.group, `[[${s}]]`).then(draw);
          line.append(chip);
        }
        main.append(line);
      }
      // rating: five stars, click the same star again to clear
      const rating = Number(props.rating ?? 0);
      const stars = el("div", "cat-line cat-stars");
      for (let i = 1; i <= 5; i++) {
        const b = el("button", i <= rating ? "on" : "", i <= rating ? "★" : "☆");
        b.title = `${i} / 5`;
        b.onclick = () => void atlas.writeProperty(block.note, "rating", rating === i ? "" : String(i)).then(draw);
        stars.append(b);
      }
      main.append(stars);

      const keys = (lib.key?.length ? lib.key : ["author", "authors", "director", "artists", "journal", "site", "published"]).filter((k) => k !== "year" && k !== "rating" && props[k] !== undefined && props[k] !== null && props[k] !== "");
      if (keys.length) {
        const dl = el("dl");
        for (const k of keys) dl.append(el("dt", "", human(k)), el("dd", "", (Array.isArray(props[k]) ? props[k] : [props[k]]).map(linkText).join(", ")));
        main.append(dl);
      }
      const svc = services(props);
      if (svc.length) {
        const line = el("div", "cat-line");
        for (const s of svc) { const a = el("a", "cat-btn", s.label); a.href = s.url; a.target = "_blank"; a.rel = "noopener"; line.append(a); }
        main.append(line);
      }
      const actions = el("div", "cat-line");
      const refresh = el("button", "cat-btn", "Refresh");
      refresh.title = "Ask the sources again; only the catalog's own properties change, never your text";
      refresh.onclick = async () => {
        refresh.disabled = true;
        refresh.textContent = "Refreshing…";
        try {
          const r = await atlas.helper.call("refresh", { path: block.note }, { timeout: 120 });
          atlas.toast("Refreshed", r?.result?.outcome ? `${title}: ${r.result.outcome}` : title, "success");
        } catch (e) { atlas.toast("Not refreshed", String(e?.message ?? e), "error"); }
        if (!gone) void draw();
      };
      actions.append(refresh);
      if (kind) { const open = el("button", "cat-btn", `Open ${titleOf(kind)}`); open.onclick = () => atlas.open(indexOf(kind)); actions.append(open); }
      main.append(actions);
      root.append(main);
      if (!gone) host.replaceChildren(root);
    };
    void draw().catch((e) => { if (!gone) host.replaceChildren(el("p", "cat-err", String(e?.message ?? e))); });
    return () => { gone = true; };
  };
}

// ---- catalog.collections ------------------------------------------------------------------------------------------
function collectionsBlock(atlas) {
  return (host, block) => {
    style();
    let gone = false;
    const root = own(el("div", "cat"));
    const capture = el("form", "cat-capture");
    const input = el("input");
    input.placeholder = "Paste a link, a DOI, an arXiv id, an ISBN… to file it in its collection";
    const go = el("button", "cat-btn", "Look up");
    go.type = "submit";
    capture.append(input, go);
    const preview = el("div");
    const tiles = el("div", "cat-tiles");
    root.append(capture, preview, tiles);
    host.replaceChildren(root);

    // words several things match: the card lists them, and the one picked is looked up and added by its IDs
    const choices = (text, p) => {
      const list = el("div", "cat-line");
      list.append(el("small", "cat-empty", p.searched ? "Several things match — which one?" : "Or is it:"));
      for (const c of [p.candidate, ...(p.others ?? [])]) {
        const chosen = c === p.candidate;
        const b = el("button", `cat-chip${chosen ? " on" : ""}`, c.label ?? `${human(c.kind)} ${Object.values(c.ids ?? {}).join(" ")}`);
        b.onclick = () => { if (!chosen) void look(text, { kind: c.kind, ids: c.ids }); };
        list.append(b);
      }
      return list;
    };

    const look = async (text, pick = {}) => {
      preview.replaceChildren(el("p", "cat-empty", "Recognising and asking the sources…"));
      try {
        const r = await atlas.helper.call("preview", { text, ...pick }, { timeout: 120 });
        const p = r.result ?? r;
        const f = p.merged?.fields ?? {};
        const card = el("div", "cat-preview");
        card.append(coverBox(atlas, f.cover || f.poster ? { t: "text", value: String(f.cover || f.poster) } : null, f.title));
        const info = el("div");
        info.append(el("b", "", `${p.exists ? "Already in" : "Add to"} ${p.label}: ${f.title ?? text}`), el("div", "cat-empty", p.path));
        const add = el("button", "cat-btn", p.exists ? "Open" : "Add");
        add.onclick = async () => {
          if (p.exists) return atlas.open(p.path);
          add.disabled = true;
          try {
            const done = await atlas.helper.call("add", { text, kind: p.candidate?.kind, ids: p.searched ? p.candidate?.ids : undefined }, { timeout: 120 });
            atlas.open(done.result?.path ?? p.path);
            preview.replaceChildren();
            input.value = "";
            void tilesDraw();
          } catch (err) { atlas.toast("Not added", String(err?.message ?? err), "error"); add.disabled = false; }
        };
        const steps = el("ul", "steps");
        (r.steps ?? []).slice(-6).forEach((s) => steps.append(el("li", "", s.explanation ?? String(s))));
        const actions = el("div", "cat-line");
        actions.append(add);
        info.append(actions);
        if (p.others?.length) info.append(choices(text, p));
        info.append(steps);
        card.append(info);
        preview.replaceChildren(card);
      } catch (err) { preview.replaceChildren(el("p", "cat-err", String(err?.message ?? err))); }
    };

    capture.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) void look(text);
    };

    const tilesDraw = async () => {
      let list;
      try { list = await kinds(atlas); } catch (e) { tiles.replaceChildren(el("p", "cat-err", `The catalog is not running: ${e?.message ?? e}`)); return; }
      const made = [];
      for (const k of list) {
        const folder = String(k.folder).replace(/\/+$/, "");
        const cover = k.library?.cover;
        const yaml = `filters:\n  and:\n    - file.inFolder(${JSON.stringify(folder)})\n    - type == ${JSON.stringify(k.type ?? k.name)}\nviews:\n  - type: table\n    name: Latest\n    order: [file.name${cover ? `, ${cover}` : ""}]\n    sort:\n      - property: file.ctime\n        direction: DESC\n    limit: 5\n`;
        const r = await atlas.query(yaml, block.note).catch(() => null);
        const view = r?.views?.[0];
        if (!view?.count) continue;
        const tile = el("div", "cat-tile");
        const h = el("h4", "", titleOf(k));
        h.append(el("span", "", String(view.count)));
        const strip = el("div", "cat-strip");
        view.rows.forEach((row) => strip.append(coverBox(atlas, cover ? row.cells[1] : null, cellText(row.cells[0]), row.path)));
        tile.append(h, strip);
        tile.onclick = () => atlas.open(indexOf(k));
        made.push(tile);
      }
      if (!gone) tiles.replaceChildren(...(made.length ? made : [el("p", "cat-empty", "No collections yet: capture something above.")]));
    };
    void tilesDraw();
    return () => { gone = true; };
  };
}

// ---- catalog.app: the Library app --------------------------------------------------------------------------------
// One app over every kind the catalog knows (DESIGN-library-app.md),
// drawn by Atlas's library page, the one References is (atlas.mountLibrary; docs/refactor/REFACTOR-libraries.md).
// Nothing about a kind is written here: its tab, cover, key fields and shelves come from its kind file.

/** A kind's property under the vault's own name (`rename: { cover: poster }`). */
const vaultName = (k, p) => k.rename?.[p] ?? p;
/** Every property a kind's library shows, by the vault's names: title, cover, key fields, shelves, its properties. */
const propsOf = (k) => [...new Set(["title", k.library?.cover, ...(k.library?.key ?? []), k.library?.group, ...(k.properties ?? [])].filter(Boolean).map((p) => vaultName(k, p)))];
const typeOf = (k) => String(k.type ?? k.name).toLowerCase();
const kindTitle = (k) => k.library?.title ?? k.label ?? human(k.name);

// Which library a kind is a tab of: its kind file's `library.in` ("Music"), else where the catalog's own kinds go (a
// vault's kind files were copied before `in` existed), else a library of its own. Papers are References' (the
// user, 2026-10-21: "libraries should be well separated … each library can have its tabs like refs which has papers
// books etc"; "in phd keep the references the main one").
const IN = {
  movie: "Films & Series", show: "Films & Series", series: "Films & Series",
  album: "Music", artist: "Music", song: "Music",
  anime: "Anime & Manga", manga: "Anime & Manga",
  book: "Books", science_book: "Books", audiobook: "Books",
  video: "Videos", article: "Web pages", webpage: "Web pages", clip: "Web pages",
  paper: "References",
};
const libraryOf = (k) => k.library?.in ?? IN[k.name] ?? kindTitle(k);
const slug = (t) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** The properties whose values are an item's filters beside its shelf (names, as the side's tags). */
const FACETS = ["genres", "topics", "tags"];
/** What a row's badges and sorts read beside a kind's own properties (absent ones are blank). */
const EXTRA = ["year", "rating", "liked"];
const names = (c) => (c?.t === "list" ? c.items ?? [] : c ? [c] : []).map((x) => linkText(cellText(x)).replace(/^#/, "").trim()).filter((x) => x && x !== "null");

/** The library of the catalog's kinds whose `libraryOf` is `title`; every kind when `title` is null (the Library
 *  app block). Each kind with notes is a tab; genres, topics and tags are the filters beside the shelves. */
function librarySource(atlas, title = null) {
  let data = null; // { at, kinds: [{ k, rows }] }, from the last load
  const found = new Map(); // a note's path → { k, row }
  const value = (row, prop) => { const i = data.at(prop); return i >= 0 ? row.cells[i] : null; };
  const titleOfRow = (row) => cellText(value(row, "title")) || row.path.split("/").pop().replace(/\.md$/, "");
  const mine = (k) => title === null || libraryOf(k) === title;
  // the kind's cover property, else the usual ones or the note's first picture (noteCover)
  const coverOf = (k, row) => async () => {
    const cell = k.library?.cover ? value(row, vaultName(k, k.library.cover)) : null;
    const set = cell && cellText(cell).trim() && cellText(cell).trim() !== "null";
    const c = set ? cell : await noteCover(atlas, row.path);
    if (!c) return null;
    return c.t === "link" && c.path ? c.path : cellText(c).trim() || null;
  };
  const first = (title ?? "Library").split(/\s*&\s*/)[0];
  return {
    id: title === null ? "catalog" : `catalog.${slug(title)}`, title: title ?? "Library", icon: "library", noun: "items",
    // one query for every note with a type; each kind takes the notes of its type (a kind's `type`, else its name)
    async load() {
      const list = (await kinds(atlas)).filter(mine);
      const props = [...new Set(["type", ...FACETS, ...EXTRA, ...list.flatMap(propsOf)])];
      const yaml = `filters:\n  and:\n    - file.hasProperty("type")\nviews:\n  - type: table\n    name: all\n    order:\n${["file.name", "file.ctime", ...props].map((p) => `      - ${JSON.stringify(p)}`).join("\n")}\n`;
      const view = (await atlas.query(yaml)).views[0];
      const at = (key) => view.columns.findIndex((c) => c.key === key || c.id === key || c.id === `note.${key}`);
      const byType = new Map();
      for (const row of view.rows) {
        const t = linkText(cellText(row.cells[at("type")])).toLowerCase();
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t).push(row);
      }
      data = { at, kinds: list.map((k) => ({ k, rows: byType.get(typeOf(k)) ?? [] })) };
      found.clear();
      const items = [];
      for (const { k, rows } of data.kinds) {
        const g = k.library?.group;
        for (const row of rows) {
          found.set(row.path, { k, row });
          const shelf = g ? linkText(cellText(value(row, vaultName(k, g)))) : "";
          const tags = [...new Set(FACETS.flatMap((f) => names(value(row, vaultName(k, f)))))];
          const rating = Number(cellText(value(row, vaultName(k, "rating"))));
          const liked = /^(true|yes)$/i.test(cellText(value(row, "liked")));
          items.push({
            id: row.path, note: row.path, title: titleOfRow(row),
            // as References shows PDF / notes: what is known of it at a glance
            flags: [...(rating > 0 ? [{ label: `★ ${rating}` }] : []), ...(liked ? [{ label: "♥", tone: "red" }] : [])],
            sub: (k.library?.key ?? []).map((p) => cellText(value(row, vaultName(k, p)))).filter(Boolean).join(" · "),
            cover: coverOf(k, row), tab: k.name, groups: shelf ? [human(shelf)] : [], tags,
            text: [row.path, ...tags, ...propsOf(k).map((p) => cellText(value(row, p)))].join(" "),
            sort: { title: titleOfRow(row), added: cellText(value(row, "file.ctime")), year: Number(cellText(value(row, vaultName(k, "year")))) || 0, rating: rating || 0 },
          });
        }
      }
      return items;
    },
    // its kinds with notes, the biggest first (an empty kind is no filter; adding by a link finds its kind itself)
    tabs: () => (data?.kinds ?? []).filter((x) => x.rows.length).sort((a, b) => b.rows.length - a.rows.length || kindTitle(a.k).localeCompare(kindTitle(b.k))).map((x) => ({ id: x.k.name, title: kindTitle(x.k) })),
    groupsTitle: "Shelves",
    layouts: ["covers", "list"],
    sorts: [{ id: "added", label: "date added", desc: true }, { id: "title", label: "title" }, { id: "year", label: "year", desc: true }, { id: "rating", label: "rating", desc: true }],
    search: `Search ${title ? title.toLowerCase() : "the library"}…`,
    empty: `Nothing here yet: add a link above, or capture one — the catalog files it in its kind's folder.`,
    async detail(item) {
      const { k, row } = found.get(item.id);
      // the services it is in, from all its properties (the note's own, not only the shown ones)
      const props = await atlas.noteProps(item.id).catch(() => ({}));
      const cover = vaultName(k, k.library?.cover ?? "");
      const g = k.library?.group;
      const now = g ? linkText(props[vaultName(k, g)]) : "";
      // what it is about: the note's text after its blocks (the kind's `body`, a film's description)
      const about = await atlas.readText(item.id).then(plainAbout, () => "");
      const name = item.id.split("/").pop().replace(/\.md$/, "");
      // the fields Edit offers: the kind's own, as the note names them
      // (single values only: a list of links — genres, cast — is edited in the note, where its links stay links)
      const editable = ["title", ...propsOf(k).filter((p) => p !== "title" && p !== cover)].filter((p) => !Array.isArray(props[p]) && !/^\[\[/.test(String(props[p] ?? "")));
      // the services it is in; a picture's address (its poster) is no place to go, the named services first
      const links = services(props).filter((l) => !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(l.url)).sort((a, b) => Number(a.label.includes(".")) - Number(b.label.includes(".")));
      return {
        kind: kindTitle(k), title: item.title,
        lines: (k.library?.key ?? []).map((p) => cellText(value(row, vaultName(k, p)))).filter(Boolean).length ? [{ text: item.sub ?? "" }] : [],
        fields: propsOf(k).filter((p) => p !== "title" && p !== cover && !(k.library?.key ?? []).map((x) => vaultName(k, x)).includes(p)).map((p) => [human(p), cellText(value(row, p))]).filter(([, v]) => v),
        actions: [
          { label: "Open note", icon: "edit", primary: true, run: () => atlas.open(item.id) },
          ...links.slice(0, 1).map((l) => ({ label: `Open on ${l.label}`, icon: "link", run: () => window.open(l.url, "_blank", "noopener") })),
          { label: "Copy link", icon: "copy", title: `[[${name}]]: to link it from a note`, run: () => navigator.clipboard.writeText(`[[${name}]]`).then(() => atlas.toast("Copied", `[[${name}]]`)) },
          { label: "Update", icon: "refresh", title: "Fetch its details again from the services it is in (your own text is kept)", run: () => atlas.helper.call("refresh", { path: item.id }, { timeout: 120 }) },
          // as References' Edit: its fields in place, each written to the note's property
          { label: "Edit", edit: { fields: editable.map((p) => ({ key: p, label: human(p), value: fieldText(props[p]), half: editable.length > 3 })), save: async (v) => { for (const p of editable) if (v[p] !== fieldText(props[p])) await atlas.writeProperty(item.id, p, v[p]); } } },
          ...(atlas.trash ? [{ label: "Delete…", danger: true, confirm: { title: `Move ${item.title} to the Trash?`, hint: "Its note goes to .atlas/trash/, where it can be taken back.", button: "Delete" }, run: () => atlas.trash(item.id) }] : []),
        ],
        links: links,
        // its shelf, changed in place (the kind's `group` property, as a link like the catalog writes it)
        choice: g && (k.library?.shelves ?? []).length
          ? { label: "Shelf", options: k.library.shelves.map((sh) => ({ label: human(sh), on: sh === now, run: () => atlas.writeProperty(item.id, vaultName(k, g), `[[${sh}]]`) })) }
          : undefined,
        body: about ? { title: "About", text: about.length > 1200 ? `${about.slice(0, 1200)}…` : about } : undefined,
      };
    },
    add: {
      placeholder: `Add ${first === "Library" ? "a" : `to ${first.toLowerCase()}:`} link, ISBN or title`, busy: "Adding…",
      async run(text) {
        const done = await atlas.helper.call("add", { text }, { timeout: 120 });
        if (!done.result?.path) throw new Error("nothing was recognised in it");
        atlas.toast("Added", done.result.path, "success");
        return done.result.path;
      },
    },
    watch: (reload) => atlas.onFilesChanged((paths) => {
      if (paths.some((p) => p.startsWith(".atlas/kinds/"))) kindsAsk = null;
      if (paths.some((p) => p.endsWith(".md") || p.startsWith(".atlas/kinds/"))) reload();
    }),
    open: (item) => atlas.open(item.id),
  };
}

/** A property's value as one line to edit (a list joined by commas, a link by its words). */
const fieldText = (v) => (Array.isArray(v) ? v.map((x) => linkText(String(x))).join(", ") : v == null ? "" : linkText(String(v)));

/** What a note is about, as plain text: its text without frontmatter, blocks, embeds and headings, links by their
 *  words (a film's description, an album's own lines). */
function plainAbout(text) {
  return text.replace(/^---[\s\S]*?\n---\n?/, "").replace(/```[\s\S]*?```/g, "").replace(/!\[\[[^\]]*\]\]/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .split("\n").filter((l) => !/^\s*(#|>|\||%%)/.test(l)).join("\n")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}

/** One library per group of kinds (`libraryOf`), registered as the kinds are known and again when a kind file
 *  changes; References' kinds (papers) are left to References. */
function registerLibraries(atlas) {
  let gone = [];
  const make = () => kinds(atlas).then((list) => {
    gone.forEach((f) => f());
    const titles = [...new Set(list.map(libraryOf))].filter((t) => t !== "References");
    gone = titles.map((t) => atlas.registerLibrary({ ...librarySource(atlas, t), icon: list.find((k) => libraryOf(k) === t)?.library?.icon ?? "library" }));
  }, () => {});
  void make();
  atlas.onFilesChanged((paths) => { if (paths.some((p) => p.startsWith(".atlas/kinds/"))) { kindsAsk = null; void make(); } });
}

function appBlock(atlas) {
  return (host) => {
    if (!atlas.mountLibrary) { host.replaceChildren(el("p", "cat-err", "The Library needs a newer Atlas (its library page).")); return; }
    return atlas.mountLibrary(own(host), librarySource(atlas));
  };
}

export function register(atlas) {
  atlas.registerBlock("catalog.library", libraryBlock(atlas), {
    title: "Catalog: a collection",
    options: [
      { key: "base", label: "Base file", kind: "text" },
      { key: "layout", label: "Layout", kind: "choice", choices: ["shelves", "grid", "table"] },
      { key: "group", label: "Shelves from", kind: "text" },
      { key: "cover", label: "Cover property", kind: "text" },
    ],
  });
  atlas.registerBlock("catalog.item", itemBlock(atlas), { title: "Catalog: this item" });
  atlas.registerBlock("catalog.collections", collectionsBlock(atlas), { title: "Catalog: all collections" });
  atlas.registerBlock("catalog.app", appBlock(atlas), { title: "Catalog: the Library app (every kind)" });
  // the vault's libraries: a tab of Atlas's Libraries page (the phone's Library) per group of kinds
  if (atlas.registerLibrary) registerLibraries(atlas);
  // from anywhere: a link, DOI, arXiv id or ISBN into its library (what Clip's "Clip a web page…" did, for every kind)
  atlas.registerCommand({
    id: "add", title: "Add to the catalog…",
    run: () => atlas.pick({
      placeholder: "A link, DOI, arXiv id or ISBN…", tag: "Catalog", icon: "library", items: [], typed: (t) => `Add ${t}`,
      onpick: async (text) => {
        if (!text?.trim()) return;
        try {
          const done = await atlas.helper.call("add", { text: text.trim() }, { timeout: 120 });
          if (done.result?.path) { atlas.open(done.result.path); atlas.toast("Added", done.result.path, "success"); }
          else atlas.toast("Not added", "nothing was recognised in it", "error");
        } catch (err) { atlas.toast("Not added", String(err?.message ?? err), "error"); }
      },
    }),
  });
}
