// The Snippets page in Settings: the options the files declare, the problems, every snippet with its switch. Plain elements in the app's colours.
import type { PluginApi, SettingsSectionContext } from "../../../../../ui/src/lib/plugin-api";
import type { makeEngine } from "./engine";
import { preview, type Compiled } from "./format";
import { switchedOf, type Read } from "./load";
import { WORDS } from "./words";

const MATH = { kind: "math", form: "inline", textArg: false } as const;
const PAGE = 150; // rows drawn at once; "Show more" draws the next page

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, style = "", text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (style) e.style.cssText = style;
  if (text !== undefined) e.textContent = text;
  return e;
};
const TITLE = "font-weight:600;margin:14px 0 6px;color:var(--text);";
const MUTED = "color:var(--text-muted);font-size:.92em;";

const placeWord = (s: Compiled) => [s.math && (s.display && s.inline ? "math" : s.display ? "display math" : "inline math"), s.text && "text", s.code && (s.langs ? s.langs.join(", ") : "code")].filter(Boolean).join(" · ");

/** What is wrong with what was read, each with where it comes from. */
function problemsOf(read: Read, engine: ReturnType<typeof makeEngine>): { what: string; source: string }[] {
  const out = [...read.problems];
  // the same plain trigger for the same place: only the first fires
  const seen = new Map<string, Compiled>();
  for (const s of read.snippets) {
    if (!s.plain || s.visual) continue;
    const k = `${s.plain}\u0000${placeWord(s)}\u0000${s.auto}`;
    const first = seen.get(k);
    if (first) out.push({ source: s.source, what: `“${s.shown}” never fires: an earlier one takes it (${first.source}).` });
    else seen.set(k, s);
  }
  // each snippet's own tests
  for (const s of read.snippets) for (const [typed, want] of Object.entries(s.test ?? {})) {
    const got = engine.simulate(typed, s.text ? { kind: "text" } : MATH);
    if (got !== want) out.push({ source: s.source, what: `“${s.shown}”: typing ${typed} gives ${got}, not ${want}.` });
  }
  return out;
}

/** Ordinary words that come out changed when typed in math: what the word list is for, seen with this vault's snippets. */
function misfires(engine: ReturnType<typeof makeEngine>): string[] {
  const bad: string[] = [];
  // a word that starts with a whole trigger (`integral`, `fraction`) changes by design: in math a trigger typed from
  // its first letter fires at once, and words there go in \text{}. What is listed is a trigger firing inside a word.
  const starts = [...engine.snippets().filter((s) => s.math && s.auto && s.plain && /^[A-Za-z]{2,}$/.test(s.plain)).map((s) => s.plain!),
    ...engine.made().filter((k) => k.length >= 3)];
  for (const w of WORDS) {
    if (starts.some((t) => w.startsWith(t))) continue;
    // the key after the word lets whatever is held go
    if (engine.simulate(`${w} `, MATH) !== `${w} `) bad.push(w);
  }
  return bad;
}

// the places a try can be typed in; `Tab` typed as \t walks the stops
const PLACES: { label: string; place: Parameters<ReturnType<typeof makeEngine>["simulate"]>[1] }[] = [
  { label: "inline math", place: MATH },
  { label: "display math", place: { kind: "math", form: "display", textArg: false } },
  { label: "text", place: { kind: "text" } },
  { label: "code", place: { kind: "code", lang: "" } },
];

/** A box to type keys into, and what this vault's snippets make of them: the engine on a detached editor. */
function mountTry(host: HTMLElement, engine: ReturnType<typeof makeEngine>) {
  const row = el("div", "display:flex;gap:8px;align-items:center;");
  const input = el("input", "flex:1;min-width:0;");
  input.placeholder = "Type keys, e.g. a/b or sr ; Tab: a tab stop";
  input.setAttribute("aria-label", "Try snippets");
  const where = el("select");
  where.setAttribute("aria-label", "Typed in");
  PLACES.forEach((p, i) => where.append(Object.assign(el("option", "", p.label), { value: String(i) })));
  const out = el("code", "display:block;min-height:1.4em;margin-top:6px;padding:6px 8px;border-radius:6px;background:var(--bg-alt);color:var(--text);white-space:pre-wrap;");
  out.dataset.testid = "snippet-try-out";
  const run = () => {
    try { out.textContent = input.value ? engine.simulate(input.value, PLACES[+where.value].place) : ""; out.style.color = "var(--text)"; }
    catch (e) { out.textContent = String((e as Error).message ?? e); out.style.color = "var(--red)"; }
  };
  // Tab in the box is typed as a tab, so a stop can be walked; Shift+Tab still leaves the box
  input.onkeydown = (e) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    input.setRangeText("\t", input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end");
    run();
  };
  input.oninput = run;
  where.onchange = run;
  row.append(input, where);
  host.append(el("div", TITLE, "Try"), row, out);
}

