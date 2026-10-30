// What plugins add to the editor (`atlas.editor.*`, docs/guides/PLUGINS.md "v4"): completions, keys,
// paste / drop handlers, decorations for a pattern, and — the escape hatch — raw CodeMirror
// extensions. One extension per editor (`pluginHooks`) reads module-level lists at the moment of
// use, so a plugin registering, changing or leaving needs no rebuild of the editor; only the
// decorations and the raw extensions are pushed to open editors. Every plugin function runs
// through `guard`: a failure is a line in that plugin's log and costs nothing else.
import { Compartment, EditorState, Facet, Prec, StateEffect, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import { matches, parseChord, type Chord } from "../keys";
import { guard, logPlugin } from "../plugin-log.svelte";
import { escapeRegExp } from "../text";

export type Where = "note" | "code" | "all";
const applies = (where: Where | undefined, md: boolean) => !where || where === "all" || (where === "note") === md;

// --- the plain shapes plugins see (they survive a change of the editor library) -----------------------

export interface CompletionItem {
  label: string; detail?: string; /** what is written (default: the label) */ insert?: string; kind?: string;
  /** Does the writing itself, instead of `insert`: a snippet with stops. */
  apply?(view: EditorView, from: number, to: number): void;
  /** The panel beside the list when this entry is selected. */
  info?(): HTMLElement;
}
/** Where a completion is asked. `view`, `pos`, `explicit` (asked for by hand) go with the editor library. */
export interface CompletionAt { path: string; line: number; before: string; word: string; view: EditorView; pos: number; explicit: boolean }
/** A list, with `from` when it replaces something other than what the trigger matched. */
export type CompletionAnswer = CompletionItem[] | { items: CompletionItem[]; from: number } | null | undefined;
export interface CompletionSpec {
  where?: Where;
  /** Offer only when the text before the caret ends like this; what it matched is what an item replaces.
   *  Without it: after a word of two letters or more, and the word is replaced. */
  trigger?: RegExp | string;
  /** Synchronous, so a list closes as soon as it no longer applies (completion-gate.ts); default: the trigger alone. */
  applies?(at: { path: string; before: string; view: EditorView; pos: number; explicit: boolean }): boolean;
  complete(at: CompletionAt): CompletionAnswer | Promise<CompletionAnswer>;
}
/** What a key handler gets: the place, and the two edits nearly every key wants. */
export interface EditorTouch { path: string; line: number; selection: string; replace(text: string): void; insert(text: string): void }
export interface PasteData { text: string; html: string; files: File[]; path: string }
export type PasteHandler = (data: PasteData) => string | null | undefined | Promise<string | null | undefined>;
export interface DecorationSpec { class?: string; title?: string; /** draws instead of the matched text (the text shows again while the caret is in it) */ replace?(host: HTMLElement): void | (() => void) }

// --- the lists ------------------------------------------------------------------------------------------

const completions = new Set<{ plugin: string; spec: CompletionSpec; trigger: RegExp }>();
const keys = new Set<{ plugin: string; chord: Chord; label: string; where?: Where; run(t: EditorTouch): boolean | void }>();
const pastes = new Set<{ plugin: string; fn: PasteHandler }>();
const drops = new Set<{ plugin: string; fn: PasteHandler }>();
const patterns = new Set<{ plugin: string; re: RegExp; render(m: RegExpExecArray): DecorationSpec | null | undefined | void }>();
const raws = new Set<{ plugin: string; ext: Extension }>();

const refresh = StateEffect.define<null>();
const live = new Map<EditorView, Compartment>(); // open editors, each with the slot its raw extensions sit in
const redraw = () => { for (const v of live.keys()) v.dispatch({ effects: refresh.of(null) }); };
function pushRaw(): void {
  for (const [v, slot] of live) {
    try { v.dispatch({ effects: slot.reconfigure([...raws].map((r) => r.ext)) }); }
    catch (e) {
      // one of them is not an extension the editor accepts: find it, log it, go on without it
      for (const r of [...raws]) {
        try { v.dispatch({ effects: slot.reconfigure(r.ext) }); } catch (bad) { raws.delete(r); logPlugin(r.plugin, "editor.extension", bad); }
      }
      try { v.dispatch({ effects: slot.reconfigure([...raws].map((r) => r.ext)) }); } catch { logPlugin("atlas", "editor.extension", e); }
    }
  }
}
const add = <T>(set: Set<T>, item: T, changed?: () => void) => { set.add(item); changed?.(); return () => { set.delete(item); changed?.(); }; };

const WORD = /[\w-]{2,}$/;
export function registerCompletion(plugin: string, spec: CompletionSpec): () => void {
  const t = spec.trigger;
  const trigger = t === undefined ? WORD : new RegExp(`(?:${typeof t === "string" ? escapeRegExp(t) : t.source})$`, typeof t === "string" ? "" : t.flags.replace(/[gy]/g, ""));
  return add(completions, { plugin, spec, trigger });
}
export function registerEditorKey(plugin: string, chord: string, run: (t: EditorTouch) => boolean | void, where?: Where): () => void {
  const c = parseChord(chord);
  if (!c) throw new Error(`editor.registerKey: "${chord}" is not a key (write it like Ctrl+Alt+K)`);
  return add(keys, { plugin, chord: c, label: chord, where, run });
}
export const registerPaste = (plugin: string, fn: PasteHandler) => add(pastes, { plugin, fn });
export const registerDrop = (plugin: string, fn: PasteHandler) => add(drops, { plugin, fn });
export function registerDecoration(plugin: string, pattern: RegExp, render: (m: RegExpExecArray) => DecorationSpec | null | undefined | void): () => void {
  if (!(pattern instanceof RegExp)) throw new Error("editor.registerDecoration: the pattern must be a regular expression");
  return add(patterns, { plugin, re: new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, "") + "g"), render }, redraw);
}
/** The escape hatch: a CodeMirror 6 extension, as it is. Unstable by nature (the library's own API). */
export function registerExtension(plugin: string, ext: Extension): () => void {
  // tried on an empty document first: something the editor refuses must never reach a real one
  // (an editor is built with every raw extension in it, and would not open at all)
  try { EditorState.create({ extensions: ext }); }
  catch (e) { logPlugin(plugin, "editor.extension", e); return () => {}; }
  return add(raws, { plugin, ext }, pushRaw);
}

