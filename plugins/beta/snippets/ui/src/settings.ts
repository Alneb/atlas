// The Snippets page in Settings: packs, the problems, the searchable list. Plain elements in the app's colours.
import type { PluginApi, SettingsSectionContext } from "../../../../../ui/src/lib/plugin-api";
import type { makeEngine } from "./engine";
import type { Compiled } from "./format";
import type { Read } from "./load";
import { PACKS } from "./packs";
import { WORDS } from "./words";

const MATH = { kind: "math", form: "inline", textArg: false } as const;
const SHOWN = 150; // rows drawn at once: the search finds the rest

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
  for (const w of WORDS) {
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
      row.append(el("div", "flex:1;", "These come from the old snippet file. Converting writes a JavaScript module beside it, with the known misfires mended and listed at its top. The old file is left as it was."));
      const b = el("button", "", "Convert");
      b.className = "btn primary";
      b.onclick = () => void o.convert().then(draw);
      row.append(b);
      top.append(row);
    } else if (!read.modules.length) {
      top.append(el("div", MUTED, "No snippets yet: put a JavaScript module in .atlas/snippets/, or switch on a pack."));
    }

    // packs
    packs.replaceChildren(el("div", TITLE, "Packs"));
    const on = new Set(String(ctx.settings().packs ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    for (const p of PACKS) {
      const row = el("label", "display:flex;gap:10px;align-items:baseline;padding:3px 0;cursor:pointer;");
      const box = el("input");
      box.type = "checkbox";
      box.checked = on.has(p.id);
      box.setAttribute("aria-label", `Pack ${p.title}`);
      box.onchange = () => {
        if (box.checked) on.add(p.id); else on.delete(p.id);
        void ctx.save({ packs: [...on].join(",") }).then(() => o.reload()).then(draw);
      };
      const text = el("span");
      text.append(el("span", "", p.title), el("span", `${MUTED}margin-left:8px;`, p.description));
      row.append(box, text);
      packs.append(row);
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

    // the list
    list.replaceChildren(el("div", TITLE, `Snippets (${read.snippets.length})`));
    const search = el("input", "width:100%;box-sizing:border-box;margin-bottom:8px;");
    search.placeholder = "Search triggers, names, what they give…";
    search.setAttribute("aria-label", "Search snippets");
    const table = el("div", "display:grid;grid-template-columns:minmax(80px,1fr) minmax(0,2.4fr) auto;gap:3px 14px;align-items:baseline;");
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      const hits = read.snippets.filter((s) => !q || s.shown.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q) || (typeof s.body === "string" && s.body.toLowerCase().includes(q)));
      table.replaceChildren();
      for (const s of hits.slice(0, SHOWN)) {
        const body = typeof s.body === "string" ? s.body : "(computed)";
        const what = el("div", "min-width:0;");
        if (s.name) what.append(el("span", "", s.name), el("span", `${MUTED}margin-left:8px;`));
        const code = el("code", `${MUTED}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:${s.name ? "none" : "block"};`, body.replace(/\s+/g, " "));
        what.append(code);
        table.append(el("code", "color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", s.shown), what, el("div", MUTED, `${s.auto ? "" : "Tab · "}${placeWord(s)}`));
      }
      if (hits.length > SHOWN) table.append(el("div", `${MUTED}grid-column:1/-1;`, `and ${hits.length - SHOWN} more: search to find them.`));
    };
    search.oninput = fill;
    fill();
    list.append(search, table);
  };
  draw();
}
