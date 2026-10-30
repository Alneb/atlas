// What makes typing expand: which snippet fires at a key, the wait for a longer trigger, what a word or a command being
// typed holds back, Tab through stops and out of brackets, Backspace giving back what an expansion replaced. Ported from
// the app's LaTeX snippets, which took many fixes: each rule here came from a real misfire.
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import type { Place } from "../../../../../ui/src/lib/editor/math-context";
import type { At, Compiled, Loaded } from "./format";
import { makeStops, parseStops } from "./stops";
import { WORDS } from "./words";
import { nextPlace, prevPlace } from "./brackets";
import { SortedWords } from "./sorted-words";

const TAIL = 120; // only the text just before the caret can hold a trigger

// LaTeX command names a letters-only trigger must not cut short while one is typed (`hbar` is not h + `bar`, `\langle`
// not \l + `ang`): the vault's own commands and triggers join these
const COMMANDS = ("langle rangle lvert rvert lVert rVert lfloor rfloor lceil rceil hbar hslash ell nabla partial infty "
  + "mathbb mathbf mathcal mathrm mathfrak mathscr mathit boldsymbol text textbf textit operatorname overline underline "
  + "overbrace underbrace widehat widetilde hat bar tilde vec dot ddot sqrt frac dfrac tfrac binom left right bigl bigr "
  + "sum prod int iint oint lim limsup liminf sup inf max min exp log ln sin cos tan cot sec csc sinh cosh tanh arcsin "
  + "arccos arctan det dim ker deg gcd cdot cdots ldots vdots ddots times div pm mp leq geq neq approx equiv sim simeq "
  + "propto cong to mapsto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow uparrow downarrow "
  + "forall exists in notin subset subseteq supset supseteq cup cap setminus emptyset varnothing wedge vee oplus otimes "
  + "dagger quad qquad angle triangle top bot bra ket braket ketbra").split(" ");

/** Sorted, for a search by prefix: asked only when a trigger has matched, but the list is long. */
class Dictionary {
  private list: string[];
  private set: Set<string>;
  constructor(words: string[], private big: SortedWords | null) { this.set = new Set(words); this.list = [...this.set].sort(); }
  has(w: string) { return this.set.has(w) || !!this.big?.has(w); }
  /** A word that starts with `w` and goes on. */
  grows(w: string) {
    let lo = 0, hi = this.list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.list[m] < w) lo = m + 1; else hi = m; }
    if (this.list[lo] === w) lo++;
    return !!this.list[lo]?.startsWith(w) || !!this.big?.grows(w);
  }
}

/** What a regex trigger is about: its last group when that ends the match (`([^\\])(sim)` → `sim`), else the match. */
function coreOf(m: RegExpExecArray): string {
  const last = m.length > 1 ? m[m.length - 1] : undefined;
  return last && m[0].endsWith(last) ? last : m[0];
}

