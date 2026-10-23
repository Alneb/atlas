<script lang="ts">
  import { keysOf } from "../lib/keymap.svelte";
  // The bar above a code file (`[editor] code_bar`): what one reaches for in an IDE — find, replace,
  // go to line, format, the file's problems — and the tools plugins add for this file (run, build,
  // test: `atlas.editor.toolbar`). Each built-in button runs the same command as its key.
  import type { EditorView } from "@codemirror/view";
  import { codeTools } from "../lib/editor/create";
  import { app } from "../lib/state.svelte";
  import { showProblems } from "../lib/actions";
  import { allCommands } from "../lib/keymap.svelte";
  import { searchRequest } from "../lib/registry";
  import { codeToolsVersion, pluginCodeTools } from "../lib/plugin-code-tools";

  let { view, path }: { view: () => EditorView | null; path: string } = $props();
  let version = $state(codeToolsVersion.n);
  $effect(() => { const l = () => (version = codeToolsVersion.n); codeToolsVersion.listeners.add(l); return () => void codeToolsVersion.listeners.delete(l); });
  const extra = $derived((void version, pluginCodeTools(path)));
  const problems = $derived(app.problems);
  const on = (f: (v: EditorView) => unknown) => () => { const v = view(); if (v) { f(v); } };
  // "Replace in files" is a command of the app: the bar runs the command, so its key and the button stay one thing
  // what is selected (one line of it) is what one wants to replace: it is handed to the Search pane
  const inFiles = () => {
    const v = view(), sel = v ? v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to) : "";
    if (sel.trim() && !sel.includes("\n")) searchRequest.q = sel;
    void allCommands().find((c) => c.id === "ui.replace")?.run();
  };
  const format = () => { const v = view(); if (v && !codeTools.format(v)) v.focus(); };
</script>

<div class="code-bar" role="toolbar" aria-label="Code tools" data-testid="code-bar">
  {#each extra as t (t.label)}<button class="tool plugin" title={t.title ?? t.label} onclick={() => void t.run()}>{t.label}</button>{/each}
  {#if extra.length}<span class="gap"></span>{/if}
  <button class="tool" title="Find in this file · Ctrl+F" onclick={on(codeTools.find)}>Find</button>
  <button class="tool" title="Find and replace in this file · Ctrl+H" onclick={on(codeTools.replace)}>Replace</button>
  <button class="tool" title="Find and replace across the vault, with a preview of every change · Ctrl+Shift+H" onclick={inFiles}>In files…</button>
  <button class="tool" title="Go to a line · Ctrl+G" onclick={on(codeTools.gotoLine)}>Line…</button>
  <span class="gap"></span>
  <button class="tool" title="Format the file with its language server · Shift+Alt+F" onclick={format}>Format</button>
  {#if problems}
    <button class="tool" class:bad={problems.errors > 0} class:warn={!problems.errors && problems.warnings > 0} title="Problems in this file · {keysOf('ui.problems') ?? ''}" onclick={showProblems}>
      {problems.errors + problems.warnings ? `${problems.errors} error${problems.errors === 1 ? "" : "s"} · ${problems.warnings} warning${problems.warnings === 1 ? "" : "s"}` : "No problems"}
    </button>
  {/if}
</div>

<style>
  .code-bar { display: flex; align-items: center; gap: 2px; padding: 3px 10px; border-bottom: 1px solid var(--border); flex: none; overflow-x: auto; }
  .tool { height: 26px; padding: 0 8px; border-radius: var(--radius-sm); color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); white-space: nowrap; }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .tool.plugin { color: var(--accent); font-weight: 500; }
  .tool.bad { color: var(--red); } .tool.warn { color: var(--yellow); }
  .gap { width: 1px; height: 16px; margin: 0 6px; background: var(--border); flex: none; }
</style>
