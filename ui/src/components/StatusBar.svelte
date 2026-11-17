<script lang="ts">
  import { tipFor } from "../lib/keymap.svelte";
  // Bottom status bar: workspace (horizontal tabs only), the plugins' cells, vim mode (click toggles vim), server connection.
  import { app } from "../lib/state.svelte";
  import { toggleVim } from "../lib/settings.svelte";
  import { showProblems } from "../lib/actions";
  import Icon from "./Icon.svelte";
  import { tabs } from "../lib/tabs.svelte";
  import { statusCells } from "../lib/plugin-status.svelte";
  import { zoomShown } from "../lib/zoom-status.svelte";
  import { zoomPane } from "../lib/pane-zoom";
  import Popover from "./Popover.svelte";
  import type { StatusCell } from "../lib/plugin-status.svelte";
  import { elsewhere, openElsewhere, placeDetail } from "../lib/where.svelte";
  import { clockOf, nowPlaying, shellPlayer } from "../lib/player.svelte";
  import { plugins, pluginSpec } from "../lib/plugin-registry.svelte";
  import { open, openPath } from "../lib/dock";

  /** A file's name as the tabs say it: no folders, a note without `.md`. */
  const short = (p: string) => p.split("/").pop()!.replace(/\.md$/i, "");

  const connLabel = $derived(app.conn === "open" ? "Connected" : app.conn === "connecting" ? "Connecting…" : "Offline — retrying");
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const dirtyCount = $derived(Object.keys(app.dirty).length);

  /** The cell whose panel is open, and its button (the popover's anchor). */
  let opened = $state<{ cell: StatusCell; anchor: HTMLElement } | null>(null);
  const toggle = (cell: StatusCell, anchor: HTMLElement) => { opened = opened?.cell.key === cell.key ? null : { cell, anchor }; };
  /** What the app's player plays (lib/player.svelte.ts): its pane opened again from the lower bar. */
  function showPlaying() {
    const s = nowPlaying.s, p = s && plugins.list.find((x) => x.id === s.plugin);
    // a film: its note, where its notes are written (mpv is its own window; a vault video's "note" is the file itself)
    if (s?.video) { if (s.note && /\.md$/i.test(s.note)) openPath(s.note); return; }
    if (!s || !p?.view) return;
    const spec = pluginSpec(p);
    if (spec.kind === "plugin") open({ ...spec, title: s.title, icon: "headphones", ...(s.open !== undefined ? { arg: s.open } : {}) });
  }
  /** The plugin draws its panel into the popover's body; its cleanup runs when the popover closes. */
  function drawn(host: HTMLElement, cell: StatusCell) {
    const done = cell.panel?.(host, () => { opened = null; });
    return { destroy: () => { if (typeof done === "function") done(); } };
  }
</script>

