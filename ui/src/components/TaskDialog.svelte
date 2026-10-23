<script lang="ts">
  import { closable } from "../lib/back";
  import { localDay } from "../lib/local-day";
  import type { Priority, TaskLine } from "../lib/task-line";
  // Obsidian Tasks' "Create or edit task": the line's fields in a form; the line is written back on Save.
  let { task, isNew, onsubmit, oncancel }: { task: TaskLine; isNew: boolean; onsubmit: (t: TaskLine) => void; oncancel: () => void } = $props();
  // svelte-ignore state_referenced_locally -- the task only seeds the form
  let t = $state<TaskLine>({ ...task });
  let input = $state<HTMLInputElement>();
  $effect(() => closable(oncancel)); // a phone's Back cancels (lib/back.ts)
  $effect(() => { input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); });

  const PRIORITIES: [Priority, string][] = [["highest", "Highest"], ["high", "High"], ["medium", "Medium"], ["none", "Normal"], ["low", "Low"], ["lowest", "Lowest"]];
  const day = (n: number): string => { const d = new Date(); d.setDate(d.getDate() + n); return localDay(d); };
  const QUICK: [string, number][] = [["Today", 0], ["Tomorrow", 1], ["In a week", 7]];
  const DATES = [["due", "Due"], ["scheduled", "Scheduled"], ["start", "Starts"]] as const;
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="shell" role="dialog" aria-modal="true" aria-label={isNew ? "Create task" : "Edit task"} data-testid="task-dialog">
  <form class="dialog" aria-label={isNew ? "Create task" : "Edit task"}
    onclick={(e) => e.stopPropagation()}
    onsubmit={(e) => { e.preventDefault(); onsubmit(t); }}
    onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); oncancel(); } }}>
    <h2>{isNew ? "Create task" : "Edit task"}</h2>
    <label>Description<input bind:this={input} bind:value={t.description} placeholder="What to do — #tags and [[links]] welcome" spellcheck="true" /></label>
    <div class="row" role="radiogroup" aria-label="Priority">
      {#each PRIORITIES as [p, name] (p)}
        <button type="button" role="radio" aria-checked={t.priority === p} class="chip" class:on={t.priority === p} onclick={() => (t.priority = p)}>{name}</button>
      {/each}
    </div>
    {#each DATES as [key, name] (key)}
      <div class="date">
        <label>{name}<input type="date" bind:value={t[key]} /></label>
        <div class="quick">
          {#each QUICK as [q, n] (q)}<button type="button" class="chip" class:on={t[key] === day(n)} onclick={() => (t[key] = day(n))}>{q}</button>{/each}
          {#if t[key]}<button type="button" class="chip" aria-label="No {name.toLowerCase()} date" onclick={() => (t[key] = "")}>×</button>{/if}
        </div>
      </div>
    {/each}
    <label>Repeats<input bind:value={t.repeat} placeholder="every week · every 2 days · every month on the 1st when done" spellcheck="false" /></label>
    <label class="check"><input type="checkbox" bind:checked={t.done} /> Done{#if t.done && t.doneOn} on {t.doneOn}{/if}</label>
    <div class="btns"><button type="button" class="btn" onclick={oncancel}>Cancel</button><button class="btn primary">{isNew ? "Create" : "Save"}</button></div>
  </form>
  </div>
</div>

<style>
  .shell { display: contents; }
  .backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, .35); display: grid; place-items: start center; padding-top: 10vh; overflow: auto; }
  .dialog { width: min(520px, 94vw); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 10px; padding: 16px; box-shadow: 0 18px 50px rgba(0, 0, 0, .45); display: flex; flex-direction: column; gap: 10px; margin-bottom: 4vh; }
  h2 { margin: 0; font-size: calc(15px * var(--ui-scale, 1)); color: var(--text); }
  label { display: flex; flex-direction: column; gap: 5px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  input:not([type="checkbox"]) { font: inherit; font-size: calc(14px * var(--ui-scale, 1)); color: var(--text); background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 9px; min-height: calc(32px * var(--ui-scale, 1)); color-scheme: inherit; }
  input:focus { outline: none; border-color: var(--accent); }
  .row, .quick { display: flex; flex-wrap: wrap; gap: 6px; }
  .date { display: grid; grid-template-columns: minmax(150px, 1fr) auto; gap: 8px; align-items: end; }
  .chip { font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-muted); background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; min-height: calc(28px * var(--ui-scale, 1)); cursor: pointer; }
  .chip.on { color: var(--accent-fg); background: var(--accent); border-color: transparent; }
  .check { flex-direction: row; align-items: center; gap: 8px; color: var(--text); }
  .btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .btn { font: inherit; color: var(--text); background: transparent; border: 1px solid var(--border-strong); padding: 5px 14px; border-radius: var(--radius-sm); cursor: pointer; }
  @media (max-width: 520px) { .date { grid-template-columns: 1fr; } }
</style>
