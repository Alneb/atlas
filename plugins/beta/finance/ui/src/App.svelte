<script lang="ts">
  // The Finance pane (DESIGN-finance "UI", rebuilt in: docs/refactor/REFACTOR-finance-ui.md). Overview,
  // Transactions (every one, editable), Spending (what the money goes on), Accounts, Budget, Review, Investments,
  // Sources; keys 1–8. The transactions are read once and shared, so every tab answers at once; everything reloads
  // when a file under the finance folder changes (a capture, an import, an edit here or in the journal).
  import { call, currency, folder, label, type Diagnostic, type PluginApi, type RegisterRow, type Summary } from "./api";
  import { group, periods as periodsOf, totals, ym, type Period, type Row } from "./model";
  import Overview from "./Overview.svelte";
  import Transactions from "./Transactions.svelte";
  import Spend from "./Spend.svelte";
  import Balances from "./Balances.svelte";
  import Register from "./Register.svelte";
  import Review from "./Review.svelte";
  import Budget from "./Budget.svelte";
  import Invest from "./Invest.svelte";
  import Sources from "./Sources.svelte";

  let { atlas }: { atlas: PluginApi } = $props();
  type Tab = "overview" | "transactions" | "spending" | "accounts" | "budget" | "review" | "invest" | "sources";
  const TABS: [Tab, string][] = [["overview", "Overview"], ["transactions", "Transactions"], ["spending", "Spending"], ["accounts", "Accounts"], ["budget", "Budget"], ["review", "Review"], ["invest", "Investments"], ["sources", "Sources"]];
  const initialArg = () => atlas.arg; // the tab openView named ("review"); later args come as a new pane
  let tab = $state<Tab>(TABS.find(([t]) => t === initialArg())?.[0] ?? "overview");
  let summary = $state<Summary | null>(null);
  let rows = $state<Row[]>([]);
  let error = $state("");
  let diags = $state<Diagnostic[]>([]);
  let account = $state("");
  let register = $state<RegisterRow[]>([]);
  let query = $state("");
  let open = $state<Row | "new" | null>(null);
  let review: Review | undefined = $state();
  let invest: Invest | undefined = $state();
  const cur = $derived(currency(atlas));

  // one period for Overview and Spending, from the latest month with transactions
  const last = $derived(rows[0]?.date.slice(0, 7) ?? ym(new Date()));
  const periods = $derived(periodsOf(last));
  let chosen = $state<Period | null>(null);
  const period = $derived(chosen ?? periods[3]); // 12 months: one month is too often one big outlier

  // A category's colour follows the category, never its rank in a view: the eight biggest of all time take the
  // eight validated slots in order (dataviz palette, both themes); every other one is grey.
  const order = $derived([...totals(rows, "Expenses")].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g));
  const color = (g: string) => { const i = order.indexOf(group(g)); return i < 0 ? "var(--fin-other)" : `var(--fin-c${i + 1})`; };

  async function load() {
    try {
      const [s, t] = await Promise.all([call<Summary>(atlas, "summary"), call<{ transactions: Row[] }>(atlas, "transactions")]);
      summary = s; rows = t.transactions;
      error = "";
      diags = s.errors + s.warnings ? (await call<{ diagnostics: Diagnostic[] }>(atlas, "check")).diagnostics : [];
      if (account) await openAccount(account, false);
      // an open editor follows its transaction (same place and header), or closes when it is gone
      if (open && open !== "new") { const o = open; open = rows.find((r) => r.path === o.path && r.line === o.line && r.text === o.text) ?? null; }
    } catch (e) { error = (e as Error).message; }
  }
  async function openAccount(a: string, go = true) {
    account = a;
    if (go) tab = "accounts";
    register = (await call<{ rows: RegisterRow[] }>(atlas, "register", { account: a })).rows;
  }
  function show(q: string) { query = q; open = null; tab = "transactions"; }
  function edit(path: string, line: number) {
    const r = rows.find((x) => x.path === path && x.line === line);
    if (r) { open = r; tab = "transactions"; } else atlas.open(path, line);
  }
  load();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const mine = (p?: string) => !!p && p.startsWith(`${folder(atlas)}/`);
  const later = () => { clearTimeout(timer); timer = setTimeout(() => { load(); review?.load(); invest?.load(); }, 300); };
  $effect(() => {
    const offs = (["file:save", "file:create", "file:delete"] as const).map((ev) => atlas.on(ev, (e) => { if (mine((e as { path?: string }).path)) later(); }));
    offs.push(atlas.on("file:rename", (e) => { const r = e as { from?: string; to?: string }; if (mine(r.from) || mine(r.to)) later(); }));
    return () => { clearTimeout(timer); offs.forEach((off) => off()); };
  });

  // Accounts opens on the first account that holds something, never on an empty page
  $effect(() => {
    if (tab !== "accounts" || account || !summary) return;
    const first = summary.accounts.find((x) => !x.closed && Object.keys(x.balances).length);
    if (first) void openAccount(first.account, false);
  });

  const categories = $derived((summary?.known ?? []).filter((a) => /^(Expenses|Income):[^:]+$/.test(a)));

  function key(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, select, [role=dialog]")) return;
    const i = ["1", "2", "3", "4", "5", "6", "7", "8"].indexOf(e.key);
    if (i >= 0) { tab = TABS[i][0]; e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={key} />
<div class="finance" class:full={tab === "transactions"}>
  <header class="top">
    <nav aria-label="Finance">
      {#each TABS as [t, name], i (t)}
        <button class:on={tab === t} aria-current={tab === t ? "page" : undefined} onclick={() => (tab = t)} title={`key ${i + 1}`}>{name}{#if t === "review" && summary?.review}<span class="badge">{summary.review}</span>{/if}</button>
      {/each}
    </nav>
    <button class="atlas-btn" onclick={() => atlas.plugin.openSettings()}>Settings…</button>
  </header>

  {#if error}
    <div class="atlas-notice error">{error}<div class="actions"><button class="atlas-btn" onclick={load}>Try again</button><button class="atlas-btn" onclick={() => atlas.plugin.openSettings()}>Settings…</button></div></div>
  {:else if !summary}
    <div class="atlas-empty">Reading the journal…</div>
  {:else if tab === "overview"}
    <Overview {atlas} {summary} {rows} {diags} {cur} bind:period={() => period, (p) => (chosen = p)} {periods} {color} onshow={show}
      ontab={(t) => (tab = t)} onaccount={(a) => openAccount(a)} onchange={load} />
  {:else if tab === "transactions"}
    <Transactions {atlas} {rows} accounts={summary.known} {cur} bind:query bind:open onchange={load} />
  {:else if tab === "spending"}
    <Spend {rows} {cur} bind:period={() => period, (p) => (chosen = p)} {periods} {color} onshow={show} />
  {:else if tab === "accounts"}
    <div class="split">
      <aside>
        <h3>Accounts</h3>
        <Balances accounts={summary.accounts} {cur} onpick={(a) => openAccount(a.account)} />
        <h3>Categories</h3>
        {#each categories as c (c)}<button class="cat" class:on={account === c} onclick={() => openAccount(c)}>{label(c)}<span class="faint">{c.split(":")[0]}</span></button>{/each}
      </aside>
      <main>
        {#if account}
          <h3>{account} <button class="link" onclick={() => show(account.toLowerCase())}>as transactions</button></h3>
          <Register rows={register} {account} onopen={(r) => edit(r.path, r.line)} />
        {:else}
          <div class="atlas-empty">Choose an account or a category: its postings with the running balance, newest first; a row opens the transaction.</div>
        {/if}
      </main>
    </div>
  {:else if tab === "budget"}
    <Budget {atlas} budget={summary.budget} {cur} onchange={load} />
  {:else if tab === "review"}
    <Review bind:this={review} {atlas} known={summary.known} onchange={load} />
  {:else if tab === "invest"}
    <Invest bind:this={invest} {atlas} {cur} />
  {:else}
    <Sources {atlas} sources={summary.sources} assets={summary.known.filter((a) => a.startsWith("Assets:"))} onchange={load} />
  {/if}
</div>

<style>
  /* The categorical slots (dataviz reference palette, validated on --bg-elev in both themes) and the two flow ends. */
  .finance {
    --fin-c1: #3987e5; --fin-c2: #d95926; --fin-c3: #199e70; --fin-c4: #c98500; --fin-c5: #d55181; --fin-c6: #008300; --fin-c7: #9085e9; --fin-c8: #e66767;
    --fin-other: #6b7280; --fin-income: #3f8f6a; --fin-saved: #7d8590;
  }
  :global([data-theme="light"]) .finance {
    --fin-c1: #2a78d6; --fin-c2: #eb6834; --fin-c3: #1baf7a; --fin-c4: #eda100; --fin-c5: #e87ba4; --fin-c6: #008300; --fin-c7: #6250d6; --fin-c8: #e34948;
    --fin-other: #9ca3af; --fin-income: #2f9e5c; --fin-saved: #8c939f;
  }
  .finance { padding: 14px 18px 28px; color: var(--text); font-size: calc(14px * var(--ui-scale, 1)); container-type: inline-size; box-sizing: border-box; }
  .finance.full { height: 100%; display: flex; flex-direction: column; padding-bottom: 0; }
  .finance.full > :global(:last-child) { flex: 1; min-height: 0; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  nav { display: flex; gap: 2px; background: var(--bg-hover); padding: 3px; border-radius: var(--radius); flex-wrap: wrap; }
  nav button { all: unset; cursor: pointer; padding: 5px 12px; border-radius: var(--radius-sm); color: var(--text-muted); display: flex; gap: 6px; align-items: center; min-height: 24px; }
  nav button:hover { color: var(--text); }
  nav button.on { background: var(--bg); color: var(--text); box-shadow: var(--shadow-sm); font-weight: 500; }
  nav button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .badge { font-size: 0.8em; padding: 0 6px; border-radius: 999px; background: var(--yellow); color: var(--bg); font-weight: 600; }
  h3 { margin: 0 0 10px; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; display: flex; gap: 10px; align-items: baseline; }
  .faint { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .link { all: unset; cursor: pointer; color: var(--accent); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .split { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 18px; align-items: start; max-width: 1180px; }
  aside { position: sticky; top: 0; display: grid; gap: 4px; }
  aside h3:not(:first-child) { margin-top: 14px; }
  .cat { all: unset; cursor: pointer; display: flex; justify-content: space-between; padding: 4px 8px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .cat:hover, .cat.on { background: var(--bg-hover); color: var(--text); }
  @container (max-width: 700px) { .split { grid-template-columns: minmax(0, 1fr); } aside { position: static; } }
</style>
