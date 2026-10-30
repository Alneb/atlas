<script lang="ts">
  // Settings → AI agents (crates/atlas-core/src/agents.rs, DESIGN-local-lock.md step 3): each agent `atlas mcp` serves
  // gets a named token of its own, shown once in the MCP server entry any client reads; revoking one shuts out that
  // agent alone, at its next request. Per machine, kept outside the vault. Generic: how one agent registers it (its
  // own command) is that agent's plugin's (REFACTOR-agents-as-plugins.md).
  import { errReason } from "../../lib/text";
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import type { AgentsState } from "../../lib/types";

  let st = $state<AgentsState | null>(null);
  let error = $state("");
  let name = $state("");
  let shown = $state<{ name: string; token: string; entry: string } | null>(null);
  let msg = $state("");

  const why = errReason;
  const when = (t: number | null) => (t ? new Date(t * 1000).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

  async function load(): Promise<void> {
    try { st = await api.agents(); error = ""; } catch (e) { error = why(e); }
  }
  onMount(() => void load());

  async function allow(): Promise<void> {
    try {
      const made = await api.allowAgent(name);
      shown = { name: name.trim(), token: made.token, entry: JSON.stringify(made.mcp, null, 2) }; name = ""; msg = "";
      await load();
    } catch (e) { msg = why(e); }
  }
  async function revoke(n: string): Promise<void> {
    try { await api.revokeAgent(n); if (shown?.name === n) shown = null; msg = `“${n}” revoked: it is turned away from its next request.`; await load(); } catch (e) { msg = why(e); }
  }
  async function terminals(on: boolean): Promise<void> {
    try { await api.agentTerminals(on); msg = on ? "Agent terminals get a token again from the next one started." : "Agent terminals are kept out; running ones lose their token now."; await load(); } catch (e) { msg = why(e); }
  }
  const copy = (t: string) => void navigator.clipboard?.writeText(t);
</script>

<section class="settings-panel agents" data-testid="agents-panel">
  {#if error}<p class="bad">{error}</p>{/if}
  {#if st}
    <h3>Allowed agents</h3>
    {#if !st.locked}
      <p class="warn">This Atlas is not locked: any program on this machine gets in, with or without a token. The tokens below take effect once it is (<code>ATLAS_LOCAL_LOCK=1</code>); make them now and the agents keep working then.</p>
    {/if}
    <label class="check"><input type="checkbox" checked={st.terminals} onchange={(e) => void terminals(e.currentTarget.checked)} /> Agent terminals Atlas starts get a token <span class="muted">(shared by every such tab, as “{st.terminalAgent}”: <code>atlas mcp</code> inherits it, so a vault's synced <code>.mcp.json</code> never holds one; a revoke gives the next tab a new token)</span></label>
    {#each st.agents as a (a.name)}
      <div class="agent"><strong>{a.name}</strong>{#if a.name === st.terminalAgent}<span class="tag">Atlas terminals</span>{/if}<span class="muted">allowed {when(a.created)} · last used {when(a.lastUsed)}</span><button class="btn danger-text" onclick={() => void revoke(a.name)}>Revoke</button></div>
    {:else}<p class="muted">No agent allowed yet. On a locked Atlas, <code>atlas mcp</code> without a token of its own is turned away.</p>{/each}

    {#if shown}
      <div class="shown" role="status">
        <span>Token for <strong>{shown.name}</strong> — copy it now, it is not shown again. Add this MCP server to the agent's MCP config:</span>
        <pre><code>{shown.entry}</code></pre>
        <div class="actions"><button class="btn primary" onclick={() => copy(shown!.entry)}>Copy the MCP entry</button><button class="btn" onclick={() => copy(shown!.token)}>Copy the token only</button></div>
        <span class="muted">That is <code>atlas mcp</code> with <code>ATLAS_AGENT_TOKEN</code> set to the token; an agent's plugin says how that agent takes it in.</span>
      </div>
    {/if}
    <div class="actions"><input placeholder="e.g. Claude on the laptop" title="Name it after the agent and the machine it is for" aria-label="Agent name" bind:value={name} onkeydown={(e) => e.key === "Enter" && name.trim() && void allow()} />
      <button class="btn" disabled={!name.trim()} onclick={() => void allow()}>Allow an agent</button><span class="msg">{msg}</span></div>
    <p class="muted">An agent may do what you can through Atlas, but never allow or revoke agents. Kept in <code>{st.file}</code> (hashes only), for every vault on this machine.</p>
  {/if}
</section>

<style>
  h3 { margin: 16px 0 4px; } /* its look: SettingsPage */
  .muted { display: block; margin: 0 0 8px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.45; }
  .bad { color: var(--red); } .warn { color: var(--orange, var(--red)); margin: 4px 0 8px; font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.45; }
  code { font-family: var(--font-mono); font-size: .92em; overflow-wrap: anywhere; }
  input { font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 8px; min-width: 0; }
  .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
  .msg { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .btn { font: inherit; display: inline-flex; align-items: center; min-height: 26px; padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--text); background: transparent; cursor: pointer; }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn.danger-text { color: var(--red); margin-left: auto; }
  .check { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; margin: 6px 0 10px; }
  .check .muted { display: inline; margin: 0; }
  .tag { font-size: .85em; padding: 0 6px; border-radius: 99px; background: var(--bg-hover); color: var(--text-muted); }
  .agent { display: flex; gap: 10px; align-items: center; padding: 5px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
  .agent .muted { display: inline; margin: 0; }
  .shown { display: grid; gap: 6px; padding: 8px; margin: 6px 0; border: 1px solid var(--accent); border-radius: var(--radius-sm); background: var(--accent-soft); }
  .shown code { user-select: all; } .shown pre { margin: 0; padding: 6px 8px; background: var(--bg-elev); border-radius: var(--radius-sm); overflow-x: auto; } .shown .actions { margin: 0; } .shown .muted { margin: 0; }
</style>
