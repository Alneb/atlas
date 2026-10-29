<script lang="ts">
  // What just happened, at the bottom (DESIGN-mail-ui §5): "Archived · Undo", "Sending… Undo", errors with the reason.
  import type { Mail } from "./store.svelte";
  let { mail }: { mail: Mail } = $props();
</script>

<div class="toasts" aria-live="polite">
  {#each mail.toasts as t (t.id)}
    <div class="toast" class:error={t.kind === "error"} class:success={t.kind === "success"} role={t.kind === "error" ? "alert" : "status"}>
      <span class="text">{t.text}</span>
      {#if t.undo}<button onclick={async () => { mail.dismiss(t.id); await t.undo?.(); }}>Undo</button>{/if}
      {#if t.action}<button onclick={() => { mail.dismiss(t.id); t.action?.run(); }}>{t.action.label}</button>{/if}
      <button class="x" onclick={() => mail.dismiss(t.id)} aria-label="Close">×</button>
    </div>
  {/each}
</div>

<style>
  .toasts { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 50; display: grid; gap: 8px; justify-items: center; pointer-events: none; width: min(560px, calc(100% - 32px)); }
  .toast { pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 9px 10px 9px 14px; border-radius: var(--radius); background: var(--heading); color: var(--bg); box-shadow: var(--shadow-md, var(--shadow-sm)); max-width: 100%; animation: in 120ms var(--ease); }
  .toast.error { background: var(--red); color: #fff; }
  .text { min-width: 0; overflow-wrap: anywhere; }
  button { all: unset; cursor: pointer; font-weight: 700; color: var(--accent); padding: 2px 6px; border-radius: var(--radius-sm); }
  .error button { color: #fff; text-decoration: underline; }
  button:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
  button:focus-visible { outline: 2px solid currentColor; }
  .x { color: inherit; opacity: 0.7; font-weight: 400; }
  @keyframes in { from { opacity: 0; transform: translateY(6px); } }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
</style>
