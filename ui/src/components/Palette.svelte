<script lang="ts">
  import { errText } from "../lib/text";
  import { closable } from "../lib/back";
  import { holdFocus, trapTab } from "../lib/focus-return";
  import { allCommands, loadKeymap } from "../lib/keymap.svelte";
  // Command palette / quick open / URL prompt / generic picker — one fuzzy list, keyboard-first.
  import { tick } from "svelte";
  import { api } from "../lib/api";
  import { besides, titledNotes, type Titled } from "../lib/titled-notes";
  import { Newest } from "../lib/newest";
  import { palette, closePalette, pickChosen, captureText, type PickItem } from "../lib/palette.svelte";
  import { open, openPath, activeEditorId, getDock } from "../lib/dock";
  import { recentFiles } from "../lib/recent";
  import { createNote } from "../lib/notes-system";
  import { editors } from "../lib/registry";
  import { fuzzy, highlightMatch } from "../lib/fuzzy";
  import { chordLabel, superOf } from "../lib/keys";
  import { fileIcon, type IconName } from "../lib/panes";
  import { basename, shownName } from "../lib/paths";
  import { toast } from "../lib/state.svelte";
  import { complete } from "../lib/textarea-complete";
  import { captureHint } from "../lib/capture-hints.svelte";
  import Icon from "./Icon.svelte";
  import CaptureGuides from "./CaptureGuides.svelte";
  import { PROMPT } from "../lib/capture-guides";

  /** `beside`: what Ctrl+Enter does instead (a file opens next to the active tab, not over it). */
  interface Item { key: string; section: string; title: string; /** a file row's file */ path?: string; detail?: string; keys?: string; icon: IconName; score: number; hl: number[]; run: () => void | Promise<void>; beside?: () => void }

  // the text and the highlighted row are the palette's shared state (set by whoever opens it)
  const q = $derived(palette.q);
  const sel = $derived(palette.sel);
  let input = $state<HTMLInputElement>();
  let listEl = $state<HTMLDivElement>();
  // a chooser's choices: given as a list, or loaded — kept with the request they answer, so a new
  // chooser never shows the previous one's
  let loaded = $state.raw<{ req: unknown; list: PickItem[] } | null>(null);
  const picks = $derived.by<PickItem[]>(() => {
    const src = palette.pick?.items;
    return Array.isArray(src) ? src : loaded?.req === palette.pick ? loaded.list : [];
  });
  /** the text the search last finished for, found or failed: the capture row waits for it */
  let answered = $state("");
  let fileHits = $state<string[]>([]);
  let titledHits = $state<Titled[]>([]); // notes found by their title (titled-notes.ts)
  /** the text `fileHits` answers: "nothing matches" is only known once the search for it came back */
  let hitsFor = $state("");
  /** lines of notes holding the words typed: the bar is also the quick search ("In notes") */
  let lineHits = $state<{ path: string; line: number; text: string }[]>([]);
  let busy = $state(false);
  /** Enter typed before the search answered this query (it waits 110 ms, then the core), with nothing to choose yet:
   *  runs the first hit when it comes
   *  (never "Create note": what was about to be found is not made twice). Typing on forgets it. */
  let enterPending = $state<{ q: string; beside: boolean } | null>(null);
  $effect(() => {
    const p = enterPending;
    if (!p || (palette.open && p.q === q && answered !== p.q.trim())) return;
    enterPending = null;
    const first = items[0];
    if (palette.open && p.q === q && first && first.key !== "f:new") choose(first, p.beside);
  });

  const placeholder = $derived(
    palette.mode === "files" ? "Open file by name…" :
    palette.mode === "pick" ? palette.pick?.placeholder ?? "Pick one…" :
    palette.mode === "url" ? "URL to open in a web pane…" :
    palette.mode === "capture" ? PROMPT : "Type a command, a file, or # for headings…",
  );

  $effect(() => { if (palette.open) return closable(closePalette); }); // a phone's Back closes it (lib/back.ts)
  $effect(() => { if (palette.open) return holdFocus(); }); // closed, the focus goes back where it was

  // per open: take the keyboard, refresh what is listed (no state is reset here — see palette.svelte.ts)
  $effect(() => {
    if (!palette.open) return;
    const req = palette.mode === "pick" ? palette.pick : null;
    void tick().then(() => input?.focus());
    if (palette.mode === "all") void loadKeymap().catch(() => {});
    if (req && !Array.isArray(req.items)) req.items().then((list) => (loaded = { req, list }), (err) => toast("Could not list the choices", errText(err), "error"));
  });

  // "super e needs an easy capture mode as well": `+` first in the bar makes it a capture box; Backspace on
  // the empty box goes back to the commands
  $effect(() => {
    if (palette.open && palette.mode === "all" && palette.q.startsWith("+")) { palette.mode = "capture"; palette.q = palette.q.slice(1).trimStart(); }
    // VS Code's habit: `>` first in the file finder (Ctrl+P) turns it into the commands, keeping the `>` (the bar's own
    // "commands only" prefix) — it answered "No matches" before
    if (palette.open && palette.mode === "files" && palette.q.startsWith(">")) palette.mode = "all";
  });
  // the capture row's words (the core's), asked only while a capture row can show
  const captureHintNow = captureHint(() => (palette.open && (palette.mode === "capture" || palette.mode === "all") && !q.trim().startsWith(">") ? q.trim() : ""));
  const captureWhat = () => captureHintNow.current.says;
  const captureNow = captureText;

  // file search (server-side filename match), debounced
  const fileSearches = new Newest(110);
  $effect(() => {
    const query = q.trim();
    const mode = palette.mode;
    if (!palette.open || (mode !== "all" && mode !== "files") || !query || query.startsWith("#") || query.startsWith(">")) { fileSearches.stop(); fileHits = []; lineHits = []; titledHits = []; hitsFor = ""; busy = false; return; } // one still answering is now stale; the same query typed again waits for its own answer (else "Create note" shows before the file is found)
    fileSearches.run(async (still) => {
      busy = true;
      try {
        const [r, t] = await Promise.all([api.search(query), titledNotes(query)]);
        if (still()) { fileHits = r.files; lineHits = r.lines; hitsFor = query; titledHits = besides(t, r.files); }
      }
      catch { if (still()) { fileHits = []; lineHits = []; titledHits = []; } }
      finally { if (still()) { busy = false; answered = query; } }
    });
    return () => fileSearches.stop();
  });

  function score<T>(items: T[], text: (t: T) => string, query: string): { item: T; score: number; hl: number[] }[] {
    const out: { item: T; score: number; hl: number[] }[] = [];
    for (const it of items) {
      const m = fuzzy(query, text(it));
      if (m) out.push({ item: it, score: m.score, hl: m.indices });
    }
    return query ? out.sort((a, b) => b.score - a.score) : out;
  }

  /** `tag:name` asks the core for a tag's notes: its answer is the list, not something to match by name. */
  const tagQuery = (q: string) => /^tag:/i.test(q.trim());
  const titledItems = (): Item[] => titledHits.map((t) => ({
    key: `t:${t.path}`, section: "By title", title: t.title, detail: shownName(t.path), icon: fileIcon(t.path), score: 0, hl: [],
    run: () => openPath(t.path), beside: () => openPath(t.path, undefined, { beside: true }),
  }));
  function fileItems(paths: string[], query: string, section: string): Item[] {
    // rank by basename first, full path as tiebreak
    return paths
      .map((p) => {
        const base = basename(p);
        const mb = fuzzy(query, base), mp = fuzzy(query, p);
        const s = Math.max(mb ? mb.score + 50 : -Infinity, mp ? mp.score : -Infinity);
        return { p, base, s: query ? s : 0, hl: mb?.indices ?? [] };
      })
      .filter((x) => x.s > -Infinity)
      .sort((a, b) => (query ? b.s - a.s : 0))
      .slice(0, 40)
      .map((x) => ({ key: `f:${x.p}`, section, title: shownName(x.p), path: x.p, detail: x.p.includes("/") ? x.p.slice(0, x.p.lastIndexOf("/")) : "", icon: fileIcon(x.p), score: x.s, hl: x.hl, run: () => openPath(x.p), beside: () => openPath(x.p, undefined, { beside: true }) }));
  }

  const items = $derived.by<Item[]>(() => {
    const query = q.trim();
    switch (palette.mode) {
      case "capture":
        return query ? [{ key: "cap", section: "", title: `Capture “${query}”`, detail: captureWhat(), icon: "plus", score: 0, hl: [], run: () => captureNow(query) }] : [];
      case "url": {
        if (!query) return [];
        const url = /^[a-z]+:\/\//i.test(query) ? query : `http://${query}`;
        return [{ key: "url", section: "", title: `Open ${url}`, icon: "globe", score: 0, hl: [], run: () => { open({ kind: "web", url }); } }];
      }
      case "pick": {
        const req = palette.pick;
        if (!req) return [];
        const ranked: Item[] = score(picks, (p) => p.title, query).map(({ item: p, score: s, hl }) => ({
          // keyed by value and title: two rows with the same value (a caller's "do nothing" rows) must
          // not break the list (duplicate keys make Svelte throw, and the palette then shows stale state)
          key: `p:${p.value}:${p.title}`, section: p.section ?? "", title: p.title, detail: p.detail, icon: p.icon ?? req.icon ?? "command", score: s, hl,
          run: () => req.onpick(p.value, false),
        }));
        const exact = picks.some((p) => p.title.toLowerCase() === query.toLowerCase() || p.value === query);
        if (req.typed && query && !exact) ranked.push({ key: "p:new", section: "New", title: req.typed(query), icon: "plus", score: -1, hl: [], run: () => req.onpick(query, true) });
        return ranked;
      }
      case "files": {
        if (!query) return fileItems(recentFiles(), "", "Recent");
        const found = fileItems(fileHits, tagQuery(query) ? "" : query, tagQuery(query) ? "Notes with this tag" : "Files");
        // no file is called that: offer to make the note (Obsidian's quick switcher) — once the search
        // has answered, so Enter typed early never creates what was about to be found
        const called = (f: Item) => !!f.path && [basename(f.path), shownName(f.path)].some((n) => n.toLowerCase() === query.toLowerCase());
        const create: Item[] = hitsFor !== query || found.some(called) || /[\\/]/.test(query) ? [] : [{ key: "f:new", section: "New", title: `Create note “${query}”`, icon: "plus", score: -1, hl: [], run: () => createNote(query) }];
        return [...found, ...titledItems(), ...create];
      }
      case "all": {
        if (query.startsWith("#")) return headingItems(query.slice(1).trim());
        const cq = query.startsWith(">") ? query.slice(1).trim() : query;
        const cmds = score(allCommands(), (c) => c.title, cq)
          .slice(0, query ? 12 : 50)
          .map(({ item: c, score: s, hl }) => ({ key: `c:${c.id}`, section: "Commands", title: c.title, detail: c.description ?? (c.source === "script" ? "script" : undefined), keys: c.keys, icon: "command" as IconName, score: s, hl, run: c.run }));
        if (query.startsWith(">")) return cmds;
        const files = query ? fileItems(fileHits, tagQuery(query) ? "" : query, tagQuery(query) ? "Notes with this tag" : "Files") : fileItems(recentFiles().slice(0, 6), "", "Recent files");
        const heads = query ? headingItems(query).slice(0, 5) : [];
        // the text of notes, after names: three letters at least, a few lines (the Search pane has them all)
        const lines: Item[] = query.length >= 3 && hitsFor === query && !tagQuery(query)
          ? lineHits.slice(0, 8).map((h): Item => ({
              key: `l:${h.path}:${h.line}`, section: "In notes", title: h.text.trim().slice(0, 140), detail: `${shownName(h.path)}:${h.line}`, icon: "search", score: 0, hl: [],
              run: () => { openPath(h.path, h.line); }, beside: () => { openPath(h.path, h.line, { beside: true }); },
            }))
          : [];
        // and what was typed can always be captured from here (Super+E: commands, files, notes' text, capture) — once the
        // search has answered: before, the capture row was the only one, and an Enter typed early wrote a file's name
        // into today's log instead of opening the file
        const capture: Item[] = query && !query.startsWith(">") && answered === query ? [{
          key: "cap", section: "Capture", title: `Capture “${query}”`, detail: `${captureWhat()} — or press Super+E again`, icon: "plus", score: -2, hl: [],
          run: () => captureNow(query),
        }] : [];
        return query ? [...cmds.slice(0, 8), ...heads, ...files, ...titledItems(), ...lines, ...capture] : [...files, ...cmds];
      }
    }
  });

  function headingItems(query: string): Item[] {
    const id = activeEditorId();
    const h = id ? editors.get(id) : undefined;
    if (!h || !id) return [];
    return score(h.headings(), (x) => x.text, query).map(({ item, score: s, hl }) => ({
      key: `h:${item.line}`, section: "Headings in this file", title: item.text, detail: "#".repeat(item.level), icon: "file-text" as IconName, score: s, hl,
      run: () => { getDock()?.getPanel(id)?.api.setActive(); h.gotoLine(item.line); },
    }));
  }

  $effect(() => { void items.length; if (sel >= items.length) palette.sel = Math.max(0, items.length - 1); });

  function choose(it: Item | undefined, beside = false) {
    if (!it) return;
    if (it.key.startsWith("c:")) api.usage({ kind: "command", id: it.key.slice(2) });
    if (palette.mode === "pick") pickChosen();
    closePalette();
    void (beside && it.beside ? it.beside() : it.run());
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) { e.preventDefault(); palette.sel = (sel + 1) % Math.max(1, items.length); scroll(); }
    else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p" && palette.mode !== "files")) { e.preventDefault(); palette.sel = (sel - 1 + items.length) % Math.max(1, items.length); scroll(); }
    else if (e.key === "Enter") { e.preventDefault(); if (!items[sel] && q.trim() && answered !== q.trim()) enterPending = { q, beside: e.ctrlKey || superOf(e) }; else choose(items[sel], e.ctrlKey || superOf(e)); }
    else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    else if (e.key === "Backspace" && palette.mode === "capture" && !palette.q) { e.preventDefault(); palette.mode = "all"; }
  }
  function framekeys(e: KeyboardEvent & { currentTarget: HTMLElement }) {
    if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); closePalette(); }
    else trapTab(e, e.currentTarget);
  }
  function scroll() { void tick().then(() => listEl?.querySelector(".item.sel")?.scrollIntoView({ block: "nearest" })); }
