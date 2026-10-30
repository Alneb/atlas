<script lang="ts">
  // The quick-capture window (docs/guides/CAPTURE.md): the app's page reduced to the one capture box
  // (components/CaptureBox.svelte), opened by `atlas-app --capture` (a small frameless window, `ATLAS_CAPTURE=webview`)
  // or in a browser at `/#capture`. Enter: written, where it went shown, the window gone; Esc: gone, nothing written.
  // No tabs, no dock: nothing of the app is mounted.
  import { onMount } from "svelte";
  import { basename } from "./lib/paths";
  import { landedAt } from "./lib/capture-guides";
  import { api } from "./lib/api";
  import { paintTheme } from "./lib/state.svelte";
  import type { VaultList } from "./lib/gen/VaultList";
  import CaptureBox from "./components/CaptureBox.svelte";

  let cb = $state<CaptureBox>();
  let text = $state("");
  let list = $state<VaultList | null>(null);
  let vault = $state("");
  let saved = $state("");
  // this window's vault first (it need not be in the list: `atlas serve` on a folder leaves no trace there), then the known ones
  const vaults = $derived(list ? [{ name: basename(list.current), path: list.current },
    ...list.vaults.filter((v) => !v.missing && v.path !== list!.current).map((v) => ({ name: v.name, path: v.path }))] : []);

  /** The desktop app closes the window when it is sent here (crates/atlas-app: on_navigation); a browser tab simply stays. */
  const close = () => { location.href = "/__atlas_close"; };

  onMount(() => {
    document.title = "Atlas capture";
    document.documentElement.classList.add("capture-window");
    cb?.focus();
    // the look of the vault, and the list of vaults — neither is needed to type
    void api.config().then((c) => { const t = c.config.ui.theme; paintTheme(t === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t); }).catch(() => {});
    void api.vaults().then((l) => { list = l; vault = l.current; }).catch(() => {});
  });
</script>

<main class="cap" data-testid="capture-window">
  <CaptureBox bind:this={cb} bind:text bind:vault {vaults} {saved} testid="capture" escape="close" lines={1} onclose={close}
    onsaved={(r) => { saved = `${vaults.length > 1 ? `${vaults.find((v) => v.path === vault)?.name ?? basename(vault)} · ` : ""}${landedAt(r)}`; setTimeout(close, 650); }} />
</main>

<style>
  :global(html.capture-window), :global(html.capture-window body) { margin: 0; height: 100%; background: var(--bg-elev); overflow: hidden; }
  .cap { min-height: 100vh; box-sizing: border-box; border: 1px solid var(--border-strong); background: var(--bg-elev); color: var(--text); font-family: var(--font-ui, system-ui); }
</style>
