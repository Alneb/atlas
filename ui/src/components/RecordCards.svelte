<script lang="ts">
  // A records field (a plugin's list of accounts, hosts…): one card per record, the first is the main one.
  // Cards are added, removed (after a confirm), moved to the top; their buttons run the plugin's own
  // commands with the card's name. Nothing is written until the form is saved.
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";
  import FormFields from "./FormFields.svelte";
  import { applies, newCard, secretHint, type Card, type OptionField, type RecordsField } from "../lib/block-options";

  let { f, cards, onaction }: { f: RecordsField; cards: Card[]; onaction?: (command: string, arg: Record<string, unknown>) => void } = $props();
  let confirming = $state<number | null>(null);
  let root = $state<HTMLElement>();

  const nameOf = (c: Card) => String(c.values[f.name] ?? "").trim();
  // a saved card can be renamed: its secrets move
  // with it and the plugin is told; a secret field says whether this card's secret is kept (under the saved name)
  function fieldsOf(c: Card): OptionField[] {
    const set = c.saved ? (f.secretsOf?.(c.was ?? nameOf(c)) ?? []) : [];
    return f.fields.flatMap((s): OptionField[] => {
      if (s.key === f.name) return [c.saved ? { ...s, hint: [s.hint, "Renaming keeps its passwords and sign-in."].filter(Boolean).join(" — ") } : s];
      if (s.kind === "secret") return [{ ...s, isSet: set.includes(s.key), hint: secretHint(set.includes(s.key), s.readonly, s.hint) }];
      return [s];
    });
  }
  async function add() {
    const c = newCard(f);
    cards.push(c);
    await tick();
    root?.querySelector<HTMLInputElement>(`[data-card="${c.id}"] input`)?.focus();
  }
  function main(i: number) {
    const [c] = cards.splice(i, 1);
    cards.unshift(c);
  }
  function remove(c: Card) {
    const i = cards.indexOf(c);
    if (i >= 0) cards.splice(i, 1);
    confirming = null;
  }
</script>

<div class="records" bind:this={root}>
  {#each cards as c, i (c.id)}
    {@const title = nameOf(c) || "New"}
    {@const acts = f.actions.filter((a) => applies(a, c.values, f.fields))}
    <section class="card" role="group" aria-label={title} data-card={c.id}>
      <header>
        <b>{title}</b>
        {#if i === 0}<span class="badge">main</span>{/if}
        <span class="sp"></span>
        {#if i > 0}<button type="button" class="link" title="Move to the top: the main one, used when none is named" onclick={() => main(i)}>Make main</button>{/if}
        <button type="button" class="x" aria-label="Remove {title}" title="Remove" onclick={() => (confirming = c.id)}><Icon name="close" size={12} /></button>
      </header>
      {#if confirming === c.id}
        <div class="confirm" role="alert">
          <span>Remove {title}?{c.saved ? " Its secrets are forgotten when the form is saved." : ""}</span>
          <button type="button" class="btn danger" onclick={() => remove(c)}>Remove</button>
          <button type="button" class="btn" onclick={() => (confirming = null)}>Keep</button>
        </div>
      {/if}
      <FormFields fields={fieldsOf(c)} bind:values={c.values} {onaction} compact />
      {#if acts.length}
        <div class="acts">
          {#each acts as a (a.command + a.label)}
            <button type="button" class="btn" title="Saves the form, then runs it for {title}" onclick={() => onaction?.(a.command, { setting: f.key, record: nameOf(c) })}>{a.label}</button>
          {/each}
        </div>
      {/if}
    </section>
  {/each}
  <div class="acts">
    <button type="button" class="btn" onclick={() => void add()}><Icon name="plus" size={12} /> {f.add}</button>
    {#each f.listActions as a (a.command + a.label)}
      <button type="button" class="btn" title="Saves the form, then runs it" onclick={() => onaction?.(a.command, { setting: f.key })}>{a.label}</button>
    {/each}
  </div>
</div>

<style>
  .records { display: flex; flex-direction: column; gap: 10px; }
  .card { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px 12px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--bg); }
  header { display: flex; align-items: center; gap: 8px; }
  header b { color: var(--text); font-weight: 600; font-size: calc(13.5px * var(--ui-scale, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: calc(11px * var(--ui-scale, 1)); color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 0 7px; }
  .sp { flex: 1; }
  .link { color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  .link:hover { color: var(--text); }
  .x { display: grid; place-items: center; width: 22px; height: 22px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .x:hover { background: var(--bg-active); color: var(--red); }
  .confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .confirm span { flex: 1; min-width: 12em; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border-strong); padding: 3px 10px; border-radius: var(--radius-sm); color: var(--text); }
  .btn:hover { background: var(--bg-hover); }
  .btn.danger { color: var(--red); border-color: var(--red); }
</style>
