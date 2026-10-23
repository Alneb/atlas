<script lang="ts">
  // The notices (lib/state.svelte.ts `toast`): an icon for its kind, the title and what it says, a × to close it, Copy
  // for an error's text, and a thin line for the time it has left — which stops while the pointer is on it, so a long
  // one can be read. The same notice again shows ×n.
  import { toasts, dismissToast, holdToast, type Toast } from "../lib/state.svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "../lib/panes";

  const ICON: Record<Toast["kind"], IconName> = { info: "circle", success: "check", error: "error" };
  let copied = $state(0);

  function copy(t: Toast) {
    void navigator.clipboard?.writeText(t.body ? `${t.title}\n${t.body}` : t.title).then(() => { copied = t.id; setTimeout(() => { if (copied === t.id) copied = 0; }, 1500); }, () => {});
  }
  const act = (t: Toast) => { dismissToast(t.id); t.run?.(); };
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast" class:acts={!!t.run} data-kind={t.kind} role="status"
      onmouseenter={() => holdToast(t.id, true)} onmouseleave={() => holdToast(t.id, false)}>
      <span class="icon"><Icon name={ICON[t.kind]} size={15} /></span>
      <button type="button" class="body" title={t.run ? "Open" : "Close"} onclick={() => act(t)}>
        <strong>{t.title}{#if t.count > 1}<span class="count">×{t.count}</span>{/if}</strong>
        {#if t.body}<span class="msg">{t.body}</span>{/if}
      </button>
      <span class="tools">
        {#if t.kind === "error"}<button type="button" class="tool" title="Copy the message" aria-label="Copy the message" onclick={() => copy(t)}><Icon name={copied === t.id ? "check" : "copy"} size={13} /></button>{/if}
        <button type="button" class="tool" title="Close" aria-label="Close" onclick={() => dismissToast(t.id)}><Icon name="close" size={13} /></button>
      </span>
      {#key t.shown}<span class="left" style="animation-duration:{t.life}ms"></span>{/key}
    </div>
  {/each}
</div>

<style>
  .toasts { position: fixed; right: 16px; bottom: calc(var(--status-h) + 14px); z-index: 1100; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
  /* a phone: over the bottom bar, across the screen */
  :global(html.phone) .toasts { left: 12px; right: 12px; bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 10px + var(--keyboard, 0px)); align-items: stretch; }
  :global(html.phone) .toast { max-width: none; }
  .toast { position: relative; overflow: hidden; pointer-events: auto; display: flex; gap: 10px; align-items: flex-start; max-width: 400px; min-width: 240px;
    padding: 10px 8px 12px 12px; background: var(--bg-elev); color: var(--text); border: 1px solid var(--border-strong); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop); animation: slide-in .18s ease-out; --kind: var(--accent); }
  .toast[data-kind="success"] { --kind: var(--green); }
  .toast[data-kind="error"] { --kind: var(--red); }
  .toast.acts:hover { border-color: var(--accent); }
  .icon { flex: none; display: grid; place-items: center; width: 22px; height: 22px; margin-top: -1px; border-radius: 50%; color: var(--kind);
    background: color-mix(in srgb, var(--kind) 14%, transparent); }
  .body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; text-align: left;
    font: inherit; font-size: calc(13px * var(--ui-scale, 1)); cursor: pointer; }
  .count { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--bg-alt); color: var(--text-muted); font-weight: 500; font-size: .85em; }
  .msg { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 12em; overflow-y: auto; }
  .tools { flex: none; display: flex; gap: 2px; margin-top: -3px; }
  .tool { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 5px; color: var(--text-faint); opacity: .7; }
  .toast:hover .tool { opacity: 1; }
  .tool:hover { color: var(--text); background: var(--bg-hover); }
  /* the time it has left: runs out to the left, stops while the pointer is on the notice (as its timer does) */
  .left { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--kind); opacity: .55; transform-origin: left;
    animation-name: run-out; animation-timing-function: linear; animation-fill-mode: forwards; }
  .toast:hover .left { animation-play-state: paused; }
  @keyframes run-out { from { transform: scaleX(1); } to { transform: scaleX(0); } }
</style>