export function makeEngine(atlas: PluginApi) {
  const cm = atlas.editor.codemirror;
  const stops = makeStops(cm);
  const { EditorView: View, keymap } = cm.view;
  const { Prec } = cm.state;

  let SNIPPETS: Compiled[] = [];
  let KNOWN: string[] = COMMANDS;
  let DICT = new Dictionary(WORDS, null);
  let OWN: string[] = [], BIG: SortedWords | null = null;
  /** The spelling dictionaries (`words.txt`, beside the plugin), fetched once: until they come the short list holds. */
  async function loadWords(): Promise<number> {
    const answer = await fetch(atlas.assetUrl("words.txt"));
    if (!answer.ok) throw new Error(`words.txt: ${answer.status}`);
    BIG = new SortedWords(await answer.text());
    DICT = new Dictionary([...WORDS, ...OWN], BIG);
    return BIG.size;
  }
  let anyCode = false;

  /** Takes what was loaded; open editors use it at the next key. */
  function use(l: Loaded): void {
    SNIPPETS = l.snippets;
    KNOWN = [...new Set([...COMMANDS, ...l.known])];
    OWN = l.words;
    DICT = new Dictionary([...WORDS, ...OWN], BIG);
    anyCode = l.snippets.some((s) => s.code && s.langs !== null);
  }

  const fixedPlace = new WeakMap<EditorView, Place>(); // the checks' own detached editors
  const placeOf = (view: EditorView, pos: number): Place => fixedPlace.get(view) ?? atlas.editor.place(view, pos);
  /** Notes and .tex files always; a code file only if some snippet speaks its language. */
  const runsHere = (view: EditorView) => fixedPlace.has(view) || anyCode || /\.(md|markdown|tex)$/i.test(atlas.editor.path(view));

  const atOf = (view: EditorView, before: string, selection = ""): At => ({
    before, selection, after: view.state.sliceDoc(view.state.selection.main.head, view.state.doc.lineAt(view.state.selection.main.head).to), path: atlas.editor.path(view),
  });

  function fits(s: Compiled, place: Place, view: EditorView): boolean {
    if (s.files && !s.files.some((g) => g.test(atlas.editor.path(view)))) return false;
    switch (place.kind) {
      // a code file runs only what names its language; a fence also what is for any code
      case "code": return s.code && (s.langs ? s.langs.includes(place.lang) : /\.(md|markdown)$/i.test(atlas.editor.path(view)));
      case "text": return s.text;
      case "math":
        if (!s.math || (place.textArg && !s.inTextArg)) return false;
        return place.form === "display" ? s.display : s.inline;
    }
  }

  /** The text a snippet writes here, or null when it cannot (a function that fails), or a promise. */
  function bodyFor(s: Compiled, m: RegExpExecArray | null, at: At): string | null | Promise<string> {
    let r = s.body;
    if (typeof r === "function") {
      try {
        const v = r(m, at);
        if (v instanceof Promise) return v;
        r = v;
      } catch (e) { console.warn("[snippets]", s.shown, e); return null; } // the failure costs this key only
      if (typeof r !== "string") return null;
    }
    let out = String(r);
    if (m) out = out.replace(/\[\[(\d+)\]\]/g, (_w, d: string) => m[Number(d) + 1] ?? "");
    return out;
  }

  // --- Backspace gives back what an expansion replaced ------------------------------------------------------------
  /** The last expansion, while nothing has happened since: the text it made is the document's (`doc`, by identity). */
  const lastExpansion = new WeakMap<EditorView, { doc: unknown; from: number; to: number; typed: string }>();

  function write(view: EditorView, s: Compiled, body: string, from: number, to: number, typed: string, visual = ""): void {
    const was = view.state.sliceDoc(from, to) + typed;
    stops.insert(view, body, from, to, visual, s.legacyStops);
    lastExpansion.set(view, { doc: view.state.doc, from, to: from + parseStops(body, visual, s.legacyStops).text.length, typed: was });
  }

  function undoExpansion(view: EditorView): boolean {
    const e = lastExpansion.get(view);
    lastExpansion.delete(view);
    if (!e || e.doc !== view.state.doc) return false;
    view.dispatch({ changes: { from: e.from, to: e.to, insert: e.typed }, selection: { anchor: e.from + e.typed.length }, userEvent: "delete.backward" });
    stops.dropAll(view);
    return true;
  }

  function expand(view: EditorView, s: Compiled, m: RegExpExecArray | null, from: number, to: number, typed = ""): boolean {
    const body = bodyFor(s, m, atOf(view, view.state.sliceDoc(view.state.doc.lineAt(from).from, from)));
    if (body == null) return false;
    if (body instanceof Promise) {
      // a computed answer: written only if the text is as it was when asked
      const doc = view.state.doc;
      void body.then((text) => { if (view.state.doc === doc) write(view, s, text, from, to, typed); else console.warn("[snippets]", s.shown, "answered after the text had changed"); },
        (e) => console.warn("[snippets]", s.shown, e));
      return true;
    }
    write(view, s, body, from, to, typed);
    return true;
  }

  // --- the longest trigger wins -----------------------------------------------------------------------------------
  // Among plain auto snippets of one priority the longest match wins, and one that could still grow into a longer
  // trigger waits for the next key: that key either continues the longer one or releases the waiting one.

  /** `text` ends with a start of `t`'s trigger that contains all of `piece` and is not yet complete. */
  const growsInto = (text: string, piece: string, t: Compiled): boolean => {
    if (!t.auto || !t.plain || t.plain.length <= piece.length || t.visual) return false;
    for (let k = piece.length; k < t.plain.length; k++) {
      const start = t.plain.slice(0, k);
      if (start.endsWith(piece) && text.endsWith(start)) return true;
    }
    return false;
  };

  /** A regex trigger that begins with a sign typed on purpose (`@alpha`, `;b`): never a word in the making, so it never
   *  waits for one. A class (`([^\\])(hbar)`) also matches a space: such a trigger still waits. */
  const signed = (s: Compiled) => !!s.regex && /^\(\?:[^\w\s\\()[\]{}.^$|?*+]/.test(s.regex.source);

  /** A trigger held back (`from`–`to`; `core`: where what it is about starts, `m`: a regex's match), and the caret after
   *  the keys that may still grow it into a longer one. */
  type Waiting = { s: Compiled; m: RegExpExecArray | null; from: number; to: number; core: number; at: number };
  const waiting = new WeakMap<EditorView, Waiting>();
  /** The snippet held back at the last key, if the caret is still where that key left it. */
  function takeWaiting(view: EditorView, head: number): Waiting | null {
    const w = waiting.get(view);
    waiting.delete(view);
    return w && w.at === head && view.state.sliceDoc(w.from, w.to) === (w.m ? w.m[0] : w.s.plain) ? w : null;
  }

  /** Expands a held trigger; what was typed after it (letters that did not become the longer trigger) goes into its
   *  first stop, as if it had expanded at once. */
  function release(view: EditorView, w: Waiting): boolean {
    const tail = view.state.sliceDoc(w.to, w.at);
    if (!expand(view, w.s, w.m, w.from, w.at)) return false;
    if (tail) view.dispatch(view.state.replaceSelection(tail));
    return true;
  }

  const lettersEnd = (s: string) => /[A-Za-z]+$/.exec(s)?.[0] ?? "";

  /** A regex trigger about letters (`dots` of `([^\\])(dots)`) inside a longer word that starts a known command. */
  function cutsCommandInWord(before: string, core: string): boolean {
    if (!/^[A-Za-z]+$/.test(core)) return false;
    const word = lettersEnd(before);
    return word.length > core.length && KNOWN.some((k) => k.startsWith(word));
  }

  /** A letters-only trigger at the end of `before` cuts a command short: right after a backslash (`\langle` being typed),
   *  or inside a longer word that starts a known command (`hbar`, `cdot`). */
  function cutsCommand(before: string, trigger: string): boolean {
    if (!/^[A-Za-z]+$/.test(trigger)) return false;
    const word = lettersEnd(before);
    if (before[before.length - word.length - 1] === "\\") return true;
    return word.length > trigger.length && KNOWN.some((k) => k.startsWith(word));
  }

  /** The letters typed so far are on their way to an ordinary word that holds this trigger (`spi` of `spin`). A
   *  `\command` is no word: `\sing` is a command being typed, and stays the commands' business. */
  function cutsWord(before: string, core: string): boolean {
    if (!/^[A-Za-z]+$/.test(core)) return false;
    const word = lettersEnd(before);
    if (word.length <= core.length || before[before.length - word.length - 1] === "\\") return false;
    const w = word.toLowerCase();
    return DICT.has(w) || DICT.grows(w);
  }

  /** A key that is no letter ends the letters before it: if they stopped short of a word (`spi+`), the trigger they held
   *  back fires now. False when there is none. */
  function releaseHeldByWord(view: EditorView, head: number, typed: string): boolean {
    if (/^[A-Za-z]$/.test(typed)) return false;
    const line = view.state.doc.lineAt(head), word = lettersEnd(view.state.doc.sliceString(Math.max(line.from, head - TAIL), head)).toLowerCase();
    if (!word || DICT.has(word) || !DICT.grows(word)) return false;
    return tryExpand(view, head, "", true, true);
  }

  /** Expands the snippet ending at `head` (with `typed` about to be inserted): the first that matches, or a longer plain
   *  one of the same priority; true when the key was handled. `plainly`: the word list does not hold this one back. */
  function tryExpand(view: EditorView, head: number, typed: string, autoOnly: boolean, plainly = false): boolean {
    if (!SNIPPETS.length) return false;
    const held = takeWaiting(view, head);
    if (!held && !plainly && typed && releaseHeldByWord(view, head, typed)) {
      const at = view.state.selection.main.head;
      if (!tryExpand(view, at, typed, autoOnly)) view.dispatch(view.state.replaceSelection(typed));
      return true;
    }
    const line = view.state.doc.lineAt(head);
    const before = view.state.doc.sliceString(Math.max(line.from, head - TAIL), head) + typed;
    // the place scans the note up to the caret: asked only once a trigger matches the text (most keys match none)
    let place: Place | undefined;
    const here = () => (place ??= placeOf(view, head));
    const startOf = (len: number) => head + typed.length - len; // where in the document a match of that length starts
    const kind = (s: Compiled) => autoOnly === s.auto && !s.visual; // visual ones need a selection
    const whenOk = (s: Compiled, len: number) => !s.when || s.when(atOf(view, before.slice(0, before.length - len)));
    const usable = (s: Compiled) => kind(s) && fits(s, here(), view);
    const plainHit = (s: Compiled) => {
      if (!s.plain || !before.endsWith(s.plain)) return false;
      const start = before.length - s.plain.length;
      if (s.word && start > 0 && /[A-Za-z0-9]/.test(before[start - 1])) return false;
      return !cutsCommand(before, s.plain) && (plainly || !cutsWord(before, s.plain));
    };
    let hit: { s: Compiled; m: RegExpExecArray | null; len: number } | null = null;
    for (const s of SNIPPETS) {
      if (!kind(s)) continue;
      const m = s.regex ? s.regex.exec(before) : null;
      if (s.regex ? !m || cutsCommandInWord(before, coreOf(m)) || (!plainly && cutsWord(before, coreOf(m))) : !plainHit(s)) continue;
      const len = m ? m[0].length : s.plain!.length;
      if (!fits(s, here(), view) || !whenOk(s, len)) continue;
      hit = { s, m, len };
      break;
    }
    if (hit && !hit.s.regex && autoOnly) {
      const first = hit.s;
      for (const s of SNIPPETS) if (s.priority === first.priority && plainHit(s) && s.plain!.length > hit.len && usable(s) && whenOk(s, s.plain!.length)) hit = { s, m: null, len: s.plain!.length };
    }
    // the letters being typed, where they start in the document, and whether they still start a longer command, trigger
    // or word (`sim` of `simeq`, `bra` of `braket`, `the` of `then`)
    const word = lettersEnd(before), wordAt = startOf(word.length);
    const longer = (w: string) => !!w && !plainly && (KNOWN.some((k) => k.length > w.length && k.startsWith(w)) || DICT.grows(w.toLowerCase()));
    // a waiting trigger: kept while the keys still spell a longer one, released first when this key does not
    if (held && (!hit || startOf(hit.len) >= held.to)) {
      const piece = view.state.sliceDoc(held.core, head) + typed;
      const letter = /^[A-Za-z]$/.test(typed) && wordAt <= held.core;
      if (!hit && (SNIPPETS.some((t) => growsInto(before, piece, t) && usable(t)) || (letter && longer(word)))) {
        waiting.set(view, { ...held, at: head + typed.length });
        return false;
      }
      // an ordinary word, whole, as a letter completes it (`then`) or a key ends it (`number `): it stays as typed
      if (!hit && letter && DICT.has(word.toLowerCase())) return false;
      const ended = lettersEnd(view.state.sliceDoc(line.from, head));
      if (!hit && !letter && ended.length > (held.m ? coreOf(held.m) : held.s.plain!).length && DICT.has(ended.toLowerCase())) return false;
      if (!hit && letter && KNOWN.includes(word)) {
        // the key completes a command: after a backslash it stands as typed (`\simeq`, not `\sim eq`); the one the held
        // trigger makes is that trigger (`sqrt` → `sqr`'s `\sqrt{ }`); any other becomes the command (`cdots` → `\cdots`)
        if (before[before.length - word.length - 1] === "\\") return false;
        const body = bodyFor(held.s, held.m, atOf(view, ""));
        if (typeof body === "string" && body.includes("\\" + word)) return expand(view, held.s, held.m, held.from, head);
        view.dispatch({ changes: { from: wordAt, to: head, insert: "\\" + word }, selection: { anchor: wordAt + word.length + 1 }, userEvent: "input.complete" });
        return true;
      }
      if (!release(view, held)) return false;
      const at = view.state.selection.main.head;
      if (typed && !tryExpand(view, at, typed, autoOnly)) view.dispatch(view.state.replaceSelection(typed));
      return true;
    }
    if (!hit) return false;
    const best = hit.s, core = hit.m ? coreOf(hit.m) : best.plain!;
    if (autoOnly && typed && (SNIPPETS.some((t) => t !== best && growsInto(before, core, t) && usable(t)) || (/^[A-Za-z]+$/.test(core) && !signed(best) && longer(word)))) {
      const from = startOf(hit.len), end = head + typed.length;
      waiting.set(view, { s: best, m: hit.m, from, to: end, core: end - core.length, at: end });
      return false; // the key is typed as it is; the next one decides
    }
    return expand(view, best, hit.m, startOf(hit.len), head, typed);
  }

  /** With text selected, typing a visual trigger wraps the selection (select `x`, type `U` → `\underbrace{x}_{…}`). */
  function wrapSelection(view: EditorView, from: number, to: number, typed: string): boolean {
    const place = placeOf(view, from), s = SNIPPETS.find((x) => x.visual && x.plain === typed && fits(x, place, view));
    if (!s) return false;
    const selection = view.state.sliceDoc(from, to);
    const body = bodyFor(s, null, atOf(view, view.state.sliceDoc(view.state.doc.lineAt(from).from, from), selection));
    if (body == null) return false;
    if (body instanceof Promise) {
      const doc = view.state.doc;
      void body.then((text) => { if (view.state.doc === doc) write(view, s, text, from, to, "", selection); }, (e) => console.warn("[snippets]", s.shown, e));
      return true;
    }
    write(view, s, body, from, to, "", selection);
    return true;
  }

  /** A closing bracket typed in front of the same one steps over it, in math. */
  function overtype(view: EditorView, at: number, typed: string): boolean {
    if (!")]}".includes(typed) || view.state.sliceDoc(at, at + 1) !== typed || placeOf(view, at).kind !== "math") return false;
    view.dispatch({ selection: { anchor: at + 1 }, userEvent: "select" });
    return true;
  }

  /** `{` by habit right after `_` or `^` expanded to `_{`: the brace is there already (`G_{ij}` was `G_{{ij}}`). */
  function braceThere(view: EditorView, at: number, typed: string): boolean {
    return typed === "{" && stops.active(view.state) && /[_^]\{$/.test(view.state.sliceDoc(Math.max(0, at - 2), at)) && view.state.sliceDoc(at, at + 1) === "}";
  }

  /** Where Tab would go from the caret (a document position), or null. */
  function taboutFrom(view: EditorView): number | null {
    const { head } = view.state.selection.main;
    // the formula may span lines ($$ … $$): from the caret to a little past it is enough to find its bracket
    const to = nextPlace(view.state.doc.sliceString(head, Math.min(view.state.doc.length, view.state.doc.lineAt(head).to + 4000)));
    return to === null ? null : head + to;
  }

  function moveTo(view: EditorView, to: number | null): boolean {
    if (to === null) return false;
    view.dispatch({ selection: { anchor: to }, scrollIntoView: true });
    return true;
  }

  const tabout = (view: EditorView) => moveTo(view, taboutFrom(view));

  /** Shift+Tab in math: the way Tab came. */
  function tabBack(view: EditorView): boolean {
    const { head } = view.state.selection.main, start = Math.max(0, head - 4000);
    const to = prevPlace(view.state.doc.sliceString(start, head));
    return moveTo(view, to === null ? null : start + to);
  }

  /** Tab right after a waiting trigger expands it. */
  function releaseWaiting(view: EditorView): boolean {
    const w = takeWaiting(view, view.state.selection.main.head);
    return !!w && release(view, w);
  }

  /** One key as the editor gets it; true when it was handled. */
  function key(view: EditorView, from: number, to: number, text: string): boolean {
    if (text.length !== 1 || view.state.selection.ranges.length > 1 || !runsHere(view)) return false;
    if (from !== to) return wrapSelection(view, from, to, text);
    if (braceThere(view, from, text)) return true;
    return tryExpand(view, from, text, true) || overtype(view, from, text);
  }

  const inMath = (view: EditorView) => { const p = placeOf(view, view.state.selection.main.head); return p.kind === "math"; };

  /** Tab's job here: a held trigger, the stops, or math; never in a code file's `$`. */
  const claim = {
    overList(view: EditorView): boolean {
      if (waiting.has(view) || stops.active(view.state)) return true;
      const head = view.state.selection.main.head;
      // a `\command` being typed: its list is walked (`\ga` → \gamma, \Gamma); a whole one is done, Tab moves on
      const command = /\\([A-Za-z]*)$/.exec(view.state.sliceDoc(Math.max(0, head - 40), head));
      if (command && !KNOWN.includes(command[1])) return false;
      return inMath(view);
    },
    whileAsking: (view: EditorView): boolean => waiting.has(view) || stops.active(view.state) || inMath(view),
  };

  const extension: Extension = [
    // ahead of the editor's own bracket closing, in code and .tex files
    Prec.high(View.inputHandler.of((view, from, to, text) => key(view, from, to, text))),
    stops.extension,
    Prec.highest(keymap.of([
      // right after an expansion, what was typed comes back
      { key: "Backspace", run: undoExpansion },
      // Escape leaves the stops and still reaches vim
      { key: "Escape", run: (view) => { stops.dropAll(view); return false; } },
    ])),
    // Tab: a trigger to release or expand, then the next stop of the snippet the caret is in (a placeholder may be
    // selected), then out of the innermost bracket; above indentation
    Prec.high(keymap.of([{
      key: "Tab",
      run: (view) => {
        if (!runsHere(view)) return stops.next(view);
        const empty = view.state.selection.main.empty, head = view.state.selection.main.head;
        if (empty && (releaseWaiting(view) || tryExpand(view, head, "", false) || (!stops.active(view.state) && releaseHeldByWord(view, head, "")))) return true;
        const math = empty && inMath(view);
        // a bracket that closes inside the stop the caret is in is left first: `(x|+y)` typed in `mk`'s `$…$`
        const end = stops.currentEnd(view.state), out = math && end !== null ? taboutFrom(view) : null;
        if (out !== null && out <= end!) return tabout(view);
        return stops.next(view) || (math && tabout(view));
      },
      shift: (view) => stops.prev(view) || (runsHere(view) && view.state.selection.main.empty && inMath(view) && tabBack(view)),
    }])),
  ];

  /** Types `text` into a detached editor at `place`, for the checks in Settings: what comes out. */
  function simulate(text: string, place: Place, start = ""): string {
    const view = new View({ state: cm.state.EditorState.create({ doc: start, selection: { anchor: start.length }, extensions: [stops.extension] }) });
    fixedPlace.set(view, place);
    try {
      for (const ch of text) {
        const { from, to } = view.state.selection.main;
        if (ch === "\t") { if (!tryExpand(view, from, "", false)) stops.next(view); continue; }
        if (!key(view, from, to, ch)) view.dispatch(view.state.replaceSelection(ch));
      }
      return view.state.doc.toString();
    } finally { view.destroy(); }
  }

  return { extension, claim, use, loadWords, simulate, insert: stops.insert, snippets: () => SNIPPETS, fits, placeOf };
}
