// `daily.header`: a bar under a day's log heading (registered by main.js). Everything comes from the note itself — its
// name or `date:`, its `weather:` (written by the Weather plugin after the day's first capture) and its lines — and from the folder's
// other logs, for the days before and after — and, live (never written into the note), the day's calendar events (the DAV
// plugin's `events`, through a view: none when it is off) and its tasks due and done (the core's tasks).
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const DAY = /(\d{4}-\d{2}-\d{2})(?=\.md$)/;

// the weather as the Weather plugin noted it: its sky's symbol first ("⛅ 12 °C, partly cloudy · Oslo")
const skyOf = (w) => { const m = /^(\p{Extended_Pictographic}\uFE0F?)\s*/u.exec(w); return m ? [m[1], w.slice(m[0].length)] : [null, w]; };

// the day's entries: its timed lines (`- 09:05 …`, captured), and under the log's heading every item, written by hand
// or not — the heading's names are the core's (capture.rs)
const LOG_HEADING = /^##\s+(log|registro|bit[aá]cora)\s*$/i;
const entries = (text) => {
  let inLog = false, n = 0;
  for (const l of text.split("\n")) {
    if (/^#{1,6}\s/.test(l)) inLog = LOG_HEADING.test(l);
    else if (/^\s*[-*] (\[.\] )?\d{1,2}:\d{2}\b/.test(l) || (inLog && /^ ?[-*] \S/.test(l))) n++;
  }
  return n;
};

const countText = (n) => (n ? `${n} ${n === 1 ? "entry" : "entries"}` : "nothing captured yet");

const CSS = `
.daily-head .daily-template { flex-basis: 100%; margin: 0; font-size: .78em; color: var(--text-faint); }
.daily-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 8px 12px; margin: 2px 0 8px;
  border: 1px solid var(--card-border, transparent); border-radius: var(--radius-lg, 8px); background: var(--card-bg, var(--bg-elev));
  box-shadow: var(--shadow-card, none); }
.daily-head .day { font-weight: 600; color: var(--heading, var(--text)); text-transform: capitalize; }
.daily-head .sub { flex: 1; color: var(--text-muted); font-size: .9em; display: flex; flex-wrap: wrap; gap: 4px 14px; }
.daily-head .sky { font-size: 1.15em; margin-right: 5px; }
.daily-head nav { display: flex; gap: 6px; }
.daily-head nav button { border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; color: var(--text-muted); background: transparent; font: inherit; font-size: .85em; cursor: pointer; }
.daily-head nav button:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.daily-head nav button:disabled { opacity: .35; cursor: default; }
.daily-head .facts { flex-basis: 100%; display: flex; flex-direction: column; gap: 2px; font-size: .88em; color: var(--text-muted); }
.daily-head .facts:empty { display: none; }
.daily-head .facts .row { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.daily-head .facts .k { color: var(--text-faint); min-width: 5.5em; }
.daily-head .facts .v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.daily-head .facts a { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--border-strong); cursor: pointer; }
`;
// per note, across remounts (the editor rebuilds a block it scrolled away or revealed): the last whole drawing,
// shown at once while the next one fills; and the calendar's answer per day, asked again after two minutes at most
const drawnHtml = new Map();
const eventsOf = new Map();
const EVENTS_TTL = 120_000;
let styled = false;
const style = () => { if (styled) return; styled = true; const s = document.createElement("style"); s.textContent = CSS; document.head.append(s); };

export function registerDaily(atlas, lang) {
  atlas.registerBlock("daily.header", (host, block) => {
    style();
    let gone = false, drawn = 0, daysOf = null, later = 0;
    if (drawnHtml.has(block.note) && !host.querySelector(".daily-head")) host.innerHTML = drawnHtml.get(block.note);
    // the log folder's dated notes, across its year / month folders (`log_folders`): asked again only when another file
    // there changes, not on every save of this one
    const here = block.note.includes("/") ? block.note.slice(0, block.note.lastIndexOf("/")) : "";
    const folder = here.replace(/(^|\/)\d{4}(\/[^/]+)*$/, "");
    const days = () => (daysOf ??= atlas.query(`filters:\n  and:\n    - file.inFolder(${JSON.stringify(folder)})\nviews:\n  - type: table\n    name: days\n    order: [file.name]\n`)
      .then((r) => (r?.views?.[0]?.rows ?? []).map((row) => row.path).filter((p) => DAY.test(p) && !p.includes("sync-conflict"))
        // by the day, not the path: month folders by name (`2026/noviembre`) sort before `2026/octubre`
        .sort((a, b) => DAY.exec(a)[1].localeCompare(DAY.exec(b)[1]) || a.localeCompare(b)))
      .catch(() => { daysOf = null; return []; }));
    // a save of the log redraws it without the facts and the arrows blinking
    const draw = async () => {
      const mine = ++drawn;
      const props = await block.props().catch(() => ({}));
      const text = await atlas.readText(block.note).catch(() => "");
      if (gone || mine !== drawn) return;
      // a template (`date: {{date}}`, or a note in the templates folder): today's header as a preview, said to be one
      const template = /\{\{/.test(String(props.date ?? "")) || /(^|\/)(templates?|plantillas)\//i.test(block.note);
      const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const iso = template ? today : String(props.date ?? "").slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? DAY.exec(block.note)?.[1];
      if (template) host.dataset.template = "1";
      if (!iso) { host.replaceChildren(el("p", "", "daily.header: this note has no date (a `date:` property or a YYYY-MM-DD name).")); return; }
      const d = new Date(`${iso}T12:00:00`);
      const box = el("div", "daily-head");
      box.addEventListener("mousedown", (e) => e.stopPropagation()); // its buttons are its own, not the editor's
      // the note's heading already says the day in full (and reads in Obsidian): here only the weekday, as a label
      box.append(el("span", "day", new Intl.DateTimeFormat(lang(), { weekday: "long" }).format(d)));
      const sub = el("div", "sub");
      const weather = String(props.weather ?? "").trim();
      if (weather) { const [icon, words] = skyOf(weather); const w = el("span"); if (icon) w.append(el("span", "sky", icon)); w.append(words); sub.append(w); }
      const lines = entries(text);
      sub.append(el("span", "count", countText(lines)));
      const nav = el("nav");
      const facts = el("div", "facts");
      box.append(sub, nav, facts);
      if (template) box.append(el("p", "daily-template", "Template preview: a log made from it shows its own day here."));
      // the first one shows at once and fills in; a redraw replaces the last only once it is whole, and only if it differs
      const first = !host.querySelector(".daily-head");
      if (first) host.replaceChildren(box);
      const [all] = await Promise.all([days(), template ? null : dayFacts(facts, iso)]);
      if (gone || mine !== drawn) return;
      const at = all.indexOf(block.note);
      const step = (label, path) => { const b = el("button", "", label); b.disabled = !path; if (path) { b.title = DAY.exec(path)[1]; b.onclick = () => atlas.open(path); } return b; };
      nav.append(step("←", at > 0 ? all[at - 1] : null), step("→", at >= 0 && at < all.length - 1 ? all[at + 1] : null));
      const shown = host.querySelector(".daily-head");
      if (!first && !(shown?.live && shown.outerHTML === box.outerHTML)) host.replaceChildren(box);
      (host.querySelector(".daily-head") ?? box).live = true;
      drawnHtml.set(block.note, box.outerHTML);
    };
    /** A save of the note itself: its count at once, in place; the rest (its tasks done) a while after the typing stops. */
    const recount = async () => {
      const text = await atlas.readText(block.note).catch(() => null);
      const count = host.querySelector(".daily-head .count");
      if (gone || text === null || !count) return void draw();
      count.textContent = countText(entries(text));
      clearTimeout(later);
      later = setTimeout(() => void draw(), 5000);
    };
    /** A line of the facts: a label, then items each opening where it came from. */
    const fact = (facts, label, items) => {
      if (!items.length) return;
      const row = el("div", "row"), v = el("span", "v");
      row.append(el("span", "k", label), v);
      items.forEach((it, i) => {
        if (i) v.append(" · ");
        const a = el("a", "", it.text);
        if (it.path) a.onclick = () => atlas.open(it.path, it.line);
        v.append(a);
      });
      facts.append(row);
    };
    /** The day's events (any calendar plugin's `events` tool, through a view) and its tasks due and done. */
    const dayFacts = async (facts, iso) => {
      const rows = async (src) => (await atlas.view(src, block.note).catch(() => null))?.rows ?? [];
      const [events, due, done] = await Promise.all([
        calendar(iso, async () => (await atlas.view(`type: list\nfrom: plugin:dav/events\nargs: {from: "${iso}", to: "${iso}"}`, block.note).catch(() => null))?.rows ?? null),
        rows(`type: task-list\nfrom: tasks\ndue: ${iso}\nstarted: false`),
        rows(`type: task-list\nfrom: tasks\nshow: all\ncompleted: ${iso}`),
      ]);
      const time = (d) => (/T(\d{2}:\d{2})/.exec(String(d ?? ""))?.[1] ?? "");
      fact(facts, "Calendar", events.map((r) => ({ text: `${time(r.props?.start) ? `${time(r.props.start)} ` : ""}${r.title ?? ""}`, path: r.path })));
      fact(facts, "Due", due.filter((r) => !r.done).map((r) => ({ text: r.title ?? "", path: r.path, line: r.line })));
      fact(facts, "Done", done.map((r) => ({ text: r.title ?? "", path: r.path, line: r.line })));
    };
    /** The day's events, from the cache while fresh; a failed asking (the calendar unreachable) keeps the last answer. */
    const calendar = async (iso, ask) => {
      const had = eventsOf.get(iso);
      if (had && Date.now() - had.at < EVENTS_TTL) return had.rows;
      const rows = await ask();
      if (rows) eventsOf.set(iso, { at: Date.now(), rows });
      return rows ?? had?.rows ?? [];
    };
    void draw();
    const off = atlas.onFilesChanged((paths) => {
      // a day made or gone; no paths: the connection came back, anything may have changed
      const day = !paths.length || paths.some((p) => p !== block.note && DAY.test(p) && (!folder || p.startsWith(`${folder}/`)));
      if (day) daysOf = null;
      if (day) void draw();
      else if (paths.includes(block.note)) void recount();
    });
    return () => { gone = true; clearTimeout(later); off(); };
  }, { title: "Daily: the top of a day's log" });
}
