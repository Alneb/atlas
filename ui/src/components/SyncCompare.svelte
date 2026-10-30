<script lang="ts">
  // A note and the other device's version of it side by side: the shared lines folded, each differing run with a
  // choice (this one, the other, both). "Use this" hands back the text so composed.
  import Dialog from "./Dialog.svelte";
  import { compose, runs, type Side } from "../lib/line-merge";

  let { title, mine, theirs, onapply, oncancel }: {
    title: string; mine: string; theirs: string; onapply: (text: string) => void; oncancel: () => void;
  } = $props();

  const rs = $derived(runs(mine, theirs));
  const diffs = $derived(rs.filter((r) => "mine" in r).length);
  // svelte-ignore state_referenced_locally -- one choice per differing run, all "mine" at first
  let choice = $state<Side[]>(Array(rs.filter((r) => "mine" in r).length).fill("mine"));

  /** A shared run shows its first and last lines around the differences; the middle is folded. */
  const CONTEXT = 2;
  const SIDES: [Side, string][] = [["mine", "This one"], ["theirs", "The other"], ["both", "Both"]];
  const all = (s: Side) => (choice = choice.map(() => s));
</script>

<Dialog label="Compare: {title}" onclose={oncancel} center testid="sync-compare">
  <div class="dialog">
    <header>
      <strong>{title}</strong>
      <span class="muted">{diffs} {diffs === 1 ? "difference" : "differences"}</span>
      <span class="all">Every one: {#each SIDES as [s, label] (s)}<button class="btn btn-ghost" onclick={() => all(s)}>{label}</button>{/each}</span>
    </header>
    <div class="cols"><span>This device</span><span>The other device</span></div>
    <div class="body">
      {#each rs as r, i (i)}
        {#if "same" in r}
          {@const head = i === 0 ? [] : r.same.slice(0, CONTEXT)}
          {@const tail = i === rs.length - 1 ? [] : r.same.slice(Math.max(head.length, r.same.length - CONTEXT))}
          {#each head as l, k (k)}<div class="same"><pre>{l}</pre><pre>{l}</pre></div>{/each}
          {#if r.same.length > head.length + tail.length}<div class="fold">{r.same.length - head.length - tail.length} lines the same</div>{/if}
          {#each tail as l, k (k)}<div class="same"><pre>{l}</pre><pre>{l}</pre></div>{/each}
        {:else}
          {@const k = rs.slice(0, i).filter((x) => "mine" in x).length}
          <div class="diff" data-choice={choice[k]}>
            <button class="side mine" class:on={choice[k] !== "theirs"} onclick={() => (choice[k] = "mine")} title="Keep this device's lines">
              {#each r.mine as l, n (n)}<pre>{l}</pre>{:else}<pre class="none">(nothing)</pre>{/each}
            </button>
            <button class="side theirs" class:on={choice[k] !== "mine"} onclick={() => (choice[k] = "theirs")} title="Take the other device's lines">
              {#each r.theirs as l, n (n)}<pre>{l}</pre>{:else}<pre class="none">(nothing)</pre>{/each}
            </button>
            <span class="pick">{#each SIDES as [s, label] (s)}<button class:sel={choice[k] === s} onclick={() => (choice[k] = s)}>{label}</button>{/each}</span>
          </div>
        {/if}
      {/each}
    </div>
    <footer>
      <button class="btn" onclick={oncancel}>Cancel</button>
      <button class="btn primary" onclick={() => onapply(compose(rs, choice))} title="This note becomes the text chosen; the other version goes to the trash">Use this</button>
    </footer>
  </div>
</Dialog>

<style>
  .dialog { width: min(1100px, 100%); max-height: 86vh; display: flex; flex-direction: column; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: var(--shadow-pop); }
  header, footer { display: flex; align-items: center; gap: 10px; padding: 10px 14px; flex-wrap: wrap; }
  header { border-bottom: 1px solid var(--border); }
  footer { border-top: 1px solid var(--border); justify-content: flex-end; }
  .muted { color: var(--text-muted); }
  .all { margin-left: auto; color: var(--text-muted); font-size: .9em; display: flex; align-items: center; gap: 2px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 6px 14px 2px; color: var(--text-faint); font-size: .85em; }
  .body { overflow: auto; padding: 4px 14px 12px; font-family: var(--font-mono); font-size: calc(12.5px * var(--ui-scale, 1)); }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; min-height: 1.4em; line-height: 1.4; font: inherit; }
  .same { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; color: var(--text-muted); }
  .fold { text-align: center; color: var(--text-faint); font-family: var(--font-ui, inherit); font-size: .9em; padding: 2px 0; border-block: 1px dashed var(--border); margin: 2px 0; }
  .diff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 4px 0; position: relative; }
  .side { text-align: left; font: inherit; color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px 6px; background: none; cursor: pointer; opacity: .45; }
  .side.on { opacity: 1; }
  .side.mine.on { background: color-mix(in srgb, var(--accent) 12%, transparent); border-color: var(--accent); }
  .side.theirs.on { background: color-mix(in srgb, var(--green, #3a3) 14%, transparent); border-color: var(--green, #3a3); }
  .none { color: var(--text-faint); font-style: italic; }
  .pick { position: absolute; right: 4px; top: -9px; display: flex; gap: 0; font-family: var(--font-ui, inherit); font-size: .8em; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
  .pick button { padding: 0 7px; border: 0; background: none; color: var(--text-muted); cursor: pointer; }
  .pick button.sel { background: var(--accent); color: var(--bg); }
  .btn { border: 1px solid var(--border-strong); padding: 4px 12px; border-radius: var(--radius-sm); }
</style>
