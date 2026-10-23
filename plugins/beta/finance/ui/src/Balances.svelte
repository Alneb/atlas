<script lang="ts">
  // Cash per account (Assets and Liabilities with a note), every commodity it holds; a click opens its register.
  import { label, money, type Account } from "./api";
  let { accounts, cur, onpick }: { accounts: Account[]; cur: string; onpick?: (a: Account) => void } = $props();
  const open = $derived(accounts.filter((a) => !a.closed));
  const fmt = (q: string, c: string) => (c === cur || /^[A-Z]{3}$/.test(c) ? money(Number(q), c) : `${Number(q).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${c}`);
</script>

<div class="balances">
  {#each open as a (a.account)}
    {@const entries = Object.entries(a.balances)}
    <button class="row" onclick={() => onpick?.(a)} disabled={!onpick} title={a.account}>
      <span class="name">{label(a.account)}</span>
      <span class="nums">
        {#each entries as [c, q] (c)}<span class:neg={Number(q) < 0}>{fmt(q, c)}</span>{:else}<span class="faint">—</span>{/each}
      </span>
    </button>
  {:else}
    <div class="atlas-empty">No accounts yet: an account is a note with <code>type: finance-account</code>.</div>
  {/each}
</div>

<style>
  .balances { display: grid; gap: 2px; }
  .row { all: unset; display: flex; justify-content: space-between; gap: 12px; padding: 5px 8px; border-radius: var(--radius-sm); cursor: default; }
  .row:not(:disabled) { cursor: pointer; }
  .row:not(:disabled):hover, .row:focus-visible { background: var(--bg-hover); }
  .name { color: var(--text-muted); }
  .nums { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
  .neg { color: var(--red); }
  .faint { color: var(--text-faint); }
</style>
