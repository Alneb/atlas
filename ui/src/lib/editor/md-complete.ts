// Obsidian/Notion-style typing aids for markdown: `[[` / `![[` link completion (files, then
// `#heading`), and a `/` slash menu of blocks. Each is a CodeMirror completion source.
import { snippet, startCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { noteHeadings } from "../note-anchor";
import { fences } from "../fence-walk";
import { noteEquations, texKey } from "../equations";
import { api } from "../api";
import { linkRow } from "../link-rows";
import { taskSuggestions, type TaskSuggestion } from "../task-complete";
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { Command } from "@codemirror/view";
import { library } from "../entities";
import { builtinOn } from "../builtin-plugins";
import { resolveWikilink } from "../links";
import { notePlaceAt } from "./math-context";
import type { LinkTarget, Paper } from "../types";
import { settings } from "../settings.svelte";
import { localDay } from "../local-day";
import { splitFrontmatter } from "../property-model";
import type { GatedSource } from "./completion-gate";


/** Enter in a list: the next item's marker; on an empty item, the list ends (Obsidian). CodeMirror's
 *  default turned an empty second item into a blank line plus a new `- [ ]`, then every later Enter
 *  added a blank line too. */
export const continueList = insertNewlineContinueMarkupCommand({ nonTightLists: false });
/** Backspace right after a task's box takes one step back: `- [ ] ` → `- ` → nothing (Obsidian). CodeMirror's
 *  `deleteMarkupBackward` removed the whole `- [ ] ` at once. */
export const backspaceMarkup: Command = (view) => {
  const r = view.state.selection.main;
  if (!r.empty) return false;
  const line = view.state.doc.lineAt(r.head);
  const box = /^(\s*(?:[-*+]|\d+[.)])\s+)\[.\] ?$/.exec(line.text.slice(0, r.head - line.from));
  if (box) {
    view.dispatch({ changes: { from: line.from + box[1].length, to: r.head }, userEvent: "delete.backward" });
    return true;
  }
  return deleteMarkupBackward(view);
};

/** The capture boxes' short forms, in a note too: `[] ` or `todo ` (any case) starting a line (or a list
 *  item) becomes `- [ ] `, and the task fields are offered at once. */
export const taskShortForms = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== " " || from !== to || !(settings.config?.editor.task_short_forms ?? true)) return false;
  const line = view.state.doc.lineAt(from);
  const m = /^(\s*)(?:[-*+] )?(?:\[\]|todo)$/i.exec(line.text.slice(0, from - line.from));
  if (!m) return false;
  const insert = `${m[1]}- [ ] `;
  // "input.type": the list opens as it does for typing (not as asked for, which would hide the ⏎ row)
  view.dispatch({ changes: { from: line.from, to, insert }, selection: { anchor: line.from + insert.length }, userEvent: "input.type" });
  return true;
});


