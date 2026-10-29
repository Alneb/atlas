<script lang="ts">
  // To / Cc / Bcc as chips (DESIGN-mail-ui §3 "Composer"): typed addresses become chips on a comma, Enter or Tab; the
  // address book (everyone mail went to or came from, the most used first) is offered as you type. Backspace in an
  // empty box takes the last chip back to edit it. The value stays a plain "Name <addr>, addr" list.
  import { hue, type Contact, type PluginApi } from "./api";
  import { call } from "./api";

  let { atlas, label, value = $bindable(), autofocus = false }: { atlas: PluginApi; label: string; value: string; autofocus?: boolean } = $props();

  let text = $state("");
  let offers = $state<Contact[]>([]);
  let sel = $state(0);
  let input: HTMLInputElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** The list split on commas outside quotes and angle brackets. */
  function split(v: string): string[] {
    const out: string[] = [];
    let cur = "", q = false, a = false;
    for (const c of v) {
      if (c === '"') q = !q;
      if (c === "<") a = true;
      if (c === ">") a = false;
      if ((c === "," || c === ";") && !q && !a) { if (cur.trim()) out.push(cur.trim()); cur = ""; } else cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  const chips = $derived(split(value));
  const addr = (c: string) => (c.match(/<([^>]+)>/)?.[1] ?? c).trim();
  const name = (c: string) => c.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || addr(c);
  const valid = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr(c));

  function add(entry: string) {
    const e = entry.trim().replace(/,$/, "");
    if (!e) return;
    value = [...chips.filter((c) => addr(c).toLowerCase() !== addr(e).toLowerCase()), e].join(", ");
    text = "";
    offers = [];
  }
  function remove(i: number) {
    value = chips.filter((_, j) => j !== i).join(", ");
  }
  function typed() {
    // a pasted list becomes chips at once
    if (/[,;]/.test(text)) {
      for (const p of split(text)) add(p);
      return;
    }
    clearTimeout(timer);
    const q = text.trim();
    if (!q) { offers = []; return; }
    timer = setTimeout(async () => {
      try {
        const r = await call<{ contacts: Contact[] }>(atlas, "contacts", { q, limit: 7 }, 10);
        if (text.trim() === q) { offers = r.contacts.filter((c) => !chips.some((x) => addr(x).toLowerCase() === c.addr)); sel = 0; }
      } catch { offers = []; }
    }, 90);
  }
  const entry = (c: Contact) => (c.name ? `${/[,"<>]/.test(c.name) ? `"${c.name.replace(/"/g, "")}"` : c.name} <${c.addr}>` : c.addr);
  function key(e: KeyboardEvent) {
    if (offers.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : offers.length - 1)) % offers.length;
    } else if (e.key === "Enter" || (e.key === "Tab" && text.trim())) {
      if (offers.length) { e.preventDefault(); add(entry(offers[sel])); }
      else if (text.trim()) { e.preventDefault(); add(text); }
    } else if (e.key === "Backspace" && !text && chips.length) {
      e.preventDefault();
      text = chips.at(-1)!;
      remove(chips.length - 1);
    } else if (e.key === "Escape" && offers.length) {
      e.stopPropagation();
      offers = [];
    }
  }
  $effect(() => { if (autofocus) input?.focus(); });
</script>

<div class="field">
  <span class="label">{label}</span>
  <div class="box" role="presentation" onclick={() => input?.focus()}>
    {#each chips as c, i (c + i)}
      <span class="chip" class:bad={!valid(c)} title={c} style:--h={hue(addr(c))}>
        <span>{name(c)}</span>
        <button onclick={(e) => { e.stopPropagation(); remove(i); }} aria-label={`Remove ${addr(c)}`}>×</button>
      </span>
    {/each}
    <input bind:this={input} bind:value={text} oninput={typed} onkeydown={key} onblur={() => { if (text.trim()) add(text); offers = []; }}
      aria-label={label} autocomplete="off" spellcheck="false" />
  </div>
  {#if offers.length}
    <ul class="offers" role="listbox">
      {#each offers as o, i (o.addr)}
        <li role="option" aria-selected={i === sel}><button class:on={i === sel} onmousedown={(e) => { e.preventDefault(); add(entry(o)); }}><b>{o.name || o.addr}</b>{#if o.name}<span>{o.addr}</span>{/if}</button></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .field { position: relative; display: flex; align-items: flex-start; gap: 8px; border-bottom: 1px solid var(--border); padding: 4px 0; }
  .label { flex: none; width: 3.2em; color: var(--text-faint); padding-top: 5px; font-size: 0.9em; }
  .box { flex: 1; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-height: 28px; cursor: text; min-width: 0; }
  .chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 2px 1px 8px; border-radius: 999px; background: hsl(var(--h) 55% 50% / 0.16); max-width: 100%; }
  .chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip.bad { background: color-mix(in srgb, var(--red) 18%, transparent); outline: 1px solid var(--red); }
  .chip button { all: unset; cursor: pointer; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; color: var(--text-muted); }
  .chip button:hover { background: var(--bg-active); color: var(--text); }
  input { all: unset; flex: 1; min-width: 8em; padding: 4px 0; }
  .offers { position: absolute; z-index: 10; left: 3.6em; right: 0; top: 100%; margin: 2px 0 0; padding: 4px; list-style: none; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-md, var(--shadow-sm)); }
  .offers button { all: unset; box-sizing: border-box; width: 100%; display: flex; gap: 10px; align-items: baseline; padding: 6px 10px; border-radius: var(--radius-sm); cursor: pointer; }
  .offers button.on, .offers button:hover { background: var(--accent-soft); }
  .offers span { color: var(--text-muted); font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; }
</style>