<footer class="status">
  <!-- the tab sidebar names the workspace itself -->
  {#if tabs.layout !== "vertical"}<span class="ws" title={app.workspace?.root ?? ""}>{app.workspace?.name ?? "—"}</span>{/if}
  {#if zoomShown.percent !== 100}
    <button class="cell zoom" data-cell="zoom" onclick={() => zoomPane(0)} title={tipFor(`This tab is shown at ${zoomShown.percent} % of the settings' sizes. Click for 100 %`, "ui.zoomReset")}>{zoomShown.percent} %</button>
  {/if}
  {#if dirtyCount}<span class="saving">{dirtyCount} unsaved</span>{/if}
  <!-- what the other devices show (lib/where.svelte.ts): a click opens it here -->
  {#each elsewhere.slice(0, 2) as d (d.peer)}
    <button class="cell elsewhere" data-testid="elsewhere" onclick={() => openElsewhere(d.peer)} title="{d.name} shows {placeDetail(d.at)}. Click to open it here, at that place">
      <Icon name="eye" size={12} />{d.name}: {short(d.at.path)}{d.at.page ? ` · p. ${d.at.page}` : ""}
    </button>
  {/each}
  {#if elsewhere.length > 2}<button class="cell elsewhere" onclick={() => openElsewhere()} title="Other devices: what they show">+{elsewhere.length - 2}</button>{/if}
  <span class="grow"></span>
  {#if nowPlaying.s}
    {@const s = nowPlaying.s}
    <span class="playing" data-testid="now-playing">
      <button class="cell" onclick={showPlaying} title="{s.title}{s.author ? ` — ${s.author}` : ''}{s.chapter >= 0 ? ` · ${s.chapters[s.chapter].title}` : ''}{s.error ? ` · ${s.error}` : ''}. Click to show the player">
        <Icon name={s.video ? "film" : "headphones"} size={12} />{s.title} · {clockOf(s.at)}</button>
      <button class="pp" onclick={() => shellPlayer.toggle()} aria-label={s.playing ? "Pause" : "Play"} title={s.playing ? "Pause" : "Play"}>{s.playing ? "❚❚" : "▶"}</button>
    </span>
  {/if}
  {#each statusCells as c (c.key)}
    {#if c.panel}<button class="cell" class:open={opened?.cell.key === c.key} title={c.title} data-cell={c.key} aria-haspopup="dialog" aria-expanded={opened?.cell.key === c.key} onclick={(e) => toggle(c, e.currentTarget)}>{c.text}</button>
    {:else if c.run}<button class="cell" title={c.title} data-cell={c.key} onclick={() => void c.run?.()}>{c.text}</button>
    {:else}<span class="cell" title={c.title} data-cell={c.key}>{c.text}</span>{/if}
  {/each}
  {#if app.problems}
    <button class="problems" class:bad={app.problems.errors > 0} onclick={showProblems} title={tipFor("Problems in this file", "ui.problems")}
      aria-label="Problems: {plural(app.problems.errors, 'error')}, {plural(app.problems.warnings, 'warning')}">
      <Icon name="error" size={12} />{app.problems.errors}<Icon name="warning" size={12} />{app.problems.warnings}
    </button>
  {/if}
  <button class="vim" class:off={!app.vimEnabled} data-mode={app.vimMode} onclick={toggleVim} title="Toggle vim mode" data-testid="vim-mode">
    {#if app.vimEnabled}{app.vimMode || "VIM"}{:else}vim off{/if}
  </button>
  <span class="conn" title={connLabel} data-state={app.conn} data-testid="conn"><span class="dot"></span>{connLabel}</span>
</footer>
{#if opened}
  {#key opened.cell.key}
    <Popover anchor={opened.anchor} label={opened.cell.title ?? opened.cell.text} width={opened.cell.panelWidth ?? 380} onclose={() => (opened = null)}>
      <div class="cell-panel" data-panel={opened.cell.key} use:drawn={opened.cell}></div>
    </Popover>
  {/key}
{/if}

<style>
  .status { height: var(--status-h); flex: none; display: flex; align-items: center; gap: 14px; padding: 0 12px 0 14px; background: var(--bg-app); color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); user-select: none; }
  .ws { color: var(--text-muted); font-weight: 500; }
  .grow { flex: 1; }
  /* a plugin's cell: quiet text; a button only shows it on hover */
  .cell { max-width: 28ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button.cell { padding: 1px 6px; border-radius: 5px; color: inherit; }
  .elsewhere { display: inline-flex; align-items: center; gap: 4px; }
  button.cell:hover, button.cell.open { background: var(--bg-hover); color: var(--text); }
  .playing { display: inline-flex; align-items: center; gap: 2px; color: var(--text-muted); }
  .playing .cell { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
  .pp { padding: 1px 6px; border-radius: 5px; color: var(--accent); font-size: .9em; }
  .pp:hover { background: var(--bg-hover); }
  .saving { color: var(--yellow); }
  .vim { font-family: var(--font-mono); font-size: calc(10.5px * var(--ui-scale, 1)); font-weight: 600; letter-spacing: .06em; padding: 1px 8px; border-radius: 5px; color: var(--text-muted); background: var(--bg-hover); min-width: 64px; text-align: center; }
  .vim[data-mode="INSERT"] { color: var(--bg); background: var(--green); }
  .vim[data-mode="VISUAL"], .vim[data-mode="V-LINE"], .vim[data-mode="V-BLOCK"] { color: var(--bg); background: var(--purple); }
  .vim[data-mode="REPLACE"] { color: var(--bg); background: var(--red); }
  .vim.off { background: none; font-weight: 400; }
  .problems { display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); padding: 1px 6px; border-radius: 5px; font-variant-numeric: tabular-nums; }
  .problems:hover { background: var(--bg-hover); color: var(--text); }
  .problems.bad { color: var(--red); }
  .conn { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); transition: background .2s; }
  .conn[data-state="open"] .dot { background: var(--green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 18%, transparent); }
  .conn[data-state="connecting"] .dot { background: var(--yellow); animation: pulse 1.2s ease-in-out infinite; }
  .conn[data-state="closed"] .dot { background: var(--red); }
</style>
