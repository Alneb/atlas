<script lang="ts">
  // The optional formatting bar above a note (`[editor] format_bar`): each button does what its key
  // does — the same functions (lib/editor/md-format.ts) — and hands the keyboard back to the text.
  import type { EditorView } from "@codemirror/view";
  import { formatNote } from "../lib/editor/md-format";
  import { tipFor } from "../lib/keymap.svelte";
  import type { MdFormat } from "../lib/registry";
  import type { IconName } from "../lib/panes";
  import Icon from "./Icon.svelte";

  let { view }: { view: () => EditorView | null } = $props();
  type Button = { kind: MdFormat; icon: IconName; title: string; command?: string };
  // icons in one style; the name and key on hover
  const GROUPS: Button[][] = [
    [{ kind: "bold", icon: "bold", title: "Bold", command: "note.bold" },
     { kind: "italic", icon: "italic", title: "Italic", command: "note.italic" },
     { kind: "code", icon: "code", title: "Code" }],
    [{ kind: "heading", icon: "heading", title: "Heading (again: a smaller one, then none)" },
     { kind: "bullet", icon: "list", title: "List" },
     { kind: "number", icon: "list-ordered", title: "Numbered list" },
     { kind: "task", icon: "list-todo", title: "To-do (again: done)", command: "note.task" },
     { kind: "taskDialog", icon: "calendar", title: "Task: dates, priority, repeat…", command: "note.task-edit" },
     { kind: "quote", icon: "quote", title: "Quote" }],
    [{ kind: "link", icon: "link", title: "Link", command: "note.link" },
     { kind: "table", icon: "table", title: "Insert a table" }],
  ];
  function run(kind: MdFormat) {
    const v = view();
    if (!v) return;
    formatNote(v, kind);
    v.focus();
  }
</script>

<div class="format-bar" role="toolbar" aria-label="Formatting" data-testid="format-bar">
  {#each GROUPS as group, i (i)}
    {#if i}<span class="gap"></span>{/if}
    {#each group as b (b.kind)}
      <!-- mousedown is stopped so the text keeps its selection while the button is pressed -->
      <button onmousedown={(e) => e.preventDefault()} onclick={() => run(b.kind)} aria-label={b.title}
        title={b.command ? tipFor(b.title, b.command) : b.title}><Icon name={b.icon} size={16} /></button>
    {/each}
  {/each}
</div>

<style>
  .format-bar { display: flex; align-items: center; gap: 2px; padding: 3px 10px; border-bottom: 1px solid var(--border); flex: none; overflow-x: auto; }
  button { display: grid; place-items: center; width: 30px; height: 28px; padding: 0; border-radius: var(--radius-sm); color: var(--text-muted); flex: none; }
  button:hover { background: var(--bg-hover); color: var(--text); }
  .gap { width: 1px; height: 16px; margin: 0 6px; background: var(--border); flex: none; }
</style>
