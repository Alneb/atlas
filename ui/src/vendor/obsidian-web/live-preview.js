// Vendored verbatim from obsidian-web: web/src/engine/cm/live-preview.js (git 521197e, copied 2026-10-05).
// Do not edit here; fix upstream and re-copy. Types: ./live-preview.d.ts

// Obsidian-style live preview for CodeMirror 6.
//
// THE IDEA
// --------
// There is exactly one document and it is the raw markdown file. Nothing here
// ever edits it. Every effect below is a *decoration*: a hint to CodeMirror about
// how to draw a range of existing text. Syntax marks are hidden while the caret
// is elsewhere and reappear the moment the caret enters the construct, which is
// what produces the "it renders as I type" feel without a second document model.
//
// That is the whole reason this file exists instead of a WYSIWYG library: a
// library would parse to a document model and regenerate markdown on save,
// silently rewriting the wikilinks, embeds and callouts this vault is full of.
// Here, text we fail to parse is merely text we fail to decorate.
//
// CLASS NAMES
// -----------
// Obsidian's own class names are reused (cm-header-N, cm-hmd-internal-link,
// cm-formatting, cm-highlight...) so existing themes and CSS snippets written
// against Obsidian have a chance of applying unchanged.

import { Decoration, EditorView, WidgetType, keymap } from "@codemirror/view";
import { StateField, StateEffect, Prec } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isIconToken } from "./obsidian-syntax.js";

// --- reveal rule ------------------------------------------------------------

/**
 * Should this construct show its raw source?
 *
 * True when any selection range touches [from, to] -- inclusive at both edges,
 * so arrowing onto the final character of a link still reveals its brackets
 * rather than making the caret appear to sit inside invisible text.
 */
function revealed(state, from, to) {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

// --- widgets ----------------------------------------------------------------

/**
 * Base for widgets keyed by a single string. CodeMirror calls eq() to decide
 * whether it may keep the existing DOM; without it every keystroke would discard
 * and rebuild every visible widget, which is the usual cause of a janky live
 * preview.
 */
class KeyedWidget extends WidgetType {
  constructor(key) {
    super();
    this.key = key;
  }
  eq(other) {
    return other.constructor === this.constructor && other.key === this.key;
  }
  ignoreEvent() {
    return false;
  }
}

/**
 * An Iconize icon: `:LiInbox:` becomes the glyph the reader draws.
 *
 * The DOM comes from the app (see the `icon` option) rather than being built
 * here, for the same reason rendered blocks do: the reader's icon set, its
 * async loading and its fallbacks already exist, and a second implementation
 * would drift from the first.
 */
class IconWidget extends KeyedWidget {
  constructor(name, render) {
    super(name);
    this.render = render;
  }
  toDOM() {
    // A name the app cannot resolve falls back to the literal source text, which
    // is what the reader shows too -- never an empty box that looks like the
    // character was eaten.
    return this.render(this.key) || document.createTextNode(`:${this.key}:`);
  }
  ignoreEvent() {
    return true;
  }
}

/** Inline HTML elements drawn as themselves (a mark with that tagName) in the editor. */
const INLINE_HTML = new Set(["u", "sup", "sub", "b", "i", "em", "strong", "mark", "s", "del", "ins", "kbd", "small", "big", "span", "font", "abbr", "cite", "q", "var", "samp", "code"]);
/** Void elements, rendered by the app's sanitizer into a widget. */
const VOID_HTML = new Set(["br", "img", "hr", "wbr"]);

/** Safe attributes for a mark: colour/style for span and font, title for abbr. */
function htmlAttributes(tag, attrText) {
  const attrs = {};
  for (const [, k, , v1, v2] of attrText.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const v = v1 ?? v2 ?? "";
    const key = k.toLowerCase();
    if (key === "style" && !/url\(|expression/i.test(v)) attrs.style = v;
    else if (key === "color" && tag === "font") attrs.style = `color: ${v}`;
    else if (key === "title") attrs.title = v;
    else if (key === "class") attrs.class = v;
  }
  return attrs;
}

/** An inline void element (`<br>`, `<img …>`) as the app's sanitized HTML. */
class InlineHtmlWidget extends KeyedWidget {
  constructor(source, html, hydrate, release) {
    super(source);
    this.html = html;
    this.hydrate = hydrate;
    this.release = release;
  }
  destroy(dom) {
    unwatchSize(dom);
    if (this.release) this.release(dom);
  }
  toDOM(view) {
    const host = document.createElement("span");
    host.className = "cm-inline-html";
    host.innerHTML = this.html;
    if (this.hydrate) this.hydrate(host);
    watchSize(host, view); // an inline embed (a picture, a drawing) grows after it is drawn too
    return host;
  }
}

/**
 * An embedded image: ![[pic.png]] or ![alt](pic.png).
 *
 * NEVER REPLACE THE ROOT NODE THIS RETURNS. CodeMirror keeps a reference to it
 * in its view tree, so swapping it for a different element leaves the tree
 * pointing at a node that is no longer in the document. The DOMObserver then
 * sees an unexplained mutation inside `.cm-content`, gives up on the view tree
 * and READS THE DOCUMENT BACK OUT OF THE DOM -- and what it can see is only the
 * visible text, so every range this layer had hidden is deleted from the file.
 *
 * That was not theoretical. `img.replaceWith(chip(...))` in the old error
 * handler destroyed image links on load failure: moving the caret onto a line
 * holding `![alt](https://…)` rewrote it to a bare `https://…` in the note, with
 * no typing involved -- measured on
 * .obsidian/snippets/…/03-float-callout.md, where line 22 lost its `![alt](` and
 * `)` the moment the caret walked over it. Any offline moment or dead remote URL
 * was enough to trigger it.
 *
 * So the root is a stable wrapper and the fallback is swapped INSIDE it. A
 * mutation inside a widget's own DOM is one CodeMirror expects and ignores.
 */
class ImageWidget extends KeyedWidget {
  /** `opts`: Obsidian's `|600` / `|600x400` size and the vault's `|center` (from its CSS snippet). */
  constructor(src, resolve, opts = {}) {
    super(src + "\u0000" + (opts.width ?? "") + (opts.center ? "c" : ""));
    this.src = src;
    this.resolve = resolve;
    this.opts = opts;
  }
  toDOM(view) {
    const host = document.createElement("span");
    host.className = "cm-embed-image-host" + (this.opts.center ? " is-centered" : "");
    // The picture arrives after the editor measured its lines: without a new measure the
    // gutter (fold arrows, line numbers) below it stays where the lines used to be.
    const remeasure = () => view?.requestMeasure();
    const img = document.createElement("img");
    img.className = "cm-embed-image";
    img.src = this.resolve(this.src);
    img.alt = this.src;
    if (this.opts.width) img.style.width = `${this.opts.width}px`;
    // A broken embed must not collapse to an invisible 0x0 box, or the line
    // looks empty and unclickable -- but the swap happens one level down.
    // A remote URL that is not an image (a video page) becomes a link instead.
    img.addEventListener("load", remeasure);
    img.addEventListener("error", () => {
      remeasure();
      if (/^https?:/.test(this.src)) {
        const a = document.createElement("a");
        a.className = "cm-embed-link";
        a.href = this.src;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = /youtu\.?be/.test(this.src) ? `▶ ${this.src}` : this.src;
        host.replaceChildren(a);
      } else host.replaceChildren(chip("cm-embed-missing", this.src));
    });
    host.appendChild(img);
    return host;
  }
}

/** `![[pic.png | center | 600]]` → the size/placement options after the target. */
function embedOptions(text) {
  const opts = {};
  for (const part of text.split("|").slice(1).map((p) => p.trim())) {
    const m = /^(\d+)(?:x\d+)?$/.exec(part);
    if (m) opts.width = Number(m[1]);
    else if (part === "center") opts.center = true;
  }
  return opts;
}

/** A non-image embed (a transcluded note), shown as a chip until opened. */
class EmbedChipWidget extends KeyedWidget {
  toDOM() {
    return chip("cm-embed-chip", this.key);
  }
}

/** A formula and the punctuation after it, kept on one line (Atlas). */
const MATH_GLUE = Decoration.mark({ class: "cm-math-glue", inclusiveStart: true }); // inclusive: opens before the formula's widget, so it wraps it

/** Rendered math, or the source in a styled box when no renderer is supplied. */
class MathWidget extends KeyedWidget {
  constructor(source, block, render) {
    super((block ? "B" : "I") + source);
    this.source = source;
    this.block = block;
    this.render = render;
  }
  toDOM() {
    const host = document.createElement(this.block ? "div" : "span");
    host.className = this.block ? "cm-math-block" : "cm-math-inline";
    if (this.render) {
      try {
        this.render(host, this.source, this.block);
        return host;
      } catch (err) {
        // A malformed formula must not take the editor down with it.
        host.classList.add("cm-math-error");
      }
    }
    host.textContent = this.source;
    return host;
  }
}

/**
 * The word shown in place of a callout's `[!type]` marker when the author gave
 * no title of their own -- Obsidian shows "Note", "Warning", and so on.
 */
/** Callouts whose fold the user flipped (by their title line's start), mapped through edits. */
const toggleCalloutFold = StateEffect.define();
/** Rebuild the decorations although nothing in the document moved: the app changed what a
 *  builder draws (a setting, such as how a note's properties are shown). */
export const redecorate = StateEffect.define();
export const calloutFolds = StateField.define({
  create: () => [],
  update(list, tr) {
    let out = tr.docChanged ? list.map((p) => tr.changes.mapPos(p)) : list;
    for (const e of tr.effects) if (e.is(toggleCalloutFold)) out = out.includes(e.value) ? out.filter((p) => p !== e.value) : [...out, e.value];
    return out;
  },
});
const isToggled = (state, pos) => (state.field(calloutFolds, false) ?? []).includes(pos);

/** The chevron after a foldable callout's title: a button, so clicking it never reveals the source. */
class CalloutFoldWidget extends WidgetType {
  constructor(folded) { super(); this.folded = folded; }
  eq(o) { return o.folded === this.folded; }
  toDOM(view) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cm-callout-fold" + (this.folded ? " is-folded" : "");
    b.setAttribute("aria-label", this.folded ? "Expand callout" : "Collapse callout");
    b.textContent = "›";
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = view.state.doc.lineAt(view.posAtDOM(b)).from;
      view.dispatch({ effects: toggleCalloutFold.of(pos) });
    });
    return b;
  }
  ignoreEvent() { return true; }
}

