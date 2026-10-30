<script lang="ts">
  // The Sources tab (DESIGN-finance "Sources"): the banks connected through Enable Banking (their notes in
  // finance/sources/), their consent and last sync in plain words, and connecting one: the application's key (a
  // secret, never in the vault), a bank chosen from the country's list, its consent page in the sign-in window (or a
  // browser tab, then the address it ended on pasted here). Files dropped in the inbox stay the way that always works.
  // Connecting is three steps drawn in the card (bank, consent, accounts), not a chain of pickers and toasts.
  import { call, folder, type PluginApi, type Source } from "./api";
  let { atlas, sources, assets = [], onchange }: { atlas: PluginApi; sources: Source[]; assets?: string[]; onchange: () => void } = $props();
  interface Bank { name: string; country: string; days: number | null }
  let hasKey = $state<boolean | null>(null);
  let country = $state("ES");
  let banks = $state<Bank[]>([]);
  let choosing = $state(false); // step 1: the country's banks listed in the card
  let filter = $state("");
  const shown = $derived(banks.filter((b) => b.name.toLowerCase().includes(filter.trim().toLowerCase())));
  let pending = $state<{ bank: string; country: string } | null>(null);
  let address = $state("");
  let busy = $state("");
  let error = $state("");
  const appId = $derived(String(atlas.plugin.settings.bank_app_id ?? ""));
  const redirect = $derived(String(atlas.plugin.settings.bank_redirect ?? ""));

  $effect(() => { atlas.secrets.has("enable_banking_key").then((h) => (hasKey = h)).catch(() => (hasKey = false)); });

  async function run<T>(what: string, f: () => Promise<T>): Promise<T | undefined> {
    busy = what; error = "";
    try { return await f(); } catch (e) { error = (e as Error).message; } finally { busy = ""; }
  }

  async function setKey() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".pem,.key,.txt";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const pem = await f.text();
      if (!/BEGIN (RSA )?PRIVATE KEY/.test(pem)) { error = `${f.name} is not a PEM private key`; return; }
      await atlas.secrets.set("enable_banking_key", pem.trim());
      hasKey = true;
      atlas.toast("Key kept", "the application's private key is a secret of the finance plugin, outside the vault");
    };
    input.click();
  }

  async function list() {
    const r = await run("list", () => call<{ banks: Bank[] }>(atlas, "bank_list", { country }));
    if (!r) return;
    banks = r.banks;
    filter = "";
    choosing = true;
  }

  let consent = $state(""); // the bank's page, as a link too: a browser may block the tab opened after the helper answered

  // A connection that came back while no tab was waiting (this one was closed or reloaded): finish it now.
  $effect(() => {
    const back = redirect && atlas.signInReturned?.(redirect);
    if (back) { address = back; void finish(); }
  });

  async function connect(bank: string) {
    choosing = false;
    const r = await run("connect", () => call<{ url: string }>(atlas, "bank_connect", { bank, country }));
    if (!r?.url) return;
    pending = { bank, country };
    consent = r.url;
    // The desktop's sign-in window, or a browser tab whose return page hands the address back here.
    const back = await atlas.signIn(r.url, redirect).catch(() => "");
    if (back) { address = back; await finish(); }
  }

  interface Unlinked { uid: string; iban: string | null; name: string | null; currency: string | null }

  // The address carries the bank in its `state`, so this works without `pending` too. The code is single-use:
  // whatever the answer, it is not offered again.
  async function finish() {
    const back = address.trim();
    if (!back || busy === "finish") return;
    address = "";
    const r = await run("finish", () => call<{ path: string; bank: string; accounts: number; until: string | null; unlinked: Unlinked[] }>(atlas, "bank_finish", { address: back, ...(pending ?? {}) }));
    pending = null; consent = "";
    if (!r) return;
    connected = `${r.bank}: ${r.accounts} accounts, consent until ${r.until ?? "?"}`;
    unlinked = r.unlinked;
    choice = Object.fromEntries(r.unlinked.map((u) => [u.uid, ""]));
    onchange();
  }

  // Step 3: accounts no ledger account names by IBAN (a pocket in another currency), each given one in a list.
  let connected = $state("");
  let unlinked = $state<Unlinked[]>([]);
  let choice = $state<Record<string, string>>({});
  const describe = (u: Unlinked) => `${u.name ?? "account"}${u.currency ? ` (${u.currency})` : ""}${u.iban ? ` …${u.iban.slice(-4)}` : ""}`;
  async function linkAll() {
    for (const u of unlinked) {
      const a = choice[u.uid];
      if (a && await run("link", () => call(atlas, "bank_link", { account: a, uid: u.uid })) === undefined) return;
    }
    unlinked = []; connected = "";
    onchange();
  }

  async function sync() {
    const r = await run("sync", () => call<{ summary?: string; skipped?: string }>(atlas, "bank_sync", {}));
    if (r) { atlas.toast("Synced", r.summary ?? r.skipped ?? ""); onchange(); }
  }

  // "From the bank's site": open it in the browser and watch the downloads folder (`downloads`) for ten minutes; every
  // statement a preset recognises is moved into the inbox, then imported with Overview → Statements.
  interface Site { name: string; url: string; hint?: string }
  let sites = $state<Site[]>([]);
  let downloads = $state<string | null>(null); // null: no downloads folder where the core runs (a server)
  let watching = $state<{ name: string; until: number } | null>(null);
  let taken = $state<string[]>([]);
  $effect(() => { call<{ banks: Site[]; downloads: string | null }>(atlas, "banks").then((r) => { sites = r.banks; downloads = r.downloads; }).catch(() => {}); });
  let poll: ReturnType<typeof setInterval> | undefined;
  $effect(() => () => clearInterval(poll));
  function fetchFrom(site: Site) {
    window.open(site.url, "_blank", "noopener");
    const since = Math.floor(Date.now() / 1000) - 5;
    watching = { name: site.name, until: Date.now() + 10 * 60_000 };
    taken = [];
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!watching || Date.now() > watching.until) { clearInterval(poll); watching = null; return; }
      try {
        const r = await call<{ taken: { name: string; preset: string }[] }>(atlas, "downloads", { since });
        if (r.taken.length) {
          taken = [...taken, ...r.taken.map((t) => `${t.name} (${t.preset})`)];
          atlas.toast("Statement taken", r.taken.map((t) => t.name).join(", ") + " → the inbox");
          onchange();
        }
      } catch (e) { error = (e as Error).message; clearInterval(poll); watching = null; }
    }, 3000);
  }

  const left = (d: string | null) => d ? Math.round((new Date(`${d}T12:00:00`).getTime() - Date.now()) / 86400000) : null;