// --- Tab ------------------------------------------------------------------------------------------------

/** A plugin that does something with Tab of its own, and says when the completion list must leave it alone. */
export interface TabClaim {
  /** With a list on screen: Tab is the plugin's, the list is taken with Enter. */
  overList(view: EditorView): boolean;
  /** With a list still on its way: Tab does not wait for it. */
  whileAsking(view: EditorView): boolean;
}
const tabClaims = new Set<{ plugin: string; claim: TabClaim }>();
export const registerTabClaim = (plugin: string, claim: TabClaim) => add(tabClaims, { plugin, claim });
export const tabOverList = (v: EditorView) => [...tabClaims].some((c) => guard(c.plugin, "tab claim", () => c.claim.overList(v), false));
export const tabWhileAsking = (v: EditorView) => [...tabClaims].some((c) => guard(c.plugin, "tab claim", () => c.claim.whileAsking(v), false));

/** The file an editor shows. */
export const editorPath = Facet.define<string, string>({ combine: (v) => v[0] ?? "" });

// --- completion -----------------------------------------------------------------------------------------

/** Does any plugin's completion answer here? Its trigger decides, or asking for the list by hand. */
export function pluginCompletionApplies(ctx: CompletionContext, md: boolean): boolean {
  if (ctx.explicit) return [...completions].some((c) => applies(c.spec.where, md));
  const line = ctx.state.doc.lineAt(ctx.pos), before = line.text.slice(0, ctx.pos - line.from);
  return [...completions].some((c) => applies(c.spec.where, md) && c.trigger.test(before) && (!c.spec.applies || !ctx.view || guard(c.plugin, "completion", () => c.spec.applies!({ path: ctx.state.facet(editorPath), before, view: ctx.view!, pos: ctx.pos, explicit: false }), false)));
}

export function pluginCompletions(path: string, md: boolean): CompletionSource {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const line = ctx.state.doc.lineAt(ctx.pos), before = line.text.slice(0, ctx.pos - line.from);
    const options: Completion[] = [];
    let from = ctx.pos;
    for (const c of completions) {
      if (!applies(c.spec.where, md)) continue;
      const hit = c.trigger.exec(before);
      if (!hit && !ctx.explicit) continue;
      const word = hit?.[0] ?? "";
      const at: CompletionAt = { path, line: line.number, before, word, view: ctx.view!, pos: ctx.pos, explicit: ctx.explicit };
      const answer = await guard(c.plugin, "completion", () => Promise.resolve(c.spec.complete(at)), Promise.resolve(null));
      const items = Array.isArray(answer) ? answer : answer?.items;
      if (ctx.aborted || !items?.length) continue;
      from = Math.min(from, Array.isArray(answer) || !answer ? ctx.pos - word.length : answer.from);
      // without a trigger the word typed is a filter on the labels; with one, the plugin decided what fits
      const fits = (label: string) => c.spec.trigger !== undefined || label.toLowerCase().includes(word.toLowerCase());
      for (const it of items) if (it && typeof it.label === "string" && fits(it.label)) options.push({ label: it.label, detail: it.detail, info: it.info, apply: it.apply ? (view: EditorView, _c: Completion, f: number, t: number) => it.apply!(view, f, t) : it.insert ?? it.label, type: it.kind });
    }
    return options.length ? { from, options, filter: false } : null;
  };
}

