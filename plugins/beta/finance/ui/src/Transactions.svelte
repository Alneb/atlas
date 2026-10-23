<script lang="ts">
  // Every transaction (DESIGN-finance "Transactions"): one searchable list, each row saying who the money went from
  // and to; Enter or a click opens it in the editor beside the list. Keys: j/k move, Enter opens, n adds, / searches.
  import { money, type PluginApi } from "./api";
  import { kind, matcher, net, sideName, sides, type Row } from "./model";
  import Editor from "./Editor.svelte";

  let { atlas, rows, accounts, cur, query = $bindable(""), open = $bindable<Row | "new" | null>(null), onchange }: {
    atlas: PluginApi; rows: Row[]; accounts: string[]; cur: string; query?: string; open?: Row | "new" | null; onchange: () => void;
  } = $props();

  const KINDS = [["all", "All"], ["spend", "Spending"], ["income", "Income"], ["transfer", "Transfers"]] as const;
  let only = $state<(typeof KINDS)[number][0]>("all");
  let shown = $state(200);
  let sel = $state(0);
  let search: HTMLInputElement | undefined = $state();
  let list: HTMLElement | undefined = $state();

  const found = $derived.by(() => {
    const m = matcher(query);
    return rows.filter((t) => (only === "all" || kind(t) === only) && m(t));
  });
  const total = $derived(found.reduce((s, t) => s + (kind(t) === "transfer" || kind(t) === "other" ? 0 : net(t)), 0));
  const visible = $derived(found.slice(0, shown));
  const payees = $derived([...new Set(rows.map((t) => t.payee))].sort());
  $effect(() => { void query; void only; shown = 200; sel = 0; });

  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const monthOf = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function pick(i: number) {
    sel = Math.max(0, Math.min(found.length - 1, i));
    if (sel >= shown) shown = sel + 50;
    queueMicrotask(() => list?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }));
  }

  function key(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = (e.target as HTMLElement).closest("input, textarea, select, [role=dialog]");
    if (e.key === "/" && !typing) { e.preventDefault(); search?.focus(); return; }
    if (typing) { if (e.key === "Escape" && e.target === search) { query = ""; search?.blur(); } return; }
    if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); pick(sel + 1); if (open && open !== "new") open = found[sel]; }
    else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); pick(sel - 1); if (open && open !== "new") open = found[sel]; }
    else if (e.key === "Enter" && found[sel]) { e.preventDefault(); open = found[sel]; }
    else if (e.key === "n") { e.preventDefault(); open = "new"; }
    else if (e.key === "Escape" && open) { open = null; }
  }
</script>

