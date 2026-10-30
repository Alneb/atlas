<script lang="ts">
  import { closable } from "../lib/back";
  import { superOf } from "../lib/keys";
  // The one right-click menu (tabs, files, pins, blocks, tables). Rows may carry an icon and a
  // shortcut hint, and a faint second line (`detail`) that says what the row does. Keys: arrows / Home / End move, a letter jumps to the next row starting with
  // it, Enter runs, Esc or a click outside closes. Placed from its measured size, so it never
  // leaves the window (it flips above / left of the pointer when there is no room).
  import Icon from "./Icon.svelte";
  import type { IconName } from "../lib/panes";
  export type MenuItem = { label: string; detail?: string; hint?: string; icon?: IconName; danger?: boolean; disabled?: boolean; run: () => void } | "sep";
  let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props();
  let menu = $state<HTMLDivElement>();
  let at = $state<{ left: number; top: number } | null>(null); // null until measured: no flash at the wrong place
  const EDGE = 6;
  const icons = $derived(items.some((it) => it !== "sep" && it.icon));
  $effect(() => closable(onclose)); // a phone's Back closes it (lib/back.ts)
  const rows = () => Array.from(menu?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
  function move(to: (i: number, n: number) => number): void {
    const r = rows();
    if (r.length) r[to(r.indexOf(document.activeElement as HTMLButtonElement), r.length)]?.focus();
  }
  function jump(letter: string): boolean {
    const r = rows(), from = r.indexOf(document.activeElement as HTMLButtonElement);
    const hit = [...r.slice(from + 1), ...r.slice(0, from + 1)].find((b) => b.dataset.label?.toLowerCase().startsWith(letter));
    hit?.focus();
    return !!hit;
  }
  $effect(() => {
    if (!menu) return;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    at = {
      left: Math.max(EDGE, x + w + EDGE > innerWidth ? x - w : x),
      top: Math.max(EDGE, y + h + EDGE > innerHeight ? Math.min(y - h, innerHeight - h - EDGE) : y),
    };
    rows()[0]?.focus();
    const close = (e: Event) => { if (!menu?.contains(e.target as Node)) onclose(); };
    const key = (e: KeyboardEvent) => {
      const steps: Record<string, (i: number, n: number) => number> = { ArrowDown: (i, n) => (i + 1) % n, ArrowUp: (i, n) => (i - 1 + n) % n, Home: () => 0, End: (_, n) => n - 1 };
      if (e.key === "Escape" || e.key === "Tab") onclose();
      else if (steps[e.key]) move(steps[e.key]);
      else if (e.key.length === 1 && !e.ctrlKey && !superOf(e) && !e.altKey && e.key !== " " && jump(e.key.toLowerCase())) { /* moved */ }
      else return; // Enter and Space reach the focused row
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", onclose);
    return () => { window.removeEventListener("mousedown", close, true); window.removeEventListener("keydown", key, true); window.removeEventListener("blur", onclose); };
  });
</script>

<div class="menu" role="menu" bind:this={menu} class:placed={at} style:left="{at?.left ?? x}px" style:top="{at?.top ?? y}px">
  {#each items as it}
    {#if it === "sep"}<div class="sep" role="separator"></div>
    {:else}
      <button role="menuitem" class:danger={it.danger} disabled={it.disabled} data-label={it.label} onmouseenter={(e) => e.currentTarget.focus()} onclick={() => { onclose(); it.run(); }}>
        {#if icons}<span class="ic">{#if it.icon}<Icon name={it.icon} size={14} />{/if}</span>{/if}
        <span class="label">{it.label}{#if it.detail}<small>{it.detail}</small>{/if}</span>{#if it.hint}<kbd>{it.hint}</kbd>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu { position: fixed; z-index: 90; min-width: 200px; max-width: min(360px, calc(100vw - 12px)); max-height: calc(100vh - 12px); overflow-y: auto; padding: 4px; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow-pop); opacity: 0; }
  .menu.placed { opacity: 1; } /* opacity, not visibility: a hidden row cannot take the focus */
  button { display: flex; align-items: center; gap: 9px; width: 100%; padding: 5px 10px; border-radius: 5px; text-align: left; color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  button:focus, button:focus-visible { background: var(--bg-hover); outline: none; }
  button:disabled { color: var(--text-faint); }
  .ic { width: 14px; height: 14px; flex: none; display: grid; place-items: center; color: var(--text-muted); }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { display: block; overflow: hidden; text-overflow: ellipsis; color: var(--text-faint); font-size: .86em; }
  .danger, .danger .ic { color: var(--red); }
  kbd { color: var(--text-faint); font-family: var(--font-mono); font-size: .85em; margin-left: 12px; }
  .sep { height: 1px; background: var(--border); margin: 4px 6px; }
  /* a finger, not a pointer */
  :global(html.phone) button { min-height: 44px; font-size: 15px; padding: 8px 12px; }
  :global(html.phone) .ic { width: 18px; height: 18px; }
</style>
