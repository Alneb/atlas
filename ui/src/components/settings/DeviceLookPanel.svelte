<script lang="ts">
  // Settings → Appearance: whose look this screen draws. Off, the vault's (every device alike); on, the theme, the
  // colour schemes, the contrast, the shapes, the accent and the text size below are this device's own
  // (device-look.svelte.ts) and the vault's file is left alone. And the theme following the system, as one switch.
  import { deviceChose, deviceLook, setOwnLook } from "../../lib/device-look.svelte";
  import { inPhoneApp } from "../../lib/eink";
  import { setValue, valueOf } from "../../lib/settings-schema";
  import { app } from "../../lib/state.svelte";

  // (the phone app follows the phone until it chooses a theme itself: settings.svelte.ts)
  const follows = $derived(valueOf("ui.theme") === "system" || (inPhoneApp() && !deviceChose("ui.theme")));
  /** Off keeps what is on screen now, so nothing jumps. */
  const follow = (on: boolean) => void setValue("ui.theme", on ? "system" : app.theme);
</script>

<section class="settings-panel device-look">
  <h3>This device</h3>
  <div class="row">
    <div class="what">
      <label for="device-look-own">Its own look</label>
      <p class="desc">{deviceLook.own
        ? "The theme, colour schemes, contrast, shapes, accent and text size below are kept on this device. The vault's own look, and every other device, stay as they are."
        : "This device draws the vault's look, like every other. On: what you choose below is kept here only (a phone, an e-ink tablet or a second screen with a look of its own)."}</p>
    </div>
    <button id="device-look-own" class="switch" class:on={deviceLook.own} role="switch" aria-checked={deviceLook.own} aria-label="This device keeps its own look" onclick={() => setOwnLook(!deviceLook.own)}><span></span></button>
  </div>
  <div class="row">
    <div class="what">
      <label for="device-look-system">Follow the system's theme</label>
      <p class="desc">Light by day and dark by night, as the system switches. Off: the theme chosen below{deviceLook.own ? ", on this device" : ", for the whole vault"}.</p>
    </div>
    <button id="device-look-system" class="switch" class:on={follows} role="switch" aria-checked={follows} aria-label="Follow the system's theme" onclick={() => follow(!follows)}><span></span></button>
  </div>
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .row { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 6px 0; }
  .what { min-width: 0; }
  label { font-weight: 500; }
  .desc { margin: 2px 0 0; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .switch { flex: none; width: 38px; height: 22px; border-radius: 11px; background: var(--border-strong); position: relative; transition: background .15s; }
  .switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--bg); transition: transform .15s; box-shadow: var(--shadow-sm); }
  .switch.on { background: var(--accent); }
  .switch.on span { transform: translateX(16px); }
</style>
