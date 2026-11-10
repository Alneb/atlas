// What a note's editor adds to the shared base (create.ts): the live preview (live/live-preview.js + KaTeX) with
// Atlas's renderers, Obsidian's folds, list continuation, the typing aids and their completions, files pasted or
// dropped saved beside the note, and the settings-driven options (heading folds, typewriter scrolling).
import { basename, dirOf, shownName } from "../paths";
import { renameTo } from "../rename-file";
import { noteHtml } from "./big-html";
import { attachFiles, takeFiles } from "../attach";
import { closeDisplayMath } from "./display-math";
import { wikilinkSource, slashSource, citeSource, citeApplies, taskSource, continueList, backspaceMarkup, taskShortForms, type TaskCompletion } from "./md-complete";
import { taskIconEl } from "../task-complete";
import { taskChips } from "./task-chips";
import { tickTaskLine } from "./task-tick";
import { settings } from "../settings.svelte";
import type { WorkspaceConfig } from "../types";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { foldGutter, foldNodeProp, foldKeymap } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownConfig } from "@lezer/markdown";
import { obsidianMarkdown, AnyTaskStatus } from "./live/obsidian-syntax.js";
import { livePreview, bodyStart, frontmatterClose, redecorate } from "./live/live-preview.js";
import { equationLabelNow, equationTarget, linkText, noteEquations, numberedTex, texKey, type Equations } from "../equations";
import { readText } from "../vault-files";
import { renderMathInto } from "../math";
import { highlightCode } from "../highlight";
import { blockHtml, inlineHtml } from "../markdown";
import { resolveLink, resolveOrBeside, vaultReady } from "../vault";
import { propertiesChip, propertiesElement } from "../properties";
import { propertySpec, watchPropertySpec } from "../property-spec.svelte";
import { blobUrlNow, warm, PLACEHOLDER } from "../raw";
import { hydrateRendered } from "../hydrate";
import { hydrateTables } from "./table-edit";
import { followLinksIn } from "../rendered-links";
import { hoverSync } from "./hover-sync";
import { mentions, entitySource } from "./mentions";
import { noteSuggestions } from "./suggest";
import { expressions } from "./expr";
import { mathPreview } from "./math-preview";
import { LOG_ENTRY, logLines } from "./log-lines";
import { pluginCompletions, pluginCompletionApplies } from "./plugin-hooks";
import { gatedCompletion, syncSource } from "./completion-gate";
import { completionTab } from "./tab-keys";
import { citing, mdSymbols } from "./completion-sources";

// Fold like Obsidian: headings and lists only. lang-markdown makes every multi-line block foldable,
// which put arrows beside ordinary paragraphs; lists inside the frontmatter are YAML, not lists.
const listFold = (node: { from: number; to: number }, state: EditorState) =>
  node.from < bodyStart(state.doc) ? null : { from: state.doc.lineAt(node.from).to, to: node.to };
const obsidianFolds: MarkdownConfig = {
  props: [foldNodeProp.add({
    "Paragraph Blockquote FencedCode CodeBlock HTMLBlock Table BlockMath LinkReference CommentBlock ProcessingInstructionBlock": () => null,
    "BulletList OrderedList ListItem": listFold,
  })],
};

