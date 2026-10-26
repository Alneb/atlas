<script lang="ts">
  // Settings → Server (docs/guides/SERVER.md): how a served Atlas lets people in. On a serving Atlas it changes the running
  // server (the password and tokens at once, the options when it starts again); on the desktop it prepares the files
  // `atlas serve --listen` starts from. Nothing here lives in the vault.
  import { errText, errReason } from "../../lib/text";
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import type { AuthMode, Me, ServerState } from "../../lib/types";

  let st = $state<ServerState | null>(null);
  let me = $state<Me | null>(null);
  let error = $state("");
  // the options' form
  let mode = $state<AuthMode>("password");
  let proxies = $state("");
  let header = $state("Remote-User");
  let plain = $state(false);
  let mcp = $state(false);
  let optsMsg = $state("");
  // password
  let current = $state(""), next = $state(""), again = $state(""), pwMsg = $state<{ ok: boolean; text: string } | null>(null);
  // tokens
  let tokName = $state(""), tokScope = $state<"capture" | "full">("capture"), shown = $state<{ name: string; token: string } | null>(null), tokMsg = $state("");

  async function load(): Promise<void> {
    try {
      [st, me] = await Promise.all([api.server(), api.me()]);
      mode = st.options.auth; proxies = st.options.trustedProxies.join(", "); header = st.options.remoteUserHeader; plain = st.options.allowPlainHttp; mcp = st.options.mcp;
      error = "";
    } catch (e) { error = errText(e); }
  }
  onMount(() => void load());

  const why = errReason;
  const when = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "never");

  async function saveOptions(): Promise<void> {
    try {
      await api.serverOptions({ auth: mode, trustedProxies: proxies.split(/[\s,]+/).filter(Boolean), remoteUserHeader: header, allowPlainHttp: plain, mcp });
      optsMsg = st?.serving ? "Saved. The server uses them once it starts again." : "Saved: used by `atlas serve --listen`.";
      await load();
    } catch (e) { optsMsg = why(e); }
  }
  async function setPassword(): Promise<void> {
    if (next !== again) { pwMsg = { ok: false, text: "The two new passwords differ." }; return; }
    try {
      await api.serverPassword(st?.hasPassword ? current : null, next);
      pwMsg = { ok: true, text: st?.hasPassword ? "Password changed." : "Password set." };
      current = next = again = "";
      await load();
    } catch (e) { pwMsg = { ok: false, text: why(e) }; }
  }
  async function makeToken(): Promise<void> {
    try {
      const { token } = await api.serverToken(tokName, tokScope);
      shown = { name: tokName.trim(), token }; tokName = ""; tokMsg = "";
      await load();
    } catch (e) { tokMsg = why(e); }
  }
  async function revoke(name: string): Promise<void> {
    try { await api.serverRevoke(name); if (shown?.name === name) shown = null; await load(); } catch (e) { tokMsg = why(e); }
  }
  async function signOutAll(): Promise<void> {
    try { const { ended } = await api.serverSignOutAll(); tokMsg = `${ended} browser${ended === 1 ? "" : "s"} signed out.`; await load(); } catch (e) { tokMsg = why(e); }
  }
</script>