class CalloutLabelWidget extends KeyedWidget {
  toDOM() {
    return chip("cm-callout-label", this.key.charAt(0).toUpperCase() + this.key.slice(1));
  }
}

/**
 * The stand-in for a note's YAML frontmatter: the read view's properties table
 * when the app supplies one, and a bare "Properties" chip when it does not.
 *
 * Built by the caller for the same reason `InlineTitleWidget` is -- this widget
 * knows WHERE the properties go, not what a property looks like. The read view
 * draws the same element from the same builder, which is what stops the two
 * views from disagreeing about a note's own metadata.
 *
 * Clicking it reveals the raw YAML, by the same route a rendered block uses.
 * That gesture is the editor's answer to "show me the source", and it is why the
 * table here is read-only: the bytes it describes are live text in this very
 * document, so the one way to change them from edit mode is to edit them.
 */
class PropertiesWidget extends KeyedWidget {
  constructor(key, render) {
    super(key);
    this.render = render;
  }
  toDOM(view) {
    const host = (this.render && this.render()) || chip("cm-properties", "Properties");
    enterOnClick(host, view);
    return host;
  }
  ignoreEvent() {
    return true;
  }
}

/**
 * The note's inline title, shown above the first line.
 *
 * It decorates a ZERO-LENGTH range at offset 0, so it adds a block to the view
 * without claiming any text: the title is the filename and there is nothing in
 * the document to replace. `side: -1` puts it ahead of anything else anchored at
 * 0 -- notably the frontmatter chip, which is where the reader puts it too.
 *
 * The element itself is built by the caller (the read view's own builder), which
 * is the point: this widget knows how to place a title, not how one looks.
 */
class InlineTitleWidget extends KeyedWidget {
  constructor(key, render) {
    super(key);
    this.render = render;
  }
  toDOM() {
    return this.render() || document.createElement("h1");
  }
  ignoreEvent() {
    return true;
  }
}

/** A drawn horizontal rule replacing the literal '---'. */
class RuleWidget extends KeyedWidget {
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-hr";
    return hr;
  }
}

function chip(cls, text) {
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text;
  return span;
}

// --- helpers ----------------------------------------------------------------

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp)(#|\?|$)/i;

/** Heading depth from the node name, e.g. ATXHeading3 -> 3. */
function headingLevel(name) {
  const m = /^ATXHeading(\d)$/.exec(name);
  return m ? Number(m[1]) : 0;
}

/* --- lists -------------------------------------------------------------
 *
 * The reader emits real <ul>/<ol> elements and lets the browser draw the
 * markers and the 28px indent. The editor has no such elements -- a list is
 * just a run of ordinary lines whose text happens to start with "- " or "1." --
 * so both the indent and the marker have to be rebuilt from the syntax tree.
 *
 * The geometry is deliberately the reader's: LIST_INDENT matches the
 * `padding-left` on `.markdown ul, .markdown ol` in redesign.css. Keep the two
 * in step, or the same list lands at a different x in the two modes.
 */
const LIST_INDENT = 28;
const MAX_LIST_DEPTH = 6;

/** How deeply a ListItem nests, counting the lists it sits inside (1-based). */
function listDepth(node) {
  let depth = 0;
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === "BulletList" || p.name === "OrderedList") depth++;
  }
  return Math.min(Math.max(depth, 1), MAX_LIST_DEPTH);
}

/**
 * The bullet or number standing in for the source marker.
 *
 * It is `inline-block` at exactly LIST_INDENT wide so that, combined with the
 * line's hanging indent, the item's text starts on the same column as the
 * reader's <li> -- and wrapped lines line up under it rather than under the
 * marker.
 */
class ListMarkWidget extends WidgetType {
  constructor(label, ordered) {
    super();
    this.label = label;
    this.ordered = ordered;
  }
  eq(other) {
    return other.label === this.label && other.ordered === this.ordered;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = `cm-list-mark${this.ordered ? " cm-list-mark-ordered" : ""}`;
    // A bullet list's "-", "*" and "+" all mean the same thing and the reader
    // shows none of them: it draws a disc. An ordered list's number carries
    // real information, so it is kept verbatim.
    span.textContent = this.ordered ? this.label : "•";
    return span;
  }
}

/** A task checkbox, matching the reader's `li > input[type=checkbox]`. */
class TaskMarkWidget extends WidgetType {
  constructor(checked, toggle) {
    super();
    this.checked = checked;
    this.toggle = toggle;
  }
  eq(other) {
    return other.checked === this.checked;
  }
  toDOM(view) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-task-mark";
    // Toggling is an edit, and the edit has to go through the document rather
    // than the DOM -- letting the box flip on its own would show a state the
    // markdown does not have. (Atlas: a click now makes that edit, `[ ]` ↔ `[x]`.)
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const line = view.state.doc.lineAt(view.posAtDOM(box));
      if (this.toggle && this.toggle(view, line.number)) return; // Atlas: the caller's tick (done date, recurrence)
      const m = /\[( |x|X)\]/.exec(line.text);
      if (!m) return;
      const at = line.from + m.index + 1;
      view.dispatch({ changes: { from: at, to: at + 1, insert: m[1] === " " ? "x" : " " } });
    });
    return box;
  }
}

/** Inline constructs whose marks are hidden and whose body gets a class. */
const INLINE_STYLED = {
  FootnoteRef: "cm-footnote-ref",
  FootnoteLabel: "cm-footnote-label",
  StrongEmphasis: "cm-strong",
  Emphasis: "cm-em",
  Strikethrough: "cm-strikethrough",
  Highlight: "cm-highlight",
  InlineCode: "cm-inline-code",
};

/** Mark nodes -- the punctuation that live preview hides. */
const MARK_NODES = new Set([
  "FootnoteMark",
  "EmphasisMark",
  "StrikethroughMark",
  "HighlightMark",
  "CodeMark",
  "LinkMark",
  "WikilinkMark",
  "MathMark",
]);

/** Callout syntax on a blockquote's first line: "> [!note] Optional title". */
const CALLOUT_RE = /^>\s*\[!([A-Za-z-]+)\]([+-]?)\s*/;

/**
 * End offset of a YAML frontmatter block, or 0 when the note has none.
 *
 * The markdown parser has no notion of frontmatter, so it reads `---` as a
 * horizontal rule and `title: x` as a paragraph -- which is why an unhandled
 * frontmatter block used to render as two rules with prose between them. The
 * block only counts when it opens on the very first line, which is also YAML's
 * own rule, and it is left as plain (dimmed) text rather than hidden: the
 * properties panel is the place to edit it, but silently swallowing lines of a
 * file the user is editing is worse than showing them.
 */