export function noteExtensions(path: string, viewRef: { view: EditorView | null }, onOpenLink?: (target: string) => void): { head: Extension; body: Extension } {
  const dir = dirOf(path);
  const isLog = () => {
    const logs = (settings.config?.log_dir ?? "notes/log").replace(/^\/+|\/+$/g, "");
    // logs at the vault's top: a day's note by its name, as the core reads one (captures.rs `log_day`)
    return logs ? path.startsWith(`${logs}/`) : /^\d{4}-\d{2}-\d{2}\.md$/.test(basename(path));
  };
  watchPropertySpec(); // the inline table's kinds; once for the app
  const resolveAttachment = (src: string): string => {
    if (/^(https?:|data:|blob:)/.test(src)) return src;
    const known = resolveLink(src, dir);
    const now = known && blobUrlNow(known);
    if (now) return now;
    // Fetch with the API header, then patch the <img> in place (a mutation inside a widget's
    // own DOM, which CodeMirror ignores — see ImageWidget in live-preview.js). A file that does
    // not exist gets an invalid src, so the widget swaps in its "missing" chip.
    const patch = (url: string) =>
      viewRef.view?.dom.querySelectorAll<HTMLImageElement>("img.cm-embed-image").forEach((img) => {
        if (img.alt === src) img.src = url;
      });
    void vaultReady().then(() => warm(resolveOrBeside(src, dir))).then(patch, () => patch("about:invalid"));
    return PLACEHOLDER;
  };
  // the note's numbered equations, once per text (lib/equations.ts)
  let eqs: { doc: unknown; of: Equations } | null = null;
  const equationsOf = (state: EditorState): Equations => {
    if (eqs?.doc !== state.doc) eqs = { doc: state.doc, of: noteEquations(state.doc.toString()) };
    return eqs.of;
  };
  const unmount = new WeakMap<HTMLElement, () => void>(); // a rendered block's views, per widget host
  const [liveField, liveKeys] = livePreview({
    renderMath: renderMathInto,
    highlightCode,
    resolveAttachment,
    linkResolves: (target: string) => target.trim().startsWith("#") || !!resolveLink(target, dir), // `#…`: this note
    // Obsidian's inline title: the file name above the first line (Settings → editor.inline_title)
    inlineTitle: (state) => {
      if (!(settings.config?.editor.inline_title ?? true)) return null;
      const name = shownName(path);
      if (headingRepeats(state, name)) return null; // "titles are duplicated usually": the note's own `# name` is the title
      return { key: name, render: () => titleInput(path, name) };
    },
    inlineHtml: (source: string) => inlineHtml(source, dir) || null,
    toggleTask: tickTaskLine, // a box ticks as on Home: done date, next occurrence
    // the YAML between the fences: Obsidian's Properties table in the note (`inline`), else one faint
    // "Properties" line (`hidden`; `panel` edits them beside the note). Keyed by mode + text.
    noteProperties: (fm: string) => {
      const mode = settings.config?.editor.properties ?? "hidden";
      const yaml = fm.replace(/^---\r?\n/, "").replace(/\r?\n(---|\.\.\.)\s*$/, "");
      return mode === "inline"
        ? { key: `inline:${propertySpec.version}:${fm}`, render: () => propertiesElement(yaml, dir, (t) => onOpenLink?.(t)) }
        : { key: `folded:${fm}`, render: () => propertiesChip(yaml) };
    },
    // a log entry with a file under it stays a timeline line, its embed a chip (log-lines.ts), not the reader's block
    blockHtml: (source: string, state: EditorState) => {
      if (isLog() && LOG_ENTRY.test(source)) return null;
      // display math (lib/equations.ts): its labels out, its number (counted over the whole note) drawn on it
      if (!/^[ \t>]*\$\$/.test(source)) return blockHtml(source, dir);
      return blockHtml(numberedTex(source, equationsOf(state).byTex.get(texKey(source))), dir);
    },
    linkLabel: (state: EditorState, target: string) => {
      const eq = equationTarget(target);
      if (!eq) return null;
      if (!eq[0]) { const n = equationsOf(state).byId.get(eq[1]); return n ? linkText("", n) : null; }
      const path = resolveLink(eq[0], dir);
      if (!path) return null;
      const n = equationLabelNow(path, eq[1], readText, () => viewRef.view?.dispatch({ effects: redecorate.of(null) }));
      return n ? linkText(eq[0], n) : null;
    },
    hydrateBlock: (host: HTMLElement) => { unmount.set(host, hydrateRendered(host, path)); hydrateTables(host, viewRef); followLinksIn(host, path); },
    releaseBlock: (host: HTMLElement) => unmount.get(host)?.(), // the widget's DOM is gone for good (not a hidden tab)
  });
  return {
    head: liveKeys,
    body: [
      markdown({ base: markdownLanguage, extensions: [...obsidianMarkdown, obsidianFolds, AnyTaskStatus], addKeymap: false, htmlTagLanguage: noteHtml() }),
      Prec.high(keymap.of([{ key: "Enter", run: (v) => closeDisplayMath(v) || continueList(v) }, { key: "Backspace", run: backspaceMarkup }])),
      taskShortForms,
      liveField,
      hoverSync(dir),
      expressions(path),
      mathPreview(() => settings.config?.editor.math_preview ?? true),
      taskChips(() => settings.config?.editor.task_chips ?? true),
      logLines(isLog),
      mentions,
      noteSuggestions(path),
      // paste / drop files → saved beside the note (editor.attachment_folder) and embedded
      EditorView.domEventHandlers({
        paste: (e, view) => {
          // a URL pasted over selected text makes a link (Obsidian)
          const url = e.clipboardData?.getData("text/plain").trim() ?? "";
          const sel = view.state.selection.main;
          if (!sel.empty && /^https?:\/\/\S+$/.test(url)) {
            e.preventDefault();
            const text = view.state.sliceDoc(sel.from, sel.to);
            view.dispatch({ changes: { from: sel.from, to: sel.to, insert: `[${text}](${url})` } });
            return true;
          }
          const files = takeFiles(e);
          if (!files) return false;
          const at = view.state.selection.main.head;
          void files.then((f) => attachAt(view, path, f, at));
          return true;
        },
        drop: (e, view) => {
          const files = takeFiles(e);
          if (!files) return false;
          const at = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
          void files.then((f) => attachAt(view, path, f, at));
          return true;
        },
      }),
      // Obsidian/Notion typing aids; each source checks its setting per call (live on/off)
      gatedCompletion([
        wikilinkSource(path),
        syncSource(slashSource),
        taskSource,
        { applies: (ctx) => citing() && citeApplies(ctx), answer: citeSource(true) },
        entitySource,
        { applies: (ctx) => pluginCompletionApplies(ctx, true), answer: pluginCompletions(path, true) },
        syncSource(mdSymbols),
      ], {
        icons: false,
        // a task field's row: the app's own icon before its plain name (no emoji in the list)
        addToOptions: [{ render: (c) => ("task" in c ? taskIconEl((c as TaskCompletion).task.icon) : null), position: 20 }],
        optionClass: (c) => ("task" in c ? "cm-task-row" : ""),
      }),
      completionTab,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ class: "markdown", spellcheck: "false" }),
      EditorView.editorAttributes.of({ class: "live-cm", "data-note": path }), // data-note: links resolve from here (lib/preview.ts)
    ],
  };
}

