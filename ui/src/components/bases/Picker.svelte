<script lang="ts" generics="T extends string">
  // A compact choice inside a Bases popover: a button that says the current choice and opens the app's menu under it
  // (fixed, so a long list of properties is never clipped by the popover's scroll). Arrows, a letter and Enter work.
  import ContextMenu from "../ContextMenu.svelte";
  import { below, type MenuAt } from "../../lib/menu";

  type Option = { value: T; label: string; detail?: string };
  let { value, options, onchange, label, mono = false }: {
    value: T; options: Option[]; onchange: (v: T) => void;
    /** what the choice is about, for screen readers ("Property", "Operator") */
    label: string;
    /** the label in the code font (an expression's name) */
    mono?: boolean;
  } = $props();

  let menu = $state<MenuAt | null>(null);
  const current = $derived(options.find((o) => o.value === value));
  function show(e: MouseEvent) {
    menu = below(e, options.map((o) => ({ label: o.label, detail: o.detail, icon: o.value === value ? "check" as const : undefined, run: () => { if (o.value !== value) onchange(o.value); } })));
  }
</script>

<button type="button" class="picker" class:mono aria-label={label} aria-haspopup="menu" aria-expanded={!!menu} title={current?.label ?? value} onclick={show}>
  <span class="cur">{current?.label ?? value}</span>
  <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
</button>
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

<style>
  .picker { display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: 100%; height: 26px; padding: 0 8px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; }
  .picker:hover { border-color: var(--border-strong); background: var(--bg-hover); }
  .picker:focus-visible, .picker[aria-expanded="true"] { outline: none; border-color: var(--accent); }
  .cur { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .mono .cur { font-family: var(--font-mono); font-size: .92em; }
  svg { flex: none; color: var(--text-faint); }
</style>
