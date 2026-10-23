<script lang="ts">
  // Settings → Plugins: the sign-ins to services Atlas keeps for its plugins (docs/design/SERVICE-SIGNIN.md) — which sites,
  // since when, and a way to forget one. The cookies themselves stay in the secrets file, never shown.
  import { errText } from "../../lib/text";
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { on } from "../../lib/bus";
  import type { Kept } from "../../lib/gen/Kept";

  let kept = $state<Kept[]>([]);
  let error = $state("");
  const when = (t: number) => new Date(t * 1000).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  async function load(): Promise<void> {
    try { kept = await api.serviceSignins(); error = ""; } catch (e) { error = errText(e); }
  }
  async function forget(host: string): Promise<void> {
    try { await api.forgetServiceSignin(host); await load(); } catch (e) { error = errText(e); }
  }
  onMount(() => { void load(); return on("signedin", () => void load()); });
</script>

<section class="settings-panel signins" data-testid="signins-panel">
  <h3>Sign-ins for plugins</h3>
  <p class="desc">When a plugin reaches a service with a sign-in in front of it (Authelia, Authentik, oauth2-proxy…), Atlas asks you to sign in once, in a window of its own, and sends that sign-in with the plugins' later requests to the site. Only plugins that list the site in their <code>net</code> permission get it.</p>
  {#if error}<p class="bad">{error}</p>{/if}
  {#if kept.length}
    <ul>
      {#each kept as k (k.host)}
        <li><span class="host">{k.host}</span> <span class="muted">since {when(k.at)}</span> <button class="btn" onclick={() => void forget(k.host)}>Forget</button></li>
      {/each}
    </ul>
  {:else if !error}<p class="muted">None yet.</p>{/if}
</section>

<style>
  ul { list-style: none; margin: 6px 0; padding: 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--border); }
  li:last-child { border-bottom: 0; }
  .host { font-weight: 600; }
  li .btn { margin-left: auto; }
  .desc, .muted { margin: 0 0 8px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.45; }
  li .muted { margin: 0; }
  .bad { color: var(--red); }
</style>
