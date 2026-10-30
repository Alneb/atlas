<script lang="ts">
  import Dialog from "./Dialog.svelte";
  // A small themed prompt (window.prompt is unthemed / unreliable in the desktop app).
  let { title, value = "", hint = "", confirm = "", danger = true, onsubmit, oncancel }: {
    title: string; value?: string; hint?: string;
    /** Confirmation only (no text field): the OK button's label, e.g. "Move to Trash". */
    confirm?: string;
    /** The confirmation's button in red (deleting, discarding). */
    danger?: boolean;
    onsubmit: (v: string) => void; oncancel: () => void;
  } = $props();
  // svelte-ignore state_referenced_locally -- the initial value only seeds the field
  let v = $state(value);
  let input = $state<HTMLInputElement>();
  $effect(() => {
    input?.focus();
    // select the name without its extension, like a file manager
    const dot = value.lastIndexOf(".");
    input?.setSelectionRange(0, dot > 0 ? dot : value.length);
  });
</script>

<Dialog label={title} onclose={oncancel}>
  <form class="dialog" aria-label={title}
    onsubmit={(e) => { e.preventDefault(); if (confirm || v.trim()) onsubmit(v.trim()); }}>
    {#if confirm}<p class="q">{title}</p>
    {:else}<label>{title}<input bind:this={input} bind:value={v} spellcheck="false" /></label>{/if}
    {#if hint}<p class="hint">{hint}</p>{/if}
    <div class="btns"><button type="button" class="btn" onclick={oncancel}>Cancel</button>
      <!-- svelte-ignore a11y_autofocus -->
      <button class="btn primary" class:danger={!!confirm && danger} disabled={!confirm && !v.trim()} autofocus={!!confirm}>{confirm || "OK"}</button></div>
  </form>
</Dialog>

<style>
  .dialog { width: min(460px, 92vw); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 10px; padding: 14px; box-shadow: var(--shadow-pop); display: flex; flex-direction: column; gap: 8px; }
  label { display: flex; flex-direction: column; gap: 6px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  input { font: inherit; font-size: calc(14px * var(--ui-scale, 1)); color: var(--text); background: var(--bg); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 6px 9px; }
  input:focus { outline: none; }
  .hint { margin: 0; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .btns { display: flex; justify-content: flex-end; gap: 8px; }
  .btn { border: 1px solid var(--border-strong); padding: 4px 12px; border-radius: var(--radius-sm); }
  .btn:disabled { opacity: .45; }
  .btn.primary.danger { background: var(--red); color: var(--accent-fg); }
  .q { margin: 0; color: var(--text); }
</style>
