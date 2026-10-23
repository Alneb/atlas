<script lang="ts">
  // The phone's top bar (lib/phone.svelte.ts): Back and the name of the pane on screen — what a phone app shows at the top
  // (the vertical tabs layout has no tab strip there) — and the capture button, the one thing a phone is most for.
  import { canNavigate, navigate } from "../lib/dock";
  import { openPalette } from "../lib/palette.svelte";
  import { activate, tabOrder, tabs } from "../lib/tabs.svelte";
  import Icon from "./Icon.svelte";

  const shown = $derived(tabs.groups.flatMap((g) => g.tabs).find((t) => t.active) ?? null);
  // read again when the active tab changes, so Back is shown only when it goes somewhere
  const back = $derived(shown ? canNavigate(-1) : false);

  // a sideways swipe on the bar shows the next / previous tab (the app's top bar does the same: AtlasActivity)
  let from: { x: number; y: number } | null = null;
  function swiped(e: TouchEvent): void {
    const t = e.changedTouches[0];
    if (!from || !t) return;
    const dx = t.clientX - from.x, dy = t.clientY - from.y;
    from = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    const ids = tabOrder(), at = tabs.active ? ids.indexOf(tabs.active) : -1;
    const next = ids[at + (dx < 0 ? 1 : -1)]; // no wrapping: the ends are ends
    if (next) activate(next);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- the swipe is a touch shortcut; the tabs sheet does the same -->
<header class="phone-top" ontouchstart={(e) => (from = { x: e.touches[0].clientX, y: e.touches[0].clientY })} ontouchend={swiped}>
  <button class="back" class:hidden={!back} aria-label="Back" onclick={() => navigate(-1)}><Icon name="chevron" size={20} /></button>
  <span class="title">{shown?.title ?? "Atlas"}</span>
</header>
<button class="fab" aria-label="Capture" onclick={() => openPalette("capture")}><Icon name="plus" size={24} /></button>

<style>
  .phone-top { flex: none; display: flex; align-items: center; gap: 4px; height: 52px; padding: 0 8px; background: var(--bg); border-bottom: 1px solid var(--border); }
  .back { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 22px; color: var(--text); transform: rotate(180deg); }
  .back:active { background: var(--bg-hover); }
  .hidden { visibility: hidden; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; font-weight: 600; color: var(--text); }
  /* Material's FAB: 56 px, 16 px from the edges, above the bottom bar */
  .fab { position: fixed; right: 16px; bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px + var(--keyboard, 0px)); width: 56px; height: 56px; border-radius: 16px; z-index: 50;
    display: grid; place-items: center; color: var(--bg); background: var(--accent); box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent); }
  .fab:active { transform: scale(.96); }
</style>
