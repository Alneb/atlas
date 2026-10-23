<script lang="ts">
  // The `!` queue (DESIGN-finance "Review"): j/k move, Enter accepts (one still in Unknown with the classifier's guess,
  // shown with its reason), c picks a category and accepts, a accepts every one like it (same payee, same category),
  // o opens the journal at the transaction. Each edit is the engine's (review_edit): only that transaction's lines change.
  import { call, label, type PluginApi, type Txn } from "./api";
  let { atlas, known, onchange }: { atlas: PluginApi; known: string[]; onchange: () => void } = $props();
  let txns = $state<Txn[]>([]);
  let sel = $state(0);
  let error = $state("");
  let loading = $state(true);
  let list: HTMLElement | undefined = $state();

  export async function load() {
    try {
      const r = await call<{ transactions: Txn[] }>(atlas, "review");
      txns = r.transactions.slice().reverse();
      sel = Math.min(sel, Math.max(txns.length - 1, 0));
      error = "";
    } catch (e) { error = (e as Error).message; }
    loading = false;
  }
  load();

  // A statement row's own words: what follows its "C: " (Unicaja's and Revolut's rows), else the whole text.
  const bankText = (v: string) => v.match(/\bC: (.*)$/)?.[1] ?? v;

  // The posting Review fills in: the Unknown one, else the first that is not money (Assets, Liabilities).
  const target = (t: Txn) => t.postings.find((p) => /^(Expenses|Income):Unknown$/.test(p.account)) ?? t.postings.find((p) => !/^(Assets|Liabilities)(:|$)/.test(p.account));

  /** What accepting it does: an Unknown with a guess takes the guess, anything else is accepted as it is. */
  const accepting = (t: Txn) => { const tg = target(t); return tg && /:Unknown$/.test(tg.account) && t.guess ? { from: tg.account, to: t.guess.to } : {}; };

  async function edit(t: Txn, change: { from?: string; to?: string }, quiet = false) {
    try {
      await call(atlas, "review_edit", { path: t.path, line: t.line, text: t.text, accept: true, ...change });
      txns = txns.filter((x) => x !== t);
      sel = Math.min(sel, Math.max(txns.length - 1, 0));
      if (!quiet) onchange();
      return true;
    } catch (e) {
      atlas.toast("Not changed", (e as Error).message, "error");
      load();
      return false;
    }
  }

  // s: split the Unknown posting into parts, typed as "Assets:Deposits 900, Expenses:Rent" (the last takes the rest).
  function split(t: Txn) {
    const from = target(t)?.account;
    if (!from) return;
    const cur = t.postings.map((p) => p.amount?.split(" ")[1]).find(Boolean) ?? "EUR";
    atlas.pick({
      placeholder: `Split ${t.payee}: Account amount, Account (the last takes the rest)`, tag: "Finance", items: [],
      typed: (s) => `Split into ${s}`,
      onpick: (v) => {
        let parts: (string | null)[][];
        try { parts = v.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
          const m = x.match(/^(\S+)(?:\s+(-?[\d.,]+)(?:\s+([A-Z]{3}))?)?$/);
          if (!m) throw new Error(`“${x}”: write Account amount`);
          const acct = m[1].includes(":") ? m[1] : `Expenses:${m[1]}`;
          return [acct, m[2] ? `${m[2].replace(",", ".")} ${m[3] ?? cur}` : null];
        }); } catch (e) { atlas.toast("Not split", (e as Error).message, "error"); return; }
        void call(atlas, "review_edit", { path: t.path, line: t.line, text: t.text, from, split: parts }).then(() => { load(); onchange(); }, (e) => atlas.toast("Not split", (e as Error).message, "error"));
      },
    });
  }

  // Every one with this payee that would be filed the same way, accepted one after another (each by the engine).
  const same = (t: Txn) => { const k = (x: Txn) => [x.payee.toLowerCase(), target(x)?.account, accepting(x).to].join("|"); return txns.filter((x) => k(x) === k(t)); };
  async function acceptLike(t: Txn) {
    const all = same(t);
    for (const x of all) if (!(await edit(x, accepting(x), true))) break;
    onchange();
    atlas.toast("Accepted", `${all.length} × ${t.payee}`);
  }

  function categorize(t: Txn) {
    const from = target(t)?.account;
    if (!from) return atlas.toast("Nothing to categorize", "every posting of this transaction is an account");
    const root = from.split(":")[0];
    const items = known.filter((a) => a.startsWith(`${root}:`) && !a.endsWith(":Unknown")).map((a) => ({ value: a, title: label(a), detail: a }));
    atlas.pick({
      placeholder: `Category for ${t.payee}`, tag: "Finance", items,
      typed: (s) => `New category “${s.includes(":") ? s : `${root}:${s}`}”`,
      onpick: (v) => void edit(t, { from, to: v.includes(":") ? v : `${root}:${v}` }),
    });
  }

  function key(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || !txns.length) return;
    const t = txns[sel];
    const go = (i: number) => { sel = Math.max(0, Math.min(txns.length - 1, i)); list?.querySelectorAll(".txn")[sel]?.scrollIntoView({ block: "nearest" }); };
    if (e.key === "j" || e.key === "ArrowDown") go(sel + 1);
    else if (e.key === "k" || e.key === "ArrowUp") go(sel - 1);
    else if (e.key === "Enter") edit(t, accepting(t));
    else if (e.key === "a") acceptLike(t);
    else if (e.key === "s") split(t);
    else if (e.key === "c") categorize(t);
    else if (e.key === "o") atlas.open(t.path, t.line);
    else return;
    e.preventDefault();
  }
