<script lang="ts">
  // Workspace search (/api/search): filename hits + ripgrep line hits; Enter/click opens at line.
  // Replace (VS Code): the hits preview the change; files can be left out; one confirm, then disk.
  import { errText, escapeHtml, escapeRegExp } from "../lib/text";
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { besides, titledNotes, type Titled } from "../lib/titled-notes";
  import { Newest } from "../lib/newest";
  import { openPath } from "../lib/dock";
  import { fileIcon } from "../lib/panes";
  import { shownName, shownPath } from "../lib/paths";
  import type { SearchResult } from "../lib/types";
  import type { PluginHits } from "../lib/gen/PluginHits";
  import type { PluginHit } from "../lib/gen/PluginHit";
  import type { PaneProps } from "../lib/dock";
  import Icon from "../components/Icon.svelte";
  import InputDialog from "../components/InputDialog.svelte";
  import { editors, paneFocus, searchRequest } from "../lib/registry";
  import { toast } from "../lib/state.svelte";
  import { openWeb } from "../lib/web-links";
  import { copy, partMenu } from "../lib/app-menu";

  let { spec, panel }: PaneProps<"search"> = $props();
  // svelte-ignore state_referenced_locally -- a pane's spec is fixed for its lifetime
  let q = $state(spec.q ?? "");
  let res = $state<SearchResult | null>(null);
  /** what the plugins found (mail…): their own groups, after the files' */
  let others = $state<PluginHits[]>([]);
  let titles = $state(new Map<string, string>()); // a file found by its title → that title
  let busy = $state(false);
  let error = $state("");
  let input: HTMLInputElement;
  let sel = $state(0);

  /** A row the keys move over: a file (at a line), or a plugin's hit (opened by its tool). */
  type Row = { path: string; line?: number; text?: string; plugin?: string; hit?: PluginHit };
  // a page at a time: the names, then the files whose text matches (each with its first lines); "Show more" adds a page
  const PAGE = 50;
  let nFiles = $state(PAGE);
  let nGroups = $state(PAGE);
  const shownFiles = $derived(res ? res.files.slice(0, nFiles) : []);
  const allGroups = $derived.by(() => {
    const m = new Map<string, { line: number; text: string }[]>();
    for (const l of res?.lines ?? []) {
      if (!m.has(l.path)) m.set(l.path, []);
      m.get(l.path)!.push({ line: l.line, text: l.text });
    }
    return m;
  });
  /** The shown groups, each line with its place in the keyboard's order (after the shown names). */
  const grouped = $derived.by(() => {
    const m = new Map<string, { line: number; text: string; idx: number }[]>();
    let idx = shownFiles.length;
    for (const [path, hits] of [...allGroups].slice(0, nGroups)) m.set(path, hits.map((h) => ({ ...h, idx: idx++ })));
    return m;
  });
  const fileRows = $derived<Row[]>([...shownFiles.map((path) => ({ path })), ...[...grouped].flatMap(([path, hits]) => hits.map((h) => ({ path, line: h.line, text: h.text })))]);
  /** the plugins' hits come after the files', numbered on from them */
  const rows = $derived<Row[]>([...fileRows, ...others.flatMap((g) => g.hits.map((hit) => ({ path: "", plugin: g.plugin, hit })))]);
  const pluginIdx = (g: number, i: number) => fileRows.length + others.slice(0, g).reduce((n, x) => n + x.hits.length, 0) + i;
  /** Matching lines in a file, all of them (the list shows the first few). */
  const countOf = (path: string) => res?.counts?.[path] ?? allGroups.get(path)?.length ?? 0;

  // line-search options (VS Code's Aa / ab / .*); read in the effect, so a toggle re-runs the search
  // `pdf`: only the text of the vault's PDFs (the core's pdf_text cache); without it their hits follow the files'.
  // `all`: every text file's lines, not only the notes' (code, logs, a run's outputs) — off: they are most of a vault's
  // bytes and few of its answers
  let opts = $state({ case: false, word: false, regex: false, agent: false, pdf: false, all: false });
  const searches = new Newest(180);
  /** This pane's lane: its newer search stops the core reading files for the one before (search.rs `Turn`). */
  const lane = `search-${Math.random().toString(36).slice(2, 10)}`;
  let rerun = $state(0); // bumped after a replace: same query, new results
  $effect(() => {
    void rerun;
    const o = { ...opts };
    const query = q.trim();
    others = [];
    if (!query) { searches.stop(); res = null; busy = false; return; } // a search still answering is now stale
    searches.run(async (still) => {
      busy = true;
      // the plugins asked beside the files (the core waits for each at most a second and a half): their groups when they come
      if (!o.pdf && !o.regex) void api.searchPlugins(query).then((r) => { if (still()) others = r; }, () => {});
      // notes found by their title: after the names, one list for the keys
      const show = (r: SearchResult, all: Titled[]) => {
        const t = besides(all, r.files);
        titles = new Map(t.map((x) => [x.path, x.title]));
        // a note whose title is the query, or starts with it, leads: before names that only contain it
        const want = query.toLowerCase();
        const lead = (x: Titled) => x.title.toLowerCase() === want ? 0 : x.title.toLowerCase().startsWith(want) ? 1 : 2;
        const first = t.filter((x) => lead(x) < 2).sort((a, b) => lead(a) - lead(b)).map((x) => x.path);
        res = { ...r, files: [...first, ...r.files, ...t.filter((x) => lead(x) === 2).map((x) => x.path)] };
        sel = 0;
        nFiles = nGroups = PAGE;
      };
      try {
        // the names and titles first (no file read: a tenth of a second), then the lines once the files are read
        let read = false;
        const titled = o.pdf ? Promise.resolve([]) : titledNotes(query);
        const full = api.search(query, { ...o, lane }).then((r) => ((read = true), r));
        if (!o.pdf) void Promise.all([api.search(query, { ...o, names: true }), titled]).then(([n, all]) => { if (still() && !read) show(n, all); }, () => {});
        const [r, all] = await Promise.all([full, titled]);
        if (still()) { show(r, all); error = ""; }
      } catch (err) {
        if (still()) error = errText(err);
      } finally {
        if (still()) busy = false;
      }
    });
    return () => searches.stop();
  });

  /** A plugin's hit opened by its own tool (the Email pane shows the message). */
  function openHit(plugin: string, h: PluginHit) {
    if (h.url) return void openWeb(h.url); // a server's page (Kiwix's article): as any web link
    api.pluginTool(plugin, h.open.tool, h.open.args).catch((e) => toast(errText(e)));
  }
  const shortDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(+d) ? "" : d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
  };

  const esc = escapeHtml;
  /** The server's match rules in JS (literal / whole word / smart case / regex), for highlighting
   *  and the replace preview; null when the pattern is not valid JS (the hit is shown plain). */
  const matcher = $derived.by(() => {
    const query = q.trim();
    if (!query) return null;
    let src = opts.regex ? query : escapeRegExp(query);
    if (opts.word) src = `\\b(?:${src})\\b`;
    // smart case as the core's (search.rs smart_insensitive): in a regex, `\S`, `\p{Greek}`, a group's name are not capitals
    const literal = opts.regex ? query.replace(/\\[pP](\{[^}]*\}|.)|\\.|\(\?P?<[^>]*>/gsu, "") : query;
    const insensitive = !opts.case && !/\p{Lu}/u.test(literal);
    try { return new RegExp(src, insensitive ? "gi" : "g"); } catch { return null; }
  });
  /** What a match becomes: the replacement as typed, or (regex) with its groups filled in —
   *  Rust's `${name}` / `${1}` written the JS way for the preview. */
  function preview(m: string, re: RegExp): string {
    if (!opts.regex) return withText;
    const js = withText.replace(/\$\{(\d+)\}/g, "$$$1").replace(/\$\{(\w+)\}/g, "$$<$1>");
    return m.replace(new RegExp(re.source, re.flags.replace("g", "")), js);
  }
  function mark(text: string): string {
    const re = matcher;
    const hits = re ? [...text.matchAll(re)].filter((x) => x[0]) : [];
    if (!re || !hits.length) return esc(text.trim());
    const start = Math.max(0, hits[0].index! - 40);
    let out = start > 0 ? "…" : "", last = start;
    for (const x of hits) {
      out += esc(text.slice(last, x.index!)).replace(last === start ? /^\s+/ : /$^/, "");
      out += replacing ? `<mark class="old">${esc(x[0])}</mark><span class="new">${esc(preview(x[0], re))}</span>` : `<mark>${esc(x[0])}</mark>`;
      last = x.index! + x[0].length;
    }
    return out + esc(text.slice(last));
  }

  // --- replace ---------------------------------------------------------------------------------
  let replacing = $state(false);
  let withText = $state("");
  let excluded = $state<Set<string>>(new Set());
  let confirming = $state(false);
  let replaceInput = $state<HTMLInputElement>();
  const included = $derived([...allGroups.keys()].filter((p) => !excluded.has(p)));
  const includedHits = $derived(included.reduce((n, p) => n + countOf(p), 0));
  const capped = $derived(allGroups.size >= 500); // search.rs MAX_FILES: there may be more files than listed
  function toggleReplace(on = !replacing) {
    replacing = on;
    // with nothing searched yet, the search comes first
    if (on) requestAnimationFrame(() => (q.trim() ? replaceInput : input)?.focus());
  }
  function exclude(path: string) {
    const next = new Set(excluded);
    if (!next.delete(path)) next.add(path);
    excluded = next;
  }
  async function replaceAll() {
    confirming = false;
    // unsaved editor text first, so the files on disk are the ones the user sees
    await Promise.all([...editors.values()].map((e) => e.flush().catch(() => {})));
    try {
      const r = await api.replace({ q: q.trim(), with: withText, ...opts, only: excluded.size ? included : undefined });
      toast("Replaced", `${r.replacements} match${r.replacements === 1 ? "" : "es"} in ${r.files.length} file${r.files.length === 1 ? "" : "s"}`, "success");
      excluded = new Set();
      rerun++;
    } catch (e) {
      toast("Replace failed", errText(e), "error");
    }
  }

  // opening a result is what makes a search "used" (typing alone is not journaled)
  /** A text hit's right-click: its line copied, its file kept out of (or back in) the replace, then its file's rows at the line. */
  function hitMenu(e: MouseEvent, path: string, line: number, text: string) {
    const out = excluded.has(path);
    partMenu(e, [
      { label: "Copy the line", icon: "copy", run: () => void copy(text.trim()) },
      ...(replacing ? [{ label: out ? "Include in the replace" : "Leave out of the replace", icon: (out ? "plus" : "close") as "plus" | "close", run: () => exclude(path) }] : []),
    ], path, undefined, line);
  }
  function go(r: Row) {
    if (r.plugin && r.hit) return openHit(r.plugin, r.hit);
    if (q.trim()) api.usage({ kind: "search", q: q.trim() });
    openPath(r.path, r.line);
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); scrollSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); scrollSel(); }
    else if (e.key === "Enter" && rows[sel]) { e.preventDefault(); go(rows[sel]); }
  }
  function scrollSel() { requestAnimationFrame(() => document.querySelector(`.search-pane [data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" })); }

  onMount(() => {
    input?.focus(); // now: keys typed right after Ctrl+Shift+F belong here
    if (document.activeElement !== input) requestAnimationFrame(() => input?.focus());
    const onReplace = () => {
      if (searchRequest.q) { q = searchRequest.q; searchRequest.q = undefined; }
      if (searchRequest.replace) { searchRequest.replace = false; toggleReplace(true); }
    };
    onReplace();
    window.addEventListener("atlas-search-replace", onReplace);
    // re-activated (Ctrl+Shift+F again, a click on the tab): the old query selected, so typing
    // replaces it. open() calls this synchronously; a later select() would eat typed letters.
    paneFocus.set(panel.id, () => input?.select());
    return () => { paneFocus.delete(panel.id); window.removeEventListener("atlas-search-replace", onReplace); };
  });
</script>

<div class="side-pane search-pane">
  <div class="search-box">
    <button class="opt toggle" class:on={replacing} aria-pressed={replacing} disabled={opts.pdf} title={opts.pdf ? "Replace works on the files, not the PDFs' text" : "Replace in files (Ctrl+Shift+H)"} aria-label="Toggle replace" onclick={() => toggleReplace()}><Icon name="chevron" size={12} /></button>
    <input bind:this={input} bind:value={q} {onkeydown} placeholder={opts.pdf ? "Search only the PDFs' text…" : "Search…"} spellcheck="false" aria-label="Search" />
    {#if busy}<span class="spin"></span>{/if}
    <span class="opts">
      <button class="opt" class:on={opts.case} aria-pressed={opts.case} title="Match case" aria-label="Match case" onclick={() => (opts.case = !opts.case)}>Aa</button>
      <button class="opt" class:on={opts.word} aria-pressed={opts.word} title="Whole word" aria-label="Whole word" onclick={() => (opts.word = !opts.word)}><u>ab</u></button>
      <button class="opt" class:on={opts.regex} aria-pressed={opts.regex} title="Regular expression" aria-label="Regular expression" onclick={() => (opts.regex = !opts.regex)}>.*</button>
      <button class="opt pdf" class:on={opts.pdf} aria-pressed={opts.pdf} title="Only the PDFs' text (papers, books, slides): their hits come after the notes' anyway" aria-label="Only the PDFs' text" onclick={() => { opts.pdf = !opts.pdf; if (opts.pdf) toggleReplace(false); }}>PDF</button>
      <button class="opt" class:on={opts.all} aria-pressed={opts.all} disabled={opts.pdf} title="Also the lines of every other text file — code, logs, a run's outputs, data. Off: the notes' and the PDFs' only (any file still matches by its name)" aria-label="All files' text" onclick={() => (opts.all = !opts.all)}>All</button>
      <button class="opt" class:on={opts.agent} aria-pressed={opts.agent} title="Also search the agent's own files (Claude's memory, session logs, instructions) — left out by default" aria-label="Include the agent's files" onclick={() => (opts.agent = !opts.agent)}><Icon name="claude" size={12} /></button>
    </span>
  </div>
  {#if replacing}
    <div class="replace-box">
      <input bind:this={replaceInput} bind:value={withText} placeholder="Replace" spellcheck="false" aria-label="Replace with"
        onkeydown={(e) => { if (e.key === "Enter" && includedHits) { e.preventDefault(); confirming = true; } }} />
      <button class="btn" disabled={!includedHits} onclick={() => (confirming = true)} title="Replace every match in the ticked files">Replace all</button>
    </div>
    {#if opts.regex}<p class="faint small hint">Use <code>$1</code>, <code>${"{"}name{"}"}</code> for groups.</p>{/if}
  {/if}
  <div class="scroll results">
    {#if error}<p class="faint small pad">{error}</p>{/if}
    {#if res}
      {#if res.files.length}
        <div class="group-label">Files <span class="n">{res.files.length}</span></div>
        {#each shownFiles as f, i (f)}
          <button class="hit file-hit" class:sel={sel === i} data-idx={i} data-path={f} onclick={() => go({ path: f })} onmouseenter={() => (sel = i)}>
            <Icon name={fileIcon(f)} size={14} />{#if titles.has(f)}<span class="fname">{titles.get(f)}</span><span class="fdir">{shownName(f)}</span>{:else}<span class="fname">{shownName(f)}</span><span class="fdir">{f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ""}</span>{/if}
          </button>
        {/each}
        {#if res.files.length > nFiles}<button class="more" onclick={() => (nFiles += PAGE)}>Show {Math.min(PAGE, res.files.length - nFiles)} more of {res.files.length - nFiles}</button>{/if}
      {/if}
      {#if res.lines.length}
        <div class="group-label">In the text <span class="n">{allGroups.size}{capped ? "+" : ""} file{allGroups.size === 1 ? "" : "s"}</span></div>
        {#each [...grouped] as [path, hits] (path)}
          <div class="hit-file" class:out={replacing && excluded.has(path)}>
            <Icon name={fileIcon(path)} size={13} /> <span class="p">{shownPath(path)}</span>
            {#if countOf(path) > hits.length}<button class="count" onclick={() => go({ path, line: hits[0]?.line })} title="Open it at the first match">{countOf(path)} matches</button>{/if}
            {#if replacing}<button class="icon-btn keep" onclick={() => exclude(path)} title={excluded.has(path) ? "Include in the replace" : "Leave this file out of the replace"}
              aria-label="{excluded.has(path) ? 'Include' : 'Exclude'} {path}"><Icon name={excluded.has(path) ? "plus" : "close"} size={12} /></button>{/if}
          </div>
          {#each hits as h (h.idx)}
            <button class="hit line-hit" class:sel={sel === h.idx} data-idx={h.idx} data-path={path} data-line={h.line} onclick={() => go({ path, line: h.line })} oncontextmenu={(e) => hitMenu(e, path, h.line, h.text)} onmouseenter={() => (sel = h.idx)}>
              <span class="ln">{h.line}</span><span class="txt">{@html mark(h.text)}</span>
            </button>
          {/each}
        {/each}
        {#if allGroups.size > nGroups}<button class="more" onclick={() => (nGroups += PAGE)}>Show {Math.min(PAGE, allGroups.size - nGroups)} more files of {allGroups.size - nGroups}</button>{/if}
      {/if}
      {#each others as g, gi (g.plugin)}
        <div class="group-label">{g.name} <span class="n">{g.hits.length}</span></div>
        {#each g.hits as h, i (i)}
          <button class="hit plugin-hit" class:sel={sel === pluginIdx(gi, i)} data-idx={pluginIdx(gi, i)} onclick={() => openHit(g.plugin, h)} onmouseenter={() => (sel = pluginIdx(gi, i))} title={h.detail ?? ""}>
            <span class="fname">{h.title || "(no subject)"}</span>{#if h.date}<span class="fdir">{shortDate(h.date)}</span>{/if}
            {#if h.detail}<span class="detail">{h.detail}</span>{/if}
          </button>
        {/each}
      {/each}
      <!-- an empty result says what to try next: the switches that narrowed it, else fewer words -->
      {#if !busy && !res.files.length && !res.lines.length && !others.length}<p class="faint small pad">{opts.pdf ? "No PDF has" : "No file has"} “{q}”. {opts.case || opts.word || opts.regex
        ? `Try with ${[opts.case && "Match case", opts.word && "Whole word", opts.regex && "Regular expression"].filter(Boolean).join(", ")} off.`
        : opts.all || opts.pdf ? "Try fewer or shorter words." : "Try fewer or shorter words — or All, for code, logs and data too."}</p>{/if}
    {:else}
      <p class="faint small pad">{opts.pdf ? "Type to search the text of every PDF: each hit opens its page." : "Type to search the names and the text of every file, the PDFs' included."}<span class="keys-only keys-line"><kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to open</span></p>
    {/if}
  </div>
</div>

{#if confirming}
  <InputDialog title="Replace {includedHits}{capped ? '+' : ''} match{includedHits === 1 ? '' : 'es'} in {included.length}{capped && !excluded.size ? '+' : ''} file{included.length === 1 ? '' : 's'}?"
    hint="“{q.trim()}” → “{withText}”. Files are rewritten on disk; git can undo it." confirm="Replace all"
    onsubmit={() => void replaceAll()} oncancel={() => (confirming = false)} />
{/if}

<style>
  /* the field keeps room to type: in a narrow panel the options go to a second line (they took the whole row, the
     field shrank to nothing) */
  .search-box { display: flex; flex-wrap: wrap; align-items: center; column-gap: 8px; row-gap: 0; margin: 10px 10px 6px; padding: 2px 10px; min-height: 32px; box-sizing: border-box; border-radius: var(--radius);
    background: var(--bg-elev); border: 1px solid var(--border-strong); color: var(--text-faint); transition: border-color .15s, box-shadow .15s; }
  .search-box:focus-within { border-color: color-mix(in srgb, var(--accent) 55%, transparent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .search-box input { flex: 1 1 8em; min-width: 0; min-height: 26px; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: calc(13px * var(--ui-scale, 1)); }
  .keys-line { display: block; margin-top: 4px; }
  .opts { display: inline-flex; flex-wrap: wrap; gap: 2px; margin-left: auto; }
  .opt { font-family: var(--font-mono); font-size: calc(11.5px * var(--ui-scale, 1)); min-height: 24px; padding: 1px 5px; border-radius: 4px; color: var(--text-muted); border: 1px solid transparent; }
  :global(html.phone) .opt { min-width: 36px; min-height: 36px; font-size: 14px; }
  .opt:hover { color: var(--text); background: var(--bg-hover); }
  .opt.on { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
  .opt.pdf { font-size: calc(10px * var(--ui-scale, 1)); letter-spacing: 0.02em; }
  .opt:disabled { opacity: 0.4; pointer-events: none; }
  .results { flex: 1; min-height: 0; overflow: auto; padding: 0 6px 16px; }
  .group-label { font-size: calc(11px * var(--ui-scale, 1)); text-transform: uppercase; letter-spacing: .07em; color: var(--text-faint); padding: 12px 8px 4px; font-weight: 600; }
  .n { font-weight: 500; margin-left: 4px; }
  .hit { display: flex; align-items: baseline; gap: 8px; width: 100%; text-align: left; padding: 4px 8px; border-radius: var(--radius-sm); color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .hit.sel { background: var(--bg-active); color: var(--text); }
  .file-hit { align-items: center; }
  .plugin-hit { flex-wrap: wrap; align-items: baseline; column-gap: 8px; }
  .plugin-hit .detail { flex-basis: 100%; min-width: 0; color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* a long name ends in an ellipsis at the panel's edge; its folder gives way first */
  .fname { color: var(--text); white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; }
  .fdir { flex: 0 100 auto; min-width: 0; }
  .fdir { color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hit-file { display: flex; align-items: center; gap: 6px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text); padding: 8px 8px 2px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line-hit { padding-left: 14px; }
  .ln { color: var(--text-faint); font-family: var(--font-mono); font-size: calc(11px * var(--ui-scale, 1)); min-width: 28px; text-align: right; flex: none; }
  .txt { font-family: var(--font-mono); font-size: calc(11.8px * var(--ui-scale, 1)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txt :global(mark) { background: color-mix(in srgb, var(--yellow) 30%, transparent); color: var(--heading); border-radius: 2px; padding: 0 1px; }
  .pad { padding: 10px 10px; line-height: 1.6; }
  .toggle { margin-left: -6px; display: inline-flex; align-items: center; justify-content: center; min-width: 24px; padding: 2px; transition: transform .15s; }
  .toggle.on { transform: rotate(90deg); }
  .replace-box { display: flex; gap: 6px; margin: 0 10px 6px; }
  .replace-box input { flex: 1; min-width: 0; height: 30px; padding: 0 10px; border-radius: var(--radius); background: var(--bg-elev); border: 1px solid var(--border-strong); color: var(--text); font: inherit; font-size: calc(13px * var(--ui-scale, 1)); outline: 0; }
  .replace-box input:focus { border-color: color-mix(in srgb, var(--accent) 55%, transparent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .hint { margin: 0 12px 6px; }
  .hit-file .p { overflow: hidden; text-overflow: ellipsis; }
  .hit-file .keep { margin-left: auto; opacity: .7; }
  .hit-file .count { margin-left: auto; flex: none; font-weight: 400; font-size: calc(11px * var(--ui-scale, 1)); color: var(--text-faint); }
  .hit-file .count:hover { color: var(--text); }
  .hit-file .count + .keep { margin-left: 4px; }
  .more { display: block; margin: 6px 8px 2px; padding: 3px 8px; border-radius: var(--radius-sm); color: var(--accent); font-size: calc(12px * var(--ui-scale, 1)); }
  .more:hover { background: var(--bg-hover); }
  .hit-file.out { opacity: .45; text-decoration: line-through; }
  .txt :global(mark.old) { text-decoration: line-through; background: color-mix(in srgb, var(--red) 25%, transparent); }
  .txt :global(.new) { background: color-mix(in srgb, var(--green) 25%, transparent); color: var(--heading); border-radius: 2px; padding: 0 1px; }
  /* a phone (docs/guides/MOBILE.md, "Files and Search on a phone"): a large field, no replace or expert switches, results
     as finger-sized rows whose words wrap; sizes follow --ui-scale, so the Boox's larger e-ink scale applies too */
  :global(html.phone) .search-box { height: calc(48px * var(--ui-scale, 1)); margin: 12px 12px 8px; border-radius: 24px; padding: 0 16px; }
  :global(html.phone) .search-box input { font-size: max(16px, calc(15px * var(--ui-scale, 1))); height: 100%; } /* 16 px: no browser zoom; the whole pill is the field */
  :global(html.phone) .toggle, :global(html.phone) .opts { display: none; }
  :global(html.phone) .search-box input:focus-visible { outline: none; } /* the pill shows the focus; no box inside it (e-ink drew one) */
  :global(html.phone) .results { padding: 0 8px 96px; }
  :global(html.phone) .group-label { font-size: calc(12px * var(--ui-scale, 1)); padding: 16px 10px 6px; }
  :global(html.phone) .file-hit { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; min-height: calc(56px * var(--ui-scale, 1)); padding: 6px 10px; border-radius: 12px; }
  /* every part placed: the icon is Icon's <span class="icon">, not the svg, so `svg { grid-row }` missed it and the
     folder fell under the icon, widening that column per row (seen on the Boox, 2026-10-17) */
  :global(html.phone) .file-hit :global(.icon) { grid-column: 1; grid-row: 1 / span 2; align-self: center; width: calc(20px * var(--ui-scale, 1)) !important; height: calc(20px * var(--ui-scale, 1)) !important; }
  :global(html.phone) .file-hit :global(.icon svg) { width: 100%; height: 100%; }
  :global(html.phone) .fname { grid-column: 2; grid-row: 1; min-width: 0; font-size: calc(15.5px * var(--ui-scale, 1)); overflow: hidden; text-overflow: ellipsis; }
  :global(html.phone) .fdir { grid-column: 2; grid-row: 2; min-width: 0; font-size: calc(12.5px * var(--ui-scale, 1)); }
  :global(html.phone) .hit-file { font-size: calc(14px * var(--ui-scale, 1)); padding: 14px 10px 4px; border-top: 1px solid var(--border); }
  :global(html.phone) .line-hit { min-height: calc(44px * var(--ui-scale, 1)); padding: 6px 10px 6px 12px; border-radius: 10px; align-items: flex-start; }
  :global(html.phone) .ln { display: none; }
  :global(html.phone) .txt { font-family: inherit; font-size: calc(14px * var(--ui-scale, 1)); line-height: 1.45; white-space: normal;
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; color: var(--text); }
  :global(html.phone) .hit:active { background: var(--bg-hover); }
  :global(html.phone.eink) .hit.sel { background: none; } /* e-ink: no grey bar left on the last-touched row */
  .spin { width: 10px; height: 10px; border: 1.5px solid var(--text-faint); border-top-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; }
</style>
