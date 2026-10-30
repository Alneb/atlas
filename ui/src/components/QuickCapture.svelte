<script lang="ts">
  // The capture popup over whatever pane is open (lib/quick-capture.svelte.ts): Super+E twice, Super+C, the bar's
  // Capture. A frame around the one capture box (CaptureBox.svelte); Enter saves and closes with the Captured notice,
  // Esc closes keeping the draft. Nothing navigates.
  import { closable } from "../lib/back";
  import { holdFocus, trapTab } from "../lib/focus-return";
  import { quickCapture, keepDraft, captured, openCaptures } from "../lib/quick-capture.svelte";
  import CaptureBox from "./CaptureBox.svelte";

  let cb = $state<CaptureBox>();

  $effect(() => {
    if (!quickCapture.open) return;
    cb?.focus();
    const back = holdFocus(), off = closable(close);
    return () => { off(); back(); };
  });
  $effect(() => { keepDraft(quickCapture.text); });

  function close() { quickCapture.open = false; }
  const triage = () => { close(); openCaptures(); };
</script>

{#if quickCapture.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={close}>
    <div class="qc" role="dialog" aria-label="Capture" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => trapTab(e, e.currentTarget)}>
      <CaptureBox bind:this={cb} bind:text={quickCapture.text} onsaved={(r, text) => { close(); captured(r, text); }} onclose={close} ontriage={triage} />
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--bg) 35%, transparent); display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; }
  .qc { width: min(620px, calc(100vw - 32px)); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-pop); outline: none; animation: rise .14s ease-out; }
  @media (max-width: 640px) { .scrim { padding-top: 8vh; } }
  @keyframes rise { from { transform: translateY(6px); opacity: 0; } }
</style>
