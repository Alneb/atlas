<script lang="ts" generics="T extends string">
  import { closable } from "../lib/back";
  // Themed dropdown: replaces native <select>, whose popup WebKitGTK draws as an unthemed light GTK
  // list (user report; flagged by the UX audit's `native-select` rule). Keyboard: Enter/Space/↓ open,
  // ↑↓ move, Enter picks, Esc closes; type a letter to jump.
  type Option = { value: T; label: string; note?: string };
  let { id, value, options, onchange, label: aria }: {
    id?: string; value: T; options: Option[]; onchange: (v: T) => void; label?: string;
  } = $props();

  let open = $state(false);
  let active = $state(0);
  let root: HTMLDivElement;
  let list = $state<HTMLUListElement>();
  const current = $derived(options.find((o) => o.value === value));
  $effect(() => { if (open) return closable(() => (open = false)); }); // a phone's Back closes the list (lib/back.ts)

  function show() {
    active = Math.max(0, options.findIndex((o) => o.value === value));
    open = true;
    requestAnimationFrame(() => list?.querySelector(".on")?.scrollIntoView({ block: "nearest" }));
  }
  function pick(i: number) {
    open = false;
    if (options[i] && options[i].value !== value) onchange(options[i].value);
    root.querySelector("button")?.focus();
  }
  function onkeydown(e: KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); open = false; }
    else if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(options.length - 1, active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
    else if (e.key.length === 1) {
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) active = i;
    } else return;
    requestAnimationFrame(() => list?.children[active]?.scrollIntoView({ block: "nearest" }));
  }
  function onfocusout(e: FocusEvent) {
    if (!root.contains(e.relatedTarget as Node)) open = false;
  }
</script>

<div class="select" bind:this={root} {onfocusout}>
  <button {id} type="button" class="trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={aria}
    onclick={() => (open ? (open = false) : show())} {onkeydown} title={current?.note}>
    <span class="cur">{current?.label ?? value}</span>
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>
  {#if open}
    <ul class="menu" role="listbox" bind:this={list} tabindex="-1">
      {#each options as o, i (o.value)}
        <li role="option" aria-selected={o.value === value} class:on={i === active} class:cur={o.value === value}
          onmousedown={(e) => { e.preventDefault(); pick(i); }} onmousemove={() => (active = i)}>
          <span class="l">{o.label}</span>{#if o.note}<span class="n">{o.note}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .select { position: relative; display: inline-block; min-width: 180px; max-width: 100%; }
  .trigger { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; font: inherit;
    font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); padding: 5px 9px; text-align: left; }
  .trigger:hover { border-color: var(--text-faint); }
  .trigger:focus-visible, .trigger[aria-expanded="true"] { outline: none; border-color: var(--accent); }
  .cur { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  svg { flex: none; color: var(--text-muted); }
  .menu { position: absolute; z-index: 50; top: calc(100% + 4px); left: 0; min-width: 100%; max-width: 460px; max-height: 300px; overflow: auto;
    margin: 0; padding: 4px; list-style: none; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    box-shadow: var(--shadow-pop); }
  li { display: flex; flex-direction: column; gap: 1px; padding: 5px 9px; border-radius: 4px; cursor: pointer; color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  li.on { background: var(--bg-hover); }
  li.cur .l { color: var(--accent); font-weight: 600; }
  .n { color: var(--text-muted); font-size: .86em; }
</style>
