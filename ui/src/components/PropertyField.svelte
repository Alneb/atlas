<script lang="ts">
  // One property's control in the properties panel, chosen by its kind: text, number, checkbox,
  // date, date and time, a choice (enum), or pills for a link / list / tags / links. `onset` gets
  // the new YAML value (null = empty); conversions live in lib/property-model.ts.
  import Select from "./Select.svelte";
  import Icon from "./Icon.svelte";
  import SuggestInput, { type Suggestion } from "./SuggestInput.svelte";
  import type { LinkTarget } from "../lib/gen/LinkTarget";
  import { asLink, asNumber, asTag, fromInput, isListKind, linkLabel, linkTarget, listOf, scalarText, toInput, WIKI } from "../lib/property-model";
  import type { PropertyKind, PropertySpec } from "../lib/types";
  import { api } from "../lib/api";

  let { name, kind, value, spec, onset, onopen, values = [] }: {
    name: string; kind: PropertyKind; value: unknown; spec?: PropertySpec;
    onset: (v: unknown) => void; onopen: (target: string) => void;
    /** the values this property has in the vault's notes, the commonest first (lib/known-properties.svelte.ts) */
    values?: string[];
  } = $props();

  const label = $derived(`${name}: ${kind}`);
  const items = $derived(listOf(value));
  const multi = $derived(isListKind(kind));
  const pills = $derived(multi || kind === "link");
  // a single link takes one pill: its input shows only while it is empty
  const canAdd = $derived(multi || items.length === 0);
  let draft = $state("");
  // a link field offers the vault's notes as the user types: the core's ranking, as `[[` in the editor
  let found = $state<Suggestion[]>([]);
  let asked = 0;
  $effect(() => {
    const q = draft.trim().replace(/^\[\[|\]\]$/g, "");
    if (!(kind === "link" || kind === "links") || !q) { found = []; return; }
    const n = ++asked;
    const t = setTimeout(() => void api.linkTargets(q).then((ts) => { if (n === asked) found = ts.slice(0, 12).map(linkSuggestion("")); }, () => {}), 120);
    return () => clearTimeout(t);
  });
  /** A note the core found, as a row: its link, and the folder it is in (two notes of one name tell apart). */
  const linkSuggestion = (before: string) => (x: LinkTarget): Suggestion => {
    const folder = x.path.includes("/") ? x.path.slice(0, x.path.lastIndexOf("/")) : "";
    return { value: `${before}[[${x.link}]]`, label: x.alias ? `${x.alias} → ${x.link}` : x.link, detail: folder };
  };
  const plain = (v: string): Suggestion => ({ value: v, label: WIKI.test(v) ? linkLabel(v) : v });
  const unique = (l: Suggestion[]) => l.filter((s, i, all) => all.findIndex((o) => o.value === s.value) === i);
  // what was typed narrows the known values too (the core already ranked the notes)
  const matches = (v: string, q: string) => !q || v.toLowerCase().includes(q.toLowerCase());
  const suggest = $derived(unique([...found, ...[...(spec?.suggest ?? []), ...values].filter((v) => matches(v, draft.trim())).map(plain)])
    .filter((s) => !items.includes(s.value)).slice(0, 40));
  // a text field: its known values, and the vault's notes after a `[[` typed in it (as `[[` in the editor)
  let typed = $state("");
  let linksAt = $state<Suggestion[]>([]);
  $effect(() => {
    const open = typed.lastIndexOf("[[");
    const q = open >= 0 && !typed.slice(open).includes("]]") ? typed.slice(open + 2).trim() : null;
    if (q === null) { linksAt = []; return; }
    const n = ++asked;
    const t = setTimeout(() => void api.linkTargets(q).then((ts) => { if (n === asked) linksAt = ts.slice(0, 12).map(linkSuggestion(typed.slice(0, open))); }, () => {}), 120);
    return () => clearTimeout(t);
  });
  const textSuggest = $derived(linksAt.length ? linksAt : unique([...(spec?.suggest ?? []), ...values].filter((v) => v !== typed && matches(v, typed.trim())).map(plain)).slice(0, 40));

  /** What the user typed in a pill field → the value to store (links get brackets, tags lose `#`). */
  const shape = (s: string) => (kind === "link" || kind === "links" ? asLink(s) : kind === "tags" ? asTag(s) : s.trim());

  function add(text: string) {
    const next = text.split(kind === "link" ? /\n/ : /,/).map(shape).filter((s) => s && !items.includes(s));
    draft = "";
    if (!next.length) return;
    onset(kind === "link" ? next[0] : [...items, ...next]);
  }
  function remove(i: number) {
    const rest = items.filter((_, j) => j !== i);
    onset(kind === "link" ? null : rest.length ? rest : null);
  }
  function pillKey(e: KeyboardEvent) {
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter" || (e.key === "," && multi)) { e.preventDefault(); add(el.value); }
    else if (e.key === "Backspace" && !el.value && items.length) { e.preventDefault(); remove(items.length - 1); }
  }
  const commitText = (e: Event) => { const v = (e.currentTarget as HTMLInputElement).value; onset(v.trim() === "" ? null : v); };
  const commitNumber = (e: Event) => onset(asNumber((e.currentTarget as HTMLInputElement).value));
  const commitDate = (e: Event, k: "date" | "datetime") => { const v = (e.currentTarget as HTMLInputElement).value; onset(v ? fromInput(v, k, spec?.format ?? "", value) : null); };
  const enterBlurs = (e: KeyboardEvent) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); };
  const options = $derived.by(() => {
    const vals = [...(spec?.values ?? [])];
    const cur = scalarText(value);
    if (cur && !vals.includes(cur)) vals.push(cur); // a value outside the spec stays choosable (and visible)
    return [{ value: "", label: "Empty" }, ...vals.map((v) => ({ value: v, label: v.replace(/^\[\[|\]\]$/g, ""), note: spec?.values.includes(v) ? undefined : "not in the spec" }))];
  });
  // what a value points at:
  // a [[link]] or a file name (`paper.pdf`, found as links are) opens in Atlas, an address in the browser
  const isUrl = (v: string) => /^https?:\/\//i.test(v.trim());
  const isFile = (v: string) => !isUrl(v) && /^[^\n]{1,200}\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(v.trim());
  const target = (v: string): string | null => (WIKI.test(v) ? linkTarget(v) : isFile(v) ? v.trim() : null);
  const follow = (v: string) => { if (isUrl(v)) void import("../lib/web-links").then((m) => m.openWeb(v.trim())); else { const t = target(v); if (t) onopen(t); } };
  const opens = (v: string) => isUrl(v) || target(v) !== null;
