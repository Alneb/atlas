<script lang="ts">
  // Unified diff → per-file cards with old/new line numbers. Files collapse; big ones start collapsed.
  // With `hunkActions`, each hunk gets buttons that receive that hunk as a standalone patch.
  import { openPath } from "../lib/dock";
  import Icon from "./Icon.svelte";

  export interface HunkAction { label: string; danger?: boolean; run: (patch: string) => void }
  let { patch, truncated = false, hunkActions = [] }: { patch: string; truncated?: boolean; hunkActions?: HunkAction[] } = $props();

  type Line = { kind: "ctx" | "add" | "del" | "hunk" | "meta"; text: string; a?: number; b?: number; h?: number };
  /** `header` and `hunks` keep the raw text: header + one hunk is a patch `git apply` takes. */
  type FileDiff = { path: string; added: number; removed: number; lines: Line[]; binary: boolean; header: string[]; hunks: string[][] };

  function parse(p: string): FileDiff[] {
    const files: FileDiff[] = [];
    let cur: FileDiff | null = null;
    let a = 0, b = 0;
    for (const raw of p.split("\n")) {
      if (raw.startsWith("diff --git ")) {
        const m = / b\/(.+)$/.exec(raw);
        cur = { path: m ? m[1] : raw.slice(11), added: 0, removed: 0, lines: [], binary: false, header: [raw], hunks: [] };
        files.push(cur);
        continue;
      }
      if (!cur) continue;
      if (raw.startsWith("@@")) cur.hunks.push([raw]);
      else if (cur.hunks.length) cur.hunks[cur.hunks.length - 1].push(raw);
      else cur.header.push(raw);
      if (raw.startsWith("+++ ")) { if (raw !== "+++ /dev/null") cur.path = raw.replace(/^\+\+\+ (b\/)?/, ""); continue; }
      if (raw.startsWith("--- ") || raw.startsWith("index ") || /^(new|deleted) file mode|^similarity|^rename |^old mode|^new mode/.test(raw)) continue;
      if (raw.startsWith("Binary files")) { cur.binary = true; continue; }
      const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
      if (h) { a = +h[1]; b = +h[2]; cur.lines.push({ kind: "hunk", text: h[3].trim(), h: cur.hunks.length - 1 }); continue; }
      if (raw.startsWith("+")) { cur.lines.push({ kind: "add", text: raw.slice(1), b: b++ }); cur.added++; }
      else if (raw.startsWith("-")) { cur.lines.push({ kind: "del", text: raw.slice(1), a: a++ }); cur.removed++; }
      else if (raw.startsWith("\\")) cur.lines.push({ kind: "meta", text: raw.slice(2) });
      else if (raw !== "" || cur.lines.length) cur.lines.push({ kind: "ctx", text: raw.slice(1), a: a++, b: b++ });
    }
    return files;
  }

  const files = $derived(parse(patch));
  // the trailing "" after the patch's last newline belongs to no hunk
  const hunkPatch = (f: FileDiff, i: number) => [...f.header, ...f.hunks[i].filter((l, k, all) => !(k === all.length - 1 && l === ""))].join("\n") + "\n";
  let collapsed = $state<Record<string, boolean>>({});
  const isCollapsed = (f: FileDiff) => collapsed[f.path] ?? f.lines.length > 400;
</script>

{#if !files.length}
  <p class="muted empty">No changes.</p>
{/if}
{#each files as f (f.path)}
  <section class="file">
    <header>
      <button class="toggle" onclick={() => (collapsed[f.path] = !isCollapsed(f))} aria-label="Collapse file">
        <span class="chev" class:closed={isCollapsed(f)}><Icon name="chevron-down" size={14} /></span>
      </button>
      <button class="path" onclick={() => openPath(f.path)} title="Open file">{f.path}</button>
      <span class="stat"><span class="add">+{f.added}</span> <span class="del">−{f.removed}</span></span>
    </header>
    {#if !isCollapsed(f)}
      {#if f.binary}
        <p class="muted pad">Binary file</p>
      {:else}
        <div class="lines">
          {#each f.lines as l}
            {#if l.kind === "hunk"}
              <div class="hunk"><span class="ln"></span><span class="ln"></span><span class="code">{l.text || "···"}</span>
                {#if hunkActions.length && l.h !== undefined}<span class="hunk-acts">{#each hunkActions as act}<button class="btn" class:danger={act.danger} onclick={() => act.run(hunkPatch(f, l.h!))}>{act.label}</button>{/each}</span>{/if}
              </div>
            {:else}
              <div class="l {l.kind}"><span class="ln">{l.a ?? ""}</span><span class="ln">{l.b ?? ""}</span><span class="code"><span class="sign">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>{l.text}</span></div>
            {/if}
          {/each}
        </div>
      {/if}
    {/if}
  </section>
{/each}
{#if truncated}<p class="muted pad">Diff cut at 1 MB.</p>{/if}

<style>
  .empty { padding: 12px 0; }
  .file { border: 1px solid var(--border); border-radius: var(--radius); margin: 0 0 14px; overflow: hidden; background: var(--bg); }
  header { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg-alt); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 1; }
  .toggle { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 5px; color: var(--text-faint); }
  .toggle:hover { background: var(--bg-hover); color: var(--text); }
  .chev { display: grid; transition: transform .12s; }
  .chev.closed { transform: rotate(-90deg); }
  .path { font-family: var(--font-mono); font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path:hover { color: var(--accent); text-decoration: underline; }
  .stat { font-family: var(--font-mono); font-size: calc(12px * var(--ui-scale, 1)); }
  .add { color: var(--green); }
  .del { color: var(--red); }
  .lines { font-family: var(--code-font, var(--font-mono)); font-size: calc(var(--code-size, 13px) * .92); line-height: 1.55; overflow-x: auto; }
  .l, .hunk { display: grid; grid-template-columns: 3.4em 3.4em 1fr; min-width: max-content; }
  .hunk:has(.hunk-acts) { grid-template-columns: 3.4em 3.4em 1fr auto; align-items: center; }
  .hunk-acts { display: inline-flex; gap: 4px; padding: 0 8px; position: sticky; right: 0; }
  .hunk-acts .btn { font-family: var(--font-ui); font-size: calc(11.5px * var(--ui-scale, 1)); padding: 1px 8px; border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); }
  .hunk-acts .btn:hover { background: var(--bg-hover); }
  .hunk-acts .btn.danger:hover { color: var(--red); border-color: var(--red); }
  .ln { color: var(--text-faint); text-align: right; padding: 0 8px 0 0; user-select: none; }
  .code { white-space: pre; padding-right: 16px; }
  .sign { display: inline-block; width: 1.4em; color: var(--text-faint); user-select: none; text-align: center; }
  .l.add { background: color-mix(in srgb, var(--green) 11%, transparent); }
  .l.add .sign { color: var(--green); }
  .l.del { background: color-mix(in srgb, var(--red) 11%, transparent); }
  .l.del .sign { color: var(--red); }
  .l.meta { color: var(--text-faint); font-style: italic; }
  .hunk { color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); padding: 2px 0; font-size: .92em; }
  .pad { padding: 8px 12px; }
</style>
