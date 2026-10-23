<script lang="ts">
  // The statements inbox (DESIGN-finance-import): what is in `<folder>/statements/inbox/`, the import's dry run (a line
  // per statement: new, already in the ledger, the bank's balances against the ledger's), and the import itself on a
  // click. Nothing is written before that click; each statement's note keeps the full report.
  import { call, folder, type PluginApi } from "./api";

  let { atlas, onchange }: { atlas: PluginApi; onchange: () => void } = $props();
  interface Line { note: string; account: string; source: string; rows: number; new: number; known: number; paired: number; skipped: number; checks: number; off: number }
  interface Run { files: string[]; report: string; new: number; errors: string[]; written: boolean; statements: Line[] }
  let run = $state<Run | null>(null);
  let busy = $state(false);
  let error = $state("");
  let open = $state(false);

  async function check(write = false) {
    busy = true;
    try {
      run = await call<Run>(atlas, "import", { write });
      error = "";
      if (run.written) {
        atlas.toast("Imported", `${run.new} transactions to review; the originals are in each account's archive.`);
        onchange();
        run = await call<Run>(atlas, "import");
      }
    } catch (e) { error = (e as Error).message; } finally { busy = false; }
  }
  check();

  const off = $derived(run?.statements.reduce((n, l) => n + l.off, 0) ?? 0);
  const checks = $derived(run?.statements.reduce((n, l) => n + l.checks, 0) ?? 0);
  const repeats = $derived(run ? run.files.length - new Set(run.statements.map((l) => l.source)).size : 0);
</script>

<h3>Statements <span class="faint">{folder(atlas)}/statements/inbox/</span></h3>
{#if error}
  <div class="atlas-notice error">{error}</div>
{:else if !run}
  <div class="atlas-empty">Reading the inbox…</div>
{:else if !run.files.length}
  <div class="atlas-empty">The inbox is empty. Drop a bank's export there (Norma 43, CSV, Excel, PDF): the preset that reads it is found from the file.</div>
{:else}
  <p class="head">
    <b>{run.files.length}</b> files, <b>{run.statements.length}</b> statements, <b>{run.new}</b> new transactions ·
    {#if checks}{#if off}<span class="bad">{off} of {checks} balances disagree</span>{:else}<span class="good">all {checks} balances agree ✓</span>{/if}{/if}
    {#if repeats > 0}· {repeats} already imported{/if}
  </p>
  {#each run.errors as e, i (i)}<div class="atlas-notice error">{e}</div>{/each}
  <table>
    <thead><tr><th>Statement</th><th class="n">rows</th><th class="n">new</th><th class="n">known</th><th class="n">transfers</th><th class="n">skipped</th><th>balances</th></tr></thead>
    <tbody>
      {#each run.statements as l (l.note)}
        <tr title={`${l.account} · ${l.source}`}>
          <td><span class="name">{l.note}</span><span class="faint">{l.source}</span></td>
          <td class="n">{l.rows}</td><td class="n" class:warm={l.new > 0}>{l.new}</td><td class="n">{l.known}</td><td class="n">{l.paired || ""}</td><td class="n">{l.skipped || ""}</td>
          <td>{#if !l.checks}<span class="faint">—</span>{:else if l.off}<span class="bad">{l.off} off</span>{:else}<span class="good">✓</span>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="actions">
    <button class="atlas-btn primary" disabled={busy || run.errors.length > 0} onclick={() => check(true)}>
      {busy ? "Working…" : run.new ? `Import ${run.new} transactions` : "File the statements"}
    </button>
    <button class="atlas-btn" disabled={busy} onclick={() => check()}>Check again</button>
    <button class="atlas-btn" onclick={() => (open = !open)}>{open ? "Hide" : "Show"} the report</button>
    {#if run.errors.length}<span class="faint">Fix the errors above first.</span>{/if}
  </div>
  {#if open}<pre>{run.report}</pre>{/if}
{/if}

<style>
  h3 { margin: 0 0 10px; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; }
  .faint { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .head { margin: 0 0 10px; color: var(--text-muted); }
  .head b { color: var(--text); font-variant-numeric: tabular-nums; }
  .good { color: var(--green); }
  .bad { color: var(--red); font-weight: 600; }
  .warm { color: var(--yellow); font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-weight: 500; color: var(--text-faint); font-size: 0.85em; padding: 2px 8px; border-bottom: 1px solid var(--border); }
  td { padding: 4px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .n { text-align: right; width: 4.5em; }
  td .name { display: block; }
  td .faint { font-size: 0.85em; overflow-wrap: anywhere; }
  .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.85em; color: var(--text-muted); max-height: 420px; overflow: auto; background: var(--bg); padding: 10px; border-radius: var(--radius-sm); }
  @media (max-width: 700px) { th:nth-child(4), td:nth-child(4), th:nth-child(5), td:nth-child(5), th:nth-child(6), td:nth-child(6) { display: none; } }
</style>