<section class="settings-panel server" data-testid="server-panel">
  {#if error}<p class="bad">{error}</p>{/if}
  {#if st}
    <h3>This Atlas</h3>
    {#if st.serving}
      <p class="desc">Serving this vault to the network on port {st.port}. You are signed in {me?.via === "proxy" ? `by your proxy as ${me.user}` : me?.via === "token" ? `with the token “${me.device}”` : "with the password"}.</p>
      {#if me?.signOut}<button class="btn" onclick={() => void api.signOut().then(() => location.assign("/login"))}>Sign out of this browser</button>{/if}
    {:else}
      <p class="desc">Not serving to the network (the desktop listens on this machine only, with no sign-in). To serve a vault from a server: <code>atlas serve --listen 0.0.0.0:7700</code>. What you set below is what it starts with; it is kept in <code>{st.files.settings}</code>, never in the vault.</p>
    {/if}
    {#if st.notReady}<p class="warn">Not ready to serve: {st.notReady}.</p>{/if}

    <h3>How people sign in</h3>
    <div class="modes" role="radiogroup" aria-label="Sign-in">
      {#each [["password", "Password", "Atlas's own sign-in page, with the password below."], ["proxy", "Your proxy (Authelia)", "Only a request from a trusted proxy that names the user (forward-auth). Security keys come from the proxy."], ["both", "Both", "The proxy's word when there is one, the sign-in page otherwise."]] as [id, label, what] (id)}
        <label class="mode"><input type="radio" name="auth" value={id} bind:group={mode} /><span><strong>{label}</strong><span class="muted">{what}</span></span></label>
      {/each}
    </div>
    {#if mode !== "password"}
      <label class="row"><span>Trusted proxies</span><input placeholder="10.0.0.2, 10.88.0.0/16, or *" bind:value={proxies} aria-label="Trusted proxies" /></label>
      <label class="row"><span>User header</span><input bind:value={header} aria-label="User header" /></label>
    {/if}
    <label class="check"><input type="checkbox" bind:checked={plain} /> Allow the password over plain HTTP from other machines <span class="muted">(only on a network you trust: a LAN or VPN)</span></label>
    <label class="check"><input type="checkbox" bind:checked={mcp} /> Let AI agents in (<code>atlas mcp</code>) <span class="muted">(off on a server by default; the desktop is not affected)</span></label>
    <div class="actions"><button class="btn primary" onclick={() => void saveOptions()}>Save sign-in options</button><span class="msg">{optsMsg}</span></div>
    <p class="muted">Terminals, plugin helpers and code blocks work in a signed-in browser as on the desktop, so the sign-in is what stands between the internet and this machine: beyond your own network, put Authelia (with a security key) in front.</p>

    {#if mode !== "proxy"}
      <h3>Password</h3>
      {#if st.hasPassword}<input type="password" autocomplete="current-password" placeholder="Current password" aria-label="Current password" bind:value={current} />{/if}
      <input type="password" autocomplete="new-password" placeholder="New password (10 characters or more)" aria-label="New password" bind:value={next} />
      <input type="password" autocomplete="new-password" placeholder="The new password again" aria-label="New password again" bind:value={again} />
      <div class="actions"><button class="btn primary" disabled={!next} onclick={() => void setPassword()}>{st.hasPassword ? "Change password" : "Set password"}</button>
        {#if pwMsg}<span class="msg" class:bad={!pwMsg.ok}>{pwMsg.text}</span>{/if}</div>
    {/if}

    <h3>Devices</h3>
    <p class="desc">A token lets an app in without the password — the phone's capture app, a script. <em>Capture</em> may only add captures (and read the names its completions need); <em>Full</em> may do everything.</p>
    {#each st.tokens as t (t.name)}
      <div class="token"><strong>{t.name}</strong><span class="tag">{t.scope}</span><span class="muted">made {when(t.created)} · last used {when(t.lastUsed)}</span><button class="btn danger-text" onclick={() => void revoke(t.name)}>Revoke</button></div>
    {:else}<p class="muted">No device tokens.</p>{/each}
    {#if shown}
      <div class="shown" role="status"><span>Token for <strong>{shown.name}</strong> — copy it now, it is not shown again:</span><code>{shown.token}</code>
        <button class="btn" onclick={() => void navigator.clipboard?.writeText(shown!.token)}>Copy</button></div>
    {/if}
    <div class="actions"><input placeholder="Device name (phone)" aria-label="Device name" bind:value={tokName} />
      <select bind:value={tokScope} aria-label="What it may do"><option value="capture">Capture</option><option value="full">Full</option></select>
      <button class="btn" disabled={!tokName.trim()} onclick={() => void makeToken()}>Make a token</button></div>

    <h3>Browsers</h3>
    <div class="actions"><span>{st.sessions} signed in with the password.</span><button class="btn" disabled={!st.sessions} onclick={() => void signOutAll()}>Sign out everywhere</button><span class="msg">{tokMsg}</span></div>
  {/if}
</section>

<style>
  h3 { margin: 16px 0 4px; } /* its look: SettingsPage */
  .desc, .muted { margin: 0 0 8px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.45; }
  .muted { display: block; }
  .bad { color: var(--red); } .warn { color: var(--orange, var(--red)); margin: 4px 0 8px; }
  code { font-family: var(--font-mono); font-size: .92em; overflow-wrap: anywhere; }
  .modes { display: grid; gap: 6px; margin-bottom: 8px; }
  .mode { display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }
  .mode:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .mode > span { display: grid; gap: 1px; } .mode .muted { margin: 0; }
  .row { display: grid; grid-template-columns: 9em 1fr; gap: 8px; align-items: center; margin: 4px 0; }
  .check { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; margin: 6px 0; }
  .check .muted { display: inline; margin: 0; }
  input:not([type]), input[type="password"], select { font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 8px; min-width: 0; }
  input[type="password"] { display: block; width: min(100%, 26em); margin: 4px 0; }
  .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
  .msg { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); } .msg.bad { color: var(--red); }
  .btn { font: inherit; display: inline-flex; align-items: center; min-height: 26px; padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--text); background: transparent; cursor: pointer; }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn.danger-text { color: var(--red); margin-left: auto; }
  .token { display: flex; gap: 10px; align-items: center; padding: 5px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
  .token .muted { display: inline; margin: 0; }
  .tag { font-size: .85em; padding: 0 6px; border-radius: 99px; background: var(--bg-hover); color: var(--text-muted); }
  .shown { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px; margin: 6px 0; border: 1px solid var(--accent); border-radius: var(--radius-sm); background: var(--accent-soft); }
  .shown code { user-select: all; }
</style>