<svelte:window onkeydown={key} />
<div class="tx" class:with={!!open}>
  <section class="main">
    <div class="bar">
      <input class="search" bind:this={search} bind:value={query} placeholder="Search payee, account, bank text · #guess · >100 · 2025-03 · !" aria-label="Search transactions" />
      <div class="seg" role="radiogroup" aria-label="Kind">
        {#each KINDS as [k, name] (k)}<button role="radio" aria-checked={only === k} class:on={only === k} onclick={() => (only = k)}>{name}</button>{/each}
      </div>
      <button class="atlas-btn primary" onclick={() => (open = "new")} title="n">New…</button>
    </div>
    <p class="count">
      <b>{found.length.toLocaleString()}</b> {found.length === 1 ? "transaction" : "transactions"}{#if query || only !== "all"} · net {money(total, cur, { sign: true })}{/if}
      {#if query}<button class="link" onclick={() => (query = "")}>clear the search</button>{/if}
    </p>

    <div class="list" bind:this={list} role="listbox" aria-label="Transactions" tabindex="-1">
      {#each visible as t, i (t.path + ":" + t.line)}
        {#if i === 0 || visible[i - 1].date.slice(0, 7) !== t.date.slice(0, 7)}<div class="month">{monthOf(t.date)}</div>{/if}
        {@const s = sides(t)}
        {@const k = kind(t)}
        <button class="row" class:sel={i === sel} class:open={open !== "new" && open?.path === t.path && open?.line === t.line} data-i={i} role="option" aria-selected={i === sel}
          onclick={() => { sel = i; open = t; }}>
          <span class="date">{day(t.date)}</span>
          <span class="who">
            <span class="payee">{t.payee}{#if t.status === "!"}<span class="chip warn">review</span>{/if}{#each t.tags as tag (tag)}<span class="chip" class:warn={tag === "guess"}>#{tag}</span>{/each}</span>
            {#if t.narration}<span class="note">{t.narration}</span>{/if}
          </span>
          <span class="route"><span class="from">{sideName(s.from)}</span><span class="arr" aria-label="to">→</span><span class="to">{sideName(s.to)}</span></span>
          <span class="amt" class:in={k !== "transfer" && net(t) > 0} class:moved={k === "transfer"}>{k === "transfer" ? "⇄ " : ""}{money(net(t), cur, { sign: k !== "transfer" })}</span>
        </button>
      {:else}
        <div class="atlas-empty">{rows.length ? "Nothing matches. Try fewer words, or clear the search." : "No transactions yet: import a statement (Overview) or add one with New…"}</div>
      {/each}
      {#if found.length > shown}<button class="atlas-btn more" onclick={() => (shown += 400)}>Show {Math.min(400, found.length - shown)} more of {found.length - shown}</button>{/if}
    </div>
  </section>

  {#if open}
    {#key open === "new" ? "new" : open.path + ":" + open.line + open.text}
      <Editor {atlas} txn={open === "new" ? null : open} {accounts} {payees} onclose={() => (open = null)} onsaved={() => { open = null; onchange(); }} />
    {/key}
  {/if}
</div>

<style>
  .tx { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; height: 100%; min-height: 0; }
  .tx.with { grid-template-columns: minmax(0, 1fr) min(460px, 45%); }
  .main { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding-right: 12px; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .search { flex: 1; min-width: 220px; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 8px 10px; }
  .search:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  .seg { display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius); overflow: hidden; }
  .seg button { all: unset; cursor: pointer; padding: 6px 10px; font-size: 0.9em; color: var(--text-muted); }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button:hover { background: var(--bg-hover); color: var(--text); }
  .seg button.on { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .count { margin: 10px 0 6px; color: var(--text-muted); font-size: 0.88em; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .count b { color: var(--text); font-variant-numeric: tabular-nums; }
  .link { all: unset; cursor: pointer; color: var(--accent); }
  .list { overflow: auto; min-height: 0; flex: 1; outline: none; }
  .month { position: sticky; top: 0; z-index: 1; background: var(--bg); padding: 10px 8px 4px; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--border); }
  .row { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 4.2em minmax(0, 1.3fr) minmax(0, 1.2fr) 8.5em; gap: 12px; align-items: center; width: 100%; padding: 7px 8px; border-bottom: 1px solid var(--border); min-height: 40px; }
  .row:hover { background: var(--bg-hover); }
  .row.sel { box-shadow: inset 2px 0 0 var(--accent); background: var(--bg-hover); }
  .row.open { background: var(--accent-soft); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .date { color: var(--text-muted); font-size: 0.88em; font-variant-numeric: tabular-nums; }
  .who { display: flex; flex-direction: column; min-width: 0; }
  .payee { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { color: var(--text-faint); font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--tag-bg); color: var(--tag-color); font-size: 0.75em; font-weight: 500; vertical-align: 1px; }
  .chip.warn { background: var(--highlight-bg); color: var(--text); }
  .route { display: flex; gap: 6px; align-items: baseline; min-width: 0; font-size: 0.88em; color: var(--text-muted); }
  .route .from, .route .to { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .route .to { color: var(--text); flex: 1; }
  .arr { color: var(--text-faint); }
  .amt { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 0.92em; }
  .amt.in { color: var(--green); }
  .amt.moved { color: var(--text-muted); }
  .more { margin: 10px auto; display: block; }
  @container (max-width: 640px) { .row { grid-template-columns: 3.6em minmax(0, 1fr) 7em; } .route { display: none; } }
</style>
