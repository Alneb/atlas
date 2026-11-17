<script lang="ts">
  // Settings → Sign-ins (docs/design/SERVICE-SIGNIN.md): every way Atlas gets past a sign-in in front of a service, as
  // one page in three sections, most preferred first —
  //  1. gate sessions: a forward-auth gate's (Authelia, Authentik…) cookies kept per host from the sign-in window,
  //     kept alive by the core (service_signin.rs; `GET/DELETE /api/signin/doors`);
  //  2. OpenID: one token per provider shared by the plugins (plugin_oauth.rs; `GET/DELETE /api/signin/tokens`), and the
  //     vault's default provider (`[plugins] oidc_*`, hidden from the generated fields: settings-pages.ts HIDDEN);
  //  3. bypass keys: a gate's shared key sent in a header (`GET/PUT/DELETE /api/signin/bypass`), only to the hosts named,
  //     over https. The form checks the hosts with the core's rules (checkBypass) so a refusal is said before sending.
  // Cookies, tokens and keys stay in the secrets file; nothing here ever shows one.
  import { errText } from "../../lib/text";
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { on } from "../../lib/bus";
  import type { Kept } from "../../lib/gen/Kept";
  import type { OidcSignin } from "../../lib/gen/OidcSignin";
  import type { Bypass } from "../../lib/gen/Bypass";
  import { openServiceSignin } from "../../lib/service-signin";
  import BypassKeyForm from "../BypassKeyForm.svelte";
  import { valueOf } from "../../lib/settings-schema";
  import { settings, updateSettings } from "../../lib/settings.svelte";

  let kept = $state<Kept[]>([]);
  let tokens = $state<OidcSignin[]>([]);
  let keys = $state<Bypass[]>([]);
  let error = $state("");
  const when = (t: number) => new Date(t * 1000).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  /** Ends within two days: said, so it can be renewed before a plugin meets the gate again. */
  const soon = (t?: number | null) => !!t && t * 1000 - Date.now() < 2 * 86_400_000;
  const users = (ps: string[], none: string) => (ps.length ? `Used by ${ps.join(", ")}` : none);
  const ruleId = (b: Bypass) => `${b.header}\u0000${b.hosts.join(",")}`;

  async function load(): Promise<void> {
    try { [kept, tokens, keys] = await Promise.all([api.serviceSignins(), api.oidcSignins(), api.signinBypasses()]); error = ""; } catch (e) { error = errText(e); }
  }
  /** One forget path for the three kinds: the call, then the lists again; a failure is shown, never swallowed. */
  async function forget(run: () => Promise<unknown>): Promise<void> {
    try { await run(); await load(); } catch (e) { error = errText(e); }
  }
  onMount(() => { void load(); return on("signedin", () => void load()); });

  // ── gate: sign in ahead of any plugin, at a service's address behind the gate (its portal answers, the window keeps the session)
  let address = $state("");
  function signInAt(): void {
    const a = address.trim();
    if (!a) return;
    openServiceSignin(/^https?:\/\//i.test(a) ? a : `https://${a}`);
    address = "";
  }

  // ── OpenID: the vault's provider, edited as one small form (three fields that only mean something together)
  const OIDC = { issuer: "plugins.oidc_issuer", client: "plugins.oidc_client_id", redirect: "plugins.oidc_redirect" } as const;
  const str = (path: string) => { void settings.config; const v = valueOf(path); return typeof v === "string" ? v : ""; };
  let issuer = $state(""), client = $state(""), redirect = $state("");
  let providerMsg = $state("");
  // the form follows the settings file until it is edited here
  $effect(() => { issuer = str(OIDC.issuer); client = str(OIDC.client); redirect = str(OIDC.redirect); });
  const providerChanged = $derived(issuer.trim() !== str(OIDC.issuer) || client.trim() !== str(OIDC.client) || redirect.trim() !== str(OIDC.redirect));
  async function saveProvider(): Promise<void> {
    // one write for the three: they only mean something together (and the form's effect must not refill it halfway)
    const [i, c, r] = [issuer.trim(), client.trim(), redirect.trim()];
    try {
      await updateSettings((cfg) => { cfg.plugins.oidc_issuer = i; cfg.plugins.oidc_client_id = c; cfg.plugins.oidc_redirect = r; });
      providerMsg = "Saved: plugins that name no provider of their own use this one.";
    } catch (e) { providerMsg = errText(e); }
  }

  // ── bypass keys: the form is BypassKeyForm (the vault switcher keeps a server's key with it too)
  let confirming = $state("");
</script>

<div class="signins" data-testid="signins-panel">
  <p class="which"><b>Which one do I need?</b> A service shows a login page in front of it → <b>sign in through the gate</b>. A plugin asks for a token → <b>OpenID</b>. Something that cannot sign in at all, such as a scheduled sync → <b>a key</b>, as a last resort.</p>
  {#if error}<p class="bad" role="alert">{error}</p>{/if}

  <section class="settings-panel" aria-labelledby="signins-gate">
    <h3 id="signins-gate">Signed in through a gate</h3>
    <p class="desc">A gate (Authelia, Authentik, oauth2-proxy…) puts one login page in front of your services. Sign in once in Atlas's window — tick “Remember me” — and every plugin that names the service gets through; Atlas keeps the session alive for as long as the gate allows.</p>
    {#if kept.length}
      <ul class="items" aria-label="Gate sessions">
        {#each kept as k (k.host)}
          <li>
            <div class="what"><span class="host">{k.host}</span>
              {#if k.ended}<span class="meta"><span class="chip bad">ended</span> The gate stopped taking it: the next request asks you to sign in again.</span>
              {:else}<span class="meta">Since {when(k.at)}{k.renewed ? ` · kept alive ${when(k.renewed)}` : ""}{#if k.expires} · <span class:bad={soon(k.expires)}>until {when(k.expires)}</span>{/if}</span>{/if}
              <span class="meta">{users(k.plugins, "No plugin names this host yet")}</span>
            </div>
            <button class="btn" onclick={() => void forget(() => api.forgetServiceSignin(k.host))} aria-label="Forget the session for {k.host}">Forget</button>
          </li>
        {/each}
      </ul>
    {:else if !error}<p class="empty">No gate session yet. When a plugin first meets a gate, Atlas offers the sign-in and the session appears here. You can also sign in ahead, below.</p>{/if}
    <form class="line" onsubmit={(e) => { e.preventDefault(); signInAt(); }}>
      <input placeholder="links.example.org" bind:value={address} aria-label="Sign in at a service's address" />
      <button class="btn" type="submit" disabled={!address.trim()}>Sign in</button>
    </form>
    <p class="hint">The address of any service behind the gate; one session opens every service behind the same gate.</p>
  </section>

  <section class="settings-panel" aria-labelledby="signins-oidc">
    <h3 id="signins-oidc">Signed in with OpenID</h3>
    <p class="desc">Some services take a token from your OpenID provider (Authelia can be one) instead of a login page. Atlas signs in once per provider and shares the token with every plugin that asks; it renews the token by itself.</p>
    {#if tokens.length}
      <ul class="items" aria-label="OpenID providers">
        {#each tokens as t (t.key)}
          <li>
            <div class="what"><span class="host">{t.issuer || "a provider"}</span>
              <span class="meta">{t.renews ? "Renews itself" : "Ends without renewal"}{t.renewed ? ` · last renewed ${when(t.renewed)}` : ""}</span>
              <span class="meta">{users(t.plugins, "No plugin uses it now")}</span>
            </div>
            <button class="btn" onclick={() => void forget(() => api.forgetOidcSignin(t.key))} aria-label="Forget the sign-in with {t.issuer}">Forget</button>
          </li>
        {/each}
      </ul>
    {:else if !error}<p class="empty">No OpenID sign-in yet. The first plugin that asks for a token opens your provider's sign-in once; the provider then appears here.</p>{/if}
    <form class="provider" onsubmit={(e) => { e.preventDefault(); void saveProvider(); }}>
      <h4>Your provider, for every plugin</h4>
      <p class="hint">Register one client for Atlas at your provider, once: public (no secret), with PKCE, and the return address below. Plugins that name no provider of their own then sign in with it. The greyed examples fit an Authelia at auth.example.org.</p>
      <label class="field"><span>Your provider's address</span><input placeholder="https://auth.example.org" bind:value={issuer} /></label>
      <label class="field"><span>The client registered for Atlas</span><input placeholder="atlas-plugins" bind:value={client} /></label>
      <label class="field"><span>Its return address (where the provider sends you back)</span><input placeholder="https://localhost/atlas" bind:value={redirect} /></label>
      <div class="line"><button class="btn" type="submit" disabled={!providerChanged}>Save provider</button>{#if providerMsg}<span class="msg" role="status">{providerMsg}</span>{/if}</div>
    </form>
  </section>

  <section class="settings-panel" aria-labelledby="signins-key">
    <h3 id="signins-key">Keys that skip the sign-in</h3>
    <p class="desc">A gate may let a request through when it carries a shared key in a header. Use one only for what cannot sign in — a scheduled sync, a native client: the key opens every host behind the gate, says nothing of who you are and skips your second factor. Prefer a gate session or OpenID.</p>
    {#if keys.length}
      <ul class="items" aria-label="Bypass keys">
        {#each keys as b (ruleId(b))}
          <li>
            <div class="what"><span class="host">{b.hosts.join(", ")}</span>
              <span class="meta">In the header <code>{b.header}</code> · key kept</span>
            </div>
            {#if confirming === ruleId(b)}
              <span class="ask">Forget? The key is not shown again.</span>
              <button class="btn" onclick={() => (confirming = "")}>Cancel</button>
              <button class="btn danger" onclick={() => { confirming = ""; void forget(() => api.forgetSigninBypass(b)); }}>Forget key</button>
            {:else}
              <button class="btn" onclick={() => (confirming = ruleId(b))} aria-label="Forget the key for {b.hosts.join(', ')}">Forget</button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else if !error}<p class="empty">No key. Add one only when your gate has a bypass set up for it; it is listed here, never its value.</p>{/if}
    <ul class="rules" aria-label="How a key is sent">
      <li>Only to the hosts listed: an exact host (<code>abs.example.org</code>) or <code>*.example.org</code> for its subdomains — never a whole domain ending like <code>*.org</code> or <code>*</code>.</li>
      <li>Only over https, and never along a redirect to another host.</li>
      <li>Kept outside the vault; after saving only “key kept” is shown.</li>
    </ul>
    <div class="keyform"><BypassKeyForm onkept={() => void load()} /></div>
  </section>
</div>

<style>
  .signins { display: flex; flex-direction: column; gap: 14px; }
  .which { margin: 0; padding: 10px 14px; border-radius: var(--radius); background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.5; max-width: 85ch; }
  .which b { color: var(--text); font-weight: 600; }
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  h4 { margin: 0; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); }
  .desc, .hint, .empty { margin: 0 0 8px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.45; max-width: 85ch; }
  .empty { color: var(--text-muted); padding: 10px 0; border-top: 1px solid var(--border); }
  .hint { margin: 4px 0 8px; }
  /* one kept item: what it is on the left, its action on the right; tall enough for a finger on the phone */
  .items { list-style: none; margin: 4px 0 8px; padding: 0; }
  .items > li { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; min-height: 48px; padding: 6px 0; border-top: 1px solid var(--border); }
  .what { flex: 1; min-width: min(100%, 14em); display: flex; flex-direction: column; gap: 1px; }
  .host { font-weight: 600; overflow-wrap: anywhere; }
  .meta { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); font-variant-numeric: tabular-nums; }
  .chip { display: inline-block; padding: 0 6px; margin-right: 4px; border-radius: 99px; border: 1px solid currentColor; font-size: .9em; }
  .ask { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .btn { border: 1px solid var(--border-strong); color: var(--text); background: transparent; }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn.danger { color: var(--red); border-color: currentColor; }
  .line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0 0; }
  .line input { flex: 1; min-width: 0; }
  .keyform { --key-label: 14em; padding-top: 10px; margin-top: 4px; border-top: 1px solid var(--border); }
  .provider { display: grid; gap: 6px; padding-top: 10px; margin-top: 4px; border-top: 1px solid var(--border); }
  /* label beside its field, under it when the column is narrow (a phone, a split) */
  .field { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
  .field > span { flex: 0 0 14em; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .field > input { flex: 1 1 16em; }
  input { font: inherit; min-width: 0; min-height: 30px; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 4px 8px; }
  input:focus-visible { outline: none; border-color: var(--accent); }
  input::placeholder { color: var(--text-faint); opacity: .8; }
  :global(html.phone) .signins input { min-height: 40px; }
  .msg { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .bad { color: var(--red); }
  .rules { margin: 4px 0 8px; padding-left: 18px; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); line-height: 1.45; max-width: 85ch; }
  code { font-family: var(--font-mono); font-size: .92em; overflow-wrap: anywhere; }
</style>
