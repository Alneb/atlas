// Obsidian's markdown syntax for the editor's parser. Started in obsidian-web (web/src/engine/cm/obsidian-syntax.js),
// now Atlas's own: changed here. Types: ./obsidian-syntax.d.ts

// Obsidian-flavored Markdown syntax for the Lezer parser behind CodeMirror 6.
//
// WHY THIS FILE EXISTS
// --------------------
// No published package parses the syntax this vault actually uses. A survey of
// the real 2122-note vault found:
//
//     wikilinks [[x]]   472 files      ==highlight==     49 files
//     embeds  ![[x]]    291 files      inline math $x$   99 files
//     callouts > [!x]   213 files      block math $$     52 files
//
// Generic engines (remark, Lute, GFM) know none of these. That matters far more
// than convenience: this vault is synced by Syncthing to a phone and a second
// machine, so an editor that *reserializes* markdown would quietly rewrite every
// construct it failed to understand, and the damage would replicate.
//
// CodeMirror avoids that entirely. The document is always the raw file text; the
// parser only labels regions so the live-preview layer can *draw over* them. Text
// we fail to parse is simply text we fail to decorate -- never text we corrupt.
// This is the same architecture Obsidian itself uses (its bundle ships the CM6
// DOM: cm-content, cm-scroller, cm-cursorLayer).
//
// NOTE ON CALLOUTS: they are deliberately NOT parsed here. A callout is an
// ordinary Blockquote whose first line begins `[!type]`, so the stock parser
// already produces the right tree shape; the decoration layer recognises it by
// inspecting that first line. Adding a block parser would mean re-implementing
// blockquote nesting for no gain.

import { styleTags, tags as t } from "@lezer/highlight";

// Character codes, named so the parse functions below read as prose.
const CH_NEWLINE = 10;
const CH_BANG = 33; // !
const CH_HASH = 35; // #
const CH_DOLLAR = 36; // $
const CH_EQUALS = 61; // =
const CH_BACKSLASH = 92; // \
const CH_OPEN_BRACKET = 91; // [
const CH_COLON = 58; // :

/**
 * Scan forward for `close`, refusing to cross a line break or a nested `[`.
 *
 * Obsidian link targets may not contain brackets or newlines, so bailing on
 * either is what keeps an unterminated `[[` from swallowing the rest of the
 * paragraph -- the failure mode that makes a live-preview editor feel broken.
 *
 * @returns the document position of `close`, or -1 if not found.
 */
function scanForClose(cx, from, close) {
  for (let pos = from; pos <= cx.end - close.length; pos++) {
    const ch = cx.char(pos);
    if (ch === CH_NEWLINE || ch === CH_OPEN_BRACKET) return -1;
    if (cx.slice(pos, pos + close.length) === close) return pos;
  }
  return -1;
}

/**
 * Build the children of a `[[target|alias]]` body, so the decoration layer can
 * hide the marks and the target while showing only the alias -- exactly what
 * Obsidian renders.
 *
 * @param bodyFrom/bodyTo the span between the opening and closing brackets.
 */
function linkBodyChildren(cx, openFrom, bodyFrom, bodyTo, closeTo) {
  const children = [cx.elt("WikilinkMark", openFrom, bodyFrom)];
  // A '|' splits target from display text. Search only the body, never past it.
  let pipe = -1;
  for (let pos = bodyFrom; pos < bodyTo; pos++) {
    if (cx.char(pos) === 124 /* | */) {
      pipe = pos;
      break;
    }
  }
  if (pipe < 0) {
    children.push(cx.elt("WikilinkTarget", bodyFrom, bodyTo));
  } else {
    children.push(cx.elt("WikilinkTarget", bodyFrom, pipe));
    children.push(cx.elt("WikilinkMark", pipe, pipe + 1));
    children.push(cx.elt("WikilinkAlias", pipe + 1, bodyTo));
  }
  children.push(cx.elt("WikilinkMark", bodyTo, closeTo));
  return children;
}