function frontmatterEnd(state) {
  if (state.doc.lines < 2 || state.doc.line(1).text.trim() !== "---") return 0;
  for (let n = 2; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const text = line.text.trim();
    if (text === "---" || text === "...") return line.to;
  }
  return 0; // unterminated: not frontmatter, just a rule and some text
}

/**
 * Where the caret should start in a freshly opened note: after the frontmatter.
 *
 * Position 0 is *inside* the frontmatter, which reveals it -- so opening any of
 * the vault's notes with properties would dump you straight into raw YAML and
 * the collapsed chip would look permanently stuck open. The body is where you
 * actually want to be typing.
 *
 * @param {import("@codemirror/state").Text} doc
 * @returns {number} an offset safe to use as an initial selection
 */
export function bodyStart(doc) {
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return 0;
  for (let n = 2; n <= doc.lines; n++) {
    const text = doc.line(n).text.trim();
    if (text === "---" || text === "...") {
      // The line after the closing fence, when the note has one.
      return n < doc.lines ? doc.line(n + 1).from : doc.line(n).to;
    }
  }
  return 0;
}

/**
 * Fill in option defaults. Kept in one place so the exported builder and the
 * ViewPlugin can never disagree about what a missing option means.
 */
function normalizeOptions(options) {
  return {
    resolveAttachment: options.resolveAttachment || ((path) => path),
    // Whether a wikilink target exists. Defaults to "yes" so an app that does
    // not know (no vault index) draws every link as a normal link, rather than
    // dimming the whole document as if nothing resolved.
    linkResolves: options.linkResolves || (() => true),
    // Syntax highlighting inside fenced code blocks, as [{from,to,cls}] ranges
    // over the code text. Defaults to none, which leaves code as plain
    // monospace -- the behaviour before this was wired in.
    highlightCode: options.highlightCode || (() => []),
    renderMath: options.renderMath || null,
    // The two halves of "render this block the way the read view does". Split in
    // two on purpose: blockHtml() runs inside buildDecorations, i.e. on every
    // keystroke, so it must be a cheap lookup; hydrateBlock() does the expensive
    // DOM work and only runs when CodeMirror actually builds a widget.
    blockHtml: options.blockHtml || (() => null),
    hydrateBlock: options.hydrateBlock || null,
    releaseBlock: options.releaseBlock || null,
    // The note's inline title, which lives OUTSIDE the document: it is the
    // filename, not text anyone can edit here. Same cheap-key/expensive-render
    // split as above, in one object so a key can never arrive without the
    // builder that matches it.
    inlineTitle: options.inlineTitle || (() => null),
    // The note's frontmatter, drawn the way the read view draws it. Same shape
    // and same reasoning as `inlineTitle`; the default of "no builder" leaves
    // the plain "Properties" chip, so a caller that knows nothing about
    // properties (a block editor, a unit test) still gets a sane widget.
    noteProperties: options.noteProperties || (() => null),
    // `<img …>` / `<br>` source -> sanitized HTML for an inline widget, or null to leave the text.
    inlineHtml: options.inlineHtml || (() => null),
    // (view, line number) -> true when the caller ticked the task its own way; else the box flips `[ ]` <-> `[x]`.
    toggleTask: options.toggleTask || null,
    // `:LiInbox:` -> the reader's icon element, or null for a name it does not
    // know (in which case the raw text stays, exactly as the reader leaves it).
    icon: options.icon || (() => null),
  };
}

/**
 * Block-level node types rendered by the APP'S OWN RENDERER rather than by
 * decorations, whenever the caret is elsewhere.
 *
 * This is the dividing line that makes the editor and the read view the same
 * picture. Decorations are good at inline, caret-adjacent constructs -- bold,
 * links, tags -- where the point is that the raw text stays put and only its
 * punctuation hides. They are hopeless at anything the reader produces with
 * JavaScript: raw HTML, `base` embeds, task queries, interactive tables. Those
 * are not markdown at all, so no amount of decoration work can reach them.
 *
 * So for these node types the whole block is replaced by the very HTML
 * `renderReader()` would have shown, and the caret entering the block puts the
 * raw markdown back to edit. Paragraphs, headings, lists and plain quotes are
 * deliberately NOT here: those stay live-decorated, because being able to type
 * straight into them is the entire point of live preview.
 */
