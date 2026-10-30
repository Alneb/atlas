<script lang="ts">
  // The rules (DESIGN-mail-ui §7): a form over the `email-rules` block of `mail/rules.md` (the note stays the truth;
  // editing it by hand works too). Each rule: a search (the search box's words) and what to do with new mail it finds.
  import Icon from "./Icon.svelte";
  import type { Rule } from "./api";
  import type { RulesHost } from "./rules-host";

  // `frame`: in Settings' page, or alone in a dialog (the pane's Rules…, view.ts), which Save and Cancel close
  let { mail, onclose = () => {}, frame }: { mail: RulesHost; onclose?: () => void; frame: "page" | "dialog" } = $props();
  const inline = $derived(frame === "page");
  let rules = $state<Rule[]>([]);
  let path = $state("");
  let error = $state("");
  let saving = $state(false);
  const ACTIONS = ["important", "not-important", "archive", "read", "star", "trash", "spam", "save", "notify", "stop", "move …", "label …"];

  $effect(() => {
    mail.call<{ rules: Rule[]; path: string }>("rules").then((r) => { rules = r.rules; path = r.path; }, (e) => (error = (e as Error).message));
  });
  const add = () => (rules = [...rules, { when: "", actions: ["archive"] }]);
  const remove = (i: number) => (rules = rules.filter((_, j) => j !== i));
  async function save() {
    saving = true;
    try {
      const clean = rules.map((r) => ({ when: r.when.trim(), actions: r.actions.map((a) => a.trim()).filter((a) => a && !a.endsWith("…")) })).filter((r) => r.when && r.actions.length);
      const r = await mail.call<{ path: string }>("set_rules", { rules: clean });
      mail.toast(`Rules saved in ${r.path}`, "success");
      if (!inline) onclose();
    } catch (e) { error = (e as Error).message; } finally { saving = false; }
  }
  async function preview(r: Rule) {
    mail.search(r.when);
    onclose();
  }
</script>

<div class={frame}>
    <span class="faint">for new mail in an inbox · kept in <button class="link" onclick={() => { mail.atlas.open(path, undefined, { beside: true }); onclose(); }}>{path || "mail/rules.md"}</button></span>
    <p class="hint">When new mail matches the search, do the actions in order. A search is written as in the search box: <code>from:shop.example</code>, <code>subject:invoice has:attachment</code>, <code>list:physics</code>, <code>-from:boss</code>, several people at once: <code>from:ana@uni.example,bo@uni.example</code>. <b>important</b> stars it and keeps the conversation as a note at once; <b>not-important</b> moves it out of the inbox; <b>stop</b> keeps later rules from seeing it; <b>save</b> keeps the conversation as a note.</p>
    {#each rules as r, i (i)}
      <div class="rule">
        <input class="when" bind:value={r.when} placeholder="from:newsletter@shop.example" aria-label="When new mail matches" />
        <span class="arrow">→</span>
        <input class="acts" value={r.actions.join(", ")} oninput={(e) => (r.actions = e.currentTarget.value.split(","))} placeholder="move Newsletters, read" aria-label="Do" list="email-rule-actions" />
        <button class="tool" onclick={() => preview(r)} title="Show the mail it matches now"><Icon name="search" size={15} /></button>
        <button class="tool" onclick={() => remove(i)} title="Remove this rule"><Icon name="trash" size={15} /></button>
      </div>
    {:else}
      <p class="faint">No rules yet.</p>
    {/each}
    <datalist id="email-rule-actions">{#each ACTIONS as a (a)}<option value={a}></option>{/each}</datalist>
    {#if error}<p class="error">{error}</p>{/if}
    <footer>
      <button class="atlas-btn" onclick={add}><Icon name="plus" size={14} /> Add a rule</button>
      <span class="grow"></span>
      {#if !inline}<button class="atlas-btn" onclick={onclose}>Cancel</button>{/if}
      <button class="atlas-btn primary" onclick={save} disabled={saving}>{inline ? "Save rules" : "Save"}</button>
    </footer>
</div>

<style>
  .page { display: grid; gap: 10px; container-type: inline-size; }
  .dialog { display: grid; gap: 10px; align-content: start; container-type: inline-size; padding: 14px 18px; height: 100%; box-sizing: border-box; overflow: auto; }
  .faint { color: var(--text-faint); font-size: 0.9em; }
  .hint { margin: 0; color: var(--text-muted); font-size: 0.9em; line-height: 1.5; }
  code { font-family: var(--font-mono); font-size: 0.9em; background: var(--bg-hover); padding: 0 4px; border-radius: 4px; }
  .link { all: unset; cursor: pointer; color: var(--accent); }
  .rule { display: flex; gap: 8px; align-items: center; }
  .rule input { min-width: 0; background: var(--bg); color: var(--text); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 9px; font: inherit; }
  .when { flex: 3; font-family: var(--font-mono); font-size: 0.92em !important; }
  .acts { flex: 2; }
  .arrow { color: var(--text-faint); }
  .tool { all: unset; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  footer { display: flex; gap: 8px; align-items: center; padding-top: 6px; }
  footer .atlas-btn { display: inline-flex; gap: 6px; align-items: center; }
  .primary { background: var(--accent) !important; color: var(--accent-fg) !important; border-color: transparent !important; }
  .grow { flex: 1; }
  .error { color: var(--red); margin: 0; }
  @container (max-width: 600px) { .rule { flex-wrap: wrap; } .when, .acts { flex-basis: 100%; } .arrow { display: none; } }
</style>
