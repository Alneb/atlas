<script lang="ts">
  // Outlook's sign-in in one dialog (view.ts, arg signinDialog(…)), the way Thunderbird does it (the card's flow):
  // automatic — Microsoft's page in the user's own browser, the answer caught on localhost by the engine; code — a
  // device code typed at microsoft.com/devicelogin, shown here with a copy button; window — Atlas's sign-in window,
  // whose return address finishes it (pasted in the box here, in a browser). The engine keeps the refresh token in
  // Atlas's secret store (oauth.rs). The account is chosen here when several sign in with Outlook.
  import { untrack } from "svelte";
  import { call, type PluginApi } from "./api";

  type Card = { name: string; auth?: string; user?: string };
  let { atlas, account: given, record, onclose }: { atlas: PluginApi; account?: string; record?: Card; onclose: () => void } = $props();

  const outlook = untrack(() => ((atlas.plugin.settings.accounts as Card[] | undefined) ?? []).filter((c) => c?.name && c.auth === "outlook"));
  let account = $state(untrack(() => given ?? record?.name ?? (outlook.length === 1 ? outlook[0].name : "")));

  type Step =
    | { kind: "choose" }
    | { kind: "starting" }
    | { kind: "waiting"; flow: string; url: string; code?: string; copied?: boolean }
    | { kind: "done" }
    | { kind: "failed"; why: string };
  let step = $state<Step>(untrack(() => (account ? { kind: "starting" } : { kind: "choose" })));
  let pasted = $state("");
  let gone = false;

  const open = (url: string) => void call(atlas, "signin_reopen", { url }).catch(() => window.open(url, "_blank"));
  const done = () => {
    if (gone) return;
    step = { kind: "done" };
    window.dispatchEvent(new CustomEvent("atlas-email:signed-in", { detail: { account } }));
    void call(atlas, "watch", {}, 30).catch(() => {});
  };
  const fail = (e: unknown) => { if (!gone) step = { kind: "failed", why: String((e as Error)?.message ?? e) }; };

  let settled = false;
  function finishWith(redirect: string) {
    if (settled || !redirect.trim()) return;
    settled = true;
    call(atlas, "signin_finish", { redirect: redirect.trim(), account }, 60).then(done, (e) => { settled = false; fail(e); });
  }

  async function start() {
    step = { kind: "starting" };
    settled = false;
    try {
      const s = await call<{ flow: string; url: string; opened?: boolean; code?: string; redirect?: string }>(atlas, "signin_start", record && record.name === account ? { record } : { account }, 60);
      if (gone) return;
      if (s.flow === "automatic" || s.flow === "code") {
        // these belong to the user's own browser: the engine opens it, here and when asked again
        let copied = false;
        if (s.code) copied = await navigator.clipboard?.writeText(s.code).then(() => true, () => false) ?? false;
        if (!s.opened) open(s.url);
        step = { kind: "waiting", flow: s.flow, url: s.url, code: s.code, copied };
        await call(atlas, "signin_finish", { account }, s.flow === "code" ? 900 : 660);
        return done();
      }
      step = { kind: "waiting", flow: "window", url: s.url };
      const back = atlas.signIn ? atlas.signIn(s.url, s.redirect ?? "https://localhost") : (window.open(s.url, "_blank"), null);
      back?.then(finishWith, () => {});
    } catch (e) { fail(e); }
  }
  if (untrack(() => step.kind === "starting")) void start();

  $effect(() => () => { gone = true; });
  const copy = (code: string) => navigator.clipboard?.writeText(code).then(() => { if (step.kind === "waiting") step = { ...step, copied: true }; }, () => {});
</script>

<div class="si">
  {#if step.kind === "choose"}
    {#if !outlook.length}
      <p>No account signs in with Outlook: set one's Sign-in to <b>outlook</b> in Email's settings.</p>
      <div class="go"><button onclick={() => atlas.plugin.openSettings()}>Open Email's settings</button></div>
    {:else}
      <p>Which account?</p>
      <ul>
        {#each outlook as c (c.name)}
          <li><button class="pick" onclick={() => { account = c.name; void start(); }}><b>{c.name}</b>{#if c.user}<small>{c.user}</small>{/if}</button></li>
        {/each}
      </ul>
    {/if}
  {:else if step.kind === "starting"}
    <p class="hint">Asking Microsoft for a sign-in for {account}…</p>
  {:else if step.kind === "waiting"}
    {#if step.flow === "code"}
      <p>On the Microsoft page, type this code and sign in as <b>{account}</b>:</p>
      <div class="code"><span>{step.code}</span><button onclick={() => copy(step.kind === "waiting" ? step.code ?? "" : "")}>{step.copied ? "Copied" : "Copy"}</button></div>
    {:else if step.flow === "automatic"}
      <p>Sign in as <b>{account}</b> on the Microsoft page in your browser.</p>
    {:else}
      <p>Sign in as <b>{account}</b> in the window that opened.</p>
    {/if}
    {#if step.flow === "window"}
      <form class="row" onsubmit={(e) => { e.preventDefault(); finishWith(pasted); }}>
        <input aria-label="Return address" placeholder="If it ends on a page that does not load: its https://localhost/… address" bind:value={pasted} />
        <button type="submit" disabled={!pasted.trim()}>Finish</button>
      </form>
    {:else}
      <p class="hint"><span class="dot"></span>Atlas finishes by itself when Microsoft sends you back.</p>
      <div class="go"><button onclick={() => step.kind === "waiting" && open(step.url)}>Open the Microsoft page again</button></div>
    {/if}
  {:else if step.kind === "done"}
    <p class="ok">Signed in: {account}'s mail can be read now.</p>
  {:else}
    <p class="err">{step.why}</p>
    <div class="go"><button class="primary" onclick={start}>Try again</button></div>
  {/if}
  <div class="go end"><button class:primary={step.kind === "done"} onclick={onclose}>{step.kind === "done" ? "Done" : "Close"}</button></div>
</div>

<style>
  .si { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; overflow: auto; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--text); }
  p { margin: 0; }
  .hint, small { color: var(--text-muted); font-size: .9em; }
  .ok { color: var(--success, #2a7); }
  .err { color: var(--danger, #c33); overflow-wrap: anywhere; }
  ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .pick { width: 100%; display: flex; flex-direction: column; align-items: flex-start; text-align: left; }
  .code { display: flex; align-items: center; gap: 12px; }
  .code span { font: 600 1.6em var(--font-mono, monospace); letter-spacing: .12em; padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px; user-select: all; }
  .row { display: flex; gap: 8px; }
  input { flex: 1; min-width: 0; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; }
  .go { display: flex; gap: 8px; }
  .go.end { justify-content: flex-end; margin-top: auto; }
  button { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; font: inherit; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text, #fff); }
  button:disabled { opacity: .5; cursor: default; }
  .dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .25; } }
</style>