/** `[[name` → notes; `![[name` → any file; `[[note#head` → that note's headings. */
const LINK_BEFORE = /!?\[\[[^\]\n]*$/;
export function wikilinkSource(fromPath: string): GatedSource {
  return {
    applies: (ctx) => (settings.config?.editor.link_completion ?? true) && !!ctx.matchBefore(LINK_BEFORE),
    answer: (ctx) => linkResult(ctx, ctx.matchBefore(LINK_BEFORE)!, fromPath),
  };
}

/** `p`'s answer if it comes within a frame or so, else `none` (it goes on loading for the next ask). */
const promptly = <T,>(p: Promise<T>, none: T, ms = 150): Promise<T> => Promise.race([p, new Promise<T>((done) => setTimeout(() => done(none), ms))]);

async function linkResult(ctx: CompletionContext, m: { from: number; text: string }, fromPath: string): Promise<CompletionResult | null> {
  const embed = m.text.startsWith("!");
  const inner = m.text.slice(embed ? 3 : 2);
  const from = m.from + (embed ? 3 : 2);
  const closing = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === "]]" ? "" : "]]";
  const hash = inner.indexOf("#");
  if (hash >= 0) return placesIn(inner.slice(0, hash), inner.slice(hash + 1), from + hash + 1, closing, fromPath);
  // papers by author, year or title words → [[citekey]], the paper's note
  // the Library only if it answers at once: its helper may be slow or busy, and the list never waits on it (the papers'
  // notes are listed by the core anyway; the next keystroke finds the Library loaded)
  const papers = !embed && inner.trim() && builtinOn("library") ? citeMatches(await promptly(library().catch(() => [] as Paper[]), [] as Paper[]), inner) : [];
  // only a citekey or an author that starts with the query goes before the notes; a title word does not
  const paperRow = (m: CiteMatch) => ({ ...citeRow(m.paper, (k) => k + closing), type: "note" });
  const leading = papers.filter((m) => m.rank <= 1).slice(0, 5);
  const cited = new Set(leading.map((m) => m.paper.key));
  // every file kind, ranked by the core (link_targets.rs): match quality, then opened / linked / changed lately;
  // daily notes below the rest unless a date is typed
  const targets = (await api.linkTargets(inner, fromPath).catch(() => [] as LinkTarget[])).filter((t) => !cited.has(t.link));
  const listed = new Set(targets.map((t) => t.link));
  const trailing = papers.filter((m) => !cited.has(m.paper.key) && !listed.has(m.paper.key)); // a paper's note the core lists stays where it ranks
  if (ctx.aborted) return null;
  const options: Completion[] = targets.map((t, i) => ({
    ...(({ label, detail }) => ({ label, detail }))(linkRow(t)), // the capture boxes' rows too (link-rows.ts)
    type: t.kind,
    boost: -i, // the core's order
    apply: (embed ? t.link : linkRow(t).link) + closing,
    info: t.kind === "note" || t.kind === "mail" ? () => preview(t.path) : undefined,
  }));
  // a name nothing has yet: the link is written, the note is made when it is followed (as in Obsidian)
  const typed = inner.trim();
  const fresh: Completion[] = typed && !embed && !targets.some((t) => t.link.toLowerCase() === typed.toLowerCase())
    ? [{ label: typed, detail: "new note", type: "new", boost: -999, apply: typed + closing }] : [];
  return { from, options: [...leading.map(paperRow), ...options, ...trailing.map(paperRow), ...fresh], filter: false };
}

/** After `#`: the target's headings; after `#^`: its block ids, with the line they mark. */
async function placesIn(note: string, after: string, from: number, closing: string, fromPath: string): Promise<CompletionResult> {
  const path = note ? await resolveWikilink(note, fromPath) : fromPath;
  const text = await api.file(path).then((f) => f.text, () => "");
  if (after.startsWith("^")) {
    // as a link finds them (note-anchor.ts `anchorLine`): a line ending in ` ^id`, or `^id` alone under its block
    const lines = text.split("\n"), code = fences(), blocks: Completion[] = [];
    for (let i = 0; i < lines.length; i++) {
      const b = !code.code(lines[i]) && /^(.*?)(?:^|\s)\^([\w-]+)\s*$/.exec(lines[i]);
      if (!b) continue;
      const said = (b[1].trim() || lines[i - 1]?.trim() || "").slice(0, 60);
      blocks.push({ label: `^${b[2]}`, detail: said, type: "block", apply: `^${b[2]}${closing}` });
    }
    // a numbered equation's label (lib/equations.ts): its number and formula, once (its `$$ ^id` line is a block id too)
    const eqs = noteEquations(text);
    for (const [id, n] of eqs.byId) {
      const [a, b] = eqs.spanOf.get(id)!;
      const tex = texKey(lines.slice(a - 1, b).join("\n")).replace(/\\label\{[^}]*\}/g, "").replace(/\s+/g, " ");
      const k = blocks.findIndex((c) => c.label === `^${id}`);
      if (k >= 0) blocks.splice(k, 1);
      blocks.push({ label: `^${id}`, detail: `(${n}) ${tex.slice(0, 50)}`, type: "equation", apply: `^${id}${closing}` });
    }
    // a figure: its number and caption
    for (const [id, n] of eqs.figures) {
      const k = blocks.findIndex((c) => c.label === `^${id}`);
      if (k >= 0) blocks[k] = { ...blocks[k], detail: `Figure ${n}. ${blocks[k].detail ?? ""}`.slice(0, 70), type: "figure" };
    }
    return { from, options: blocks, validFor: /^\^?[\w:-]*$/ };
  }
  const heads = noteHeadings(text.split("\n")).map((h) => h.text);
  return { from, options: heads.map((h) => ({ label: h, type: "heading", apply: h + closing })), validFor: /^[^\]\n]*$/ };
}