// --- decorations ----------------------------------------------------------------------------------------

class PluginWidget extends WidgetType {
  private clean: (() => void) | void = undefined;
  constructor(private plugin: string, private text: string, private draw: (host: HTMLElement) => void | (() => void)) { super(); }
  eq(o: PluginWidget): boolean { return o.plugin === this.plugin && o.text === this.text && o.draw === this.draw; }
  toDOM(): HTMLElement {
    const host = document.createElement("span");
    host.className = "cm-plugin-widget";
    this.clean = guard(this.plugin, "decoration", () => this.draw(host), undefined);
    return host;
  }
  destroy(): void { if (typeof this.clean === "function") this.clean(); }
  ignoreEvent(): boolean { return true; } // what happens in the drawing is the plugin's
}

function decorate(view: EditorView): DecorationSet {
  const found: Range<Decoration>[] = [], sel = view.state.selection.main;
  for (const p of patterns) {
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.sliceDoc(from, to);
      p.re.lastIndex = 0;
      for (let m = p.re.exec(text), n = 0; m && n < 2000; m = p.re.exec(text), n++) {
        if (!m[0]) { p.re.lastIndex++; continue; }
        const a = from + m.index, b = a + m[0].length, hit = m;
        const spec = guard(p.plugin, "decoration", () => p.render(hit), null);
        if (!spec) continue;
        const draw = spec.replace;
        if (draw && (sel.from > b || sel.to < a)) found.push(Decoration.replace({ widget: new PluginWidget(p.plugin, m[0], draw) }).range(a, b));
        else if (spec.class || spec.title) found.push(Decoration.mark({ class: spec.class, attributes: spec.title ? { title: spec.title } : undefined }).range(a, b));
      }
    }
  }
  // sorted, and a replaced range never overlaps another decoration (the editor would throw)
  found.sort((x, y) => x.from - y.from || x.to - y.to);
  const kept: Range<Decoration>[] = [];
  let end = -1;
  for (const d of found) if (d.from >= end) { kept.push(d); end = d.to; }
  return Decoration.set(kept);
}

// --- the extension each editor carries -------------------------------------------------------------------

export function pluginHooks(path: string, md: boolean): Extension {
  const slot = new Compartment();
  const touch = (view: EditorView): EditorTouch => {
    const s = view.state.selection.main;
    return {
      path, line: view.state.doc.lineAt(s.head).number, selection: view.state.sliceDoc(s.from, s.to),
      replace: (text) => view.dispatch(view.state.replaceSelection(String(text)), { userEvent: "input", scrollIntoView: true }),
      insert: (text) => view.dispatch({ changes: { from: view.state.selection.main.head, insert: String(text) }, selection: { anchor: view.state.selection.main.head + String(text).length }, userEvent: "input", scrollIntoView: true }),
    };
  };
  /** Paste or drop: the first handler that answers with text wins; one that answers later (a promise)
   *  takes the event at once and falls back to the plain text when it has nothing. */
  const incoming = (set: Set<{ plugin: string; fn: PasteHandler }>, what: string) => (e: ClipboardEvent | DragEvent, view: EditorView): boolean => {
    if (!set.size) return false;
    const dt = "clipboardData" in e ? e.clipboardData : e.dataTransfer;
    if (!dt) return false;
    const data: PasteData = { text: dt.getData("text/plain"), html: dt.getData("text/html"), files: [...dt.files], path };
    for (const h of set) {
      const r = guard(h.plugin, what, () => h.fn(data), null);
      if (typeof r === "string") { e.preventDefault(); touch(view).replace(r); return true; }
      if (r instanceof Promise) {
        e.preventDefault();
        void r.then((text) => touch(view).replace(typeof text === "string" ? text : data.text), () => touch(view).replace(data.text));
        return true;
      }
    }
    return false;
  };
  const marks = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) { live.set(view, slot); this.decorations = decorate(view); }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.some((t) => t.effects.some((e) => e.is(refresh)))) this.decorations = decorate(u.view);
    }
    destroy(): void { live.delete(this.view); }
  }, { decorations: (v) => v.decorations });
  return [
    editorPath.of(path),
    Prec.highest(EditorView.domEventHandlers({
      keydown: (e, view) => {
        for (const k of keys) {
          if (!applies(k.where, md) || !matches(k.chord, e)) continue;
          if (guard(k.plugin, `key ${k.label}`, () => k.run(touch(view)), false) === false) continue; // not taken: the key goes on
          e.preventDefault();
          return true;
        }
        return false;
      },
      paste: incoming(pastes, "paste"),
      drop: incoming(drops, "drop"),
    })),
    marks,
    slot.of([...raws].map((r) => r.ext)),
  ];
}
