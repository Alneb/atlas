<script lang="ts">
  // Headings of the last focused editor (markdown #… or LaTeX \section…); follows edits and the
  // active editor; click jumps there. Dragging a heading (or Alt+Up/Down on it) moves its section.
  import { onMount, tick } from "svelte";
  import { shownName } from "../lib/paths";
  import { moveBefore, moveBy, landsOn, type Head, type SectionMove } from "../lib/section-move";
  import { editors } from "../lib/registry";
  import { getDock, lastEditorId } from "../lib/dock";
  import type { PaneProps } from "../lib/dock";
  import Icon from "../components/Icon.svelte";

  let { panel: _panel }: PaneProps<"outline"> = $props();
  let editorId = $state<string | null>(null);
  let heads = $state<Head[]>([]);
  let list = $state<HTMLElement>();
  let drag = $state<number | null>(null); // index of the heading being dragged
  let mark = $state<number | null>(null); // it would land in front of this one (heads.length = the end)
  const ed = $derived(editorId ? editors.get(editorId) : undefined);
  const minLevel = $derived(heads.length ? Math.min(...heads.map((h) => h.level)) : 1);

  function refresh() {
    editorId = lastEditorId(); // the editor the user was in, even while this pane has focus
    heads = editorId ? editors.get(editorId)!.headings() : [];
  }

  // the file's lines, not counting the empty one after a final newline (so a section moved to the end keeps it)
  const lines = () => { const t = ed?.snapshot().text ?? ""; return t.split("\n").length - (t.endsWith("\n") ? 1 : 0); };
  /** Apply a move and keep the keys on the heading that moved. */
  async function move(m: SectionMove | null) {
    drag = mark = null;
    if (!m || !ed) return;
    ed.moveSection(m);
    refresh();
    await tick();
    list?.querySelector<HTMLElement>(`[data-line="${landsOn(m)}"]`)?.focus();
  }
  function over(e: DragEvent, i: number) {
    if (drag === null) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    mark = e.clientY < r.top + r.height / 2 ? i : i + 1;
  }
  function onKey(e: KeyboardEvent, i: number) {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    void move(moveBy(heads, lines(), i, e.key === "ArrowUp" ? -1 : 1));
  }

  onMount(() => {
    refresh();
    let t: ReturnType<typeof setTimeout> | undefined;
    const onDoc = (e: Event) => { if ((e as CustomEvent).detail === editorId) { clearTimeout(t); t = setTimeout(refresh, 250); } };
    window.addEventListener("atlas-doc-change", onDoc);
    const sub = getDock()?.onDidActivePanelChange(() => setTimeout(refresh, 50));
    const sub2 = getDock()?.onDidRemovePanel(() => setTimeout(refresh, 50));
    return () => { window.removeEventListener("atlas-doc-change", onDoc); sub?.dispose(); sub2?.dispose(); clearTimeout(t); };
  });
</script>

<div class="side-pane">
  <div class="side-head">
    <span class="side-title">{ed ? shownName(ed.path) : "Outline"}</span>
  </div>
  <div class="scroll outline" bind:this={list}>
    {#if !ed}
      <p class="faint small pad">Open a note or a .tex file to see its outline.</p>
    {:else if !heads.length}
      <p class="faint small pad">No headings yet.</p>
    {:else}
      {#each heads as h, i (h.line)}
        <button class="head" style:padding-left="{8 + (h.level - minLevel) * 14}px" class:top={h.level === minLevel}
          class:moving={drag === i} class:before={mark === i} class:after={mark === heads.length && i === heads.length - 1}
          data-line={h.line} draggable="true" title="Line {h.line} — drag, or Alt+↑/↓, to move the section"
          ondragstart={(e) => { drag = i; e.dataTransfer?.setData("text/plain", h.text); }}
          ondragover={(e) => over(e, i)} ondragend={() => (drag = mark = null)}
          ondrop={(e) => { e.preventDefault(); if (drag !== null && mark !== null) void move(moveBefore(heads, lines(), drag, mark)); }}
          onkeydown={(e) => onKey(e, i)}
          onclick={() => { getDock()?.getPanel(editorId!)?.api.setActive(); ed?.gotoLine(h.line); ed?.focus(); }}>
          <Icon name="outline" size={12} /><span>{h.text}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .outline { flex: 1; min-height: 0; overflow: auto; padding: 4px 6px 16px; }
  .head { display: flex; gap: 7px; align-items: center; width: 100%; text-align: left; padding-top: 4px; padding-bottom: 4px; padding-right: 8px;
    border-radius: var(--radius-sm); color: var(--text-muted); font-size: calc(13px * var(--ui-scale, 1)); }
  .head span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head :global(svg) { flex: none; opacity: .5; }
  .head.top { color: var(--text); font-weight: 550; }
  .head:hover { background: var(--bg-hover); color: var(--text); }
  .head.moving { opacity: .45; }
  /* where the dragged section would land */
  .head.before { box-shadow: 0 -2px 0 var(--accent); }
  .head.after { box-shadow: 0 2px 0 var(--accent); }
  .pad { padding: 8px 10px; }
</style>
