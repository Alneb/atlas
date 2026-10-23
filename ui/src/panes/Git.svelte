<script lang="ts">
  import { errText } from "../lib/text";
  import { shownName } from "../lib/paths";
  import { superOf } from "../lib/keys";
  import { refreshGitTree, onGitWorthyChange } from "../lib/gitstatus.svelte";
  // Source control: branch, staged / unstaged changes (click → diff, +/− to stage, ↺ to discard),
  // commit box, pull / push (only when pressed; push asks), and the full history (you vs Claude,
  // housekeeping dimmed or hidden per settings).
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { open } from "../lib/dock";
  import { settings, updateSettings } from "../lib/settings.svelte";
  import { toast } from "../lib/state.svelte";
  import type { GitChange, GitCommit, GitStatus, StatusEntry } from "../lib/types";
  import type { PaneProps } from "../lib/dock";
  import CommitRow from "../components/CommitRow.svelte";
  import Icon from "../components/Icon.svelte";
  import InputDialog from "../components/InputDialog.svelte";

  let { panel: _panel }: PaneProps<"git"> = $props();
  let status = $state<GitStatus | null>(null);
  let error = $state("");
  let log = $state<GitCommit[]>([]);
  let more = $state(true);
  let message = $state("");
  let busy = $state(false);
  let root = $state<HTMLElement>();
  const PAGE = 80;

  const staged = $derived(status?.entries.filter((e) => e.staged) ?? []);
  const unstaged = $derived(status?.entries.filter((e) => e.unstaged) ?? []);
  const showHouse = $derived(settings.config?.activity.show_housekeeping ?? false);
  const showClaude = $derived(settings.config?.activity.show_claude ?? true);
  const visible = $derived(log.filter((c) => (showHouse || c.kind !== "housekeeping") && (showClaude || c.by !== "agent")));

  const letter: Record<GitChange, string> = { added: "A", modified: "M", deleted: "D", renamed: "R", untracked: "U", conflicted: "!" };

  async function refreshStatus() {
    // the same answer is not assigned: no redraw of a list that did not change
    try { const s = await api.gitStatus(); if (JSON.stringify(s) !== JSON.stringify(status)) status = s; error = ""; }
    catch (e) { error = errText(e); }
    void refreshGitTree(); // the file tree's markers follow stage / commit
  }
  async function loadLog(reset = false) {
    if (status && !status.repo) { log = []; more = false; return; } // no repository: no history to ask for
    const page = await api.gitLog(reset ? 0 : log.length, PAGE).catch(() => [] as GitCommit[]);
    log = reset ? page : [...log, ...page];
    more = page.length === PAGE;
  }
  async function stage(paths: string[], on: boolean) {
    try { await api.gitStage(paths, on); await refreshStatus(); }
    catch (e) { toast(on ? "Stage failed" : "Unstage failed", errText(e), "error"); }
  }
  async function commit() {
    if (!message.trim() || !staged.length || busy) return;
    busy = true;
    try {
      const r = await api.gitCommitIndex(message);
      toast(`Committed ${r.hash}`, message.split("\n")[0], "success");
      message = "";
      await Promise.all([refreshStatus(), loadLog(true)]);
    } catch (e) {
      // hooks (e.g. a pre-commit gate) explain themselves here
      toast("Commit failed", errText(e), "error", 12000);
    } finally { busy = false; }
  }
  // --- discard / pull / push: each behind the user's click, the irreversible ones behind a confirm
  let ask = $state<{ title: string; hint: string; confirm: string; run: () => Promise<void> } | null>(null);
  const failed = (what: string) => (e: unknown) => toast(what, errText(e), "error", 12000);
  function discard(paths: string[]) {
    const one = paths.length === 1 ? paths[0] : `${paths.length} files`;
    ask = { title: `Discard the changes to ${one}?`, confirm: "Discard", hint: "Back to the last staged / committed version (new files go to the Trash). A copy is kept in .atlas/cache/discarded/.",
      run: async () => { const r = await api.gitDiscard(paths); toast("Discarded", `A copy is in ${r.kept}`); await refreshStatus(); } };
  }
  let syncing = $state<"" | "pull" | "push">("");
  async function sync(way: "pull" | "push") {
    syncing = way;
    try { const r = await (way === "pull" ? api.gitPull() : api.gitPush()); toast(way === "pull" ? "Pulled" : "Pushed", r.message, "success"); await Promise.all([refreshStatus(), loadLog(true)]); }
    catch (e) { failed(way === "pull" ? "Pull failed" : "Push failed")(e); }
    finally { syncing = ""; }
  }
  function push() {
    const n = status?.ahead ?? 0;
    ask = { title: `Push ${n} commit${n === 1 ? "" : "s"} to ${status?.upstream ?? "the remote"}?`, confirm: "Push", hint: "Others will see them; a push is not undone by Atlas.", run: () => sync("push") };
  }

  const showDiff = (e: StatusEntry, isStaged: boolean) => open({ kind: "diff", path: e.path, staged: isStaged });
  const dir = (p: string) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";

  onMount(() => {
    void refreshStatus();
    void loadLog(true);
    // the history is read again only when there is a new commit (its newest hash changed)
    const newCommit = async () => { const top = await api.gitLog(0, 1).catch(() => []); if (top[0]?.hash !== log[0]?.hash) void loadLog(true); };
    return onGitWorthyChange(() => { void refreshStatus(); void newCommit(); }, () => !!root?.offsetParent);
  });
