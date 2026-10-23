<script lang="ts" module>
  import { api } from "../../lib/api";
  // workspace paths for file / folder pickers: fetched once per Settings visit
  let paths: Promise<{ files: string[]; folders: string[] }> | null = null;
  export function workspacePaths(): Promise<{ files: string[]; folders: string[] }> {
    return (paths ??= api.files().then((files) => {
      const folders = new Set<string>();
      for (const f of files) { const parts = f.split("/"); for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/")); }
      return { files, folders: [...folders].sort() };
    }, () => ({ files: [], folders: [] })));
  }
  export const forgetPaths = () => { paths = null; };
</script>

<script lang="ts">
  // One setting: label + description on the left, a control chosen from the field's shape on the
  // right (switch, segmented choice, slider, colour, path picker, list), a "modified · reset" mark.
  import Select from "../Select.svelte";
  import Icon from "../Icon.svelte";
  import { settings } from "../../lib/settings.svelte";
  import { options, plain, valueOf, defaultOf, isModified, setValue, resetValue, resolve, type Schema } from "../../lib/settings-schema";
  import { errText } from "../../lib/text";
  import { human, fieldLabel, stringKind } from "../../lib/settings-pages";

  let { path, schema: s }: { path: string; schema: Schema } = $props();

  const label = $derived(fieldLabel(path));
  const opts = $derived(options(s));
  const v = $derived(valueOf(path));
  const modified = $derived(isModified(path));
  const kind = $derived(s.type === "string" ? stringKind(path) : "plain");
  const sug = $derived(settings.suggestions[path] ?? []);
  let custom = $state(false);
  let picks = $state<string[]>([]);
  let listError = $state("");
  const listId = $derived(`dl-${path.replace(/\W/g, "-")}`);

  $effect(() => {
    if (kind !== "folder" && kind !== "file") return;
    void workspacePaths().then((p) => { picks = (kind === "folder" ? p.folders : p.files).slice(0, 4000); });
  });

  // dragging a slider saves at most every 150 ms (each save rewrites config.toml)
  let slideT: ReturnType<typeof setTimeout> | undefined;
  const slide = (n: number) => { clearTimeout(slideT); slideT = setTimeout(() => void setValue(path, n), 150); };
  const num = (x: string) => { const n = Number(x); return Number.isFinite(n) ? (s.type === "integer" ? Math.round(n) : n) : null; };
  const shownDefault = $derived.by(() => {
    const d = defaultOf(path);
    if (Array.isArray(d)) return d.length ? d.join(", ") : "empty";
    if (d === "" || d === null || d === undefined) return "empty";
    if (typeof d === "boolean") return d ? "on" : "off";
    return String(d);
  });
</script>

<div class="row" class:modified class:stacked={s.type === "array" && !!s.items && resolve(s.items).type === "object"} data-path={path}>
  <div class="label">
    <label for={path}>{label}</label>
    {#if s.description}<p>{plain(s.description)}</p>{/if}
    {#if modified}
      <button class="reset" onclick={() => resetValue(path)} title="Default: {shownDefault}">modified · reset to {shownDefault}</button>
    {/if}
  </div>
  <div class="control">
    {#if s.type === "boolean"}
      <button id={path} class="switch" class:on={v === true} role="switch" aria-checked={v === true} aria-label={label} onclick={() => setValue(path, !v)}><span></span></button>
    {:else if opts && opts.length <= 4}
      <div class="seg" role="radiogroup" id={path} aria-label={label}>
        {#each opts as o (o.value)}
          <button role="radio" aria-checked={v === o.value} class:on={v === o.value} title={o.note ? plain(o.note) : undefined} onclick={() => setValue(path, o.value)}>{human(o.value)}</button>
        {/each}
      </div>
    {:else if opts}
      <Select id={path} value={String(v)} onchange={(x) => setValue(path, x)}
        options={opts.map((o) => ({ value: o.value, label: human(o.value), note: o.note ? plain(o.note) : undefined }))} />
    {:else if s.type === "integer" || s.type === "number"}
      <div class="range">
        {#if s.minimum !== undefined && s.maximum !== undefined}
          <input type="range" min={s.minimum} max={s.maximum} step={s.type === "integer" ? 1 : 0.02} value={v as number} aria-label="{label} slider"
            oninput={(e) => { const n = num(e.currentTarget.value); if (n !== null) slide(n); }} />
        {/if}
        <input id={path} type="number" value={v as number} min={s.minimum} max={s.maximum} step={s.type === "integer" ? 1 : 0.02}
          onchange={(e) => { const n = num(e.currentTarget.value); if (n !== null) void setValue(path, n); }} />
      </div>
    {:else if s.type === "array" && s.items && resolve(s.items).type === "object"}
      <!-- a list of records (template rules…): one JSON object per line, checked before it is saved -->
      <textarea id={path} rows={Math.min(8, Math.max(3, ((v as unknown[]) ?? []).length + 1))} spellcheck="false" class="records"
        onchange={(e) => {
          try { void setValue(path, e.currentTarget.value.split("\n").map((x) => x.trim()).filter(Boolean).map((x) => JSON.parse(x))); listError = ""; }
          catch (err) { listError = `Not saved: ${errText(err)}`; }
        }}>{((v as unknown[]) ?? []).map((x) => JSON.stringify(x, (_k, val) => (val === null ? undefined : val))).join("\n")}</textarea>
      <span class="hint">{listError || `one per line, as {${Object.keys(resolve(s.items).properties ?? {}).map((k) => `"${k}": …`).join(", ")}}`}</span>
    {:else if s.type === "array"}
      <textarea id={path} rows={Math.min(8, Math.max(3, ((v as string[]) ?? []).length))} spellcheck="false"
        onchange={(e) => setValue(path, e.currentTarget.value.split("\n").map((x) => x.trim()).filter(Boolean))}>{((v as string[]) ?? []).join("\n")}</textarea>
      <span class="hint">one per line</span>
    {:else if kind === "colour"}
      <div class="colour">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : "#8aa4ff"} aria-label="{label} picker"
          onchange={(e) => setValue(path, e.currentTarget.value)} />
        <input id={path} type="text" class="short" value={(v as string) ?? ""} placeholder="theme's" spellcheck="false" onchange={(e) => setValue(path, e.currentTarget.value.trim())} />
        {#if v}<button class="icon-btn" title="Use the theme's colour" aria-label="Clear {label}" onclick={() => setValue(path, "")}><Icon name="close" size={12} /></button>{/if}
      </div>
    {:else if sug.length}
      <!-- detected choices, plus the current value even when undetected (bundled fonts), and Default for "" -->
      {@const choices = [
        ...(defaultOf(path) === "" || v === "" ? [{ value: "", label: "Default" }] : []),
        ...(v && !sug.some((o) => o.value === v) ? [{ value: String(v), label: `${v} (current)` }] : []),
        ...sug.map((o) => ({ value: o.value, label: o.label })),
      ].filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i)}<!-- a value detected twice (or "" both as Default and detected) broke the list -->
      <Select id={path} value={custom ? "\u0000custom" : String(v ?? "")}
        onchange={(x) => { if (x === "\u0000custom") custom = true; else { custom = false; void setValue(path, x); } }}
        options={[...choices, { value: "\u0000custom", label: "Type a value…" }]} />
      {#if custom}
        <input type="text" value={(v as string) ?? ""} spellcheck="false" placeholder="type a value" aria-label="{label} (custom)"
          onchange={(e) => { custom = false; void setValue(path, e.currentTarget.value.trim()); }} />
      {/if}
      <span class="hint">{sug.length} detected</span>
    {:else}
      <input id={path} type="text" value={(v as string) ?? ""} spellcheck="false" list={picks.length ? listId : undefined}
        placeholder={kind === "folder" ? "a folder in the workspace" : kind === "file" ? "a file in the workspace" : defaultOf(path) === "" ? "default" : ""}
        onchange={(e) => setValue(path, e.currentTarget.value)} />
      {#if picks.length}
        <datalist id={listId}>{#each picks as p (p)}<option value={p}></option>{/each}</datalist>
        <span class="hint">{kind === "folder" ? "pick or type a folder" : "pick or type a file"}</span>
      {/if}
    {/if}
  </div>
</div>

<style>
  .row { display: flex; gap: 24px; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border); }
  /* a list of records needs the row's width: its control goes under the description */
  .row.stacked { flex-direction: column; align-items: stretch; gap: 8px; }
  .row.modified { box-shadow: inset 2px 0 0 var(--accent); padding-left: 10px; margin-left: -12px; }
  .label { min-width: 0; }
  .label label { font-weight: 500; color: var(--text); }
  .label p { margin: 2px 0 0; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .reset { margin-top: 3px; padding: 0; color: var(--accent); font-size: calc(11.5px * var(--ui-scale, 1)); }
  .reset:hover { text-decoration: underline; }
  .control { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  input, textarea { font: inherit; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); padding: 5px 9px; }
  input[type="text"] { width: 240px; }
  input.short { width: 100px; font-family: var(--font-mono); }
  .control :global(.select) { width: 240px; }
  input[type="number"] { width: 80px; text-align: right; }
  input[type="range"] { width: 150px; padding: 0; border: 0; background: none; accent-color: var(--accent); }
  input[type="color"] { width: 34px; height: 30px; padding: 2px; cursor: pointer; }
  .range, .colour { display: flex; gap: 8px; align-items: center; }
  textarea { width: 240px; font-family: var(--font-mono); resize: vertical; }
  /* a list of records: one per line, read whole (no wrapping), as wide as the row allows */
  textarea.records { width: 100%; box-sizing: border-box; white-space: pre; overflow-x: auto; font-size: calc(12px * var(--ui-scale, 1)); }
  input:focus, textarea:focus { outline: none; border-color: var(--accent); }
  .hint { color: var(--text-faint); font-size: calc(11px * var(--ui-scale, 1)); }
  .switch { width: 38px; height: 22px; border-radius: 11px; background: var(--border-strong); position: relative; transition: background .15s; }
  .switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--bg); transition: transform .15s; box-shadow: 0 1px 2px rgb(0 0 0 / .25); }
  .switch.on { background: var(--accent); }
  .switch.on span { transform: translateX(16px); }
  .seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; }
  .seg button { padding: 4px 12px; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-muted); border-right: 1px solid var(--border); }
  .seg button:last-child { border-right: 0; }
  .seg button:hover { background: var(--bg-hover); color: var(--text); }
  .seg button.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  /* a phone: the words get the width; a control that does not fit beside them (a choice, a list, a text) goes under
     them, a switch stays at the right — by size, not by kind */
  :global(html.phone) .row { flex-wrap: wrap; gap: 10px 16px; }
  :global(html.phone) .label { flex: 1 1 60%; }
  :global(html.phone) .control { align-items: flex-start; max-width: 100%; }
  :global(html.phone) .control :global(.select), :global(html.phone) .control :global(input:not([type="checkbox"]):not([type="color"]):not([type="range"])) { width: 100%; max-width: calc(100vw - 32px); }
  :global(html.phone) .seg button { padding: 8px 14px; }
  .icon-btn { display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .icon-btn:hover { background: var(--bg-active); color: var(--text); }
</style>