/** The selected row's note, its first lines (frontmatter left out), beside the list. */
async function preview(path: string): Promise<Node> {
  const text = await api.file(path).then((f) => f.text, () => "");
  const el = document.createElement("div");
  el.className = "cm-link-preview";
  el.textContent = splitFrontmatter(text).body.trim().slice(0, 600) || "(empty)";
  return el;
}

type Block = { label: string; detail: string; template: string };
const today = () => localDay();
const BLOCKS: Block[] = [
  { label: "Heading 1", detail: "#", template: "# ${}" },
  { label: "Heading 2", detail: "##", template: "## ${}" },
  { label: "Heading 3", detail: "###", template: "### ${}" },
  { label: "To-do", detail: "- [ ]", template: "- [ ] ${}" },
  { label: "Bulleted list", detail: "-", template: "- ${}" },
  { label: "Numbered list", detail: "1.", template: "1. ${}" },
  { label: "Quote", detail: ">", template: "> ${}" },
  ...["note", "tip", "important", "warning", "question", "example", "abstract", "quote"].map((k) => ({
    label: `Callout: ${k}`, detail: `> [!${k}]`, template: `> [!${k}] \${title}\n> \${}`,
  })),
  { label: "Math block", detail: "$$ … $$", template: "$$\n${}\n$$" },
  { label: "Aligned equations", detail: "\\begin{aligned}", template: "$$\\begin{aligned}\n${} &= ${} \\\\\n\\end{aligned}$$" },
  { label: "Inline math", detail: "$ … $", template: "$${}$" },
  { label: "Code block", detail: "```", template: "```${lang}\n${}\n```" },
  { label: "Table", detail: "| a | b |", template: "| ${Column} | ${Column} |\n| --- | --- |\n| ${} |  |" },
  { label: "Divider", detail: "---", template: "\n---\n${}" },
  { label: "Footnote", detail: "[^1]", template: "[^${1}]" },
  { label: "Link to note", detail: "[[ ]]", template: "[[${}]]" },
  { label: "Embed", detail: "![[ ]]", template: "![[${}]]" },
  { label: "Date", detail: "today", template: "" },
  { label: "Time", detail: "now", template: "" },
];

/** `/` at the start of a line or after a space (outside math and code) opens the block menu. */
export const slashSource = (ctx: CompletionContext): CompletionResult | null => {
  if (!(settings.config?.editor.slash_menu ?? true)) return null;
  const m = ctx.matchBefore(/(?:^|\s)\/[\w-]*$/);
  if (!m) return null;
  const slash = m.text.lastIndexOf("/") + m.from;
  // text only: not in math, nor in code (a path typed in a shell fence, `/usr`, is not a block)
  if (notePlaceAt(ctx.state, slash).kind !== "text") return null;
  return {
    from: slash + 1, // filter on what follows the slash; apply() removes the slash too
    options: BLOCKS.map((b) => ({
      label: b.label,
      detail: b.detail,
      type: "keyword",
      boost: b.label.startsWith("Heading") || b.label === "To-do" ? 2 : 0,
      apply: (view, _c, afterSlash, to) => {
        const from = afterSlash - 1;
        if (b.label === "Date") return view.dispatch({ changes: { from, to, insert: today() }, selection: { anchor: from + 10 } });
        if (b.label === "Time") {
          const t = new Date().toTimeString().slice(0, 5);
          return view.dispatch({ changes: { from, to, insert: t }, selection: { anchor: from + t.length } });
        }
        snippet(b.template)(view, _c, from, to);
      },
    })),
    validFor: /^[\w-]*$/,
  };
};

// --- citations from the Library (cache shared with the mention chips: lib/entities.ts) -----------
/** A paper the query matched; rank 0 its citekey starts with the query, 1 an author does, 2 the key holds it, 3 the rest. */
type CiteMatch = { paper: Paper; rank: 0 | 1 | 2 | 3 };