// --- [[wikilink]] and [[wikilink|alias]] ------------------------------------
// Must run before the stock "Link" parser, which also claims '['.
const Wikilink = {
  defineNodes: [
    { name: "Wikilink" },
    { name: "WikilinkMark" },
    { name: "WikilinkTarget" },
    { name: "WikilinkAlias" },
  ],
  parseInline: [
    {
      name: "Wikilink",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== CH_OPEN_BRACKET || cx.char(pos + 1) !== CH_OPEN_BRACKET) return -1;
        const close = scanForClose(cx, pos + 2, "]]");
        if (close < 0 || close === pos + 2) return -1; // unterminated or empty
        return cx.addElement(
          cx.elt("Wikilink", pos, close + 2, linkBodyChildren(cx, pos, pos + 2, close, close + 2))
        );
      },
    },
  ],
};

// --- ![[embed]] -------------------------------------------------------------
// Must run before "Image", which claims '!'. Kept a distinct node from Wikilink
// because the decoration layer renders it very differently: an embed becomes a
// block widget (image, or a transcluded note), a wikilink stays inline text.
const Embed = {
  defineNodes: [{ name: "Embed" }],
  parseInline: [
    {
      name: "Embed",
      before: "Image",
      parse(cx, next, pos) {
        if (
          next !== CH_BANG ||
          cx.char(pos + 1) !== CH_OPEN_BRACKET ||
          cx.char(pos + 2) !== CH_OPEN_BRACKET
        )
          return -1;
        const close = scanForClose(cx, pos + 3, "]]");
        if (close < 0 || close === pos + 3) return -1;
        return cx.addElement(
          cx.elt("Embed", pos, close + 2, linkBodyChildren(cx, pos, pos + 3, close, close + 2))
        );
      },
    },
  ],
};

// --- ==highlight== ----------------------------------------------------------
// Delimiter-based so it nests correctly with emphasis, matching how the stock
// parser handles '*' and '_'.
const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

const Highlight = {
  defineNodes: [{ name: "Highlight" }, { name: "HighlightMark" }],
  parseInline: [
    {
      name: "Highlight",
      after: "Emphasis",
      parse(cx, next, pos) {
        if (next !== CH_EQUALS || cx.char(pos + 1) !== CH_EQUALS) return -1;
        // A third '=' means a Setext underline or a divider, not a highlight.
        if (cx.char(pos + 2) === CH_EQUALS) return -1;
        return cx.addDelimiter(HighlightDelim, pos, pos + 2, true, true);
      },
    },
  ],
};

// --- footnotes [^id] ---------------------------------------------------------
// A reference `[^id]` anywhere; at the start of a line followed by `:` it is the definition's label.
// Both are one node with the brackets as marks, so live preview can hide them like other syntax.
const Footnote = {
  defineNodes: [{ name: "FootnoteRef" }, { name: "FootnoteLabel" }, { name: "FootnoteMark" }],
  parseInline: [
    {
      name: "FootnoteRef",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== 91 /* [ */ || cx.char(pos + 1) !== 94 /* ^ */) return -1;
        let end = pos + 2;
        while (end < cx.end && /[\w-]/.test(String.fromCharCode(cx.char(end)))) end++;
        if (end === pos + 2 || cx.char(end) !== 93 /* ] */) return -1;
        const label = pos === cx.offset && cx.char(end + 1) === 58; /* ':' at line start → definition */
        return cx.addElement(cx.elt(label ? "FootnoteLabel" : "FootnoteRef", pos, end + 1, [
          cx.elt("FootnoteMark", pos, pos + 2),
          cx.elt("FootnoteMark", end, end + 1),
        ]));
      },
    },
  ],
};

// --- $inline math$ ----------------------------------------------------------
const InlineMath = {
  defineNodes: [{ name: "InlineMath" }, { name: "MathMark" }],
  parseInline: [
    {
      name: "InlineMath",
      before: "Escape",
      parse(cx, next, pos) {
        if (next !== CH_DOLLAR) return -1;
        if (cx.char(pos + 1) === CH_DOLLAR) return -1; // '$$' belongs to BlockMath
        for (let scan = pos + 1; scan < cx.end; scan++) {
          const ch = cx.char(scan);
          if (ch === CH_NEWLINE) return -1; // inline math is single-line
          if (ch === CH_BACKSLASH) {
            scan++; // \$ is a literal dollar, not a terminator
            continue;
          }
          if (ch === CH_DOLLAR) {
            if (scan === pos + 1) return -1; // "$$" empty span
            return cx.addElement(
              cx.elt("InlineMath", pos, scan + 1, [
                cx.elt("MathMark", pos, pos + 1),
                cx.elt("MathMark", scan, scan + 1),
              ])
            );
          }
        }
        return -1;
      },
    },
  ],
};

