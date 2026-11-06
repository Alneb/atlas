// The lower bar's Spelling panel (plugin API v27, a status cell's `panel`): the note's language to switch, every word
// marked in the note with its likeliest fixes (a click replaces, the word itself selects it), the words added by hand
// (× takes one back), and what the vault taught. main.ts builds the model; this only draws it and calls back.

export interface Marked { word: string; line: number; from: number; to: number; fixes: string[] }
export interface PanelModel {
  lang: string;
  /** the languages to switch to: code → name */
  choices: { lang: string; name: string }[];
  /** "set for this note" / "guessed from its words" */
  source: string;
  dictionaries: string;
  loading: boolean;
  marked: Marked[];
  added: string[];
  learned: { count: number; terms: string[] };
}
export interface PanelActions {
  setLang(lang: string): void;
  select(m: Marked): void;
  fix(m: Marked, by: string): void;
  add(word: string): Promise<void>;
  remove(word: string): Promise<void>;
  settings(): void;
}

const CSS = `
.sp { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px; }
.sp h3 { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); }
.sp .langs { display: flex; flex-wrap: wrap; gap: 4px; }
.sp button { font: inherit; color: var(--text); background: none; border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
.sp button:hover { background: var(--bg-hover); }
.sp .langs button.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.sp .about { margin-top: 4px; color: var(--text-faint); font-size: 11.5px; }
.sp ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow: auto; }
.sp li.word { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.sp li.word .w { border: none; padding: 1px 4px; text-decoration: underline wavy var(--red); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.sp li.word .line { color: var(--text-faint); font-size: 11px; min-width: 44px; }
.sp li.word .fix { border-color: transparent; background: var(--bg-hover); padding: 1px 6px; }
.sp li.word .fix:hover { border-color: var(--accent); }
.sp li.word .keep { margin-left: auto; color: var(--text-faint); border-color: transparent; padding: 1px 5px; }
.sp .none { color: var(--text-faint); }
.sp .chips { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow: auto; }
.sp .chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 2px 1px 7px; border-radius: 10px; background: var(--bg-hover); }
.sp .chip button { border: none; padding: 0 5px; color: var(--text-faint); border-radius: 10px; }
.sp .chip.plain { padding: 1px 7px; color: var(--text-muted); }
.sp .foot { display: flex; justify-content: flex-end; }
`;

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string | (() => unknown) | undefined> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "onclick") el.addEventListener("click", v as () => void);
    else if (typeof v === "function") continue;
    else if (v !== undefined) el.setAttribute(k, v);
  }
  for (const k of kids) if (k) el.append(k);
  return el;
}

/** Draws the panel into `host`; `model()` is asked again after each action, so the panel shows what it changed. */
export function drawPanel(host: HTMLElement, model: () => PanelModel, act: PanelActions) {
  host.replaceChildren(h("style", {}, CSS));
  const body = host.appendChild(h("div", { class: "sp" }));
  const again = () => draw(model());
  const draw = (m: PanelModel) => {
    const langs = h("section", {},
      h("h3", {}, "Language of this note"),
      h("div", { class: "langs" }, ...m.choices.map((c) =>
        h("button", { class: c.lang === m.lang ? "on" : "", "aria-pressed": String(c.lang === m.lang), title: c.lang === m.lang ? m.source : `Set lang: ${c.lang} in this note's properties`, onclick: () => { act.setLang(c.lang); } }, c.name))),
      h("div", { class: "about" }, `${m.source} · ${m.dictionaries}${m.loading ? " · loading the dictionary…" : ""}`));

    const marked = h("section", {}, h("h3", {}, `Marked in this note (${m.marked.length})`),
      m.marked.length
        ? h("ul", {}, ...m.marked.map((w) => h("li", { class: "word" },
          h("button", { class: "w", title: "Select it in the note", onclick: () => act.select(w) }, w.word),
          h("span", { class: "line" }, `line ${w.line}`),
          ...(w.fixes.length ? w.fixes.slice(0, 3).map((by) => h("button", { class: "fix", title: `Replace with “${by}”`, onclick: () => { act.fix(w, by); again(); } }, by)) : [h("span", { class: "none" }, "no suggestions")]),
          h("button", { class: "keep", title: `Add “${w.word}” to this vault's words`, onclick: () => void act.add(w.word).then(again) }, "+ add"))))
        : h("div", { class: "none" }, m.loading ? "Waiting for the dictionary." : "Nothing marked: every word is known."));

    const added = h("section", {}, h("h3", {}, `Added by you (${m.added.length})`),
      m.added.length
        ? h("div", { class: "chips" }, ...m.added.map((w) => h("span", { class: "chip" }, w, h("button", { title: `Take “${w}” out of this vault's words`, "aria-label": `Remove ${w}`, onclick: () => void act.remove(w).then(again) }, "×"))))
        : h("div", { class: "none" }, "None yet: “+ add” here or a right-click on a marked word adds one."));

    const learned = h("section", {}, h("h3", {}, `Learned from the vault (${m.learned.count})`),
      m.learned.terms.length
        ? h("div", {}, h("div", { class: "about" }, "Not in the dictionary, the most used first:"), h("div", { class: "chips" }, ...m.learned.terms.map((w) => h("span", { class: "chip plain" }, w))))
        : h("div", { class: "none" }, m.learned.count ? "All of them are in the dictionary too." : "Still counting the vault's notes."));

    body.replaceChildren(langs, marked, added, learned, h("div", { class: "foot" }, h("button", { onclick: () => act.settings() }, "Spelling settings…")));
  };
  draw(model());
}
