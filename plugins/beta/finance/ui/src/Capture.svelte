<script lang="ts">
  // The capture box (DESIGN-finance "Capture"): type a payment in your words — "12,40 café con Ana revolut ayer",
  // "+1500 salary unicaja" — and the engine's reading shows as you type (`parse`); Enter writes it to review (`add`).
  // The same words work in Atlas's own capture box, from any app (the `capture` hook).
  import { call, type PluginApi } from "./api";
  let { atlas, onchange }: { atlas: PluginApi; onchange: () => void } = $props();
  interface Reading { hint?: string; why?: string; sure?: boolean; skipped?: string }
  let text = $state("");
  let reading = $state<Reading | null>(null);
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asked = 0;

  function typed() {
    clearTimeout(timer);
    const t = text.trim();
    if (!t) { reading = null; return; }
    timer = setTimeout(async () => {
      const n = ++asked;
      try { const r = await call<Reading>(atlas, "parse", { text: t }); if (n === asked) reading = r; } catch (e) { if (n === asked) reading = { skipped: (e as Error).message }; }
    }, 150);
  }

  async function add() {
    if (!text.trim() || busy) return;
    busy = true;
    try {
      const r = await call<{ path: string; hint: string }>(atlas, "add", { text: text.trim() });
      atlas.toast("Added to review", r.hint.replace(/^→ /, ""));
      text = ""; reading = null;
      onchange();
    } catch (e) { atlas.toast("Not added", (e as Error).message, "error"); } finally { busy = false; }
  }
</script>

<div class="capture">
  <input
    placeholder="12,40 café con Ana revolut ayer · +1500 salary unicaja · 30 cad groceries" bind:value={text} oninput={typed}
    onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } else if (e.key === "Escape") { text = ""; reading = null; } }}
    aria-label="Add a payment in your words" />
  <div class="hint" class:off={!reading?.hint}>
    {#if reading?.hint}
      <span class:unsure={!reading.sure}>{reading.hint}</span>{#if reading.why}<span class="faint">&nbsp;· {reading.why}</span>{/if}<span class="faint">&nbsp;· Enter adds it to review</span>
    {:else if reading?.skipped}
      <span class="faint">{reading.skipped}</span>
    {:else}
      <span class="faint">A payment in your words: an amount, where it went, the account and the day (es, en, fr).</span>
    {/if}
  </div>
</div>

<style>
  .capture { display: grid; gap: 4px; }
  input { width: 100%; box-sizing: border-box; font: inherit; font-size: 1.05em; padding: 8px 10px; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); outline: none; }
  input:focus { border-color: var(--accent); }
  .hint { min-height: 1.4em; font-variant-numeric: tabular-nums; color: var(--text); }
  .unsure { font-style: italic; }
  .faint { color: var(--text-faint); }
</style>