</script>

<div class="review" role="listbox" aria-label="Transactions to review" tabindex="0" onkeydown={key} bind:this={list}>
  {#if error}
    <div class="atlas-notice error">{error}<div class="actions"><button class="atlas-btn" onclick={load}>Try again</button></div></div>
  {:else if loading}
    <div class="atlas-empty">Reading the journal…</div>
  {:else if !txns.length}
    <div class="atlas-empty">Nothing to review.</div>
  {:else}
    <div class="keys"><kbd>j</kbd><kbd>k</kbd> move · <kbd>Enter</kbd> accept · <kbd>a</kbd> accept all like it · <kbd>c</kbd> category · <kbd>s</kbd> split · <kbd>o</kbd> open in the journal · {txns.length} left</div>
    {#each txns as t, i (t.path + t.line)}
      {@const tg = target(t)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="txn" class:sel={i === sel} role="option" aria-selected={i === sel} tabindex="-1" onclick={() => (sel = i)}>
        <div class="line1">
          <span class="date">{t.date}</span>
          <span class="payee">{t.payee}</span>
          {#if t.narration}<span class="faint">{t.narration}</span>{/if}
          <span class="grow"></span>
          {#if tg && tg.account.endsWith(":Unknown") && t.guess}
            <button class="cat guess" class:sure={t.guess.sure} onclick={() => categorize(t)} title="{t.guess.why} — Enter takes it, c chooses another">{label(t.guess.to)}?</button>
          {:else if tg}<button class="cat" class:unknown={tg.account.endsWith(":Unknown")} onclick={() => categorize(t)} title="c: choose the category">{label(tg.account)}</button>{/if}
          {#if i === sel}
            {@const n = same(t).length}
            {#if n > 1}<button class="atlas-btn" onclick={() => acceptLike(t)} title="a">All {n}</button>{/if}
            <button class="atlas-btn primary" onclick={() => edit(t, accepting(t))} title="Enter">Accept</button>
          {/if}
        </div>
        {#if i === sel && t.guess && tg?.account.endsWith(":Unknown")}<div class="why faint">{t.guess.why}</div>{/if}
        <div class="posts">
          {#each t.postings.filter((p) => p !== tg || p.amount) as p, j (j)}<span><span class="faint">{label(p.account)}</span> {p.amount ?? ""}</span>{/each}
          {#each t.meta.filter(([k]) => k === "bank") as [, v], j (j)}<span class="faint bank" title={v}>“{bankText(v)}”</span>{/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .review { outline: none; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .keys { color: var(--text-faint); font-size: 0.9em; margin-bottom: 6px; }
  kbd { font-family: var(--font-mono); font-size: 0.85em; padding: 0 4px; border: 1px solid var(--border); border-radius: 3px; margin-right: 2px; }
  .txn { padding: 8px 10px; border-radius: var(--radius); border: 1px solid transparent; }
  .txn:hover { background: var(--bg-hover); }
  .txn.sel { border-color: var(--accent); background: var(--accent-soft); }
  .line1 { display: flex; align-items: center; gap: 10px; min-height: 26px; }
  .date { color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .payee { font-weight: 600; white-space: nowrap; }
  .line1 > .faint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .bank { font-style: italic; }
  .grow { flex: 1; }
  .faint { color: var(--text-faint); }
  .cat { all: unset; cursor: pointer; padding: 2px 10px; border-radius: 999px; background: var(--bg-hover); color: var(--text-muted); }
  .cat.unknown { box-shadow: inset 0 0 0 1px var(--yellow); }
  .cat.guess { box-shadow: inset 0 0 0 1px var(--accent); font-style: italic; }
  .cat.guess.sure { font-style: normal; }
  .why { font-size: 0.85em; margin: 2px 0 0; }
  .cat:hover { color: var(--text); }
  .posts { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 0.92em; font-variant-numeric: tabular-nums; margin-top: 2px; }
</style>