</script>

{#if pills}
  <div class="pills" data-kind={kind}>
    {#each items as it, i (it)}
      <span class="pill" class:tag={kind === "tags"} class:link={WIKI.test(it)}>
        {#if WIKI.test(it)}
          <button type="button" class="pill-text" title="Open {linkTarget(it)}" onclick={() => onopen(linkTarget(it))}>{linkLabel(it)}</button>
        {:else if opens(it)}
          <button type="button" class="pill-text opens" title={isUrl(it) ? `Open ${it} in the browser` : `Open ${it}`} onclick={() => follow(it)}>{it}</button>
        {:else}
          <span class="pill-text">{it}</span>
        {/if}
        <button type="button" class="pill-x" aria-label="Remove {it}" onclick={() => remove(i)}><Icon name="close" size={11} /></button>
      </span>
    {/each}
    {#if canAdd}
      <SuggestInput class="pill-input" aria-label={label} placeholder={kind === "tags" ? "Add a tag…" : kind === "list" ? "Add…" : "Add a link…"}
        items={suggest} onpick={add} bind:value={draft} onkeydown={pillKey} onblur={() => draft.trim() && add(draft)} />
    {/if}
  </div>
{:else if kind === "bool"}
  <label class="check"><input type="checkbox" aria-label={label} checked={value === true} onchange={(e) => onset((e.currentTarget as HTMLInputElement).checked)} /><span>{value === true ? "Yes" : "No"}</span></label>
{:else if kind === "enum"}
  <Select label={label} value={scalarText(value)} {options} onchange={(v) => onset(v || null)} />
<!-- a template's `{{date}}` stays its text, never read as a date -->
{:else if (kind === "date" || kind === "datetime") && !/\{\{/.test(scalarText(value))}
  {@const k = kind}
  <input class="field" type={k === "date" ? "date" : "datetime-local"} aria-label={label} value={toInput(value, k)} onchange={(e) => commitDate(e, k)} onkeydown={enterBlurs} />
{:else if kind === "number"}
  <input class="field num" type="number" step="any" aria-label={label} value={scalarText(value)} onchange={commitNumber} onkeydown={enterBlurs} />
{:else}
  {@const text = scalarText(value)}
  <div class="text-row">
    <SuggestInput class="field" type="text" aria-label={label} placeholder="Empty" value={text} items={textSuggest}
      onpick={(v) => { typed = v; onset(v.trim() === "" ? null : v); }} onchange={commitText} onkeydown={enterBlurs}
      oninput={(e) => (typed = e.currentTarget.value)} onfocus={(e) => (typed = e.currentTarget.value)} />
    {#if text && opens(text)}
      <button type="button" class="icon-btn open" aria-label="Open {label}" title={isUrl(text) ? `Open ${text} in the browser` : `Open ${target(text)}`} onclick={() => follow(text)}><Icon name="link" size={12} /></button>
    {/if}
  </div>
{/if}

<style>
  .field, .text-row :global(.field) { width: 100%; min-width: 0; height: 26px; padding: 0 7px; border-radius: var(--radius-sm); border: 1px solid transparent; background: transparent;
    color: var(--text); font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); }
  .field:hover, .text-row :global(.field:hover) { border-color: var(--border); }
  .field:focus, .text-row :global(.field:focus) { outline: none; border-color: var(--accent); background: var(--bg); }
  .field::placeholder, .text-row :global(.field::placeholder) { color: var(--text-faint); font-style: italic; }
  .num { font-variant-numeric: tabular-nums; }
  input[type="date"], input[type="datetime-local"] { font-variant-numeric: tabular-nums; color-scheme: light dark; }
  .check { display: inline-flex; align-items: center; gap: 7px; min-height: 26px; padding: 0 7px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); cursor: pointer; }
  .check input { accent-color: var(--accent); width: 14px; height: 14px; }
  .pills { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 26px; padding: 2px 4px; border-radius: var(--radius-sm); border: 1px solid transparent; }
  .pills:hover { border-color: var(--border); }
  .pills:focus-within { border-color: var(--accent); background: var(--bg); }
  .pill { display: inline-flex; align-items: center; max-width: 100%; min-width: 0; border-radius: 999px; background: var(--bg-alt); border: 1px solid var(--border);
    font-size: calc(12px * var(--ui-scale, 1)); line-height: 20px; }
  .pill.tag { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
  .pill-text { padding: 0 2px 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: inherit; }
  .pill.link .pill-text { color: var(--link, var(--accent)); }
  .pill .pill-text.opens { color: var(--link, var(--accent)); cursor: pointer; }
  .text-row { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .text-row .open { flex: none; width: 22px; height: 22px; color: var(--text-faint); }
  .text-row .open:hover { color: var(--link, var(--accent)); }
  button.pill-text:hover { text-decoration: underline; }
  .pill-x { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: var(--text-faint); flex: none; }
  .pill-x:hover { color: var(--text); background: var(--bg-hover); }
  .pills :global(.pill-input) { flex: 1; min-width: 70px; height: 22px; border: 0; background: transparent; color: var(--text); font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); padding: 0 4px; }
  .pills :global(.pill-input:focus) { outline: none; }
  .pills :global(.pill-input::placeholder) { color: var(--text-faint); }
</style>
