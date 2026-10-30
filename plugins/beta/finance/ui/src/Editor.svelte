<script lang="ts">
  // One transaction, every field editable (DESIGN-finance "Transactions"): date, mark, payee, narration, tags and the
  // postings — who the money went from and to — with the balance checked as you type. Saved through `txn_save`, which
  // writes only when the books stay sound; deleted with Undo. A new one when `txn` is null.
  import { call, label, money, type PluginApi } from "./api";
  import { draftOf, imbalance, sides, type Draft, type Row } from "./model";

  let { atlas, txn, accounts, payees, onclose, onsaved }: {
    atlas: PluginApi; txn: Row | null; accounts: string[]; payees: string[]; onclose: () => void; onsaved: (path?: string) => void;
  } = $props();

  const blank = (): Draft => ({ date: new Date().toISOString().slice(0, 10), status: "*", payee: "", narration: "", tags: [], postings: [{ account: "", amount: "" }, { account: "", amount: "" }] });
  const initial = () => (txn ? draftOf(txn) : blank());
  let draft = $state<Draft>(initial());
  let tagText = $state(initial().tags.map((t) => `#${t}`).join(" "));
  let busy = $state(false);
  let error = $state("");
  const check = $derived(imbalance(draft));
  const balanced = $derived(check.bad.length === 0 && (check.open || check.left.size === 0));
  const changed = $derived(JSON.stringify({ ...draft, tags: tags() }) !== JSON.stringify(initial()));
  const meta = $derived(txn?.meta ?? []);
  const flows = $derived(txn ? sides(txn) : null);
  let first: HTMLInputElement | undefined = $state();
  $effect(() => { if (!txn) first?.focus(); });

  function tags() { return tagText.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean); }
  const fmt = (n: number, c: string) => (/^[A-Z]{3}$/.test(c) ? money(n, c, { sign: true }) : `${n > 0 ? "+" : ""}${n.toFixed(2)} ${c}`);

  async function save() {
    if (busy || !balanced) return;
    busy = true; error = "";
    try {
      const at = txn ? { path: txn.path, line: txn.line, text: txn.text } : {};
      const r = await call<{ path: string }>(atlas, "txn_save", { draft: { ...draft, tags: tags() }, ...at });
      atlas.toast(txn ? "Saved" : "Added", `${draft.payee} · ${draft.date}`, "success");
      onsaved(r.path);
    } catch (e) { error = (e as Error).message; } finally { busy = false; }
  }

  async function remove() {
    if (!txn || busy) return;
    busy = true; error = "";
    try {
      const r = await call<{ path: string; removed: string }>(atlas, "txn_delete", { path: txn.path, line: txn.line, text: txn.text });
      const what = `${txn.payee} · ${txn.date}`;
      atlas.toast("Deleted", what, "info", { label: "Undo", run: () => void call(atlas, "txn_restore", { path: r.path, text: r.removed }).then(() => atlas.toast("Restored", what, "success")).catch((e) => atlas.toast("Not restored", (e as Error).message, "error")) });
      onsaved();
    } catch (e) { error = (e as Error).message; } finally { busy = false; }
  }

  function key(e: KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); onclose(); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); }
  }
</script>