/** Every `![[target]]` in a chunk of source. */
const EMBED_RE = /!\[\[([^\]|#]+)/g;

/**
 * A callout marker at quote depth two or more: `> > [!note]`, `> > > [!tip]`.
 *
 * Multiline, because the nested marker is never on the block's first line -- the
 * first line is what opens the OUTER callout.
 */
const NESTED_CALLOUT_RE = /^>[^\S\n]*(?:>[^\S\n]*)+\[!/m;

/**
 * Does this block go through the app's renderer rather than through decorations?
 *
 * Beyond the fixed list below: any paragraph containing a **transclusion** -- an
 * `![[...]]` that is not an image. This was the single biggest gap in the
 * editor. A transclusion is not a picture, it is a whole note, base or table
 * that the reader EXPANDS, and no decoration can do that. Measured on
 * notes/indexes/Status.md, which is little more than two `![[….base]]` lines:
 * the read view produced 586 text runs, the editor 6, because each embed was
 * drawn as a one-word chip.
 *
 * Note it is the whole PARAGRAPH, not the embed line alone. This vault writes
 *
 *     [[02_status.base|Status Base]]
 *     ![[02_status.base]]
 *
 * with no blank line, so both lines are one paragraph -- and the server splits
 * blocks on blank lines too, which is what makes the source text a usable key.
 *
 * IMAGE embeds are deliberately excluded: `![[photo.png]]` renders inline via
 * ImageWidget and keeps the surrounding prose editable, which is what Obsidian
 * does and what live preview is for.
 */
function rendersAsBlock(name, node, state) {
  if (RENDERED_BLOCKS.has(name)) return true;

  // NESTED callouts only -- a callout that contains another callout.
  //
  // The decoration layer draws a callout by tinting each `.cm-line` and swapping
  // the `> [!type]` marker for a label widget. That works, and it is what lets
  // you type straight into a callout; the parity catalogue proves a single-level
  // callout matches the reader down to its computed styles. What per-line
  // classes cannot express is NESTING: one line carries one set of classes, so
  // an inner callout has nowhere to live. Measured on the probe fixture, the
  // inner box simply was not there --
  //   read: `div.callout.callout-note < div.callout-body < div.callout.callout-warning`
  //   edit: `div.cm-line.cm-callout.callout-warning.cm-quote`
  //
  // Routing these through the renderer makes nesting work for free. It is
  // deliberately limited to the nested case rather than applied to every
  // callout: rendering a block costs click-to-enter before you can type in it,
  // and this vault has callouts in 222 of its ~281 notes while only 8 nest them.
  // Widening it would change how four fifths of the vault is edited to fix one
  // thirtieth. If the decoration layer ever learns real nesting, delete this
  // branch rather than growing it.
  //
  // The depth test is shape-based, not a fixed `> >`: any number of quote marks
  // before a `[!` counts, so a three-deep callout is caught too. CALLOUT_RE
  // itself is the same constant the label widget uses further down --
  // "what counts as a callout" must not drift between the code that renders one
  // and the code that decorates one.
  if (name === "Blockquote") {
    if (!CALLOUT_RE.test(state.doc.lineAt(node.from).text)) return false;
    return NESTED_CALLOUT_RE.test(state.doc.sliceString(node.from, node.to));
  }

  if (name !== "Paragraph") return false;
  const source = state.doc.sliceString(node.from, node.to);
  for (const [, target] of source.matchAll(EMBED_RE)) {
    if (!IMAGE_EXT.test(target.trim())) return true;
  }
  return false;
}

const RENDERED_BLOCKS = new Set([
  "HTMLBlock", // raw <div>/<img>/<iframe> — invisible to the decoration layer
  "Table", // the reader's tables are interactive (sortable, editable cells)
  "FencedCode", // includes the `base` and `tasks` blocks the app renders itself
  "BlockMath", // $$...$$, via the same server-rendered path as the read view
]);

/**
 * A block shown exactly as the read view shows it.
 *
 * Keyed by the block's SOURCE TEXT, which is what makes this self-healing: edit
 * one character and the source no longer matches any known block, the lookup
 * misses, no decoration is emitted, and the raw markdown reappears for editing.
 * When the note is saved and its blocks come back from the server, it renders
 * again. No offset bookkeeping, and no way for a stale block to be shown as if
 * it were current.
 */
class RenderedBlockWidget extends KeyedWidget {
  constructor(source, html, hydrate, release) {
    super(source);
    this.html = html;
    this.hydrate = hydrate;
    this.release = release;
  }
  // CodeMirror drops the DOM (scrolled away, edited, the view destroyed): what
  // hydrate() mounted goes with it. Never on a detached editor (a hidden tab),
  // which keeps its DOM and comes back with it intact.
  destroy(dom) {
    unwatchSize(dom);
    if (this.release) this.release(dom);
  }
  eq(other) {
    // Compare the HTML too: the same source re-rendered differently (a base
    // whose query now returns more rows) has to replace its DOM.
    return super.eq(other) && other.html === this.html;
  }
  /**
   * A first guess at the rendered height, in pixels.
   *
   * CodeMirror needs SOME height for a block it has not measured yet, in order
   * to size the scrollbar and map screen coordinates back to document
   * positions. Left at the default it assumes one line, which for a rendered
   * table or equation is wildly short -- the error shows up as a tall empty
   * `cm-gap` and as clicks landing on the wrong line. One line of source is a
   * far better guess than one line total, and remeasure() corrects it for real
   * as soon as the DOM exists.
   */
  get estimatedHeight() {
    return (this.key.split("\n").length + 1) * 24;
  }

  toDOM(view) {
    const host = document.createElement("div");
    host.className = "cm-rendered-block";
    host.innerHTML = this.html;
    // The server's HTML is pretty-printed, so it arrives wrapped in newlines.
    // Inside a block-level container those become real line boxes -- measured at
    // 48px of dead space under a base table -- so they go.
    trimEdgeWhitespace(host);
    const settled = this.hydrate ? this.hydrate(host) : null;
    enterOnClick(host, view);
    remeasure(host, view, settled);
    watchSize(host, view);
    return host;
  }
  // The rendered DOM is interactive -- base tables, task checkboxes, links --
  // so its events belong to it, not to CodeMirror. Getting the caret INTO the
  // block is handled explicitly by enterOnClick() instead; without that the
  // block could be rendered but never edited.
  ignoreEvent() {
    return true;
  }
}

/**
 * Clicking a rendered block puts the caret in it, which reverts it to markdown.
 *
 * Necessary because `ignoreEvent()` returns true: CodeMirror is told to keep its
 * hands off the widget's DOM so that base tables, checkboxes and links keep
 * working, and the price is that a click no longer moves the caret by itself. So
 * the block has to ask for it.
 *
 * Clicks that land on something interactive are left alone -- following a link
 * or ticking a task must not drop you into raw markdown. Everything else (the
 * prose of the block, its margins) means "I want to edit this".
 */
const INTERACTIVE = "a, button, input, textarea, select, label, summary, .view-tab, .col-grip";

/** Drop whitespace-only text nodes at a container's edges. */
function trimEdgeWhitespace(host) {
  const blank = (node) => node && node.nodeType === 3 && !node.data.trim();
  while (blank(host.firstChild)) host.removeChild(host.firstChild);
  while (blank(host.lastChild)) host.removeChild(host.lastChild);
}

/**
 * Tell CodeMirror to re-measure once a widget's real height is known.
 *
 * THIS IS NOT OPTIONAL, and its absence is worth spelling out because the
 * symptoms look like three unrelated bugs. CodeMirror caches the height of every
 * line to size the scrollbar and to map a mouse position back to a document
 * position. A widget whose content arrives *after* it is inserted -- MathJax
 * typesetting, images loading, a base table filling in -- silently invalidates
 * that cache. The result is a tall empty `cm-gap` where the estimate was too
 * generous, and clicks landing several lines away from where they were aimed.
 *
 * So every asynchronous thing that can change a block's height ends in a
 * requestMeasure(): the next frame (layout of the HTML we just inserted), the
 * hydration promise (math), and each image's load event.
 */
/**
 * A rendered block's height keeps changing after it is drawn: a Base's rows arrive, an embed mounts once its link is
 * resolved, a picture gets its source a moment later (an <img> with no source yet counts as loaded, so a "load"
 * listener never fires). Told only once, CodeMirror kept its first guess for the block's height: boxes taller than
 * what they show, the space a picture or block left behind, clicks landing a line off (a Bases view's box larger than the view,
 * the space that pictures and other blocks left).
 * So every real change of a rendered block's size is a new measure; the observer goes with the widget.
 */
const sizeWatchers = new WeakMap();
function watchSize(host, view) {
  if (!view || typeof ResizeObserver === "undefined") return;
  let last = -1;
  const ro = new ResizeObserver((entries) => {
    const h = Math.round(entries[entries.length - 1].contentRect.height);
    if (h !== last) { last = h; view.requestMeasure(); }
  });
  ro.observe(host);
  sizeWatchers.set(host, ro);
}
function unwatchSize(host) {
  sizeWatchers.get(host)?.disconnect();
  sizeWatchers.delete(host);
}

function remeasure(host, view, settled) {
  if (!view) return;
  const measure = () => view.requestMeasure();
  requestAnimationFrame(measure);
  if (settled && typeof settled.then === "function") settled.then(measure, measure);
  for (const img of host.querySelectorAll("img")) {
    if (!img.complete) img.addEventListener("load", measure, { once: true });
  }
}

function enterOnClick(host, view) {
  if (!view) return; // headless tests build widgets without a view
  host.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.target.closest(INTERACTIVE)) return;
    const pos = view.posAtDOM(host);
    if (pos == null) return;
    event.preventDefault();
    view.dispatch({ selection: { anchor: pos } });
    view.focus();
  });
}

// --- the decoration builder -------------------------------------------------

/**
 * Compute the decoration set for `ranges` of `state`.
 *
 * Takes a state rather than a view purely so it can be tested headlessly -- CM6's
 * state and syntax tree work fine in node, while a view needs real layout. The
 * ViewPlugin below is then a thin wrapper that supplies view.visibleRanges.
 *
 * @param {import("@codemirror/state").EditorState} state
 * @param {readonly {from: number, to: number}[]} ranges  usually view.visibleRanges
 */
export function buildDecorations(state, ranges, options = {}) {
  const opts = normalizeOptions(options);
  const deco = [];
  const add = (from, to, value) => {
    if (from <= to) deco.push(value.range(from, to));
  };

  /**
   * Colour a revealed formula: dim `$`/`$$`, highlight the LaTeX between them.
   *
   * WHY THE CODE HIGHLIGHTER AND NOT A MATH-SPECIFIC ONE. The same argument
   * that picked hljs for fenced code (see highlight-code.js) applies twice over
   * here: it is the reader's own highlighter, so ```` ```latex ```` and an
   * edited `$$…$$` are coloured by ONE grammar and ONE palette, and it costs no
   * new dependency -- only registering the grammar in the vendored bundle,
   * which `lib/common` omits (see vendor-assets.mjs).
   *
   * Marks, never a widget: the point of revealing a formula is to type in it,
   * and a widget would have to be torn down on the first keystroke.
   *
   * @param {number} from start of the whole node, `$` included
   * @param {number} to   end of the whole node, `$` included
   */
  const addMathSource = (from, to) => {
    // The delimiters are MEASURED, not assumed to be one `$` for inline and two
    // for block: the caret is in this formula, so it is very likely half-typed,
    // and `$$x` (no closing yet) must dim two characters at the front and none
    // at the back rather than eat two characters of maths.
    const raw = state.doc.sliceString(from, to);
    const open = /^\$+/.exec(raw)?.[0].length ?? 0;
    const close = /\$+$/.exec(raw)?.[0].length ?? 0;
    const inner = { from: from + open, to: to - close };
    // A MARK over an empty range is a RangeError, not a no-op ("Mark decorations
    // may not be empty"), and a throw in here takes the whole decoration field
    // down -- i.e. live preview stops entirely. `$$x` reaches exactly that case:
    // its closing fence is zero characters long. So every mark below goes
    // through this guard rather than through the shared `add`, whose own check
    // (`from <= to`) is the right one for replacements and too weak for marks.
    const mark = (a, b, cls) => {
      if (b > a) add(a, b, Decoration.mark({ class: cls }));
    };
    const FENCE = "cm-formatting cm-formatting-math";
    // One mark over the whole formula: it is code while it is being edited, so
    // it is set in the code face (app.css). Marks compose, so this coexists with
    // the delimiter and highlight marks laid over the same characters.
    mark(from, to, "cm-math-src");
    // Nothing between the delimiters yet -- and with `$$` the two delimiter
    // ranges would overlap -- so dim the lot and stop.
    if (inner.to <= inner.from) {
      mark(from, to, FENCE);
      return;
    }
    mark(from, inner.from, FENCE);
    mark(inner.to, to, FENCE);
    const source = state.doc.sliceString(inner.from, inner.to);
    for (const r of opts.highlightCode(source, "latex")) {
      // Clamp exactly as the fenced-code branch does: a stale cache entry must
      // never produce a decoration reaching past the text it describes.
      const start = Math.min(inner.from + r.from, inner.to);
      const end = Math.min(inner.from + r.to, inner.to);
      mark(start, end, r.cls);
    }
  };

  // The inline title comes first, before the frontmatter chip, exactly as in the
  // read view. It is not part of the document, so it is a widget over an empty
  // range rather than a replacement of anything.
  const title = opts.inlineTitle(state); // the state: a caller may leave it out when the note's first heading says the same
  if (title) {
    add(
      0,
      0,
      Decoration.widget({
        widget: new InlineTitleWidget(title.key, title.render),
        block: true,
        side: -1,
      })
    );
  }

  // Frontmatter is handled outside the tree walk (the parser does not model it)
  // and every node inside it is skipped, so its `---` fences stop turning into
  // horizontal rules and its `key: value` lines stop being parsed as prose.
  //
  // It is REPLACED by the read view's properties table rather than shown as
  // YAML: this app has a Properties panel that edits the same fields far better
  // than raw YAML does, and Obsidian shows a properties widget here rather than
  // the source. Clicking the widget (or arrowing into it) still gives the raw
  // YAML back, so nothing is unreachable.
  const fmEnd = frontmatterEnd(state);
  if (fmEnd) {
    if (revealed(state, 0, fmEnd)) {
      for (let n = 1; n <= state.doc.lines; n++) {
        const line = state.doc.line(n);
        add(line.from, line.from, Decoration.line({ class: "cm-frontmatter" }));
        // Colour the `key:` part. The markdown parser gives us nothing here --
        // to it this is prose -- and unstyled YAML is genuinely hard to read, so
        // one regex earns its keep. Deliberately shape-based rather than a list
        // of known property names, so a new property looks right immediately.
        const key = /^(\s*-?\s*)([A-Za-z_][\w .-]*)(:)/.exec(line.text);
        if (key) {
          const start = line.from + key[1].length;
          add(start, start + key[2].length, Decoration.mark({ class: "cm-yaml-key" }));
        }
        if (line.to >= fmEnd) break;
      }
    } else {
      // The key carries the app's own identity for the properties (path plus a
      // fingerprint of the values), so editing a property redraws the widget and
      // an unrelated keystroke does not. Falling back to a constant is right for
      // the chip: it never changes.
      const spec = opts.noteProperties(state.doc.sliceString(0, fmEnd));
      add(
        0,
        fmEnd,
        // `skipEntry` keeps arrow keys OUT of the frontmatter: walking up off
        // the first line of the body should not drop you into raw YAML. The
        // widget is still reachable, by clicking it.
        Decoration.replace({
          widget: new PropertiesWidget(spec ? "properties:" + spec.key : "properties", spec?.render),
          block: true,
          skipEntry: true,
        })
      );
    }
  }

  // Set by the Blockquote branch when a callout's `> [!type]` marker is being
  // replaced, so the QuoteMark branch does not also try to hide the same '>' --
  // two replace decorations over one range is an error, not a no-op.
  let calloutMarkerEnd = -1;
  // closing tags already paired with (and hidden by) their opening HTMLTag
  const htmlClosers = new Set();

  // --- pass 1: chunks the app's own renderer owns ---------------------------
  //
  // This MUST run before anything else adds a decoration. A rendered chunk can
  // span several syntax nodes -- a heading and the embed beneath it are one
  // block to the server -- and if the heading has already been given its line
  // decoration by the time we replace the chunk, that decoration sits inside a
  // replaced range. CodeMirror rejects the overlap by throwing, and a throw here
  // kills the whole decoration field: the symptom is not a misplaced heading but
  // an editor with no live preview at all. (Measured during development: a note
  // that matched 53 of 72 text runs against the read view dropped to 3.)
  const rendered = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (rendered.length && node.from < rendered[rendered.length - 1].to) return false;
      if (fmEnd && node.to <= fmEnd) return false;
      if (!rendersAsBlock(node.name, node, state)) return undefined;

      // The PARSER's boundary, expanded only to whole lines.
      //
      // Verified against /api/note rather than assumed: the server's
      // split_blocks agrees with the markdown parser, not with blank lines. For
      // notes/indexes/Cinema.md it returns `### Movie Posters` and
      // `![[01_movies.base#Poster]]` as SEPARATE blocks despite there being no
      // blank line between them. An earlier version here merged them into one
      // blank-line chunk, produced a key no block had, and silently rendered
      // nothing -- Cinema.md dropped to 7 text runs against the reader's 577.
      const chunk = {
        from: state.doc.lineAt(node.from).from,
        to: state.doc.lineAt(node.to).to,
      };
      if (revealed(state, chunk.from, chunk.to)) return false; // being edited
      const source = state.doc.sliceString(chunk.from, chunk.to);
      const html = opts.blockHtml(source);
      if (!html) return undefined; // unknown to the renderer: decorate as markdown
      rendered.push({ ...chunk, source, html });
      return false;
    },
  });

  for (const chunk of rendered) {
    const widget = new RenderedBlockWidget(chunk.source, chunk.html, opts.hydrateBlock, opts.releaseBlock);
    add(chunk.from, chunk.to, Decoration.replace({ widget, block: true }));
  }

  // Both walks run in document order, so one moving cursor answers "is this
  // position inside a rendered chunk?" without a search.
  let cursor = 0;
  const insideRendered = (pos) => {
    while (cursor < rendered.length && rendered[cursor].to <= pos) cursor++;
    const hit = rendered[cursor];
    return !!hit && pos >= hit.from;
  };

  for (const visible of ranges) {
    syntaxTree(state).iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        const name = node.name;

        // Skip nodes that lie ENTIRELY inside the frontmatter. Testing `from`
        // instead would match the document node itself (which starts at 0) and
        // abort the whole walk, leaving the note undecorated.
        if (fmEnd && node.to <= fmEnd) return false;

        // Anything inside a chunk the renderer already owns is off limits: a
        // second decoration there would overlap the block replacement, which
        // CodeMirror treats as an error -- and a thrown decoration builder takes
        // the entire live preview down with it.
        if (insideRendered(node.from)) return false;

        // --- headings: always style the line, hide the '#' when not focused ---
        const level = headingLevel(name);
        if (level) {
          const line = state.doc.lineAt(node.from);
          add(line.from, line.from, Decoration.line({ class: `cm-header cm-header-${level}` }));
          return;
        }

        if (name === "HeaderMark") {
          const parent = node.node.parent;
          if (parent && !revealed(state, parent.from, parent.to)) {
            // Swallow the space after '#' too, otherwise the text stays indented
            // by one column relative to a rendered heading.
            let to = node.to;
            if (state.doc.sliceString(to, to + 1) === " ") to++;
            add(node.from, to, Decoration.replace({}));
          }
          return;
        }

        // --- lists: indent the line, swap the source marker for a real one ---
        if (name === "ListItem") {
          const depth = listDepth(node.node);
          // Only this item's OWN lines get the indent. A nested list's lines
          // belong to the child ListItem and will be decorated when the walk
          // reaches it -- decorating them here too would put two competing
          // `cm-list-N` classes on one line and the deeper indent would be
          // decided by stylesheet order rather than by nesting.
          const nested = [];
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name === "BulletList" || c.name === "OrderedList") nested.push(c);
          }
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos);
            // a nested list starts AFTER its indentation, so compare whole lines: `line.from >= n.from`
            // missed every nested line and gave it this item's classes on top of its own
            if (!nested.some((n) => line.to >= n.from && line.from < n.to)) {
              // the item's first line hangs its marker; continuation lines (lazy or indented)
              // align with the item's text instead of outdenting their first row
              const cont = line.from > state.doc.lineAt(node.from).from;
              add(line.from, line.from, Decoration.line({ class: `cm-list cm-list-${depth}${cont ? " cm-list-cont" : ""}` }));
              // the source's own indentation is drawn by the padding: hide it (shown when editing)
              const lead = /^[ \t]+/.exec(line.text);
              if (cont && lead && !revealed(state, node.from, node.to)) add(line.from, line.from + lead[0].length, Decoration.replace({}));
            }
            if (line.to >= node.to) break;
            pos = line.to + 1;
          }
          return; // keep descending: ListMark and any nested items are children
        }

        if (name === "ListMark") {
          const item = node.node.parent;
          if (item && !revealed(state, item.from, item.to)) {
            const raw = state.doc.sliceString(node.from, node.to);
            // Swallow the trailing space as well, so the replacement widget's
            // fixed width alone decides where the item's text begins.
            let to = node.to;
            if (state.doc.sliceString(to, to + 1) === " ") to++;
            // and the indentation before it: nesting depth is drawn by the line's padding
            const lineStart = state.doc.lineAt(node.from).from;
            const from = /^[ \t]*$/.test(state.doc.sliceString(lineStart, node.from)) ? lineStart : node.from;
            // Obsidian draws a task's checkbox where the bullet would be, not after it
            const task = !!item.getChild("Task");
            add(from, to, task ? Decoration.replace({}) : Decoration.replace({ widget: new ListMarkWidget(raw, /\d/.test(raw)) }));
          }
          return;
        }

        // A task's "[ ]" / "[x]" sits after the ListMark on the same line.
        if (name === "TaskMarker") {
          const item = node.node.parent;
          if (item && !revealed(state, item.from, item.to)) {
            const checked = /[xX]/.test(state.doc.sliceString(node.from, node.to));
            let to = node.to;
            if (state.doc.sliceString(to, to + 1) === " ") to++;
            add(node.from, to, Decoration.replace({ widget: new TaskMarkWidget(checked, opts.toggleTask) }));
          }
          return;
        }

        // --- inline emphasis / code / highlight ---
        const styleClass = INLINE_STYLED[name];
        if (styleClass) {
          add(node.from, node.to, Decoration.mark({ class: styleClass }));
          return;
        }

        if (MARK_NODES.has(name)) {
          const parent = node.node.parent;
          if (parent && !revealed(state, parent.from, parent.to)) {
            add(node.from, node.to, Decoration.replace({}));
          }
          return;
        }

        // --- [[wikilink]] and [[target|alias]] ---
        if (name === "Wikilink") {
          const target = node.node.getChild("WikilinkTarget"), alias = node.node.getChild("WikilinkAlias");
          // A link whose target does not exist is dimmed, exactly as the read
          // view dims it (`is-unresolved`, decided server-side) and as Obsidian
          // does. opts.linkResolves is a cached lookup by contract -- this runs
          // on every keystroke, so it must never touch the network itself.
          const missing =
            target && !opts.linkResolves(state.doc.sliceString(target.from, target.to));
          add(
            node.from,
            node.to,
            Decoration.mark({
              class: missing ? "cm-hmd-internal-link is-unresolved" : "cm-hmd-internal-link",
              // Atlas: the real target, so a click on an aliased link opens the right note, and its label (a PDF
              // link's label is the words to select on its page)
              attributes: target ? { "data-target": state.doc.sliceString(target.from, target.to),
                ...(alias ? { "data-label": state.doc.sliceString(alias.from, alias.to) } : {}) } : undefined,
            })
          );
          if (!revealed(state, node.from, node.to)) {
            // With an alias, the target is noise: Obsidian shows only the alias.
            // The marks themselves are hidden by the MARK_NODES branch.
            if (alias && target) add(target.from, alias.from, Decoration.replace({}));
          }
          return;
        }

        // --- ![[embed]] ---
        // Returning false stops the iteration descending into the node's marks:
        // a child Decoration.replace inside an already-replaced range is an
        // overlapping replacement, which CodeMirror rejects.
        if (name === "Embed") {
          const target = node.node.getChild("WikilinkTarget");
          if (!target) return;
          const path = state.doc.sliceString(target.from, target.to).trim();
          // the caret inside: the link stays text to edit, the picture shows right after it
          if (revealed(state, node.from, node.to)) {
            if (IMAGE_EXT.test(path)) add(node.to, node.to, Decoration.widget({ widget: new ImageWidget(path, opts.resolveAttachment, embedOptions(state.doc.sliceString(node.from + 3, node.to - 2))), side: 1 }));
            return;
          }
          const widget = IMAGE_EXT.test(path)
            ? new ImageWidget(path, opts.resolveAttachment, embedOptions(state.doc.sliceString(node.from + 3, node.to - 2)))
            : new EmbedChipWidget(path);
          add(node.from, node.to, Decoration.replace({ widget }));
          return false;
        }

        // --- ![alt](src) ---
        if (name === "Image") {
          const url = node.node.getChild("URL");
          if (!url) return;
          const src = state.doc.sliceString(url.from, url.to);
          if (revealed(state, node.from, node.to)) {
            add(node.to, node.to, Decoration.widget({ widget: new ImageWidget(src, opts.resolveAttachment), side: 1 }));
            return;
          }
          add(
            node.from,
            node.to,
            Decoration.replace({ widget: new ImageWidget(src, opts.resolveAttachment) })
          );
          return false;
        }

        // --- [text](url): hide the brackets and the target, keep the text ---
        if (name === "Link") {
          // Atlas: the target on the mark, for the hover preview (lib/preview.ts)
          const href = node.node.getChild("URL");
          add(node.from, node.to, Decoration.mark({ class: "cm-link", attributes: href ? { "data-href": state.doc.sliceString(href.from, href.to) } : undefined }));
          if (!revealed(state, node.from, node.to)) {
            const url = node.node.getChild("URL");
            if (url) {
              // Locate the ']' that ends the link text rather than assuming the
              // URL is preceded by exactly "](": a title, or whitespace inside
              // the parens, would break that assumption.
              let close = url.from - 1;
              while (close > node.from && state.doc.sliceString(close, close + 1) !== "]") close--;
              add(node.from, node.from + 1, Decoration.replace({}));
              add(close, node.to, Decoration.replace({}));
            }
          }
          // Handled wholesale, so do not let the generic mark branch add
          // overlapping replacements for the same brackets.
          return false;
        }

        // --- #tag ---
        if (name === "Tag") {
          add(node.from, node.to, Decoration.mark({ class: "cm-hashtag" }));
          return;
        }

        // --- inline HTML: <u>x</u>, <sup>nd</sup>, <br>, <img src=…> ---
        // Obsidian renders these, so the tags hide and the content gets the real element
        // (a mark with tagName), until the caret enters the pair. Closing tags are consumed by
        // their opener; unknown tags stay as written.
        if (name === "HTMLTag") {
          if (htmlClosers.has(node.from)) return;
          const text = state.doc.sliceString(node.from, node.to);
          const m = /^<([a-zA-Z][\w-]*)\b([^>]*?)\/?>$/.exec(text);
          if (!m) return;
          const tag = m[1].toLowerCase();
          if (VOID_HTML.has(tag)) {
            if (revealed(state, node.from, node.to)) return;
            const html = opts.inlineHtml(text);
            if (html) add(node.from, node.to, Decoration.replace({ widget: new InlineHtmlWidget(text, html, opts.hydrateBlock, opts.releaseBlock) }));
            return;
          }
          if (!INLINE_HTML.has(tag)) return;
          const blockEnd = node.node.parent ? node.node.parent.to : state.doc.lineAt(node.from).to;
          const close = new RegExp(`</${tag}\\s*>`, "i").exec(state.doc.sliceString(node.to, blockEnd));
          if (!close) return;
          const cFrom = node.to + close.index;
          const cTo = cFrom + close[0].length;
          htmlClosers.add(cFrom);
          if (revealed(state, node.from, cTo)) {
            add(node.from, node.to, Decoration.mark({ class: "cm-formatting cm-html-tag" }));
            add(cFrom, cTo, Decoration.mark({ class: "cm-formatting cm-html-tag" }));
            return;
          }
          add(node.from, node.to, Decoration.replace({}));
          if (cFrom > node.to) add(node.to, cFrom, Decoration.mark({ tagName: tag, attributes: htmlAttributes(tag, m[2]) }));
          add(cFrom, cTo, Decoration.replace({}));
          return;
        }

        // --- :IconName: (Iconize) ---
        // Replaced by the glyph, and revealed as source when the caret is on it,
        // like every other construct here: the name is the only way to edit it.
        //
        // Either node name: with GFM configured the stock `Emoji` parser claims
        // `:...:` before our own Icon rule can, so the check is on the TEXT --
        // see isIconToken(). An `:emoji:` that is not an icon falls through and
        // stays plain text, exactly as the reader leaves it.
        if (name === "Icon" || name === "Emoji") {
          const token = state.doc.sliceString(node.from, node.to);
          if (!isIconToken(token)) return;
          if (revealed(state, node.from, node.to)) return;
          const iconName = token.slice(1, -1);
          add(
            node.from,
            node.to,
            Decoration.replace({ widget: new IconWidget(iconName, opts.icon) })
          );
          return;
        }

        // --- math ---
        if (name === "InlineMath" || name === "BlockMath") {
          const block = name === "BlockMath";
          // Revealed: the formula is being edited, so it shows as LaTeX source
          // -- and LaTeX source gets coloured, exactly as a code fence does. The
          // delimiters are dimmed (Obsidian's `cm-formatting-math`) so the eye
          // separates the maths from the `$`s that switch it on.
          if (revealed(state, node.from, node.to)) {
            addMathSource(node.from, node.to);
            return false;
          }
          const raw = state.doc.sliceString(node.from, node.to);
          const source = block ? raw.replace(/^\$\$|\$\$$/g, "").trim() : raw.slice(1, -1);
          if (!source) return;
          const widget = new MathWidget(source, block, opts.renderMath);
          if (block) {
            // A block replacement must span whole lines or CodeMirror will throw.
            const first = state.doc.lineAt(node.from);
            const last = state.doc.lineAt(node.to);
            if (first.from === node.from && last.to === node.to) {
              add(node.from, node.to, Decoration.replace({ widget, block: true }));
              return false;
            }
          }
          add(node.from, node.to, Decoration.replace({ widget }));
          // punctuation right after a formula stays on its line (Atlas): a line could break between
          // the inline-block and its ", which" or "."
          if (!block) {
            const glue = /^[.,;:!?)\]’”]+/.exec(state.doc.sliceString(node.to, Math.min(node.to + 4, state.doc.lineAt(node.to).to)));
            if (glue) add(node.from, node.to + glue[0].length, MATH_GLUE);
          }
          return false;
        }

        // --- horizontal rule ---
        if (name === "HorizontalRule") {
          if (!revealed(state, node.from, node.to)) {
            add(node.from, node.to, Decoration.replace({ widget: new RuleWidget("hr") }));
          }
          return false;
        }

        // --- the '>' of a blockquote, hidden like any other syntax mark ---
        if (name === "QuoteMark") {
          if (node.from < calloutMarkerEnd) return; // already inside the callout marker
          const quote = node.node.parent;
          if (quote && !revealed(state, quote.from, quote.to)) {
            let to = node.to;
            if (state.doc.sliceString(to, to + 1) === " ") to++;
            add(node.from, to, Decoration.replace({}));
          }
          return;
        }

        // --- blockquotes and callouts ---
        // A callout is an ordinary blockquote whose first line opens with
        // [!type]; the parser has no node for it, so it is recognised by regex
        // here. Both are drawn as one LINE decoration per line -- there is no
        // wrapper element to style -- so the first and last lines get extra
        // classes to round off the box (see app.css).
        if (name === "Blockquote") {
          const first = state.doc.lineAt(node.from);
          const callout = CALLOUT_RE.exec(first.text);
          const kind = callout ? callout[1].toLowerCase() : null;
          const open = !revealed(state, node.from, node.to);

          // `[!tip]-` starts folded, `[!tip]+` open; the chevron flips it (calloutFolds)
          const foldable = !!(kind && callout[2]);
          const folded = foldable && open && (callout[2] === "-") !== isToggled(state, first.from);
          if (kind && open) {
            // Swallow "> [!type]" (and its fold marker) so only the title shows.
            // With no title of their own, the type name becomes the title.
            const markerEnd = first.from + callout[0].length;
            calloutMarkerEnd = markerEnd;
            const hasTitle = first.to > markerEnd;
            add(
              first.from,
              markerEnd,
              hasTitle
                ? Decoration.replace({})
                : Decoration.replace({ widget: new CalloutLabelWidget(kind) })
            );
          }

          if (foldable && open) add(first.to, first.to, Decoration.widget({ widget: new CalloutFoldWidget(folded), side: 1 }));
          if (folded && first.to < node.to) {
            // the body is one block replacement; the title line alone stays, styled as first AND last
            add(first.from, first.from, Decoration.line({ class: `cm-callout callout-${kind} cm-callout-first cm-callout-last cm-callout-title cm-callout-folded` }));
            add(first.to, node.to, Decoration.replace({}));
            return;
          }
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos);
            const edge =
              (line.from === node.from ? " cm-callout-first" : "") +
              (line.to >= node.to ? " cm-callout-last" : "");
            add(
              line.from,
              line.from,
              Decoration.line({
                // `callout-<kind>` (no cm- prefix) is the read view's own class:
                // reusing it means the colour palette in app.css is shared.
                class: kind
                  ? `cm-callout callout-${kind}${edge}` +
                    (line.from === node.from ? " cm-callout-title" : "")
                  : "cm-quote",
              })
            );
            if (line.to >= node.to) break;
            pos = line.to + 1;
          }
          return;
        }

        // --- fenced code: style the block, then colour the code inside it ---
        if (name === "FencedCode") {
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos);
            const edge =
              (line.from === node.from ? " cm-codeblock-first" : "") +
              (line.to >= node.to ? " cm-codeblock-last" : "");
            add(line.from, line.from, Decoration.line({ class: `cm-codeblock${edge}` }));
            if (line.to >= node.to) break;
            pos = line.to + 1;
          }

          // Syntax highlighting, with the READER'S highlighter, so a code block
          // is coloured identically in both views -- see highlight-code.js. The
          // text stays live and editable; only marks are added over it, which is
          // why typing inside a fence keeps its colours instead of flipping to
          // plain the way a rendered widget would.
          const info = node.node.getChild("CodeInfo");
          const text = node.node.getChild("CodeText");
          if (info && text) {
            // The info string can carry more than a language (```js title=x),
            // and the language is the first word of it.
            const lang = state.doc.sliceString(info.from, info.to).split(/\s+/)[0];
            const code = state.doc.sliceString(text.from, text.to);
            for (const r of opts.highlightCode(code, lang)) {
              // Offsets come back relative to the code text; shift them onto the
              // document. Clamped because a stale cache entry must never produce
              // a decoration past the end of the block.
              const from = Math.min(text.from + r.from, text.to);
              const to = Math.min(text.from + r.to, text.to);
              if (to > from) add(from, to, Decoration.mark({ class: r.cls }));
            }
          }
          return;
        }
      },
    });
  }

  // `true` tells CodeMirror to sort; ranges are produced in tree order, which is
  // close to but not exactly the required order once line decorations are mixed in.
  return Decoration.set(deco, true);
}

