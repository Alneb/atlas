<script lang="ts">
  // Settings → Desktop app: the desktop's global key for Atlas Capture (platform/capture_key.rs). KDE and GNOME keep it
  // in their own shortcut settings, which this reads and writes; Windows' installer and macOS's app set theirs, shown.
  import { api } from "../../lib/api";
  import { errText } from "../../lib/text";
  import type { CaptureKey } from "../../lib/gen/CaptureKey";

  const DEFAULT = "Meta+Shift+C";
  /** KDE spells the logo key Meta; Atlas's keys say Super. */
  const shown = (k: string) => k.replace(/\bMeta\b/g, "Super");
  const stored = (k: string) => k.trim().replace(/\s*\+\s*/g, "+").replace(/\bSuper\b/gi, "Meta").replace(/\bControl\b/gi, "Ctrl").replace(/\b(meta|ctrl|alt|shift)\b/g, (m) => m[0].toUpperCase() + m.slice(1)).replace(/\+([a-z0-9])$/i, (_, c: string) => "+" + c.toUpperCase());

  let now = $state<CaptureKey | null>(null);
  let failed = $state("");
  let typed = $state(shown(DEFAULT));
  let busy = $state(false);
  api.captureKey().then((k) => { now = k; if (k.key) typed = shown(k.key); }, (e) => { failed = errText(e); });

  async function bind() {
    busy = true;
    failed = "";
    try { now = await api.setCaptureKey(stored(typed)); } catch (e) { failed = errText(e); }
    busy = false;
  }
</script>

<section class="settings-panel capture-key">
  <h3>Capture key</h3>
  <p class="desc">One key, anywhere on the desktop, opens the capture box: a thought, a task or a link into today's log without switching to Atlas.</p>
  {#if now}
    <div class="row">
      <span class="label">Now</span>
      {#if now.key}<kbd>{shown(now.key)}</kbd>{:else}<span class="none">no key</span>{/if}
    </div>
    <p class="desc">{now.note}</p>
    {#if now.can_set}
      <form class="row" onsubmit={(e) => { e.preventDefault(); void bind(); }}>
        <input aria-label="Capture key" bind:value={typed} spellcheck="false" />
        <button class="btn btn-ghost" disabled={busy}>{busy ? "Setting…" : now.key ? "Change" : "Set"}</button>
      </form>
    {/if}
  {:else if !failed}<p class="desc">Reading the desktop's shortcuts…</p>{/if}
  {#if failed}<p class="err">{failed}</p>{/if}
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .desc { margin: 0 0 6px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .row { display: flex; gap: 10px; align-items: center; padding: 4px 0; }
  .label { color: var(--text-muted); min-width: 40px; }
  .none { color: var(--text-faint); }
  kbd { font-family: var(--font-mono); font-size: .9em; padding: 1px 7px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg-alt); }
  input { font: inherit; font-family: var(--font-mono); width: 16em; padding: 3px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); }
  .err { margin: 4px 0 0; color: var(--red); font-size: calc(12.5px * var(--ui-scale, 1)); }
</style>
