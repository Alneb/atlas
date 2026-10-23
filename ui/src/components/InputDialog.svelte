<script lang="ts">
  import { closable } from "../lib/back";
  // A small themed prompt (window.prompt is unthemed / unreliable in the desktop app).
  let { title, value = "", hint = "", confirm = "", onsubmit, oncancel }: {
    title: string; value?: string; hint?: string;
    /** Confirmation only (no text field): the OK button's label, e.g. "Move to Trash". */
    confirm?: string;
    onsubmit: (v: string) => void; oncancel: () => void;
  } = $props();
  // svelte-ignore state_referenced_locally -- the initial value only seeds the field
  let v = $state(value);
  let input = $state<HTMLInputElement>();
  $effect(() => closable(oncancel)); // a phone's Back cancels (lib/back.ts)
  $effect(() => {
    input?.focus();
    // select the name without its extension, like a file manager
    const dot = value.lastIndexOf(".");
    input?.setSelectionRange(0, dot > 0 ? dot : value.length);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="shell" role="dialog" aria-modal="true" aria-label={title}>
  <form class="dialog" aria-label={title} onclick={(e) => e.stopPropagation()}
    onsubmit={(e) => { e.preventDefault(); if (confirm || v.trim()) onsubmit(v.trim()); }}
    onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); oncancel(); } }}>
    {#if confirm}<p class="q">{title}</p>
    {:else}<label>{title}<input bind:this={input} bind:value={v} spellcheck="false" /></label>{/if}
    {#if hint}<p class="hint">{hint}</p>{/if}
    <div class="btns"><button type="button" class="btn" onclick={oncancel}>Cancel</button>
      <!-- svelte-ignore a11y_autofocus -->
      <button class="btn primary" class:danger={!!confirm} disabled={!confirm && !v.trim()} autofocus={!!confirm}>{confirm || "OK"}</button></div>
  </form>
  </div>
</div>

<style>
  .shell { display: contents; }
  .backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, .35); display: grid; place-items: start center; padding-top: 18vh; }
  .dialog { width: min(460px, 92vw); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 10px; padding: 14px; box-shadow: 0 18px 50px rgba(0, 0, 0, .45); display: flex; flex-direction: column; gap: 8px; }
  label { display: flex; flex-direction: column; gap: 6px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  input { font: inherit; font-size: calc(14px * var(--ui-scale, 1)); color: var(--text); background: var(--bg); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 6px 9px; }
  input:focus { outline: none; }
  .hint { margin: 0; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .btns { display: flex; justify-content: flex-end; gap: 8px; }
  .btn { border: 1px solid var(--border-strong); padding: 4px 12px; border-radius: var(--radius-sm); }
  .btn:disabled { opacity: .45; }
  .btn.primary.danger { background: var(--red); color: #fff; }
  .q { margin: 0; color: var(--text); }
</style>