// --- the extension ----------------------------------------------------------

/**
 * Build the live-preview extension.
 *
 * @param {object} [options]
 * @param {(path: string) => string} [options.resolveAttachment]
 *        Map a vault-relative embed path to a URL the browser can load. Defaults
 *        to identity, which is right for already-absolute paths.
 * @param {(target: string) => boolean} [options.linkResolves]
 *        Whether `[[target]]` names something that exists, so a missing target
 *        can be dimmed. Runs inside buildDecorations -- i.e. on every keystroke,
 *        for every link on screen -- so it must be a synchronous cached lookup.
 *        Defaults to always-true.
 * @param {(host: HTMLElement, source: string, block: boolean) => void} [options.renderMath]
 *        Render a formula into `host`. Optional by design: this app has no
 *        client-side math renderer yet (math is rendered server-side for reading
 *        view), so without one the source is shown in a styled box rather than
 *        forcing a ~270 KB KaTeX dependency into the bundle prematurely.
 */
export function livePreview(options = {}) {
  const opts = normalizeOptions(options);

  // WHY A StateField AND NOT A ViewPlugin
  // -------------------------------------
  // The obvious shape here is a ViewPlugin, because it can build decorations for
  // `view.visibleRanges` only and skip the rest of the document. That is what
  // this was, and it was silently broken: a `$$…$$` formula is replaced by a
  // BLOCK widget, and CodeMirror rejects block decorations that come from a
  // plugin --
  //
  //     Error: Block decorations may not be specified via plugins
  //
  // The throw takes the whole plugin down, so the editor rendered as plain text
  // with no live preview at all, and the only visible symptom was "nothing
  // happens". Block decorations must come from a StateField, so that is what
  // this is.
  //
  // The cost is that decorations are rebuilt for the WHOLE document rather than
  // the viewport, since a StateField has no view and cannot know what is on
  // screen. Measured on the real vault that is 0.11 ms for an average note and
  // 3.2 ms for the worst one -- affordable per keystroke, and correctness is not
  // negotiable against it. If it ever does become the bottleneck, the fix is to
  // split the field in two (block decorations here, inline ones back in a
  // viewport-limited plugin), not to move blocks back into a plugin.
  const field = StateField.define({
    create(state) {
      return decorate(state, opts);
    },
    update(value, tr) {
      // Selection changes matter as much as edits: moving the caret into a
      // construct is what reveals its source.
      if (
        !tr.docChanged &&
        !tr.selection &&
        !tr.effects.some((e) => e.is(toggleCalloutFold) || e.is(redecorate)) &&
        syntaxTree(tr.startState) === syntaxTree(tr.state)
      ) {
        return {
        deco: value.deco.map(tr.changes),
        atomic: value.atomic.map(tr.changes),
        blocks: value.blocks,
      };
      }
      return redecorate_(value, tr, opts) ?? decorate(tr.state, opts);
    },
    provide: (f) => [
      EditorView.decorations.from(f, (v) => v.deco),
      // ONLY the replaced ranges are atomic -- never the styling ones.
      //
      // Handing CodeMirror the whole set was a real bug with a confusing face:
      // it made every `cm-strong` span and every heading LINE atomic, so the
      // caret skipped over whole bold words and clicking inside a heading
      // snapped to its edge. It read as "the mouse and the cursor disagree",
      // which sounds like a geometry problem and is not one.
      //
      // Atomicity is only wanted for text that is HIDDEN or REPLACED, where
      // stepping into it would strand the caret in something invisible.
      EditorView.atomicRanges.of((view) => view.state.field(f, false)?.atomic || Decoration.none),
    ],
  });

  return [[calloutFolds, field], blockEntryKeymap(field)];
}