export function mountSection(host: HTMLElement, o: { atlas: PluginApi; engine: ReturnType<typeof makeEngine>; ctx: SettingsSectionContext; read(): Read; reload(): Promise<Read>; convert(): Promise<void> }) {
  const { engine, ctx } = o;
  const top = el("div"), tryBox = el("div"), packs = el("div"), problems = el("div"), list = el("div");
  host.append(top, tryBox, problems, packs, list);
  mountTry(tryBox, engine);

  const draw = () => {
    const read = o.read();
    top.replaceChildren();
    if (read.fromOldFile) {
      const row = el("div", "display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);");
      row.append(el("div", "flex:1;", "These come from the old snippet file ([latex] snippets_file in the settings file). Converting writes a JavaScript module beside it, with the known misfires mended and listed at its top. The old file is left as it was."));
      const b = el("button", "", "Convert");
      b.className = "btn primary";
      b.onclick = () => void o.convert().then(draw);
      row.append(b);
      top.append(row);
    } else if (!read.modules.length) {
      top.append(el("div", MUTED, "No snippets yet: put a JavaScript module in .atlas/snippets/."));
    } else {
      top.append(el("div", MUTED, `From ${read.modules.join(", ")}: the vault's own files, the one place snippets come from. A switch here turns one off (or on) without touching the file.`));
    }

    // the options the files declare, each switched as one
    const switched = switchedOf(ctx.settings().switched);
    const flip = (key: string) => {
      if (switched.has(key)) switched.delete(key); else switched.add(key);
      void ctx.save({ switched: JSON.stringify([...switched].sort()) }).then(() => o.reload()).then(draw);
    };
    const toggle = (label: string, on: boolean, key: string) => {
      const box = el("input");
      box.type = "checkbox";
      box.checked = on;
      box.setAttribute("aria-label", label);
      box.onchange = () => flip(key);
      return box;
    };
    packs.replaceChildren();
    if (read.options.length) {
      packs.append(el("div", TITLE, "Options"));
      for (const p of read.options) {
        const row = el("label", "display:flex;gap:10px;align-items:baseline;padding:3px 0;cursor:pointer;");
        const text = el("span");
        text.append(el("span", "", p.title), el("span", `${MUTED}margin-left:8px;`, `${p.description} ${p.count} snippet${p.count === 1 ? "" : "s"} · ${p.source}`));
        row.append(toggle(`Option ${p.title}`, p.on, `option:${p.id}`), text);
        packs.append(row);
      }
    }

    // problems; the word check waits for the page to have drawn
    problems.replaceChildren();
    const found = problemsOf(read, engine);
    const show = (items: { what: string; source: string }[]) => {
      problems.replaceChildren();
      if (!items.length) return;
      problems.append(el("div", TITLE, `Problems (${items.length})`));
      for (const p of items) {
        const row = el("div", "padding:2px 0;");
        row.dataset.testid = "snippet-problem";
        row.append(el("span", "color:var(--red);", p.what), el("span", `${MUTED}margin-left:8px;`, p.source));
        problems.append(row);
      }
    };
    show(found);
    setTimeout(() => {
      const bad = misfires(engine);
      if (bad.length) show([...found, { source: "typed in math", what: `${bad.length} ordinary words change: ${bad.slice(0, 40).join(", ")}${bad.length > 40 ? "…" : ""}` }]);
    }, 0);

    // every snippet, off ones too: a switch, the trigger, what it gives (drawn), where, and from which file
    const offOptions = new Set(read.options.filter((p) => !p.on).map((p) => p.id));
    const optionTitle = new Map(read.options.map((p) => [p.id, p.title]));
    list.replaceChildren(el("div", TITLE, `Snippets (${read.all.length}, ${read.snippets.filter((s) => !s.alias).length} on)`));
    const search = el("input", "width:100%;box-sizing:border-box;margin-bottom:8px;");
    search.placeholder = "Search triggers, names, what they give, files…";
    search.setAttribute("aria-label", "Search snippets");
    // switch · trigger · the drawn formula (a fixed width, so every row's source starts at the same place) · source · where
    const table = el("div", "display:grid;grid-template-columns:auto minmax(70px,1fr) 9em minmax(0,2.4fr) auto;gap:4px 12px;align-items:center;");
    let shown = PAGE;
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      const hits = read.all.filter((s) => !q || s.shown.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q) || s.source.toLowerCase().includes(q)
        || (s.option && optionTitle.get(s.option)?.toLowerCase().includes(q)) || (typeof s.body === "string" && s.body.toLowerCase().includes(q)));
      table.replaceChildren();
      for (const s of hits.slice(0, shown)) {
        const inOff = !!s.option && offOptions.has(s.option);
        const box = toggle(`Snippet ${s.shown}`, !switched.has(s.key), s.key);
        if (inOff) { box.disabled = true; box.title = `Off with its option, ${optionTitle.get(s.option!)}`; }
        const drawn = el("div", "min-width:0;overflow:hidden;white-space:nowrap;");
        const body = typeof s.body === "string" ? s.body : null;
        if (body && s.math && !s.regex) {
          // a preview that cannot be drawn is left blank, never a red error: the source beside it says what it gives
          try { o.atlas.editor.drawMath(drawn, preview(body), false); } catch { drawn.replaceChildren(); }
          if (drawn.querySelector(".katex-error")) drawn.replaceChildren();
        }
        const what = el("div", "min-width:0;overflow:hidden;");
        const detail = s.name ?? (body ? body.replace(/\s+/g, " ") : "(computed)");
        what.append(el("code", `${MUTED}white-space:nowrap;`, detail));
        if (s.note) what.append(el("span", `${MUTED}margin-left:8px;`, s.note));
        const where = el("div", `${MUTED}white-space:nowrap;text-align:right;`, `${s.auto ? "" : "Tab · "}${placeWord(s)} · ${s.option ? optionTitle.get(s.option) : s.source}`);
        const trig = el("code", `color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${inOff || switched.has(s.key) ? "opacity:.5;text-decoration:line-through;" : ""}`, s.shown);
        table.append(box, trig, drawn, what, where);
      }
      if (hits.length > shown) {
        const more = el("button", "grid-column:1/-1;justify-self:start;", `Show ${Math.min(PAGE, hits.length - shown)} more of ${hits.length - shown}`);
        more.onclick = () => { shown += PAGE; fill(); };
        table.append(more);
      }
    };
    search.oninput = () => { shown = PAGE; fill(); };
    fill();
    list.append(search, table);
  };
  draw();
}