</script>

{#snippet entryRow(e: StatusEntry, isStaged: boolean)}
  {@const ch = (isStaged ? e.staged : e.unstaged)!}
  <li class="entry">
    <button class="name" onclick={() => showDiff(e, isStaged)} title={e.orig ? `${e.orig} → ${e.path}` : e.path}>
      <span class="base" class:gone={ch === "deleted"}>{shownName(e.path)}</span><span class="dir">{dir(e.path)}</span>
    </button>
    {#if !isStaged}<button class="icon-btn act" title="Discard changes" aria-label="Discard changes to {e.path}" onclick={() => discard([e.path])}><Icon name="undo" size={13} /></button>{:else}<span></span>{/if}
    <button class="icon-btn act" title={isStaged ? "Unstage" : "Stage"} aria-label="{isStaged ? 'Unstage' : 'Stage'} {e.path}" onclick={() => stage([e.path], !isStaged)}><Icon name={isStaged ? "minus" : "plus"} size={13} /></button>
    <span class="st {ch}">{letter[ch]}</span>
  </li>
{/snippet}

<div class="side-pane git" bind:this={root}>
  <div class="side-head">
    <span class="side-title"><Icon name="git" size={13} /> {status?.branch ?? "Git"}{#if status?.ahead} ↑{status.ahead}{/if}{#if status?.behind} ↓{status.behind}{/if}</span>
    <span class="sync">
      <button class="icon-btn" title={status?.upstream ? `Pull from ${status.upstream} (fast-forward only)` : "No upstream branch to pull from"} aria-label="Pull"
        disabled={!status?.upstream || !!syncing} onclick={() => sync("pull")}><Icon name="arrow-down" size={14} />{#if status?.behind}<span class="n">{status.behind}</span>{/if}</button>
      <button class="icon-btn" title={status?.upstream ? `Push to ${status.upstream}` : "No upstream branch — set one once in a terminal: git push -u origin HEAD"} aria-label="Push"
        disabled={!status?.upstream || !status?.ahead || !!syncing} onclick={push}><Icon name="arrow-up" size={14} />{#if status?.ahead}<span class="n">{status.ahead}</span>{/if}</button>
      <button class="icon-btn" title="Refresh" aria-label="Refresh" onclick={() => { void refreshStatus(); void loadLog(true); }}><Icon name="refresh" size={14} /></button>
    </span>
  </div>
  <div class="scroll body">
    {#if status && !status.repo}
      <p class="faint small pad">This workspace is not a git repository: <code>git init</code> in a terminal here makes it one.</p>
    {:else if error}
      <p class="faint small pad">{error}</p>
    {:else}
      <div class="commit-box">
        <textarea bind:value={message} rows="2" placeholder={staged.length ? "Commit message (Ctrl+Enter)" : "Stage changes to commit"} spellcheck="false"
          onkeydown={(e) => { if (e.key === "Enter" && (e.ctrlKey || superOf(e))) { e.preventDefault(); void commit(); } }}></textarea>
        <button class="btn primary" disabled={!message.trim() || !staged.length || busy} onclick={commit}>{busy ? "Committing…" : `Commit ${staged.length || ""}`}</button>
      </div>

      {#if staged.length}
        <div class="group-head"><span>Staged</span><span class="count">{staged.length}</span>
          <button class="icon-btn" title="Unstage all" onclick={() => stage(staged.map((e) => e.path), false)}><Icon name="minus" size={13} /></button></div>
        <ul>{#each staged as e (e.path)}{@render entryRow(e, true)}{/each}</ul>
      {/if}
      <div class="group-head"><span>Changes</span><span class="count">{unstaged.length}</span>
        {#if unstaged.length}<button class="icon-btn" title="Discard all changes" aria-label="Discard all changes" onclick={() => discard(unstaged.map((e) => e.path))}><Icon name="undo" size={13} /></button>
          <button class="icon-btn" title="Stage all" onclick={() => stage(unstaged.map((e) => e.path), true)}><Icon name="plus" size={13} /></button>{/if}</div>
      {#if unstaged.length}
        <ul>{#each unstaged as e (e.path)}{@render entryRow(e, false)}{/each}</ul>
      {:else}
        <p class="faint small pad">Working tree clean.</p>
      {/if}

      <div class="group-head"><span>History</span>
        <label class="mini" title="Show history / session-log / HTML-only commits">
          <input type="checkbox" checked={showHouse} onchange={(e) => void updateSettings((c) => { c.activity.show_housekeeping = e.currentTarget.checked; })} /> housekeeping
        </label>
      </div>
      <div class="log">
        {#each visible as c (c.hash)}<CommitRow {c} compact />{/each}
        {#if more}<button class="btn more" onclick={() => loadLog()}>Load more</button>{/if}
      </div>
    {/if}
  </div>
</div>

{#if ask}
  <InputDialog title={ask.title} hint={ask.hint} confirm={ask.confirm}
    onsubmit={() => { const a = ask!; ask = null; a.run().catch(failed(`${a.confirm} failed`)); }} oncancel={() => (ask = null)} />
{/if}

<style>
  .body { flex: 1; min-height: 0; overflow: auto; padding: 4px 10px 20px; }
  .side-title { display: inline-flex; gap: 6px; align-items: center; }
  .commit-box { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 10px; }
  textarea { font: inherit; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    padding: 6px 8px; resize: vertical; min-height: 2.6em; }
  textarea:focus { outline: none; border-color: var(--accent); }
  .group-head { display: flex; align-items: center; gap: 6px; margin: 12px 0 2px; font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted); }
  .group-head > span:first-child { flex: 1; }
  .count { background: var(--bg-hover); border-radius: 999px; padding: 0 7px; font-size: calc(10.5px * var(--ui-scale, 1)); }
  ul { list-style: none; margin: 0; padding: 0; }
  .sync { display: inline-flex; gap: 2px; }
  .sync .n { font-size: calc(10.5px * var(--ui-scale, 1)); margin-left: 1px; font-variant-numeric: tabular-nums; }
  .sync button:disabled { opacity: .4; }
  .entry { display: grid; grid-template-columns: minmax(0, 1fr) auto auto 18px; align-items: center; gap: 4px; border-radius: var(--radius-sm); }
  .entry:hover { background: var(--bg-hover); }
  .entry .act { opacity: 0; }
  .entry:hover .act { opacity: 1; }
  .name { display: flex; gap: 6px; align-items: baseline; min-width: 0; padding: 3px 6px; text-align: left; font-size: calc(13px * var(--ui-scale, 1)); }
  /* a long name is cut, never drawn under the buttons; the folder gives way first */
  .base { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 4ch; }
  .base.gone { text-decoration: line-through; opacity: .7; }
  .dir { color: var(--text-faint); font-size: .88em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 50; }
  .st { font-family: var(--font-mono); font-size: calc(11.5px * var(--ui-scale, 1)); font-weight: 700; text-align: center; }
  .st.modified { color: var(--yellow); } .st.added, .st.untracked { color: var(--green); } .st.deleted, .st.conflicted { color: var(--red); } .st.renamed { color: var(--accent); }
  .mini { display: inline-flex; gap: 4px; align-items: center; text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--text-faint); cursor: pointer; }
  .log { padding: 0 8px; }
  .more { width: 100%; margin-top: 8px; border: 1px solid var(--border); }
  .pad { padding: 6px 4px; }
</style>
