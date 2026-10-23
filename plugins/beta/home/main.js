// Home (plugin.toml): chips in Today's greeting — the week, the moon, what is due — and the `home.areas` block (the
// vault's areas at a glance) beside the older `home.map` (its topics as a tree).
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

const WORDS = {
  en: { week: "Week", day: "day", due: (n) => `${n} due today`, over: (n) => `${n} overdue`, free: "nothing due today",
    moon: ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"],
    notes: (n) => `${n} note${n === 1 ? "" : "s"}`, none: (by) => `No notes name a ${by} yet: give notes a \`${by}:\` property (links to the notes they belong to).` },
  es: { week: "Semana", day: "día", due: (n) => `${n} para hoy`, over: (n) => `${n} atrasada${n === 1 ? "" : "s"}`, free: "nada para hoy",
    moon: ["luna nueva", "creciente", "cuarto creciente", "gibosa creciente", "luna llena", "gibosa menguante", "cuarto menguante", "menguante"],
    notes: (n) => `${n} nota${n === 1 ? "" : "s"}`, none: (by) => `Ninguna nota tiene \`${by}:\` todavía.` },
};
const AREA_WORDS = { en: { ago: (t) => `${t} ago`, now: "just now", none: "No notes yet." }, es: { ago: (t) => `hace ${t}`, now: "ahora", none: "Aún no hay notas." } };
const MOONS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];

/** ISO week and day of the year. */
function weekOf(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  const yday = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
  return { week, yday };
}

/** The moon's phase (0–7) and how lit it is, from a known new moon and the synodic month. */
function moonOf(d) {
  const synodic = 29.530588853, age = (((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % synodic + synodic) % synodic;
  return { phase: Math.round((age / synodic) * 8) % 8, lit: Math.round((1 - Math.cos((2 * Math.PI * age) / synodic)) * 50) };
}

const CSS = `
.home-map { display: flex; flex-direction: column; gap: 1px; font-size: .95em; }
.home-map .row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer; color: var(--text); background: none; border: 0; font: inherit; text-align: left; width: 100%; }
.home-map .row:hover { background: var(--bg-hover); }
.home-map .row.ghost { cursor: default; color: var(--text-muted); }
.home-map .row.ghost:hover { background: none; }
.home-map .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-map .kids { color: var(--text-faint); font-size: .85em; cursor: pointer; padding: 0 4px; border-radius: 4px; }
.home-map .kids:hover { color: var(--text); background: var(--bg-hover); }
.home-map .n { font-size: .8em; color: var(--text-faint); font-variant-numeric: tabular-nums; background: var(--bg-hover); padding: 1px 8px; border-radius: 99px; }
.home-map .bar { width: 46px; height: 4px; border-radius: 2px; background: var(--bg-hover); overflow: hidden; flex: none; }
.home-map .bar i { display: block; height: 100%; background: color-mix(in srgb, var(--accent) 70%, transparent); }
.home-map .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--accent); opacity: .8; }
.home-map .lv1 .dot { opacity: .55; width: 6px; height: 6px; } .home-map .lv2 .dot { opacity: .35; width: 5px; height: 5px; }
.home-map .empty { color: var(--text-faint); margin: 4px 0; }
.home-areas { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.home-areas .area { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt); min-width: 0; }
.home-areas .area:hover { border-color: var(--border-strong); }
.home-areas .head { display: flex; align-items: baseline; gap: 8px; cursor: pointer; background: none; border: 0; padding: 0; font: inherit; color: var(--heading, var(--text)); text-align: left; }
.home-areas .head b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.home-areas .head .n { font-size: .8em; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.home-areas .heat { height: 3px; border-radius: 2px; background: var(--bg-hover); overflow: hidden; }
.home-areas .heat i { display: block; height: 100%; background: var(--accent); opacity: .75; }
.home-areas .when { font-size: .78em; color: var(--text-faint); }
.home-areas .note { display: block; width: 100%; font: inherit; font-size: .88em; text-align: left; color: var(--text-muted); background: none; border: 0; padding: 1px 0; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-areas .note:hover { color: var(--accent); }
`;
let styled = false;
const style = () => { if (styled) return; styled = true; const s = document.createElement("style"); s.textContent = CSS; document.head.append(s); };

/** The vault's tree from one property: a node per note named there, under the deepest node it names itself (the most
 *  particular: `topics: [[Physics]], [[Condensed Matter]]` hangs under Condensed Matter, in whatever order). */
export function topicTree(rows, min = 2) {
  const named = new Map(), parentsOf = new Map(), pathOf = new Map();
  for (const r of rows) {
    pathOf.set(r.name, r.path);
    for (const t of r.topics) named.set(t, (named.get(t) ?? 0) + 1);
    parentsOf.set(r.name, r.topics);
  }
  const nodes = [...named].filter(([, n]) => n >= min).map(([name, n]) => ({ name, n, path: pathOf.get(name) ?? null, kids: [] }));
  const byName = new Map(nodes.map((x) => [x.name, x]));
  const roots = [], depth = new Map();
  const ups = (name) => (parentsOf.get(name) ?? []).filter((p) => p !== name && byName.has(p));
  const depthOf = (name, seen = new Set()) => {
    if (depth.has(name)) return depth.get(name);
    if (seen.has(name)) return 0; // a loop of topics: cut here
    seen.add(name);
    const d = Math.max(0, ...ups(name).map((p) => depthOf(p, seen) + 1));
    depth.set(name, d);
    return d;
  };
  const parent = new Map(nodes.map((x) => [x.name, ups(x.name).sort((a, b) => depthOf(b) - depthOf(a))[0]]));
  // a loop of topics (A names B, B names A): the first met of it becomes a root, so nothing hangs in the air
  for (const x of nodes) {
    const seen = new Set();
    for (let at = x.name; parent.get(at); at = parent.get(at)) {
      if (seen.has(at)) { parent.delete(at); break; }
      seen.add(at);
    }
  }
  for (const x of nodes) (parent.get(x.name) ? byName.get(parent.get(x.name)).kids : roots).push(x);
  const total = (x) => x.n + x.kids.reduce((s, k) => s + total(k), 0);
  const sort = (xs) => { xs.sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name)); xs.forEach((k) => sort(k.kids)); return xs; };
  return sort(roots);
}

