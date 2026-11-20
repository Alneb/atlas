<script lang="ts">
  // Settings → Sign-ins (docs/design/SERVICE-SIGNIN.md): first "Your services" — each plugin's server with its login
  // page session and its own login, a button for what is missing, nothing to type — then the sessions kept; the
  // OpenID provider and the bypass keys folded under Advanced (most people never need them). Underneath, three ways —
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
  import { allCommands } from "../../lib/keymap.svelte";
  import { openSettingsAt, pluginPageId } from "../../lib/settings-nav.svelte";
  import type { Plugin } from "../../lib/gen/Plugin";

  let kept = $state<Kept[]>([]);
  let tokens = $state<OidcSignin[]>([]);
  let keys = $state<Bypass[]>([]);
  let error = $state("");
  const when = (t: number) => new Date(t * 1000).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  /** Ends within two days: said, so it can be renewed before a plugin meets the gate again. */
  const soon = (t?: number | null) => !!t && t * 1000 - Date.now() < 2 * 86_400_000;
  const users = (ps: string[], none: string) => (ps.length ? `Used by ${ps.join(", ")}` : none);
  const ruleId = (b: Bypass) => `${b.header}\u0000${b.hosts.join(",")}`;

  // ── your services: every plugin's server (an http(s) address among its settings), with the two things a service
  // behind a gate may need — the gate's session (Authelia's cookies, kept by the sign-in window) and the service's
  // own login (its token, a secret of the plugin, which its sign-in command gets through the same Authelia)
  type Service = { plugin: Plugin; url: string; host: string; secrets: string[]; has: string[] };
  let services = $state<Service[]>([]);
  async function loadServices(): Promise<void> {
    const ps = (await api.plugins()).filter((p) => !p.blocked);
    const found: Service[] = [];
    for (const p of ps) {
      const urls = Object.values(p.settings ?? {}).filter((v): v is string => typeof v === "string" && /^https?:\/\/[^\s/]+/i.test(v.trim()));
      if (!urls.length) continue;
      const url = urls[0].trim(), secrets = p.fields.filter((f) => f.kind === "secret" && !f.hidden).map((f) => f.key);
      const has = secrets.length ? await api.pluginSecretNames(p.id).catch(() => []) : [];
      found.push({ plugin: p, url, host: new URL(url).host, secrets, has });
    }
    services = found.sort((a, b) => a.plugin.title.localeCompare(b.plugin.title));
  }
  /** The kept session that reaches `host`: the plugin is among its users, or its cookies' host covers the address. */
  const gateOf = (sv: Service): Kept | undefined => kept.find((k) => !k.ended && (k.plugins.includes(sv.plugin.id) || sv.host === k.host || sv.host.endsWith(`.${k.host.replace(/^[^.]+\./, "")}`)));
  /** The plugin's own sign-in command (`<plugin>.signin`, `….sign-in`, `….login`), when it has one. */
  const signinCommand = (sv: Service) => allCommands().find((c) => c.id.startsWith(`${sv.plugin.id}.`) && /\.(sign-?in|log-?in)$/i.test(c.id));
  const ownLogin = (sv: Service) => sv.secrets.length > 0 && sv.secrets.some((k) => sv.has.includes(k));
  async function runSignin(sv: Service): Promise<void> {
    const c = signinCommand(sv);
    if (c) { await c.run(); await load(); } else openSettingsAt(pluginPageId(sv.plugin.id));
  }

  async function load(): Promise<void> {
    try { [kept, tokens, keys] = await Promise.all([api.serviceSignins(), api.oidcSignins(), api.signinBypasses()]); await loadServices(); error = ""; } catch (e) { error = errText(e); }
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
  {#if error}<p class="bad" role="alert">{error}</p>{/if}

  <section class="settings-panel" aria-labelledby="signins-services">
    <h3 id="signins-services">Your services</h3>
    <p class="desc">Atlas signs in the way a browser does: your login page (Authelia…) in a window, its cookies kept and renewed. A service behind it may also want its own login — the same page again, its token kept.</p>
    {#if services.length}
      <ul class="items" aria-label="Services">
        {#each services as sv (sv.plugin.id)}
          {@const gate = gateOf(sv)}
          {@const cmd = signinCommand(sv)}
          <li data-service={sv.plugin.id}>
            <div class="what"><span class="host">{sv.plugin.title}</span><span class="meta">{sv.host}</span>
              <span class="meta">{#if gate}<span class="chip ok">signed in</span> through {gate.host}{:else}<span class="chip">no login page session</span> fine at home if your network skips it{/if}</span>
              {#if sv.secrets.length || cmd}<span class="meta">Its own login: {#if ownLogin(sv)}<span class="chip ok">done</span>{:else}<span class="chip bad">not yet</span>{/if}</span>{/if}
            </div>
            <div class="acts">
              {#if !gate}<button class="btn" onclick={() => openServiceSignin(sv.url)}>Sign in</button>{/if}
              {#if (sv.secrets.length || cmd) && !ownLogin(sv)}<button class="btn primary" onclick={() => void runSignin(sv)}>{cmd ? `Sign in to ${sv.plugin.title}` : "Open its settings"}</button>{/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else if !error}<p class="empty">No plugin points at a server yet.</p>{/if}
  </section>

  <section class="settings-panel" aria-labelledby="signins-gate">
    <h3 id="signins-gate">Login sessions kept</h3>
    <p class="desc">One per login page (Authelia, Authentik…): it opens every service behind that page.</p>
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
    {:else if !error}<p class="empty">None yet: “Sign in” on a service above opens its login page once.</p>{/if}
    <details class="more">
      <summary>Sign in at another address</summary>
      <form class="line" onsubmit={(e) => { e.preventDefault(); signInAt(); }}>
        <input placeholder="a service's address" bind:value={address} aria-label="Sign in at a service's address" />
        <button class="btn" type="submit" disabled={!address.trim()}>Sign in</button>
      </form>
      <p class="hint">Any service behind your login page (not the login page itself): Atlas opens it, follows it to the login, and keeps the session for every service behind it.</p>
    </details>
  </section>

  <details class="advanced">
  <summary>Advanced: an OpenID provider for plugins, keys that skip the login</summary>

  <section class="settings-panel" aria-labelledby="signins-oidc">
    <h3 id="signins-oidc">An OpenID provider for plugins</h3>
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
    <h3 id="signins-key">Keys that skip the login</h3>
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
  </details>
</div>

<style>
  .advanced, .more { margin-top: 10px; }
  .advanced > summary, .more > summary { cursor: pointer; color: var(--text-muted); padding: 6px 0; }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .chip.ok { color: var(--green, #2e7d32); }
  .signins { display: flex; flex-direction: column; gap: 14px; }
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
