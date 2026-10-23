<script lang="ts">
  // One commit: message, author (you / Claude), files with +/− counts, full diff.
  import { errText } from "../lib/text";
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import type { CommitDetail } from "../lib/types";
  import type { PaneProps } from "../lib/dock";
  import { rel } from "../lib/time";
  import DiffView from "../components/DiffView.svelte";

  let { spec }: PaneProps<"commit"> = $props();
  let c = $state<CommitDetail | null>(null);
  let error = $state("");

  onMount(() => { api.gitCommit(spec.hash).then((d) => (c = d), (e) => (error = errText(e))); });
  const body = $derived((c?.body ?? "").replace(/\n*Co-Authored-By:.*$/gim, "").trim());
  const totals = $derived(c ? c.files.reduce((t, f) => [t[0] + (f.added ?? 0), t[1] + (f.removed ?? 0)], [0, 0]) : [0, 0]);
</script>

<div class="commit-pane">
  {#if error}
    <p class="muted">{error}</p>
  {:else if !c}
    <p class="muted">Loading…</p>
  {:else}
    <header>
      <h1>{c.subject}</h1>
      <div class="meta">
        <span class="badge" class:claude={c.by === "agent"}>{c.by === "agent" ? (c.agent ?? "Agent") : "You"}</span>
        {#if c.kind === "housekeeping"}<span class="badge house">housekeeping</span>{/if}
        <code>{c.hash.slice(0, 10)}</code>
        <span>{c.author}</span>
        <span title={new Date(c.time).toLocaleString()}>{rel(c.time)}</span>
        <span>{c.files.length} file{c.files.length === 1 ? "" : "s"} · <span class="add">+{totals[0]}</span> <span class="del">−{totals[1]}</span></span>
      </div>
      {#if body}<pre class="body">{body}</pre>{/if}
    </header>
    <DiffView patch={c.patch.patch} truncated={c.patch.truncated} />
  {/if}
</div>

<style>
  .commit-pane { height: 100%; overflow-y: auto; padding: 24px max(20px, calc(50% - 520px)) 60px; }
  h1 { margin: 0 0 8px; font-size: calc(20px * var(--ui-scale, 1)); color: var(--heading); letter-spacing: -.01em; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .badge { padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent-strong); font-weight: 600; font-size: calc(11px * var(--ui-scale, 1)); }
  .badge.claude { background: color-mix(in srgb, var(--purple) 18%, transparent); color: var(--purple); }
  .badge.house { background: var(--bg-hover); color: var(--text-faint); }
  .body { margin: 14px 0 0; padding: 12px 14px; border-radius: var(--radius); background: var(--bg-alt); white-space: pre-wrap; font-family: var(--font-ui); color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  header { margin-bottom: 20px; }
  .add { color: var(--green); }
  .del { color: var(--red); }
</style>
