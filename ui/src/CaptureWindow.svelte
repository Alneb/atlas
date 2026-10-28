<script lang="ts">
  // The quick-capture window (docs/guides/CAPTURE.md): the app's page reduced to one box, opened by a
  // global shortcut (`atlas-app --capture`, a small frameless window) or in a browser at `/#capture`.
  // Type, Enter: written to today's log (or as a note, as that vault's settings say), and the
  // window is gone. Esc: gone, nothing written. No tabs, no dock: nothing of the app is mounted.
  import { errText } from "./lib/text";
  import { shownPath } from "./lib/paths";
  import { onMount } from "svelte";
  import { api } from "./lib/api";
  import { captureHint } from "./lib/capture-hints.svelte";
  import { complete } from "./lib/textarea-complete";
  import { paintTheme } from "./lib/state.svelte";
  import type { VaultList } from "./lib/gen/VaultList";

  let text = $state("");
  let box = $state<HTMLTextAreaElement>();
  let vaults = $state<VaultList | null>(null);
  let vault = $state(""); // the vault written to (default: the one this window belongs to)
  let phase = $state<"typing" | "sending" | "saved" | "failed">("typing"); // (not `state`: `$state` would then read as a store)
  let message = $state("");
  const hint = captureHint(() => text, () => vault || undefined);
  // this window's vault first (it need not be in the list: `atlas serve` on a folder leaves no trace there), then the known ones
  const others = $derived.by(() => {
    if (!vaults) return [];
    const known = vaults.vaults.filter((v) => !v.missing && v.path !== vaults!.current);
    return [{ name: vaults.current.split("/").pop() ?? vaults.current, path: vaults.current }, ...known.map((v) => ({ name: v.name, path: v.path }))];
  });
  const nameOf = (path: string) => others.find((v) => v.path === path)?.name ?? path.split("/").pop() ?? path;

  /** The desktop app closes the window when it is sent here (crates/atlas-app: on_navigation); a browser tab simply stays. */
  const close = () => { location.href = "/__atlas_close"; };

  onMount(() => {
    document.title = "Atlas capture";
    document.documentElement.classList.add("capture-window");
    box?.focus();
    // the look of the vault, and the list of vaults — neither is needed to type
    void api.config().then((c) => { const t = c.config.ui.theme; paintTheme(t === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t); }).catch(() => {});
    void api.vaults().then((l) => { vaults = l; vault = l.current; }).catch(() => {});
  });

  async function send() {
    const value = text.trim();
    if (!value || phase === "sending") return;
    phase = "sending";
    try {
      const r = await api.capture(value, vault && vault !== vaults?.current ? vault : undefined);
      phase = "saved";
      message = `${vault ? `${nameOf(vault)} · ` : ""}${shownPath(r.path)}:${r.line}`;
      setTimeout(close, 650); // long enough to read where it went
    } catch (e) {
      phase = "failed";
      message = errText(e);
      box?.focus();
    }
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); }
    // Alt+↑ / Alt+↓: the next vault, without leaving the box
    else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp") && others.length > 1) {
      e.preventDefault();
      const i = others.findIndex((v) => v.path === vault), n = others.length;
      vault = others[(i + (e.key === "ArrowDown" ? 1 : n - 1)) % n].path;
    }
  }
</script>

<main class="cap" data-testid="capture-window" data-state={phase}>
  <div class="line">
    <span class="tile" aria-hidden="true">A</span>
    <!-- the list hangs from this box (textarea-complete.ts), not from the whole window -->
    <div class="field">
      <textarea bind:this={box} bind:value={text} {onkeydown} use:complete={{ vault: () => vault || undefined }} rows="1" placeholder="Capture a thought, a to-do, a link…" aria-label="Capture" disabled={phase === "saved"} data-testid="capture"></textarea>
    </div>
  </div>
  <footer>
    {#if phase === "saved"}<span class="ok" data-testid="capture-ok">Saved to {message}</span>
    {:else if phase === "failed"}<span class="bad">Not saved: {message}</span>
    {:else}
      <span class="what" data-testid="capture-what">
        <!-- the little guides, as in the native box: what the short forms do -->
        {#if !text.trim()}<code>[]</code> to-do <code>@fri</code> date <code>[[</code> link <code>#</code> tag
        {:else}{hint.current.says}{/if}
      </span>
    {/if}
    {#if others.length > 1 && phase !== "saved"}
      <label class="vault" title="The vault it goes to (Alt+↑ / Alt+↓)">
        <select bind:value={vault} aria-label="Vault" data-testid="capture-vault">{#each others as v (v.path)}<option value={v.path}>{v.name}</option>{/each}</select>
      </label>
    {/if}
    <span class="keys"><kbd>Enter</kbd> save <kbd>Esc</kbd> close</span>
  </footer>
</main>

<style>
  :global(html.capture-window), :global(html.capture-window body) { margin: 0; height: 100%; background: var(--bg-elev); overflow: hidden; }
  /* the native box's layout (crates/atlas-capture): tile and text, a hairline, the footer */
  .cap { position: relative; display: flex; flex-direction: column; min-height: 100vh; box-sizing: border-box; padding: 12px 14px 10px; border: 1px solid var(--border-strong); background: var(--bg-elev); color: var(--text); font-family: var(--font-ui, system-ui); }
  .line { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-height: 0; }
  .tile { width: 22px; height: 22px; margin-top: 1px; border-radius: 6px; display: grid; place-items: center; flex: none; font-weight: 600; font-size: 12px; color: var(--bg); background: linear-gradient(135deg, var(--accent-strong), var(--accent) 55%, var(--purple)); }
  .field { position: relative; flex: 1; min-width: 0; }
  textarea { display: block; width: 100%; box-sizing: border-box; resize: none; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 16px; line-height: 22px; padding: 1px 0; field-sizing: content; max-height: 40vh; }
  textarea::placeholder { color: var(--text-faint); }
  footer { display: flex; align-items: center; gap: 12px; min-height: 22px; margin-top: 8px; padding: 8px 0 0 32px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-faint); white-space: nowrap; }
  .what { margin-right: auto; overflow: hidden; text-overflow: ellipsis; }
  .what code { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); background: var(--bg-hover); border-radius: 4px; padding: 1px 4px; margin: 0 2px 0 6px; white-space: pre; }
  .what code:first-child { margin-left: 0; }
  .ok { margin-right: auto; color: var(--green); overflow: hidden; text-overflow: ellipsis; }
  .bad { margin-right: auto; color: var(--red); overflow: hidden; text-overflow: ellipsis; }
  .vault { display: inline-flex; align-items: center; }
  select { font: inherit; font-size: 11.5px; color: var(--accent-strong); background: var(--accent-soft); border: 0; border-radius: 10px; padding: 2px 8px; max-width: 16ch; min-height: 22px; }
  .keys { display: inline-flex; align-items: center; gap: 5px; }
  kbd { font-family: var(--font-ui); font-size: 10.5px; color: var(--text-muted); background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; margin-left: 4px; }
</style>