// --- #tag -------------------------------------------------------------------
// Obsidian requires at least one non-numeric character, which is what stops
// "#1" in prose ("issue #1") from becoming a tag.
const TAG_BODY = /[\p{L}\p{N}_/-]/u;
const TAG_HAS_LETTER = /[\p{L}_/-]/u;

const Tag = {
  defineNodes: [{ name: "Tag" }],
  parseInline: [
    {
      name: "Tag",
      parse(cx, next, pos) {
        if (next !== CH_HASH) return -1;
        // Only at a word boundary, so a URL fragment (#section) is left alone.
        if (pos > cx.offset) {
          const prev = String.fromCharCode(cx.char(pos - 1));
          if (!/\s/.test(prev)) return -1;
        }
        let end = pos + 1;
        while (end < cx.end && TAG_BODY.test(String.fromCharCode(cx.char(end)))) end++;
        if (end === pos + 1) return -1;
        if (!TAG_HAS_LETTER.test(cx.slice(pos + 1, end))) return -1;
        return cx.addElement(cx.elt("Tag", pos, end));
      },
    },
  ],
};

// --- :IconName: (Iconize) ---------------------------------------------------
// The reader turns these into an icon span, so the editor has to know they are
// one token rather than prose -- otherwise a daily note's headings read
// ":LiInbox: Capturas de hoy" while the reader shows an inbox glyph and the
// title alone. Measured on four separate daily notes before this existed.
//
// THE RULE IS COPIED FROM THE SERVER (src/markdown.rs) ON PURPOSE: the inner
// name must start with an uppercase ASCII letter and be alphanumeric, which is
// what keeps `http://`, a time like `12:30` and lowercase emoji like `:tada:`
// out of it. If one side's rule changes the other must change with it, or the
// same text renders two ways.
const ICON_BODY = /[A-Za-z0-9]/;

/**
 * Is this whole token an Iconize icon?
 *
 * Exported because WHO produces the node depends on which parser is configured:
 * with GFM (what the editor runs) the stock `Emoji` inline parser claims `:...:`
 * first and the Icon rule below never sees it; without GFM (what the syntax
 * tests configure) the Icon rule does. Positioning this parser `before: "Emoji"`
 * looked like the fix and is not: it throws `unknown parser Emoji` wherever GFM
 * is absent, which took a whole test FILE out of the run -- the test count fell
 * from 63 to 52 while still reporting a single failure.
 *
 * So the decoration layer accepts either node and checks the text with this,
 * and the two paths cannot disagree about what an icon is.
 */
export function isIconToken(text) {
  return /^:[A-Z][A-Za-z0-9]*:$/.test(text);
}

const Icon = {
  defineNodes: [{ name: "Icon" }],
  parseInline: [
    {
      name: "Icon",
      parse(cx, next, pos) {
        if (next !== CH_COLON) return -1;
        const first = String.fromCharCode(cx.char(pos + 1));
        if (!/[A-Z]/.test(first)) return -1;
        let end = pos + 1;
        while (end < cx.end && ICON_BODY.test(String.fromCharCode(cx.char(end)))) end++;
        // Needs at least one character of name and a closing colon.
        if (end === pos + 1 || end >= cx.end || cx.char(end) !== CH_COLON) return -1;
        return cx.addElement(cx.elt("Icon", pos, end + 1));
      },
    },
  ],
};