export function register(atlas) {
  const lang = () => { const l = String(atlas.plugin.settings.language ?? "auto"); return (l === "auto" ? navigator.language : l).startsWith("es") ? "es" : "en"; };
  const W = () => WORDS[lang()];

  if (atlas.shell.greetingItem) {
    const now = new Date(), { week, yday } = weekOf(now), moon = moonOf(now);
    atlas.shell.greetingItem({ id: "week", icon: "📅", text: `${W().week} ${week} · ${W().day} ${yday}`, order: 30 });
    atlas.shell.greetingItem({ id: "moon", icon: MOONS[moon.phase], text: W().moon[moon.phase], title: `${moon.lit} %`, order: 31 });
    const due = atlas.shell.greetingItem({ id: "due", icon: "☑", text: "…", order: 20 });
    const count = async (when) => ((await atlas.view(`type: task-list\nfrom: tasks\ndue: ${when}`)).rows ?? []).filter((r) => !r.done).length;
    void Promise.all([count("today"), count("overdue")]).then(([today, over]) => {
      due.set([today ? W().due(today) : W().free, over ? W().over(over) : ""].filter(Boolean).join(" · "));
    }, () => due.remove());
  }

  atlas.registerBlock("home.map", (host, block) => {
    style();
    const by = String(block.options?.by ?? atlas.plugin.settings.by ?? "topics").trim() || "topics";
    const min = Number(block.options?.min ?? 2) || 2;
    const box = el("div", "home-map");
    host.append(box);
    let gone = false;
    const yaml = `filters:\n  and:\n    - file.ext == "md"\n    - '!${by}.isEmpty()'\nviews:\n  - type: table\n    name: map\n    order: [file.name, ${by}]\n`;
    void atlas.query(yaml).then((res) => {
      if (gone) return;
      const rows = (res.views?.[0]?.rows ?? []).map((r) => ({
        name: r.cells[0]?.text ?? r.path.replace(/^.*\//, "").replace(/\.md$/, ""), path: r.path,
        topics: (r.cells[1]?.items ?? [r.cells[1]]).map((c) => c?.text ?? c?.value).filter(Boolean).map(String),
      }));
      const tree = topicTree(rows, min);
      if (!tree.length) { box.append(el("p", "empty", W().none(by))); return; }
      const most = Math.max(...tree.map((x) => x.n));
      // two levels open; a deeper one folds under its parent (a click on "▸ 3" opens it)
      const draw = (x, level, into) => {
        const row = el("button", `row lv${Math.min(level, 2)}${x.path ? "" : " ghost"}`);
        row.style.paddingLeft = `${8 + level * 18}px`;
        row.title = x.path ? `${x.name} — ${W().notes(x.n)}` : `${x.name} (${W().notes(x.n)}; no note of its own)`;
        const bar = el("span", "bar"), fill = el("i"); fill.style.width = `${Math.max(6, Math.round((x.n / most) * 100))}%`; bar.append(fill);
        const name = el("span", "name", x.name);
        const fold = x.kids.length ? el("span", "kids", "") : null;
        if (fold) name.append(fold);
        row.append(el("span", "dot"), name, bar, el("span", "n", String(x.n)));
        if (x.path) row.onclick = () => atlas.open(x.path);
        into.append(row);
        if (!x.kids.length) return;
        const under = el("div");
        into.append(under);
        for (const k of x.kids) draw(k, level + 1, under);
        const set = (open) => { under.hidden = !open; fold.textContent = ` ${open ? "▾" : "▸"} ${x.kids.length}`; };
        set(level < 1);
        fold.onclick = (e) => { e.stopPropagation(); set(under.hidden); };
      };
      for (const x of tree) draw(x, 0, box);
    }, (e) => { if (!gone) box.append(el("p", "empty", String(e?.message ?? e))); });
    return () => { gone = true; };
  }, { title: "Map of the vault", options: [
    { key: "by", label: "The property notes hang from", kind: "text", hint: "default: the plugin's setting (topics)" },
    { key: "min", label: "Only names given by at least", kind: "number" },
  ] });

  // The vault's areas: each top folder a tile — how many notes, when it was last touched, a bar of how busy it was this month,
  // and its latest notes — busiest first. Mail, templates and Atlas's own folders are left out.
  atlas.registerBlock("home.areas", (host, block) => {
    style();
    const max = Number(block.options?.areas ?? 6) || 6, per = Number(block.options?.notes ?? 3) || 3;
    const skip = new Set(String(block.options?.skip ?? "").split(",").map((x) => x.trim()).filter(Boolean));
    const box = el("div", "home-areas");
    host.append(box);
    let gone = false;
    const yaml = `filters:\n  and:\n    - file.ext == "md"\nviews:\n  - type: table\n    name: areas\n    order: [file.name, file.folder, file.mtime, type]\n    sort:\n      - property: file.mtime\n        direction: DESC\n`;
    void atlas.query(yaml).then((res) => {
      if (gone) return;
      const A = AREA_WORDS[lang()], now = Date.now(), month = 30 * 864e5;
      const areas = new Map();
      for (const r of res.views?.[0]?.rows ?? []) {
        const folder = String(r.cells[1]?.text ?? r.cells[1]?.value ?? r.path.replace(/\/?[^/]*$/, ""));
        const top = folder.split("/")[0];
        const type = String(r.cells[3]?.value ?? r.cells[3]?.text ?? "");
        if (!top || top.startsWith(".") || /^(templates?|plantillas|attachments?|adjuntos)$/i.test(top) || skip.has(top) || /^email/.test(type)) continue;
        const t = Date.parse(String(r.cells[2]?.text ?? "").replace(" ", "T")) || 0;
        const a = areas.get(top) ?? { name: top, n: 0, recent: 0, last: 0, notes: [] };
        a.n++;
        if (now - t < month) a.recent++;
        a.last = Math.max(a.last, t);
        if (a.notes.length < per) a.notes.push({ name: r.cells[0]?.text ?? r.path.replace(/^.*\//, "").replace(/\.md$/, ""), path: r.path });
        areas.set(top, a);
      }
      const list = [...areas.values()].sort((x, y) => y.recent - x.recent || y.last - x.last).slice(0, max);
      if (!list.length) { box.append(el("p", "empty", A.none)); return; }
      const busiest = Math.max(1, ...list.map((a) => a.recent));
      const ago = (t) => { const m = Math.round((now - t) / 6e4); if (m < 2) return A.now; if (m < 60) return A.ago(`${m} min`); const h = Math.round(m / 60); if (h < 48) return A.ago(`${h} h`); return A.ago(`${Math.round(h / 24)} d`); };
      for (const a of list) {
        const tile = el("div", "area");
        const head = el("button", "head"); head.title = `${a.name}: ${W().notes(a.n)}, ${a.recent} this month`;
        head.append(el("b", "", a.name), el("span", "n", String(a.n)));
        head.onclick = () => (atlas.files?.explore ? atlas.files.explore({ source: "vault", path: a.name }) : a.notes[0] && atlas.open(a.notes[0].path));
        const heat = el("div", "heat"), fill = el("i"); fill.style.width = `${Math.max(4, Math.round((a.recent / busiest) * 100))}%`; heat.append(fill);
        tile.append(head, heat, el("span", "when", a.last ? ago(a.last) : ""));
        for (const x of a.notes) { const b = el("button", "note", x.name); b.title = x.path; b.onclick = () => atlas.open(x.path); tile.append(b); }
        box.append(tile);
      }
    }, (e) => { if (!gone) box.append(el("p", "empty", String(e?.message ?? e))); });
    return () => { gone = true; };
  }, { title: "Areas of the vault", options: [
    { key: "areas", label: "How many areas", kind: "number" },
    { key: "notes", label: "Latest notes in each", kind: "number" },
    { key: "skip", label: "Folders left out", kind: "text", hint: "comma-separated top folders" },
  ] });
}