/**
 * Let Up/Down walk INTO a rendered block instead of over it.
 *
 * A block replace decoration collapses its lines into a single widget, so
 * CodeMirror's vertical motion -- which thinks in visual lines -- jumps straight
 * past it to the next real line. The keyboard could then never reach a table, a
 * base or an equation to edit it: moving with the cursor skipped them.
 *
 * Making the range non-atomic is necessary but not sufficient; the motion has to
 * be aimed. So this runs ahead of the default keymap, works out the offset the
 * caret is heading for, and if that lands inside a block, puts the caret there.
 * The block then reveals itself, because the caret being inside is exactly what
 * reveals it -- no special case, just the ordinary rule.
 */
function blockEntryKeymap(field) {
  const step = (view, forward) => {
    const { blocks } = view.state.field(field, false) || {};
    if (!blocks || !blocks.length) return false;

    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    // Where plain vertical motion is headed: the neighbouring line.
    const target = forward ? line.to + 1 : line.from - 1;
    if (target < 0 || target > view.state.doc.length) return false;

    const hit = blocks.find((b) => target >= b.from && target <= b.to);
    if (!hit) return false; // ordinary line: let the default keymap have it

    // Enter at the near edge, so Down lands at the top of the block and Up at
    // its bottom -- the same way walking into a paragraph would feel.
    view.dispatch({
      selection: { anchor: forward ? hit.from : hit.to },
      scrollIntoView: true,
    });
    return true;
  };

  // Prec.highest, not high: @replit/codemirror-vim registers its own keymap at
  // the highest precedence, so anything below it never sees an arrow key while
  // vim mode is on -- which is most of the time here. Verified by driving
  // ArrowDown in a real browser and watching the rendered-block count: with
  // Prec.high it never dropped, meaning the caret jumped the block every time.
  return Prec.highest(
    keymap.of([
      { key: "ArrowDown", run: (view) => step(view, true) },
      { key: "ArrowUp", run: (view) => step(view, false) },
      // NOT j/k. Binding a plain letter here would swallow it while typing in
      // vim's insert mode, which is a far worse bug than j not entering a table.
    ])
  );
}

