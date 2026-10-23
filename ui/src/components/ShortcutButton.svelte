<script lang="ts">
  // A command's shortcut: click, press the new keys (saved to .atlas/keys.toml); a clash moves the
  // chord here and clears it on the other command; ⟲ goes back to the default. Shared by the
  // Commands pane and Settings → Keyboard.
  import { errText } from "../lib/text";
  import { allCommands, keymap, setKey, type Cmd } from "../lib/keymap.svelte";
  import { chordFromEvent, chordLabel, sameChord } from "../lib/keys";
  import { toast } from "../lib/state.svelte";
  import Icon from "./Icon.svelte";

  let { cmd }: { cmd: Cmd } = $props();
  let recording = $state(false);

  function record(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") { recording = false; return; }
    if (e.key === "Backspace" || e.key === "Delete") { recording = false; void save(""); return; }
    const chord = chordFromEvent(e);
    if (!chord) return; // a bare modifier: keep listening
    if (!/^(Ctrl|Alt|Meta)\+/.test(chord) && !/^F\d/.test(chord)) { toast("Add Ctrl, Alt or Meta", "A plain key would fire while typing."); return; }
    recording = false;
    const clash = allCommands().find((o) => o.id !== cmd.id && o.keys && sameChord(o.keys, chord));
    if (clash) toast(`${chord} was used by "${clash.title}"`, "It now runs this command instead; give the other one a new shortcut.", "info", 7000);
    void save(chord, clash);
  }

  async function save(keys: string | null, clash?: Cmd) {
    try {
      if (clash) await setKey(clash.id, "");
      await setKey(cmd.id, keys);
    } catch (e) { toast("Could not save the shortcut", errText(e), "error"); }
  }
</script>

<span class="shortcut keys-only">
  {#if recording}
    <!-- svelte-ignore a11y_autofocus -->
    <button class="keys rec" onkeydown={record} onblur={() => (recording = false)} autofocus>Press keys… <span>Esc cancel · ⌫ none</span></button>
  {:else}
    <button class="keys" onclick={() => (recording = true)} title="Click, then press the new shortcut" aria-label="Shortcut for {cmd.title}">
      {#if cmd.keys}{#each chordLabel(cmd.keys) as k}<kbd>{k}</kbd>{/each}{:else}<span class="add">Add shortcut</span>{/if}
    </button>
  {/if}
  {#if cmd.id in keymap.overrides}
    <button class="icon-btn" onclick={() => save(null)} title="Back to the default ({cmd.defaultKeys ?? "none"})" aria-label="Reset shortcut"><Icon name="refresh" size={13} /></button>
  {/if}
</span>

<style>
  .shortcut { display: inline-flex; gap: 4px; align-items: center; }
  .keys { display: inline-flex; gap: 3px; align-items: center; min-width: 110px; justify-content: flex-end; padding: 3px 6px; border-radius: var(--radius-sm); border: 1px dashed transparent; }
  .keys:hover { border-color: var(--border-strong); }
  .keys .add { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .keys.rec { border: 1px solid var(--accent); color: var(--accent); font-size: calc(12px * var(--ui-scale, 1)); flex-direction: column; align-items: flex-end; }
  .keys.rec span { color: var(--text-faint); font-size: .85em; }
  kbd { font-family: var(--font-mono); font-size: calc(11px * var(--ui-scale, 1)); padding: 1px 5px; border-radius: 4px; border: 1px solid var(--border-strong); background: var(--bg-elev); color: var(--text); }
  .icon-btn { display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .icon-btn:hover { background: var(--bg-active); color: var(--text); }
</style>