</script>

{#if palette.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={closePalette}>
    <!-- Tab walks the box and its rows, never out to the page behind the scrim; Esc closes from a row as from the box -->
    <div class="palette" role="dialog" aria-modal="true" tabindex="-1" aria-label="Command palette" onclick={(e) => e.stopPropagation()} onkeydown={framekeys} data-testid="palette">
      <div class="field">
        <Icon name={palette.mode === "pick" ? palette.pick?.icon ?? "command" : palette.mode === "url" ? "globe" : palette.mode === "files" ? "file" : palette.mode === "capture" ? "plus" : "command"} size={16} />
        <input bind:this={input} bind:value={palette.q} {onkeydown} {placeholder} spellcheck="false" autocomplete="off" aria-label={placeholder}
          use:complete={{ when: () => palette.mode === "capture" }} />
        {#if busy}<span class="spin"></span>{/if}
        <span class="mode-tag">{palette.mode === "all" ? "Commands" : palette.mode === "files" ? "Files" : palette.mode === "pick" ? palette.pick?.tag ?? "Pick" : palette.mode === "capture" ? "Capture" : "Web"}</span>
      </div>
      <div class="list" bind:this={listEl}>
        {#each items as it, i (it.key)}
          {#if i === 0 || items[i - 1].section !== it.section}
            {#if it.section}<div class="section">{it.section}</div>{/if}
          {/if}
          <button class="item" class:sel={i === sel} onclick={() => choose(it)} onmousemove={() => (palette.sel = i)} data-testid="palette-item" data-path={it.path} title={it.path}>
            <span class="ico"><Icon name={it.icon} size={15} /></span>
            <span class="title">{@html highlightMatch(it.title, it.hl)}</span>
            {#if it.detail}<span class="detail">{it.detail}</span>{/if}
            {#if it.keys}<span class="kbd-group keys-only">{#each chordLabel(it.keys) as k}<kbd>{k}</kbd>{/each}</span>{/if}
          </button>
        {:else}
          <div class="none">{q.trim() ? (busy ? "Searching…" : "No matches") : palette.mode === "url" ? "Type an address" : "Start typing"}</div>
        {/each}
      </div>
      <div class="foot">
        <span class="keys-only"><kbd>↑</kbd><kbd>↓</kbd> move</span><span class="keys-only"><kbd>Enter</kbd> run</span>{#if items[sel]?.beside}<span class="keys-only"><kbd>Ctrl</kbd><kbd>Enter</kbd> open beside</span>{/if}<span class="keys-only"><kbd>Esc</kbd> close</span>
        {#if palette.mode === "all"}<span class="faint"><kbd>#</kbd> headings · <kbd>&gt;</kbd> commands only · <kbd>+</kbd> capture</span>{/if}
        {#if palette.mode === "capture"}<span class="faint">{#if !q.trim()}<CaptureGuides box={input} /> · {/if}<kbd>⌫</kbd> back to commands</span>{/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 1000; background: var(--scrim); display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; animation: fade-in .1s ease-out; }
  .palette { width: min(640px, calc(100vw - 32px)); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-xl);
    box-shadow: var(--shadow-pop); overflow: hidden; display: flex; flex-direction: column; max-height: 64vh; animation: pop-in .14s cubic-bezier(.2, .9, .3, 1.2); }
  .field { display: flex; align-items: center; gap: 10px; padding: 0 14px 0 16px; height: 52px; border-bottom: 1px solid var(--border); color: var(--text-faint); flex: none; }
  .field input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: calc(15px * var(--ui-scale, 1)); }
  .field input::placeholder { color: var(--text-faint); }
  .mode-tag { font-size: calc(11px * var(--ui-scale, 1)); color: var(--text-faint); border: 1px solid var(--border); border-radius: 99px; padding: 1px 8px; }
  .list { overflow-y: auto; padding: 6px; flex: 1; min-height: 0; }
  .section { font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--text-faint); padding: 10px 10px 4px; }
  .item { display: flex; align-items: center; gap: 10px; width: 100%; height: 36px; padding: 0 10px; border-radius: var(--radius); text-align: left; color: var(--text); font-size: calc(13.5px * var(--ui-scale, 1)); }
  /* a phone (lib/phone.svelte.ts): rows a finger can hit, the box near the top so the keyboard leaves room */
  :global(html.phone) .scrim { padding-top: 8px; }
  :global(html.phone) .item { height: 44px; }
  .item.sel { background: var(--bg-active); }
  .item.sel .ico { color: var(--accent); }
  .ico { color: var(--text-faint); display: inline-flex; }
  /* a title takes the row; beside a detail it keeps 60% of it (on a phone all it needs: the detail goes first) */
  .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; }
  .title:has(+ .detail) { flex: none; max-width: 60%; }
  :global(html.phone) .title:has(+ .detail) { flex: 0 1 auto; max-width: none; }
  .title :global(mark) { background: none; color: var(--accent-strong); font-weight: 600; }
  .detail { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
  .item .kbd-group { margin-left: auto; flex: none; }
  .none { padding: 18px 12px; color: var(--text-faint); font-size: calc(13px * var(--ui-scale, 1)); text-align: center; }
  .foot { display: flex; gap: 16px; padding: 8px 14px; border-top: 1px solid var(--border); font-size: calc(11.5px * var(--ui-scale, 1)); color: var(--text-muted); flex: none; flex-wrap: wrap; }
  .foot .faint { margin-left: auto; }
  .spin { width: 12px; height: 12px; border: 1.5px solid var(--text-faint); border-top-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; }
</style>