/**
 * Build both sets the field holds: everything to draw, and the subset that is
 * atomic to the caret.
 *
 * The discriminator is an INVARIANT of this file: every `Decoration.line` and
 * `Decoration.mark` built above passes a `class`, and no `Decoration.replace`
 * ever does. So "has no class" means "this range is hidden or replaced", which
 * is exactly the set the caret must step over rather than into. If a future
 * decoration breaks that rule, the symptom is a caret that skips text it should
 * be able to enter -- so keep replace decorations classless and style their
 * widgets instead.
 */
function decorate(state, opts) {
  return finish(buildDecorations(state, fullRange(state), opts));
}

/**
 * Only what an edit or a caret move can change, rebuilt; the rest of the decorations mapped through the change.
 * Rebuilding the whole note on every key cost a 4.5 MB note (pictures inlined as data: URLs) 22 ms a key at the
 * median and 300 ms at worst — every rendered block's source sliced, hashed and looked up again (measured in Atlas). The region is whole top-level blocks (a paragraph, a list, a fence, a heading) around
 * the changes and around the old and new selection: every node that overlaps it lies inside it, so dropping the old
 * decorations there and adding the new ones leaves nothing twice. Null — rebuild everything — when the edit can
 * change the structure beyond its block (a fence, $$, HTML, a front matter or rule line, typed or deleted), on an
 * effect that asks for it, or when the parse is not where the edit is.
 */