// --- $$ block math $$ -------------------------------------------------------
// A block parser rather than an inline one because these routinely span many
// lines. Follows the same shape as lezer's own FencedCode: `line` is mutated in
// place by cx.nextLine(), and cx.lineStart tracks the current line's offset.
const BlockMath = {
  defineNodes: [{ name: "BlockMath" }],
  parseBlock: [
    {
      name: "BlockMath",
      before: "LinkReference",

      /**
       * Let a `$$` line interrupt a paragraph.
       *
       * `parse` is only ever consulted at the START of a block, so without this
       * a `$$` fence written directly under a line of prose -- no blank line
       * between, which is how much of this vault is written -- stays swallowed
       * inside the Paragraph and no BlockMath node is ever produced. The formula
       * then renders as loose `$$` lines with raw TeX between them, which is
       * exactly the "multi-line $$ is broken in real notes" bug.
       *
       * Returning true here ends the leaf block, so the line is reconsidered as
       * the start of a new one and `parse` below gets its chance.
       */
      endLeaf(cx, line) {
        const rest = line.text.slice(line.pos);
        return rest.startsWith("$$") || rest.startsWith("\\[");
      },

      parse(cx, line) {
        const rest = line.text.slice(line.pos);
        // `\[ … \]` too (LaTeX display math): the same rules with its own closer
        const tex = rest.startsWith("\\[");
        if (!tex && !rest.startsWith("$$")) return false;
        const closer = tex ? "\\]" : "$$";
        // Obsidian pairs `$$` delimiters wherever they sit on a line, not only at line ends:
        //   $$ x = 1 $$          one-line formula
        //   …\ket{e} $$which in…  the closer mid-line, prose after it on the same line
        //   $$$$                 closes one formula and opens the next
        // A block ends at the end of its closing line; trailing prose is part of the node and
        // renders with it (blockHtml pairs the same way). Ending only at lines that END with
        // `$$` desynchronised every later formula of a note (Internship Porto: 9 KaTeX errors).
        const from = cx.lineStart + line.pos;
        let col = line.pos + 2; // where the closer search starts on the current line
        for (;;) {
          let idx = line.text.indexOf(closer, col);
          while (idx < 0) {
            if (!cx.nextLine()) {
              // unterminated: runs to end of document, like an unclosed fence
              cx.addElement(cx.elt("BlockMath", from, cx.prevLineEnd()));
              return true;
            }
            idx = line.text.indexOf(closer, line.pos);
          }
          const closeEnd = idx + 2;
          const after = line.text.slice(closeEnd);
          if (!tex && after.startsWith("$$") && after.indexOf("$$", 2) < 0) {
            // `$$$$`: the next formula opens right here. Both stay ONE node -- a block replaced
            // from mid-line cannot be drawn -- and blockHtml renders the two formulas from it.
            col = closeEnd + 2;
            continue;
          }
          cx.addElement(cx.elt("BlockMath", from, cx.lineStart + line.text.length));
          cx.nextLine();
          return true;
        }
      },
    },
  ],
};

// Highlight tags. These drive syntax colouring of the *source* text -- the
// live-preview layer adds its own classes on top for the rendered look.
const obsidianHighlighting = {
  props: [
    styleTags({
      "WikilinkMark HighlightMark MathMark": t.processingInstruction,
      WikilinkTarget: t.link,
      WikilinkAlias: t.link,
      Wikilink: t.link,
      Embed: t.link,
      Highlight: t.special(t.emphasis),
      "InlineMath BlockMath": t.atom,
      Tag: t.tagName,
      Icon: t.atom,
    }),
  ],
};

/**
 * The full set, for `markdown({ extensions: obsidianMarkdown })`.
 *
 * Order matters: Embed must precede Wikilink so `![[x]]` is not first claimed as
 * `!` + `[[x]]`.
 */
export const obsidianMarkdown = [
  // Indented code blocks off: this vault indents continuation prose (under a list item, after a
  // `$$` block) with a tab or 4 spaces, which CommonMark turns into code -- raw `$a$` on screen.
  { remove: ["IndentedCode"] },
  Embed,
  Footnote,
  Wikilink,
  Highlight,
  InlineMath,
  BlockMath,
  Tag,
  Icon,
  obsidianHighlighting,
];

/**
 * Atlas: a task box with any one status, as Obsidian reads it -- `[-]` (cancelled), `[/]`, `[>]`… -- and not only
 * GFM's `[ ]` / `[x]`. Gives the same `Task` / `TaskMarker` nodes as GFM's TaskList, so it needs GFM's nodes (the
 * editor's `markdownLanguage`) and runs before it.
 */
class AnyTaskParser {
  nextLine() { return false; }
  finish(cx, leaf) {
    cx.addLeafElement(leaf, cx.elt("Task", leaf.start, leaf.start + leaf.content.length, [
      cx.elt("TaskMarker", leaf.start, leaf.start + 3),
      ...cx.parser.parseInline(leaf.content.slice(3), leaf.start + 3),
    ]));
    return true;
  }
}
export const AnyTaskStatus = {
  parseBlock: [{
    name: "AnyTaskStatus",
    before: "TaskList",
    leaf(cx, leaf) {
      return /^\[[^ xX\]\n\\]\][ \t]/.test(leaf.content) && cx.parentType().name == "ListItem" ? new AnyTaskParser() : null;
    },
  }],
};
