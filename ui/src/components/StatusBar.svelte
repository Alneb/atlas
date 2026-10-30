<script lang="ts">
  import { tipFor } from "../lib/keymap.svelte";
  // Bottom status bar: workspace (horizontal tabs only), the plugins' cells, vim mode (click toggles vim), server connection.
  import { app } from "../lib/state.svelte";
  import { toggleVim } from "../lib/settings.svelte";
  import { showProblems } from "../lib/actions";
  import Icon from "./Icon.svelte";
  import { tabs } from "../lib/tabs.svelte";
  import { statusCells } from "../lib/plugin-status.svelte";

  const connLabel = $derived(app.conn === "open" ? "Connected" : app.conn === "connecting" ? "Connecting…" : "Offline — retrying");
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const dirtyCount = $derived(Object.keys(app.dirty).length);
</script>

<footer class="status">
  <!-- the tab sidebar names the workspace itself -->
  {#if tabs.layout !== "vertical"}<span class="ws" title={app.workspace?.root ?? ""}>{app.workspace?.name ?? "—"}</span>{/if}
  {#if dirtyCount}<span class="saving">{dirtyCount} unsaved</span>{/if}
  <span class="grow"></span>
  {#each statusCells as c (c.key)}
    {#if c.run}<button class="cell" title={c.title} data-cell={c.key} onclick={() => void c.run?.()}>{c.text}</button>
    {:else}<span class="cell" title={c.title} data-cell={c.key}>{c.text}</span>{/if}
  {/each}
  {#if app.problems}
    <button class="problems" class:bad={app.problems.errors > 0} onclick={showProblems} title={tipFor("Problems in this file", "ui.problems")}
      aria-label="Problems: {plural(app.problems.errors, 'error')}, {plural(app.problems.warnings, 'warning')}">
      <Icon name="error" size={12} />{app.problems.errors}<Icon name="warning" size={12} />{app.problems.warnings}
    </button>
  {/if}
  <button class="vim" class:off={!app.vimEnabled} data-mode={app.vimMode} onclick={toggleVim} title="Toggle vim mode" data-testid="vim-mode">
    {#if app.vimEnabled}{app.vimMode || "VIM"}{:else}vim off{/if}
  </button>
  <span class="conn" title={connLabel} data-state={app.conn} data-testid="conn"><span class="dot"></span>{connLabel}</span>
</footer>

<style>
  .status { height: var(--status-h); flex: none; display: flex; align-items: center; gap: 14px; padding: 0 12px 0 14px; background: var(--bg-app); color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); user-select: none; }
  .ws { color: var(--text-muted); font-weight: 500; }
  .grow { flex: 1; }
  /* a plugin's cell: quiet text; a button only shows it on hover */
  .cell { max-width: 28ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button.cell { padding: 1px 6px; border-radius: 5px; color: inherit; }
  button.cell:hover { background: var(--bg-hover); color: var(--text); }
  .saving { color: var(--yellow); }
  .vim { font-family: var(--font-mono); font-size: calc(10.5px * var(--ui-scale, 1)); font-weight: 600; letter-spacing: .06em; padding: 1px 8px; border-radius: 5px; color: var(--text-muted); background: var(--bg-hover); min-width: 64px; text-align: center; }
  .vim[data-mode="INSERT"] { color: var(--bg); background: var(--green); }
  .vim[data-mode="VISUAL"], .vim[data-mode="V-LINE"], .vim[data-mode="V-BLOCK"] { color: var(--bg); background: var(--purple); }
  .vim[data-mode="REPLACE"] { color: var(--bg); background: var(--red); }
  .vim.off { background: none; font-weight: 400; }
  .problems { display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); padding: 1px 6px; border-radius: 5px; font-variant-numeric: tabular-nums; }
  .problems:hover { background: var(--bg-hover); color: var(--text); }
  .problems.bad { color: var(--red); }
  .conn { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); transition: background .2s; }
  .conn[data-state="open"] .dot { background: var(--green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 18%, transparent); }
  .conn[data-state="connecting"] .dot { background: var(--yellow); animation: pulse 1.2s ease-in-out infinite; }
  .conn[data-state="closed"] .dot { background: var(--red); }
</style>
