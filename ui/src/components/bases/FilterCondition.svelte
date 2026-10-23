<script lang="ts">
  // One filter condition as words: property · operator · value, the value's editor fitting the property's type. A
  // condition is written once it is complete (an operator that needs a value has one); an expression the words cannot
  // state stays an expression, edited as text.
  import Icon from "../Icon.svelte";
  import Picker from "./Picker.svelte";
  import { arity, complete, fresh, OPS, opLabel, read, write, type Condition, type FieldType, type OpId } from "../../lib/base-filter";

  let { expr, props, typeOf, onchange, onremove }: {
    /** The expression as written; null for a row just added. */
    expr: string | null;
    props: { id: string; label: string }[];
    typeOf: (id: string) => FieldType;
    onchange: (expr: string) => void;
    onremove: () => void;
  } = $props();

  /** The row as shown: the condition the expression states, else the expression itself. */
  type Shown = { cond: Condition } | { text: string };
  const fromExpr = (e: string | null): Shown => {
    if (e === null) return { cond: fresh(props[0]?.id ?? "file.name", typeOf(props[0]?.id ?? "file.name")) };
    const c = read(e);
    return c ? { cond: c } : { text: e };
  };
  // svelte-ignore state_referenced_locally -- seeded here, then kept in step with the file by the effect below
  let shown = $state<Shown>(fromExpr(expr));
  // svelte-ignore state_referenced_locally
  let last = expr;
  $effect(() => { if (expr !== last) { last = expr; shown = fromExpr(expr); } });

  const type = $derived("cond" in shown ? typeOf(shown.cond.prop) : "text");
  const propOptions = $derived.by(() => {
    const opts = props.map((p) => ({ value: p.id, label: p.label, detail: p.label !== p.id ? p.id : undefined }));
    if ("cond" in shown && !props.some((p) => p.id === (shown as { cond: Condition }).cond.prop)) opts.unshift({ value: shown.cond.prop, label: shown.cond.prop, detail: undefined });
    return opts;
  });
  const opOptions = $derived.by(() => {
    const own = OPS[type].map(([value, label]) => ({ value, label }));
    // an operator written by hand that the type does not list stays choosable
    if ("cond" in shown && !own.some((o) => o.value === (shown as { cond: Condition }).cond.op)) own.push({ value: shown.cond.op, label: opLabel(type, shown.cond.op) });
    return own;
  });

  function update(c: Condition) {
    shown = { cond: c };
    if (complete(c)) {
      const e = write(c, typeOf(c.prop));
      last = e;
      onchange(e);
    }
  }
  function pickProp(id: string) {
    const c = (shown as { cond: Condition }).cond;
    const t = typeOf(id);
    // the operator stays when the new property's type has it, the value when it still means something
    const keep = OPS[t].some(([o]) => o === c.op);
    update({ prop: id, op: keep ? c.op : OPS[t][0][0], values: keep && arity(c.op) !== 0 ? c.values : [] });
  }
  const pickOp = (op: OpId) => update({ ...(shown as { cond: Condition }).cond, op, values: arity(op) === 0 ? [] : (shown as { cond: Condition }).cond.values });
  const setValue = (v: string) => {
    const c = (shown as { cond: Condition }).cond;
    update({ ...c, values: arity(c.op) === "many" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [v] });
  };
  const valueText = (c: Condition) => (arity(c.op) === "many" ? c.values.join(", ") : c.values[0] ?? "");
  const enterCommits = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); } };
  function asExpression() {
    const c = "cond" in shown ? (complete(shown.cond) ? write(shown.cond, type) : "") : shown.text;
    shown = { text: c };
  }
</script>

<div class="cond">
  {#if "cond" in shown}
    {@const c = shown.cond}
    <Picker label="Property" value={c.prop} options={propOptions} onchange={pickProp} />
    <Picker label="Operator" value={c.op} options={opOptions} onchange={pickOp} />
    {#if arity(c.op) !== 0}
      {#if type === "date" && arity(c.op) === 1}
        <input class="val" type="date" aria-label="Value" value={/^\d{4}-\d{2}-\d{2}/.exec(valueText(c))?.[0] ?? ""} onchange={(e) => setValue(e.currentTarget.value)} onkeydown={enterCommits} />
      {:else}
        <input class="val" type={type === "number" ? "number" : "text"} step="any" aria-label="Value" spellcheck="false"
          placeholder={arity(c.op) === "many" ? "a, b, c" : type === "tags" ? "tag" : type === "folder" ? "folder/path" : "value"}
          value={valueText(c)} onchange={(e) => setValue(e.currentTarget.value)} onkeydown={enterCommits} />
      {/if}
    {:else}
      <span class="val none"></span>
    {/if}
    <button type="button" class="icon-btn more" title="Edit as an expression" aria-label="Edit as an expression" onclick={asExpression}><Icon name="code" size={12} /></button>
  {:else}
    <input class="val expr" aria-label="Expression" spellcheck="false" placeholder={'status == "done"'} value={shown.text}
      onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) { last = v; shown = read(v) ? { cond: read(v)! } : { text: v }; onchange(v); } }} onkeydown={enterCommits} />
  {/if}
  <button type="button" class="icon-btn" title="Remove this filter" aria-label="Remove this filter" onclick={onremove}><Icon name="close" size={12} /></button>
</div>

<style>
  .cond { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .cond > :global(.picker) { flex: 0 1 auto; max-width: 38%; }
  .val { flex: 1 1 80px; min-width: 60px; height: 26px; padding: 0 7px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; }
  .val:focus { outline: none; border-color: var(--accent); }
  .val.none { border: 0; background: none; }
  .val.expr { font-family: var(--font-mono); font-size: .92em; }
  input[type="date"] { color-scheme: light dark; }
  .icon-btn { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text); }
  .more { opacity: .7; }
</style>
