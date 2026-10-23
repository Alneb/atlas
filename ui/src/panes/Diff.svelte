<script lang="ts">
  // Working-tree (or staged) diff of one file; follows the file as it changes on disk. Hunks can be
  // staged / discarded (unstaged view) or unstaged (staged view) one at a time.
  import { errText } from "../lib/text";
  import { shownPath } from "../lib/paths";
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { on } from "../lib/bus";
  import type { Patch } from "../lib/types";
  import type { PaneProps } from "../lib/dock";
  import { openPath } from "../lib/dock";
  import DiffView, { type HunkAction } from "../components/DiffView.svelte";
  import InputDialog from "../components/InputDialog.svelte";
  import { toast } from "../lib/state.svelte";

  let { spec }: PaneProps<"diff"> = $props();
  let p = $state<Patch | null>(null);
  let error = $state("");
  const load = () => api.gitDiff(spec.path, spec.staged).then((d) => { p = d; error = ""; }, (e) => (error = errText(e)));

  const fail = (what: string) => (e: unknown) => toast(what, errText(e), "error", 10000);
  let confirmDiscard = $state<string | null>(null);
  const actions = $derived<HunkAction[]>(spec.staged
    ? [{ label: "Unstage hunk", run: (h) => void api.gitApply(h, true, true).then(load, fail("Unstage failed")) }]
    : [{ label: "Stage hunk", run: (h) => void api.gitApply(h, true, false).then(load, fail("Stage failed")) },
       { label: "Discard hunk", danger: true, run: (h) => (confirmDiscard = h) }]);

  onMount(() => {
    void load();
    return on("fs", (e) => { if (!e.paths.length || e.paths.includes(spec.path)) void load(); });
  });
</script>

<div class="diff-pane">
  <header>
    <h1>{shownPath(spec.path)}</h1>
    <span class="muted">{spec.staged ? "staged (index vs last commit)" : "unstaged (working tree vs index)"}</span>
    <button class="btn" onclick={() => openPath(spec.path)}>Open file</button>
  </header>
  {#if error}<p class="muted">{error}</p>{:else if p}<DiffView patch={p.patch} truncated={p.truncated} hunkActions={actions} />{/if}
</div>
{#if confirmDiscard}
  <InputDialog title="Discard this hunk?" hint="Its lines go back to the staged / committed version in the file." confirm="Discard"
    onsubmit={() => { const h = confirmDiscard!; confirmDiscard = null; void api.gitApply(h, false, true).then(load, fail("Discard failed")); }}
    oncancel={() => (confirmDiscard = null)} />
{/if}

<style>
  .diff-pane { height: 100%; overflow-y: auto; padding: 20px max(20px, calc(50% - 520px)) 60px; }
  header { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; margin-bottom: 14px; }
  h1 { margin: 0; font-family: var(--font-mono); font-size: calc(15px * var(--ui-scale, 1)); color: var(--heading); }
  .btn { margin-left: auto; border: 1px solid var(--border-strong); }
  .btn:hover { background: var(--bg-hover); }
</style>
