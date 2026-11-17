// Jellyfin's own tab: every film and series on the server, yours or not — the Libraries page lists only what you watched
// or started (DESIGN-server-libraries.md, "Revised (3)"); its header button opens this. Continue first, then the covers
// by kind and a filter; a film plays at a click (with its note beside it), a series asks which episode.
import { chooseEpisode, el, jellyfin, watch, yours } from "./client.js";

/** What the pane is opened on (main.js's `server`). */
export const SERVER = "jellyfin:server";

export default function mount(host, atlas) {
  const j = jellyfin(atlas);
  const root = el("div");
  root.className = "jf";
  const style = el("style");
  style.textContent = CSS;
  host.append(style, root);
  let gone = false;

  const head = el("div"), tabs = el("div"), filter = el("input"), mine = el("button"), body = el("div");
  head.className = "jf-bar"; tabs.className = "jf-tabs"; body.className = "jf-body";
  filter.className = "atlas-input jf-filter"; filter.placeholder = "Filter the films and series…";
  mine.className = "atlas-btn"; mine.textContent = "Your library";
  mine.title = "What you watched or started, in the Libraries page";
  mine.onclick = () => atlas.openLibrary("jellyfin");
  const title = el("div", "", "Jellyfin");
  title.className = "jf-title";
  head.append(title, tabs, filter, mine);
  root.append(head, body);

  let all = [], kind = "";
  const card = (r) => {
    const b = el("button"), pic = el("div"), img = el("img");
    b.className = "jf-card"; pic.className = "jf-cover"; img.alt = "";
    pic.append(img);
    if (r.progress && r.progress < 1) { const bar = el("div"); bar.className = "jf-prog"; bar.style.width = `${Math.round(r.progress * 100)}%`; pic.append(bar); }
    if (r.played) { const m = el("div", "", "✓"); m.className = "jf-seen"; m.title = "watched"; pic.append(m); }
    void j.cover(r.id).then((u) => { if (u && !gone) img.src = u; }, () => {});
    const sub = [r.year, r.type === "Series" ? (r.unplayed ? `${r.unplayed} to watch` : "series") : r.length ? `${Math.round(r.length / 60)} min` : ""].filter(Boolean).join(" · ");
    const t = el("div", "", r.title), s = el("div", "", sub);
    t.className = "jf-name"; s.className = "jf-sub";
    b.append(pic, t, s);
    b.title = r.overview || r.title;
    b.onclick = () => void (r.type === "Series" ? chooseEpisode(atlas, r) : watch(atlas, r));
    return b;
  };
  const section = (label, rows) => {
    if (!rows.length) return;
    const h = el("h3", "", label), g = el("div");
    g.className = "jf-grid";
    for (const r of rows) g.append(card(r));
    body.append(h, g);
  };
  const draw = () => {
    body.replaceChildren();
    const f = filter.value.trim().toLowerCase();
    const shown = all.filter((r) => (!kind || r.type === kind) && (!f || `${r.title} ${r.year ?? ""} ${r.genres.join(" ")}`.toLowerCase().includes(f)));
    if (!f) section("Continue", shown.filter((r) => r.progress && r.progress < 1 && r.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed));
    section(f ? "Found" : "Everything", shown);
    if (!shown.length) body.append(notice(all.length ? "Nothing matches." : "Nothing on this server."));
    const n = all.filter(yours).length;
    mine.textContent = n ? `Your library (${n})` : "Your library";
  };
  const notice = (text) => { const p = el("p", "", text); p.className = "atlas-notice"; return p; };
  for (const [k, label] of [["", "All"], ["Movie", "Films"], ["Series", "Series"]]) {
    const b = el("button", "", label);
    b.className = "atlas-btn";
    b.classList.toggle("on", k === kind);
    b.onclick = () => { kind = k; for (const x of tabs.children) x.classList.toggle("on", x === b); draw(); };
    tabs.append(b);
  }
  filter.oninput = draw;

  if (!j.on) body.append(notice("Set your Jellyfin's address in Settings → Plugins → Jellyfin, then the command “Jellyfin: sign in”."));
  else {
    body.append(notice("Loading the server's films and series…"));
    void j.all().then((rows) => { if (gone) return; all = rows; draw(); }, (e) => { if (!gone) body.replaceChildren(notice(`Jellyfin: ${e.message ?? e}`)); });
  }
  return () => { gone = true; };
}

const CSS = `
  .jf { height: 100%; overflow: auto; background: var(--bg); color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  .jf .jf-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 2; }
  .jf .jf-title { font-weight: 600; }
  .jf .jf-tabs { display: flex; gap: 6px; }
  .jf .jf-tabs .on { background: var(--accent-soft); border-color: var(--accent); }
  .jf .jf-filter { font: inherit; flex: 1; min-width: 120px; max-width: 320px; margin-left: auto; }
  .jf .jf-body { padding: 4px 14px 14px; }
  .jf h3 { margin: 14px 0 8px; font-size: 1em; color: var(--heading); }
  .jf .jf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; }
  .jf .jf-card { display: flex; flex-direction: column; gap: 4px; padding: 0; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; min-width: 0; }
  .jf .jf-cover { position: relative; aspect-ratio: 2 / 3; border-radius: 8px; overflow: hidden; background: var(--bg-elev); box-shadow: 0 0 0 1px var(--border); }
  .jf .jf-card:hover .jf-cover, .jf .jf-card:focus-visible .jf-cover { box-shadow: 0 0 0 2px var(--accent); }
  .jf .jf-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .jf .jf-cover img:not([src]) { visibility: hidden; }
  .jf .jf-prog { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--accent); }
  .jf .jf-seen { position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; background: var(--accent); color: var(--bg); }
  .jf .jf-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .jf .jf-sub { color: var(--text-faint); font-size: .9em; }
`;