</script>

<div class="grid">
  <section class="card wide">
    <h3>Banks <span class="faint">read through Enable Banking with your consent; on the server, four times a day at most</span></h3>
    {#each sources as s (s.path)}
      {@const d = left(s.until)}
      <div class="src">
        <button class="name" onclick={() => atlas.open(s.path)}>{s.bank}<span class="faint"> · {s.country}</span></button>
        <span class:bad={d !== null && d < 14} class="faint">{d === null ? "consent: unknown" : d < 0 ? `consent ended ${s.until}` : `consent ${d} days left`}</span>
        <span class="faint">{s.synced ? `synced ${s.synced}` : "never synced"}</span>
        {#if d !== null && d < 14}<button class="atlas-btn" onclick={() => connect(s.bank)}>Renew</button>{/if}
        <div class="accts faint">{s.accounts.map((a) => `${a.name || "account"} ${a.iban ? `…${a.iban.slice(-4)}` : ""}`).join(" · ")}</div>
        {#if s.error}<div class="atlas-notice error">{s.error}</div>{/if}
      </div>
    {:else}
      <div class="atlas-empty">No bank connected. Statements dropped into {folder(atlas)}/statements/inbox/ always work (Overview → Statements).</div>
    {/each}
    <div class="actions">
      <button class="atlas-btn primary" disabled={!!busy || !hasKey || !appId || !redirect} onclick={list}>{busy === "list" || busy === "connect" ? "Asking…" : "Connect a bank"}</button>
      <select bind:value={country} aria-label="Country">{#each ["ES", "FR", "PT", "IT", "DE", "NL", "BE", "IE", "LT", "FI"] as c (c)}<option>{c}</option>{/each}</select>
      <button class="atlas-btn" disabled={!!busy || !sources.length} onclick={sync}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>
    </div>
    {#if choosing}
      <div class="step" role="group" aria-label="Choose a bank">
        <div class="steps faint"><b>1 Bank</b> · 2 Consent · 3 Accounts</div>
        <input bind:value={filter} placeholder={`${banks.length} banks in ${country}: type to narrow`} aria-label="Bank" />
        <div class="banks">
          {#each shown as b (b.name)}
            <button class="site" onclick={() => connect(b.name)}><b>{b.name}</b>{#if b.days}<span class="faint">consent up to {b.days} days</span>{/if}</button>
          {:else}<span class="faint">No bank matches.</span>{/each}
        </div>
        <button class="atlas-btn" onclick={() => (choosing = false)}>Cancel</button>
      </div>
    {/if}
    {#if connected}
      <div class="step" role="group" aria-label="Link the accounts">
        <div class="steps faint">1 Bank · 2 Consent · <b>3 Accounts</b></div>
        <p>Connected {connected}.{#if unlinked.length}{" "}These accounts name no ledger account yet: which is each?{/if}</p>
        {#each unlinked as u (u.uid)}
          <label class="link-row"><span>{describe(u)}</span>
            <select bind:value={choice[u.uid]} aria-label={`Ledger account for ${describe(u)}`}>
              <option value="">not now</option>
              {#each assets as a (a)}<option value={a}>{a}</option>{/each}
            </select>
          </label>
        {/each}
        <button class="atlas-btn primary" disabled={busy === "link"} onclick={linkAll}>Done</button>
      </div>
    {/if}
    {#if pending}
      <div class="paste">
        <span class="steps faint">1 Bank · <b>2 Consent</b> · 3 Accounts</span>
        <span>Opened {pending.bank}'s consent page{#if consent} (<a href={consent} target="_blank" rel="noopener">open it</a> if no tab appeared){/if}. It comes back here by itself; if it does not, paste the address it ended on:</span>
        <input bind:value={address} placeholder={`${redirect}?code=…`} onkeydown={(e) => e.key === "Enter" && finish()} />
        <button class="atlas-btn primary" disabled={!address.trim() || !!busy} onclick={finish}>Finish</button>
      </div>
    {/if}
    {#if error}<div class="atlas-notice error">{error}</div>{/if}
  </section>

  {#if downloads}
  <section class="card wide">
    <h3>From the bank's site <span class="faint">download as usual: what lands in {downloads} and reads as a statement goes to the inbox</span></h3>
    <div class="sites">
      {#each sites as s (s.url)}
        <button class="site" onclick={() => fetchFrom(s)} title={s.url}><b>{s.name}</b>{#if s.hint}<span class="faint">{s.hint}</span>{/if}</button>
      {/each}
    </div>
    {#if watching}<p>Watching the downloads for {watching.name}… <button class="atlas-btn" onclick={() => { clearInterval(poll); watching = null; }}>Stop</button></p>{/if}
    {#if taken.length}<p class="faint">Taken: {taken.join(", ")}. Import them in Overview → Statements.</p>{/if}
  </section>
  {/if}

  <section class="card wide">
    <h3>Enable Banking <span class="faint">what connecting needs</span></h3>
    <ol class="setup">
      <li class:done={!!appId}>An application at <b>enablebanking.com</b> (free for your own accounts) and its id in <button class="link" onclick={() => atlas.plugin.openSettings()}>Settings</button>{#if appId}: <code>{appId}</code>{/if}.</li>
      <li class:done={!!redirect}>Its redirect address, the server's https address, in Settings too{#if redirect}: <code>{redirect}</code>{/if}.</li>
      <li class:done={!!hasKey}>Its private key (the .pem the control panel gave): <button class="atlas-btn" onclick={setKey}>{hasKey ? "Replace the key" : "Choose the key file"}</button> <span class="faint">kept as a secret of the plugin, outside the vault</span></li>
    </ol>
    <p class="faint">Desjardins (Canada) has no such access yet: fetch its PDF statements from its site above.</p>
  </section>
</div>

<style>
  .grid { display: grid; gap: 14px; }
  .card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; min-width: 0; }
  h3 { margin: 0 0 10px; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; }
  .faint { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .bad { color: var(--red); }
  .src { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--border); }
  .src .name { all: unset; cursor: pointer; font-weight: 600; }
  .accts { flex-basis: 100%; font-size: 0.88em; }
  .actions, .paste { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
  .paste input, select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 5px 8px; }
  .paste input { flex: 1; min-width: 240px; }
  .setup { margin: 0; padding-left: 1.4em; display: grid; gap: 6px; }
  .setup li.done::marker { color: var(--green); }
  .setup li.done { color: var(--text-muted); }
  .link { all: unset; cursor: pointer; color: var(--accent); }
  code { font-size: 0.9em; }
  .sites { display: flex; flex-wrap: wrap; gap: 8px; }
  .site { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  .site:hover { background: var(--bg-hover); border-color: var(--accent); }
  .site .faint { font-size: 0.85em; }
  .step { display: grid; gap: 8px; margin-top: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); }
  .steps { font-size: 0.85em; }
  .steps b { color: var(--text); }
  .step input { font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 5px 8px; }
  .banks { display: flex; flex-wrap: wrap; gap: 8px; max-height: 260px; overflow: auto; }
  .step > .atlas-btn { justify-self: start; }
  .step p { margin: 0; }
  .link-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .link-row span { min-width: 200px; }
</style>