<div class="editor" role="dialog" aria-label={txn ? "Edit transaction" : "New transaction"} tabindex="-1" onkeydown={key}>
  <header>
    <h2>{txn ? "Transaction" : "New transaction"}</h2>
    <button class="x" onclick={onclose} aria-label="Close" title="Close (Esc)">×</button>
  </header>

  {#if flows}
    <div class="route" aria-label="Where the money went">
      <span class="side">{#each flows.from as l (l.account)}<b>{label(l.account)}</b>{/each}</span>
      <span class="arrow" aria-hidden="true">→</span>
      <span class="side">{#each flows.to as l (l.account)}<b>{label(l.account)}</b>{/each}</span>
    </div>
  {/if}

  <div class="fields">
    <label class="date">Date<input type="date" bind:value={draft.date} bind:this={first} /></label>
    <label class="mark">Status
      <select bind:value={draft.status}><option value="*">Cleared</option><option value="!">To review</option></select>
    </label>
    <label class="wide">Payee — who it was with<input bind:value={draft.payee} list="fin-payees" placeholder="Mercadona" /></label>
    <label class="wide">Note<input bind:value={draft.narration} placeholder="what it was for" /></label>
    <label class="wide">Tags<input bind:value={tagText} placeholder="e.g. #trip" /></label>
  </div>

  <h3>Postings <span class="faint">money leaves the negative ones and arrives in the positive ones; leave one amount empty to take the rest</span></h3>
  <div class="postings">
    {#each draft.postings as p, i (i)}
      <div class="posting">
        <input class="acct" bind:value={p.account} list="fin-accounts" placeholder="Expenses:Food" aria-label="Account" />
        <input class="amt" bind:value={p.amount} placeholder={check.open && !p.amount ? "the rest" : "-12.40 EUR"} aria-label="Amount" />
        <button class="x" onclick={() => draft.postings.splice(i, 1)} disabled={draft.postings.length <= 2} aria-label="Remove this posting" title="Remove">−</button>
      </div>
    {/each}
    <button class="atlas-btn add" onclick={() => draft.postings.push({ account: "", amount: "" })}>Add a posting</button>
  </div>
  <p class="balance" class:bad={!balanced} role="status">
    {#if check.bad.length}Not an amount: {check.bad.join(", ")} (write it as “-12.40 EUR”)
    {:else if balanced}{check.open ? "Balanced: the empty posting takes the rest" : "Balanced"}
    {:else}Off by {[...check.left].map(([c, v]) => fmt(v, c)).join(", ")} — fix an amount or leave one empty{/if}
  </p>

  {#if meta.length}
    <h3>From the bank</h3>
    <dl class="meta">
      {#each meta as [k, v] (k + v)}<dt>{k}</dt><dd>{v}</dd>{/each}
    </dl>
  {/if}

  {#if error}<div class="atlas-notice error">{error}</div>{/if}

  <footer>
    <button class="atlas-btn primary" disabled={busy || !balanced || !draft.payee.trim() || (!!txn && !changed)} onclick={save} title="Ctrl+Enter">{busy ? "Saving…" : txn ? "Save" : "Add"}</button>
    {#if txn}
      <button class="atlas-btn" onclick={() => atlas.open(txn.path, txn.line)}>Open in the journal</button>
      <button class="atlas-btn danger" disabled={busy} onclick={remove}>Delete</button>
    {/if}
    <span class="faint where">{txn ? `${txn.path.split("/").pop()}:${txn.line}` : `goes to journal/${draft.date.slice(0, 4)}.fin`}</span>
  </footer>

  <datalist id="fin-accounts">{#each accounts as a (a)}<option value={a}></option>{/each}</datalist>
  <datalist id="fin-payees">{#each payees as p (p)}<option value={p}></option>{/each}</datalist>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; background: var(--bg-elev); border-left: 1px solid var(--border); height: 100%; overflow: auto; min-width: 0; box-sizing: border-box; outline: none; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.05em; color: var(--heading); }
  h3 { margin: 4px 0 0; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; }
  h3 .faint { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .faint { color: var(--text-faint); }
  .x { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--text-muted); font-size: 1.2em; }
  .x:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
  .x:focus-visible { outline: 2px solid var(--accent); }
  .x:disabled { opacity: 0.35; cursor: default; }
  .route { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius); background: var(--accent-soft); flex-wrap: wrap; }
  .route .side { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .route b { font-weight: 600; overflow-wrap: anywhere; }
  .arrow { color: var(--accent); font-size: 1.2em; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .fields .wide { grid-column: 1 / -1; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 0.82em; color: var(--text-muted); min-width: 0; }
  input, select { font: inherit; font-size: 1.1em; color: var(--text); background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 8px; min-width: 0; }
  input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  .postings { display: flex; flex-direction: column; gap: 6px; }
  .posting { display: grid; grid-template-columns: minmax(0, 1fr) 9.5em 28px; gap: 6px; align-items: center; }
  .amt { font-family: var(--font-mono); text-align: right; font-variant-numeric: tabular-nums; }
  .add { align-self: flex-start; }
  .balance { margin: 0; font-size: 0.88em; color: var(--green); }
  .balance.bad { color: var(--red); }
  .meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; font-size: 0.88em; }
  .meta dt { color: var(--text-muted); }
  .meta dd { margin: 0; overflow-wrap: anywhere; font-family: var(--font-mono); font-size: 0.95em; }
  footer { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--border); }
  .where { margin-left: auto; font-size: 0.82em; }
  .danger { color: var(--red); }
</style>