/** The files' embeds (lib/attach.ts) inserted at `at`, the caret after them. */
async function attachAt(view: EditorView, notePath: string, files: File[], at: number): Promise<void> {
  const done = await attachFiles(notePath, files);
  if (!done.length) return;
  const insert = done.map((a) => a.embed).join("\n");
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length } });
}

/** Settings-driven markdown options (heading folds); reconfigured live like codeOptions. */
export function mdOptions(c: WorkspaceConfig | null): Extension {
  return [
    (c?.editor.fold_headings ?? true) ? [foldGutter({ openText: "▾", closedText: "▸" }), keymap.of(foldKeymap)] : [],
    c?.editor.typewriter ? typewriter : [],
  ];
}

/** Typewriter scrolling: the caret's line stays at mid-height. Done with scroll margins, so CodeMirror's
 *  own scroll-into-view keeps the caret in a one-line band at the middle — one scroll per keystroke, in
 *  the same frame (a second, centring scroll a frame later made the text rattle). A click does not
 *  scroll; the padding lets the last lines reach the middle. */
const typewriter = [
  EditorView.scrollMargins.of((view) => {
    // a selection being made (a drag, Shift+arrows) keeps its end where it is: only a caret is held at mid-height
    if (!view.state.selection.main.empty) return null;
    // CodeMirror shows a tooltip only inside the editor less these margins: with a list open (completions, snippets,
    // a hover) the one-line band hid every list under the caret; while one is up the caret is not held mid-height
    if (view.dom.querySelector(".cm-tooltip")) return null;
    const m = Math.max(0, view.scrollDOM.clientHeight / 2 - view.defaultLineHeight);
    return { top: m, bottom: m };
  }),
  EditorView.theme({ ".cm-content": { paddingBottom: "50vh" } }),
];

/** Whether the note's first line of text (after the frontmatter) is a `# heading` saying the file's name — then the
 *  inline title would draw the same words twice. Case, spaces and emphasis marks do not count. */
export function headingRepeats(state: EditorState, name: string): boolean {
  const norm = (t: string) => t.replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const doc = state.doc;
  for (let n = frontmatterClose(doc) + 1; n <= Math.min(doc.lines, 400); n++) {
    const t = doc.line(n).text;
    if (!t.trim()) continue;
    const h = /^#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(t);
    return !!h && norm(h[1]) === norm(name);
  }
  return false;
}

/** The inline title as a field: the note's name, renamed in place — Enter (or leaving the field) renames the file,
 *  Esc puts the name back. A textarea grown to its text, so a long name wraps (an input cut it off on a phone). The editor ignores the widget's events (live-preview's InlineTitleWidget), so the field's
 *  keys and clicks are its own. */
function titleInput(path: string, name: string): HTMLElement {
  const h = document.createElement("textarea");
  h.className = "inline-title";
  h.value = name;
  h.rows = 1;
  const fit = () => { h.style.height = "auto"; h.style.height = `${h.scrollHeight}px`; };
  h.addEventListener("input", () => { h.value = h.value.replace(/[\r\n]+/g, " "); fit(); }); // a name has no line breaks (a paste)
  new ResizeObserver(fit).observe(h); // attached, and at each new width
  h.spellcheck = false;
  h.setAttribute("aria-label", "The note's name: type to rename it");
  h.title = "The note's name: type here and press Enter to rename it";
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    if (h.value.trim() && h.value.trim() !== name) void renameTo(path, h.value).then((ok) => { if (!ok) h.value = name; });
    else h.value = name;
  };
  h.addEventListener("focus", () => { done = false; });
  h.addEventListener("keydown", (e) => {
    e.stopPropagation(); // the app's keys (vim, shortcuts) stay out of the field
    if (e.key === "Enter") { e.preventDefault(); commit(); h.blur(); }
    else if (e.key === "Escape") { e.preventDefault(); done = true; h.value = name; h.blur(); }
  });
  h.addEventListener("blur", commit);
  return h;
}
