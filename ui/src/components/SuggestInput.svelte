<script lang="ts" module>
  export interface Suggestion { value: string; label: string; detail?: string }
</script>

<script lang="ts">
  // A text input with its own list of suggestions under it — what a property's value offers (the vault's notes for a
  // link, the values the vault already uses): ↑/↓ to move, Enter or Tab to take one, Escape to close, a click to take
  // it. In place of a `<datalist>`, which WebKitGTK barely shows and which cannot say which folder a note is in
  //.
  import type { HTMLInputAttributes } from "svelte/elements";

  let { value = $bindable(""), items, onpick, class: cls = "", ...rest }: {
    value?: string;
    items: Suggestion[];
    onpick: (value: string) => void;
    class?: string;
  } & Omit<HTMLInputAttributes, "value" | "class"> = $props();

  let input = $state<HTMLInputElement | null>(null);
  let open = $state(false);
  let at = $state(-1); // the highlighted row; -1: none (Enter is then the input's own)
  let box = $state({ left: 0, top: 0, width: 0 });

  const shown = $derived(open && items.length > 0);
  $effect(() => { void items; at = -1; }); // new suggestions: nothing taken by surprise

  function place() {
    const r = input?.getBoundingClientRect();
    if (!r) return;
    // kept inside the window: the properties panel sits at its right edge, where a list as wide as its input ran off
    const width = Math.min(Math.max(260, r.width), window.innerWidth - 16);
    box = { left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 2, width };
  }
  function show() { place(); open = true; }

  function take(i: number) {
    const s = items[i];
    if (!s) return;
    open = false;
    onpick(s.value);
  }

  function key(e: KeyboardEvent) {
    if (shown) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        // round the list and back to "none" (the typed text as it is)
        at = e.key === "ArrowDown" ? (at + 1 >= items.length ? -1 : at + 1) : (at < 0 ? items.length - 1 : at - 1);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && at >= 0) { e.preventDefault(); e.stopPropagation(); take(at); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); open = false; return; }
    }
    rest.onkeydown?.(e as KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement });
  }
</script>

<input bind:this={input} bind:value class={cls} autocomplete="off" role="combobox" aria-expanded={shown} aria-autocomplete="list"
  {...rest}
  onkeydown={key}
  oninput={(e) => { show(); rest.oninput?.(e); }}
  onfocus={(e) => { show(); rest.onfocus?.(e); }}
  onblur={(e) => { open = false; rest.onblur?.(e); }} />
{#if shown}
  <ul class="suggest" role="listbox" style="left:{box.left}px;top:{box.top}px;width:{box.width}px">
    {#each items as s, i (s.value)}
      <!-- mousedown, not click: the input keeps its focus, so its blur does not commit the half-typed text first -->
      <li role="option" aria-selected={i === at} class:at={i === at} onmousedown={(e) => { e.preventDefault(); take(i); }} onmouseenter={() => (at = i)}>
        <span class="label">{s.label}</span>{#if s.detail}<span class="detail">{s.detail}</span>{/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .suggest { position: fixed; z-index: 60; max-height: 260px; overflow-y: auto; margin: 0; padding: 4px; list-style: none;
    background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-pop);
    font-size: calc(12.5px * var(--ui-scale, 1)); }
  li { display: flex; align-items: baseline; gap: 8px; padding: 4px 8px; border-radius: 4px; cursor: pointer; color: var(--text); }
  li.at { background: var(--accent-soft); }
  .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .detail { margin-left: auto; color: var(--text-faint); font-size: .9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
</style>
