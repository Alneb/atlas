<script lang="ts">
  // A template's questions asked together in one form (`{{prompt:Course | choice:a,b}}`, `| date`, `| number`,
  // `| note:folder`, plain text): a list, a date, a number, a note of the vault (offered from its folder), or text.
  // The answers go to the core as the template's values (crates/atlas-template).
  import { closable } from "../lib/back";
  import { api } from "../lib/api";
  import SuggestInput, { type Suggestion } from "./SuggestInput.svelte";
  import type { PromptAsk } from "../lib/gen/PromptAsk";

  let { title, asks, onsubmit, oncancel }: {
    title: string; asks: PromptAsk[];
    onsubmit: (values: Record<string, string>) => void; oncancel: () => void;
  } = $props();
  // svelte-ignore state_referenced_locally -- the questions are fixed while the form is open
  let values = $state<Record<string, string>>(Object.fromEntries(asks.map((a) => [a.name, a.kind === "choice" ? (a.choices[0] ?? "") : ""])));
  let notes = $state<Record<string, Suggestion[]>>({});
  let form = $state<HTMLFormElement>();
  $effect(() => closable(oncancel));
  $effect(() => { form?.querySelector<HTMLElement>("input, select")?.focus(); });

  /** A note question's suggestions: the vault's notes matching what is typed, in its folder when it names one. */
  async function suggest(a: PromptAsk, q: string) {
    const all = await api.linkTargets(q).catch(() => []);
    const inside = a.folder ? all.filter((t) => t.path.startsWith(`${a.folder}/`)) : all;
    notes = { ...notes, [a.name]: inside.slice(0, 12).map((t) => ({ value: t.link, label: t.title ?? t.link, detail: t.path })) };
  }
  // a note's answer is a link, as a property holding a note is
  const answer = (a: PromptAsk, v: string) => (a.kind === "note" && v.trim() && !v.trim().startsWith("[[") ? `[[${v.trim()}]]` : v.trim());
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="shell" role="dialog" aria-modal="true" aria-label={title}>
  <form class="dialog" bind:this={form} onclick={(e) => e.stopPropagation()}
    onsubmit={(e) => { e.preventDefault(); onsubmit(Object.fromEntries(asks.map((a) => [a.name, answer(a, values[a.name] ?? "")]))); }}
    onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); oncancel(); } }}>
    <p class="q">{title}</p>
    {#each asks as a (a.name)}
      <label>{a.name}
        {#if a.kind === "choice"}
          <select bind:value={values[a.name]}>{#each a.choices as c (c)}<option value={c}>{c}</option>{/each}</select>
        {:else if a.kind === "date"}<input type="date" bind:value={values[a.name]} />
        {:else if a.kind === "number"}<input type="number" step="any" bind:value={values[a.name]} />
        {:else if a.kind === "note"}
          <SuggestInput class="field" type="text" bind:value={values[a.name]} items={notes[a.name] ?? []} placeholder={a.folder ? `A note in ${a.folder}/…` : "A note…"}
            oninput={(e) => void suggest(a, (e.currentTarget as HTMLInputElement).value)} onpick={(v) => (values[a.name] = v)} />
        {:else}<input type="text" bind:value={values[a.name]} spellcheck="false" />{/if}
      </label>
    {/each}
    <div class="btns"><button type="button" class="btn" onclick={oncancel}>Cancel</button><button class="btn primary">Create</button></div>
  </form>
  </div>
</div>

<style>
  .shell { display: contents; }
  .backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, .35); display: grid; place-items: start center; padding-top: 14vh; }
  .dialog { width: min(460px, 92vw); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 10px; padding: 14px; box-shadow: 0 18px 50px rgba(0, 0, 0, .45); display: flex; flex-direction: column; gap: 10px; }
  .q { margin: 0; color: var(--text); font-weight: 600; }
  label { display: flex; flex-direction: column; gap: 5px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  input, select, .dialog :global(input.field) { font: inherit; font-size: calc(14px * var(--ui-scale, 1)); color: var(--text); background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 9px; }
  input:focus, select:focus, .dialog :global(input.field:focus) { outline: none; border-color: var(--accent); }
  .btns { display: flex; justify-content: flex-end; gap: 8px; }
  .btn { border: 1px solid var(--border-strong); padding: 4px 12px; border-radius: var(--radius-sm); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }
</style>
