<script lang="ts">
  // Tools Atlas drafted from how you work (docs/guides/MALLEABLE.md R5): each says what it noticed and which
  // files it would write. Keep writes them (reversible: they are plain files in git); Dismiss hides it.
  // Shown in Settings → Automation and as the `suggestions` block of a .page / ```view.
  import { errText } from "../lib/text";
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { openPath } from "../lib/dock";
  import { on } from "../lib/bus";
  import { toast } from "../lib/state.svelte";
  import type { ToolDraft } from "../lib/gen/ToolDraft";
  import Icon from "./Icon.svelte";

  let { compact = false }: { compact?: boolean } = $props();
  let drafts = $state<ToolDraft[] | null>(null);
  let open = $state<string | null>(null);
  let shown = $state(false);
  let busy = $state<string | null>(null);

  async function load() {
    try { drafts = await api.toolDrafts(); } catch { drafts = []; }
  }
  async function keep(d: ToolDraft) {
    busy = d.id;
    try {
      const paths = await api.keepTool(d.id);
      toast(`Kept: ${d.title}`, paths.join(", "), "success");
      if (paths[0]) openPath(paths[0]);
      await load();
    } catch (e) { toast("Could not keep it", errText(e), "error"); }
    finally { busy = null; }
  }
  async function dismiss(d: ToolDraft) {
    busy = d.id;
    try { await api.dismissTool(d.id); drafts = (drafts ?? []).filter((x) => x.id !== d.id); }
    catch (e) { toast("Could not dismiss it", errText(e), "error"); }
    finally { busy = null; }
  }

  onMount(() => {
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    // notes changing can make or settle a draft; debounce the miner
    const off = on("fs", (e) => { if (e.paths.some((p) => p.endsWith(".md") || p.endsWith(".base"))) { clearTimeout(t); t = setTimeout(load, 1500); } });
    return () => { off(); clearTimeout(t); };
  });
</script>

<div class="drafts" class:compact>
  {#if drafts === null}
    <p class="muted">Looking at how you work…</p>
  {:else if !drafts.length && compact}
    <p class="muted">Nothing drafted right now.</p>
  {:else if !drafts.length}
    <p class="muted">Nothing drafted right now. Atlas watches for patterns (folders of alike notes, repeated work) and drafts a tool here when it sees one — you never have to ask.</p>
  {:else if !shown}
    <!-- one line until asked: a list of cards took over the pane it sat in and read as an alarm -->
    <button class="summary" onclick={() => (shown = true)} aria-expanded="false">
      <Icon name="plugin" size={14} />
      <span><b>{drafts[0].title}</b>{drafts.length > 1 ? ` and ${drafts.length - 1} more` : ""} — {drafts[0].why}</span>
      <span class="more">Show</span>
    </button>
  {:else}
    <button class="summary open" onclick={() => (shown = false)} aria-expanded="true">
      <span>Each suggestion says what Atlas noticed and which file it would write. <b>Keep</b> writes that file (plain text, yours to edit or delete); <b>Dismiss</b> hides the suggestion for good.</span>
      <span class="more">Hide</span>
    </button>
    <ul>
      {#each drafts as d (d.id)}
        <li>
          <div class="head">
            <Icon name="plugin" size={14} />
            <div class="txt"><b>{d.title}</b><span>{d.why}</span></div>
            <button class="btn primary" disabled={busy === d.id} onclick={() => keep(d)}>Keep</button>
            <button class="btn" disabled={busy === d.id} onclick={() => dismiss(d)}>Dismiss</button>
          </div>
          <button class="files" onclick={() => (open = open === d.id ? null : d.id)} aria-expanded={open === d.id}>
            {open === d.id ? "Hide" : "Show"} what it would write: {d.files.map((f) => f.path).join(", ")}
          </button>
          {#if open === d.id}{#each d.files as f (f.path)}<pre><span>{f.path}</span>{f.text}</pre>{/each}{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .summary { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-alt); color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); text-align: left; }
  .summary.open { margin-bottom: 8px; background: none; border-style: dashed; }
  .summary > span:first-of-type { flex: 1; min-width: 0; }
  .summary b { color: var(--text); font-weight: 600; }
  .summary .more { color: var(--accent); flex: none; }
  .summary:hover { border-color: var(--border-strong); }
  .drafts ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  li { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; background: var(--bg-alt); }
  .head { display: flex; gap: 10px; align-items: center; color: var(--accent); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; color: var(--text); }
  .txt span { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .files { margin-top: 4px; padding: 0; color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); text-align: left; }
  .files:hover { color: var(--accent); }
  pre { margin: 6px 0 0; padding: 6px 9px; max-height: 200px; overflow: auto; background: var(--bg); border-radius: var(--radius-sm); font-size: calc(11.5px * var(--ui-scale, 1)); }
  pre span { display: block; color: var(--text-faint); margin-bottom: 4px; }
  .btn { padding: 3px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: .5; }
  .muted { color: var(--text-muted); margin: 4px 0; font-size: calc(12.5px * var(--ui-scale, 1)); }
  .compact li { padding: 6px 8px; }
</style>
