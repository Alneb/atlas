// What a note's editor adds to the shared base (create.ts): the live preview (vendored obsidian-web + KaTeX) with
// Atlas's renderers, Obsidian's folds, list continuation, the typing aids and their completions, files pasted or
// dropped saved beside the note, and the settings-driven options (heading folds, typewriter scrolling).
import { dirOf, shownName } from "../paths";
import { errText } from "../text";
import { noteHtml } from "./big-html";
import { api } from "../api";
import { toast } from "../state.svelte";
import { wikilinkSource, slashSource, citeSource, taskSource, continueList, backspaceMarkup, taskShortForms, type TaskCompletion } from "./md-complete";
import { taskIconEl } from "../task-complete";
import { taskChips } from "./task-chips";
import { tickTaskLine } from "./task-tick";
import { settings } from "../settings.svelte";
import type { WorkspaceConfig } from "../types";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { foldGutter, foldNodeProp, foldKeymap } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownConfig } from "@lezer/markdown";
import { obsidianMarkdown } from "../../vendor/obsidian-web/obsidian-syntax.js";
import { livePreview, bodyStart } from "../../vendor/obsidian-web/live-preview.js";
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
import { pluginCompletions } from "./plugin-hooks";
import { completionTab } from "./tab-keys";
import { citing, mdSymbols, snippetsMd } from "./completion-sources";

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
  const isLog = () => path.startsWith(`${(settings.config?.log_dir ?? "notes/log").replace(/\/+$/, "")}/`);
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
  const unmount = new WeakMap<HTMLElement, () => void>(); // a rendered block's views, per widget host
  const [liveField, liveKeys] = livePreview({
    renderMath: renderMathInto,
    highlightCode,
    resolveAttachment,
    linkResolves: (target: string) => !!resolveLink(target, dir),
    // Obsidian's inline title: the file name above the first line (Settings → editor.inline_title)
    inlineTitle: (state) => {
      if (!(settings.config?.editor.inline_title ?? true)) return null;
      const name = shownName(path);
      if (headingRepeats(state, name)) return null; // "titles are duplicated usually": the note's own `# name` is the title
      return { key: name, render: () => { const h = document.createElement("div"); h.className = "inline-title"; h.textContent = name; return h; } };
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
    blockHtml: (source: string) => (isLog() && LOG_ENTRY.test(source) ? null : blockHtml(source, dir)),
    hydrateBlock: (host: HTMLElement) => { unmount.set(host, hydrateRendered(host, path)); hydrateTables(host, viewRef); followLinksIn(host, path); },
    releaseBlock: (host: HTMLElement) => unmount.get(host)?.(), // the widget's DOM is gone for good (not a hidden tab)
  });
  return {
    head: liveKeys,
    body: [
      markdown({ base: markdownLanguage, extensions: [...obsidianMarkdown, obsidianFolds], addKeymap: false, htmlTagLanguage: noteHtml() }),
      Prec.high(keymap.of([{ key: "Enter", run: continueList }, { key: "Backspace", run: backspaceMarkup }])),
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
          const files = [...(e.clipboardData?.files ?? [])];
          if (!files.length) return false;
          e.preventDefault();
          void attachFiles(view, path, files, view.state.selection.main.head);
          return true;
        },
        drop: (e, view) => {
          const files = [...(e.dataTransfer?.files ?? [])];
          if (!files.length) return false;
          e.preventDefault();
          void attachFiles(view, path, files, view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head);
          return true;
        },
      }),
      // Obsidian/Notion typing aids; each source checks its setting per call (live on/off)
      autocompletion({
        override: [
          (ctx) => ((settings.config?.editor.link_completion ?? true) ? wikilinkSource(path)(ctx) : null),
          (ctx) => ((settings.config?.editor.slash_menu ?? true) ? slashSource(ctx) : null),
          taskSource,
          (ctx) => (citing() ? citeSource(true)(ctx) : null),
          entitySource,
          pluginCompletions(path, true),
          snippetsMd,
          mdSymbols,
        ],
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

/** Obsidian's name for clipboard images, which arrive as a bare "image.png". */
function attachmentName(f: File): string {
  if (f.name && !/^image\.\w+$/.test(f.name)) return f.name;
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  return `Pasted image ${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

async function attachFiles(view: EditorView, notePath: string, files: File[], at: number): Promise<void> {
  const embeds: string[] = [];
  for (const f of files) {
    try { embeds.push((await api.attach(notePath, attachmentName(f), f)).embed); }
    catch (err) { toast(`Could not attach ${f.name || "the pasted file"}`, errText(err), "error"); }
  }
  if (!embeds.length) return;
  const insert = embeds.join("\n");
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
  let n = 1;
  if (doc.line(1).text.trim() === "---") {
    for (n = 2; n <= Math.min(doc.lines, 200) && doc.line(n).text.trim() !== "---"; n++);
    n++;
  }
  for (; n <= Math.min(doc.lines, 400); n++) {
    const t = doc.line(n).text;
    if (!t.trim()) continue;
    const h = /^#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(t);
    return !!h && norm(h[1]) === norm(name);
  }
  return false;
}
