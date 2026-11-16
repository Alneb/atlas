<script lang="ts">
  // Every modal dialog's frame: the scrim (`--scrim`, a click on it closes), one place on screen (near the top, or
  // centred for the big ones), Escape and a phone's Back close it, Tab stays inside, and the focus goes back where it
  // was when it closes (lib/focus-return.ts). The dialog's own look is its content's.
  import type { Snippet } from "svelte";
  import { tick } from "svelte";
  import { closable } from "../lib/back";
  import { holdFocus, trapTab } from "../lib/focus-return";

  let { label, onclose, center = false, testid, children }: {
    label: string; onclose: () => void;
    /** Centred, for the big ones (a comparison, a plugin's view); near the top otherwise. */
    center?: boolean; testid?: string; children: Snippet;
  } = $props();
  let frame = $state<HTMLDivElement>();

  $effect(() => closable(onclose));
  $effect(() => {
    const back = holdFocus();
    // the content focuses its first field itself; when it does not, the frame takes the keys
    void tick().then(() => { if (frame && !frame.contains(document.activeElement)) frame.focus(); });
    return back;
  });
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); onclose(); }
    else if (frame) trapTab(e, frame);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" class:center onclick={onclose}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="frame" role="dialog" aria-modal="true" aria-label={label} data-testid={testid} tabindex="-1" bind:this={frame}
    onclick={(e) => e.stopPropagation()} {onkeydown}>
    {@render children()}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 100; background: var(--scrim); display: grid; place-items: start center; padding: 12vh 16px 16px; overflow: auto; }
  .scrim.center { place-items: center; padding-top: 16px; }
  /* as wide as the scrim, so a content sized in % (min(1100px, 100%)) has something to measure; only the content
     takes the pointer, the rest of the row is still the scrim */
  .frame { width: 100%; display: flex; justify-content: center; outline: none; pointer-events: none; }
  .frame > :global(*) { pointer-events: auto; }
</style>
