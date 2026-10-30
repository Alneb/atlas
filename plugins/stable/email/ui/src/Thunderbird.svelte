<script lang="ts">
  // Thunderbird, in one dialog (view.ts, arg THUNDERBIRD_DIALOG): its accounts, each added as a card in Email's
  // settings with what to do next said beside it; and an account's local mail (a POP account's, gone from the
  // server) checked first, then what is in no note written as notes — the counts, the go-ahead and the result here.
  import { untrack } from "svelte";
  import { call, type PluginApi } from "./api";

  type Card = { name: string; auth?: string; user?: string };
  type Found = { user: string; name: string; imap_host: string; auth: string; profile: string; record: Card };
  let { atlas, onclose }: { atlas: PluginApi; onclose: () => void } = $props();

  // the cards as the dialog opened; this dialog adds to them
  let cards = $state<Card[]>(untrack(() => ((atlas.plugin.settings.accounts as Card[] | undefined) ?? []).filter((c) => c?.name)));
  let found = $state<Found[] | null>(null);
  let foundError = $state("");
  let added = $state<Record<number, string>>({});

  untrack(() => call<{ accounts: Found[] }>(atlas, "thunderbird")).then((r) => (found = r.accounts), (e) => (foundError = String((e as Error).message ?? e)));

  const isCard = (f: Found) => cards.some((c) => c.name === f.record.name || (c.user && c.user === f.record.user));
  async function add(i: number, f: Found) {
    try {
      cards = [...cards, f.record];
      await atlas.plugin.saveSettings({ accounts: cards });
      added[i] = f.record.auth === "outlook" ? "Added: now “Sign in to Outlook” on its card." : "Added: now type its password on its card (an app password for Gmail).";
    } catch (e) {
      cards = cards.filter((c) => c !== f.record);
      added[i] = `Not added: ${(e as Error).message ?? e}`;
    }
  }

  // local mail: check (a dry run), then write
  let account = $state(untrack(() => cards[0]?.name ?? ""));
  type Step = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "missing"; n: number; by: [string, number][] } | { kind: "done"; text: string; error?: boolean };
  let step = $state<Step>({ kind: "idle" });
  async function check() {
    step = { kind: "busy", text: `Comparing ${account}'s local mail with its notes…` };
    try {
      const dry = await call<{ missing: Record<string, number>; note?: string }>(atlas, "thunderbird_mail", { account, dry: true }, 600);
      const by = Object.entries(dry.missing ?? {});
      const n = by.reduce((a, [, k]) => a + k, 0);
      step = n ? { kind: "missing", n, by } : { kind: "done", text: dry.note ?? "Every local message is already a note." };
    } catch (e) { step = { kind: "done", text: String((e as Error).message ?? e), error: true }; }
  }
  async function write(n: number) {
    step = { kind: "busy", text: `Writing ${n} messages as notes…` };
    try {
      const r = await call<{ saved: string[]; failed: string[] }>(atlas, "thunderbird_mail", { account, dry: false }, 1800);
      step = { kind: "done", text: `${r.saved.length} kept as notes${r.failed.length ? `; ${r.failed.length} failed: ${r.failed.slice(0, 3).join("; ")}` : "."}`, error: r.failed.length > 0 };
    } catch (e) { step = { kind: "done", text: String((e as Error).message ?? e), error: true }; }
  }
</script>

<div class="tb">
  <section>
    <h3>Accounts in Thunderbird</h3>
    <p class="hint">Each becomes a card in Email's settings; its password or sign-in is given there.</p>
    {#if foundError}
      <p class="err">{foundError}</p>
    {:else if !found}
      <p class="hint">Reading Thunderbird's profiles…</p>
    {:else if !found.length}
      <p class="hint">No account found in a Thunderbird profile.</p>
    {:else}
      <ul>
        {#each found as f, i (i)}
          <li>
            <div class="who"><b>{f.user || f.name}</b><small>{f.imap_host} · {f.auth} · {f.profile}</small>
              {#if added[i]}<small class:err={added[i].startsWith("Not")}>{added[i]}</small>{/if}</div>
            {#if added[i] && !added[i].startsWith("Not")}
              <button onclick={() => atlas.plugin.openSettings()}>Open its card</button>
            {:else}
              <button class:primary={!isCard(f)} disabled={isCard(f)} onclick={() => add(i, f)}>{isCard(f) ? "Already a card" : "Add"}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>Local mail</h3>
    <p class="hint">What Thunderbird keeps on this computer only (a POP account's mail, gone from the server), kept as notes.</p>
    {#if !cards.length}
      <p class="hint">Add the account above first.</p>
    {:else}
      <div class="row">
        <select aria-label="Account" bind:value={account} onchange={() => (step = { kind: "idle" })} disabled={step.kind === "busy"}>
          {#each cards as c (c.name)}<option value={c.name}>{c.name}{c.user ? ` — ${c.user}` : ""}</option>{/each}
        </select>
        <button onclick={check} disabled={!account || step.kind === "busy"}>Check</button>
      </div>
      {#if step.kind === "busy"}
        <p class="hint">{step.text}</p>
      {:else if step.kind === "missing"}
        {@const n = step.n}
        <p>{n} message{n === 1 ? "" : "s"} Thunderbird keeps for {account} {n === 1 ? "is" : "are"} in no note:</p>
        <ul class="counts">{#each step.by as [folder, k] (folder)}<li><span>{folder}</span><span>{k}</span></li>{/each}</ul>
        <div class="row"><button class="primary" onclick={() => write(n)}>Write them as notes</button></div>
      {:else if step.kind === "done"}
        <p class:err={step.error}>{step.text}</p>
      {/if}
    {/if}
  </section>

  <div class="go"><button onclick={onclose}>Close</button></div>
</div>

<style>
  .tb { display: flex; flex-direction: column; gap: 18px; height: 100%; min-height: 0; overflow: auto; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--text); }
  h3 { margin: 0 0 2px; font-size: 1em; }
  p { margin: 4px 0; }
  .hint, small { color: var(--text-muted); font-size: .9em; }
  .err { color: var(--danger, #c33); }
  ul { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
  .counts li { justify-content: space-between; padding: 3px 8px; font-size: .9em; }
  .row { display: flex; gap: 8px; margin-top: 6px; }
  select { flex: 1; min-width: 0; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; }
  button { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; white-space: nowrap; font: inherit; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text, #fff); }
  button:disabled { opacity: .5; cursor: default; }
  .go { display: flex; justify-content: flex-end; margin-top: auto; }
</style>
