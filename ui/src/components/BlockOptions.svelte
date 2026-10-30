<script lang="ts">
  // The options of one block — or the settings of one plugin — as a form, drawn from its fields
  // (lib/block-options.ts, controls in FormFields). Saving hands back the changed options; the host
  // writes them to its file. A field whose `when` does not hold is left out of what is handed back.
  import FormFields from "./FormFields.svelte";
  import Dialog from "./Dialog.svelte";
  import { applies, shown, store, type FormValue, type OptionField } from "../lib/block-options";

  let { title, fields, options, onsave, oncancel, onaction, note = "An empty field takes the option out of the file. Everything here is also plain text in the page (Edit layout)." }: {
    title: string; fields: OptionField[]; options: Record<string, unknown>; /** the line under the fields: where the values are kept */ note?: string;
    onsave: (options: Record<string, unknown>) => void; oncancel: () => void;
    /** a records card's or list's button: the host saves `options` first, then runs `command` */
    onaction?: (command: string, arg: Record<string, unknown>, options: Record<string, unknown>) => void;
  } = $props();
  // svelte-ignore state_referenced_locally -- the form starts from the block's options
  let values = $state<Record<string, FormValue>>(Object.fromEntries(fields.map((f) => [f.key, shown(f, options[f.key])])));
  let form = $state<HTMLFormElement>();
  $effect(() => { form?.querySelector<HTMLElement>("input, button.trigger")?.focus(); });
  // cards need room: a plugin with a list of records gets a wider dialog
  const wide = $derived(fields.some((f) => f.kind === "records"));

  function collect(): Record<string, unknown> {
    const next = { ...options };
    for (const f of fields) {
      if (applies(f, values, fields)) store(next, f, values[f.key]);
      else delete next[f.key];
    }
    return next;
  }
</script>

<Dialog label="Options: {title}" onclose={oncancel}>
  <form class="dialog" class:wide bind:this={form} aria-label="Options: {title}"
    onsubmit={(e) => { e.preventDefault(); onsave(collect()); }}>
    <h3>{title}</h3>
    <FormFields {fields} bind:values onaction={onaction && ((command, arg) => onaction(command, arg, collect()))} />
    <p class="hint">{note}</p>
    <div class="btns"><button type="button" class="btn" onclick={oncancel}>Cancel</button><button class="btn primary">Save</button></div>
  </form>
</Dialog>

<style>
  .dialog { width: min(480px, 92vw); max-height: 72vh; overflow: auto; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 10px; padding: 16px; box-shadow: var(--shadow-pop); display: flex; flex-direction: column; gap: 12px; }
  .dialog.wide { width: min(640px, 94vw); max-height: 84vh; }
  h3 { margin: 0; font-size: calc(14px * var(--ui-scale, 1)); font-weight: 600; color: var(--text); }
  .hint { margin: 0; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .btns { display: flex; justify-content: flex-end; gap: 8px; }
  .btn { border: 1px solid var(--border-strong); padding: 4px 12px; border-radius: var(--radius-sm); }
</style>
