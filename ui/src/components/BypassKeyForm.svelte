<script lang="ts">
  // The one form that keeps a gate's bypass key (`PUT /api/signin/bypass`, service_signin.rs): Settings → Sign-ins
  // uses it with the hosts typed, the vault switcher with a server's host filled in. The hosts and the header are
  // checked by the core's rules first (checkBypass), so a refusal is said before anything is sent; the key itself is
  // never shown again after it is kept.
  import { api } from "../lib/api";
  import { checkBypass } from "../lib/service-signin";
  import { errText } from "../lib/text";

  let { hosts = "", header = "X-Api-Key", onkept, oncancel }: {
    /** The hosts it starts with (a server's own host from the vault switcher); still editable, e.g. to `*.domain`. */
    hosts?: string;
    header?: string;
    /** After the key is kept: the hosts it was kept for. */
    onkept?: (hosts: string[]) => void;
    /** Shown as a Cancel button when given (the vault switcher's inline form). */
    oncancel?: () => void;
  } = $props();
  // seeded once from the props; the form owns them from then on
  // svelte-ignore state_referenced_locally
  let hostsText = $state(hosts), headerText = $state(header), value = $state("");
  let msg = $state<{ ok: boolean; text: string } | null>(null);

  async function keep(): Promise<void> {
    const c = checkBypass(hostsText, headerText);
    if (!c.ok) { msg = { ok: false, text: c.why }; return; }
    if (!value.trim()) { msg = { ok: false, text: "Type the key your gate expects." }; return; }
    try {
      await api.setSigninBypass({ hosts: c.hosts, header: c.header }, value);
      msg = { ok: true, text: `Key kept for ${c.hosts.join(", ")}.` };
      value = "";
      onkept?.(c.hosts);
    } catch (e) { msg = { ok: false, text: errText(e) }; }
  }
</script>

<form class="key" data-testid="bypass-key-form" onsubmit={(e) => { e.preventDefault(); void keep(); }}>
  <label class="field"><span>Hosts</span><input placeholder="abs.example.org or *.example.org" bind:value={hostsText} oninput={() => (msg = null)} spellcheck="false" /></label>
  <label class="field"><span>Header</span><input placeholder="X-Api-Key" bind:value={headerText} oninput={() => (msg = null)} spellcheck="false" /></label>
  <label class="field"><span>Key</span><input type="password" autocomplete="off" bind:value={value} /></label>
  <div class="line">
    {#if oncancel}<button class="btn" type="button" onclick={oncancel}>Cancel</button>{/if}
    <button class="btn" type="submit" disabled={!hostsText.trim() || !value}>Keep key</button>
    {#if msg}<span class="msg" class:bad={!msg.ok} role={msg.ok ? "status" : "alert"}>{msg.text}</span>{/if}
  </div>
</form>

<style>
  .key { display: grid; gap: 6px; }
  /* label beside its field, under it when the column is narrow (a phone, a split) */
  .field { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
  .field > span { flex: 0 0 var(--key-label, 6em); color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .field > input { flex: 1 1 16em; }
  input { font: inherit; min-width: 0; min-height: 30px; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 4px 8px; }
  input:focus-visible { outline: none; border-color: var(--accent); }
  input::placeholder { color: var(--text-faint); opacity: .8; }
  :global(html.phone) .key input { min-height: 40px; }
  .line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0 0; }
  .btn { font: inherit; font-size: calc(13px * var(--ui-scale, 1)); border: 1px solid var(--border-strong); color: var(--text); background: transparent; padding: 5px 12px; border-radius: var(--radius-sm); cursor: pointer; }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: .5; cursor: default; }
  .msg { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .bad { color: var(--red); }
</style>