/** Words of the query must all appear in the key, authors, year or title (any order); best rank, then newest, first. */
function citeMatches(list: Paper[], q: string): CiteMatch[] {
  const words = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const w = words[0] ?? "";
  const rank = (p: Paper): CiteMatch["rank"] =>
    p.key.toLowerCase().startsWith(w) ? 0 : p.authors.some((a) => a.toLowerCase().startsWith(w)) ? 1 : p.key.toLowerCase().includes(w) ? 2 : 3;
  return list
    .filter((p) => words.every((x) => `${p.key} ${p.authors.join(" ")} ${p.year ?? ""} ${p.title}`.toLowerCase().includes(x)))
    .map((paper) => ({ paper, rank: rank(paper) }))
    .sort((a, b) => a.rank - b.rank || Number(b.paper.year ?? 0) - Number(a.paper.year ?? 0))
    .slice(0, 40);
}

const citeRow = (p: Paper, apply: (k: string) => string): Completion => ({
  label: p.key,
  detail: `${p.authors[0]?.split(",")[0] ?? ""}${p.authors.length > 1 ? " et al." : ""} ${p.year ?? ""}`.trim(),
  info: p.title,
  type: "variable",
  apply: apply(p.key),
});

/** `\cite{hub` / `\citep{a, hub` (notes and .tex) → the key. A note cites with a wikilink, `[[citekey]]` (linkResult); the
 *  `@key` completion was removed on 2026-10-15 ("i think you made a @ command to cite things, we shouldnt"). */
const CITE_BEFORE = /\\(?:cite|citep|citet|citealt|autocite|parencite|textcite|footcite)\*?(?:\[[^\]]*\])*\{(?:[^}\s]*,\s*)*[^},\s]*$/;
export const citeApplies = (ctx: CompletionContext): boolean => !!ctx.matchBefore(CITE_BEFORE);
export function citeSource(_md: boolean) {
  return (ctx: CompletionContext): Promise<CompletionResult | null> | null => {
    const tex = ctx.matchBefore(CITE_BEFORE);
    if (tex) {
      const start = tex.from + tex.text.length - (/[^{,\s]*$/.exec(tex.text)?.[0].length ?? 0);
      const q = ctx.state.sliceDoc(start, ctx.pos);
      return library().then((l) => ({ from: start, options: citeMatches(l, q).map((m) => citeRow(m.paper, (k) => k)), filter: false }));
    }
    return null;
  };
}

// --- tasks: the Obsidian Tasks fields, on a to-do line (rules: task_suggest.rs in the core) -------------
// A word that starts a field's name (due, high, repeats…) lists the fields under a first "new line"
// row, so Enter after an ordinary word still makes a new line; Tab or ↓ go to the fields. After a
// date field (or `@`) the days come, as typed ("next fri", "in 3 days"), written as YYYY-MM-DD.
const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[.\]\s/;
/** A task row carries its suggestion: the list draws its icon (`taskIcon` in create.ts). */
export type TaskCompletion = Completion & { task: TaskSuggestion; browsing: boolean };
export const taskSource: GatedSource = {
  // `[editor] task_suggest`: "always" is Obsidian Tasks with "minimum match 0"
  // not inside an open `[[`: there the list is the link's alone (the fields came after the notes, as if a link had one)
  applies: (ctx) => TASK_LINE.test(ctx.state.doc.lineAt(ctx.pos).text) && !ctx.matchBefore(LINK_BEFORE) && ((settings.config?.editor.task_suggest ?? "always") !== "off" || ctx.explicit),
  answer: taskAnswer,
};

async function taskAnswer(ctx: CompletionContext): Promise<CompletionResult | null> {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const mode = settings.config?.editor.task_suggest ?? "always";
  const found = await taskSuggestions(line.text.slice(0, ctx.pos - line.from), { explicit: ctx.explicit, at: true, browse: mode === "always", keepEnter: true });
  if (!found || ctx.aborted) return null;
  const from = ctx.pos - found.replace;
  return { from, filter: false, options: found.items.map((it, i): TaskCompletion => ({
    label: it.label, detail: it.detail, type: "task", boost: 50 - i, task: it, browsing: found.browsing,
    apply: (view, _c, f, to) => {
      if (it.icon === "new_line") { continueList(view); return; }
      view.dispatch({ changes: { from: f, to, insert: it.insert }, selection: { anchor: f + it.insert.length }, userEvent: "input.complete" });
      if (it.more) requestAnimationFrame(() => startCompletion(view)); // straight on to the dates / the rules
    },
  })) };
}