const STRUCTURAL = /```|~~~|\$\$|<|^---|^\s*\|/m;
function redecorate_(value, tr, opts) {
  if (tr.effects.some((e) => e.is(toggleCalloutFold) || e.is(redecorate))) return null;
  const state = tr.state, tree = syntaxTree(state), oldTreeFull = syntaxTree(tr.startState);
  // the parser caught up (a tree changed with no edit), or the last pass drew from a partial parse, or this one would:
  // everything again — a big note opens before it is parsed through, and only a full pass draws what came later
  if (!tr.docChanged && oldTreeFull !== tree) return null;
  if (tree.length < state.doc.length || oldTreeFull.length < tr.startState.doc.length) return null;
  const spans = [], oldSpans = [], oldTree = oldTreeFull;
  let structural = false;
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (STRUCTURAL.test(inserted.toString()) || STRUCTURAL.test(tr.startState.sliceDoc(fromA, toA))) structural = true;
    spans.push([fromB, toB]);
    oldSpans.push([fromA, toA]);
  });
  if (structural) return null;
  for (const r of tr.startState.selection.ranges) spans.push([tr.changes.mapPos(r.from), tr.changes.mapPos(r.to)]);
  for (const r of state.selection.ranges) spans.push([r.from, r.to]);
  // each span widened to the top-level blocks it touches (the document's children)
  let from = state.doc.length, to = 0;
  for (const [a, b] of spans) {
    const start = topBlock(tree, a, 1), end = topBlock(tree, b, -1);
    from = Math.min(from, start ? start.from : state.doc.lineAt(a).from);
    to = Math.max(to, end ? end.to : state.doc.lineAt(b).to);
  }
  if (from > to) return null;
  from = state.doc.lineAt(from).from;
  to = state.doc.lineAt(to).to;
  // a heading touched (before or after the edit) can change what is drawn elsewhere — the inline title at the top
  // hides when the note's first heading says the same — so the whole note is drawn again
  if (touchesHeading(tree, from, to) || oldSpans.some(([a, b]) => touchesHeading(oldTree, a, b))) return null;
  const fresh = buildDecorations(state, [{ from, to }], opts);
  const add = [];
  fresh.between(from, to, (f, t, v) => { add.push(v.range(f, t)); });
  const deco = value.deco.map(tr.changes).update({ filterFrom: from, filterTo: to, filter: () => false, add, sort: true });
  return finish(deco);
}
function touchesHeading(tree, from, to) {
  let hit = false;
  tree.iterate({ from, to, enter: (n) => { if (/Heading/.test(n.name)) { hit = true; return false; } } });
  return hit;
}
/** The top-level block at `pos` (a child of the document node), looking to the given side of it first. */
function topBlock(tree, pos, side) {
  let node = tree.resolveInner(pos, side);
  while (node.parent && node.parent.parent) node = node.parent;
  return node.parent ? node : null; // the document itself: between blocks
}

/** A decoration set with what the editor reads from it: the rendered blocks and the atomic ranges. */
function finish(deco) {
  // The block-replaced ranges, kept as plain offsets so the arrow-key handler
  // can ask "would this motion land inside a rendered block?" cheaply.
  const blocks = [];
  deco.between(0, 1e12, (from, to, value) => {
    if (value.spec?.block && !value.spec.skipEntry) blocks.push({ from, to });
  });
  return {
    deco,
    blocks,
    // Atomic: hidden syntax marks and INLINE widgets (an image, a formula) --
    // text the caret would otherwise get stranded inside.
    //
    // NOT atomic: block widgets. A rendered block has to be enterable, or
    // arrowing down through the note steps over it and there is no way to edit
    // it from the keyboard at all. Walking into one is precisely what reveals
    // its markdown, which is the whole interaction this editor is built around.
    atomic: deco.update({
      filter: (_from, _to, value) => !value.spec?.class && !value.spec?.block,
    }),
  };
}

/** The whole document, as the single range `buildDecorations` should cover. */
function fullRange(state) {
  return [{ from: 0, to: state.doc.length }];
}
