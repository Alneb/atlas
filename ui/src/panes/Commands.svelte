<script lang="ts">
  import { errText } from "../lib/text";
  import { keysOf } from "../lib/keymap.svelte";
  // Commands & shortcuts: every command (Atlas's own and the workspace's scripts), where each script
  // came from (you or Claude, from git), its shortcut (click → press keys → saved to .atlas/keys.toml),
  // run it and see its output, and create a new one — recurring work becomes a button, no Claude needed.
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { openPath } from "../lib/dock";
  import { allCommands, keymap, loadKeymap, type Cmd } from "../lib/keymap.svelte";
  import ShortcutButton from "../components/ShortcutButton.svelte";
  import { toast } from "../lib/state.svelte";
  import { rel } from "../lib/time";
  import type { PaneProps } from "../lib/dock";

  let { panel: _panel }: PaneProps<"commands"> = $props();
  import Icon from "../components/Icon.svelte";

  let q = $state("");
  let output = $state<Record<string, { ok: boolean; text: string }>>({});
  let running = $state<string | null>(null);
  let creating = $state(false);
  let form = $state({ title: "", run: "", description: "", schedule: "" });
  let fresh = $state<string | null>(null);

  const cmds = $derived.by(() => {
    void keymap.overrides; void keymap.server; // re-derive when the keymap reloads
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return allCommands().filter((c) => {
      const hay = `${c.title} ${c.id} ${c.description ?? ""} ${c.keys ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  });
  const scripts = $derived(cmds.filter((c) => c.source === "script"));
  const atlas = $derived(cmds.filter((c) => c.source !== "script"));

  function origin(c: Cmd): string {
    if (!c.file) return "";
    if (!c.origin) return "not committed yet";
    return `added by ${c.origin.by === "agent" ? (c.origin.agent ?? "an agent") : "you"} · ${rel(c.origin.time)}`;
  }

  async function run(c: Cmd) {
    if (c.source === "ui") return void c.run();
    running = c.id;
    try {
      const r = await api.cmd(c.id);
      const text = r.ok ? (typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? "done", null, 1)) : r.error ?? "failed";
      output = { ...output, [c.id]: { ok: r.ok, text: text.trim() || "(no output)" } };
    } catch (e) {
      output = { ...output, [c.id]: { ok: false, text: errText(e) } };
    } finally { running = null; }
  }

  async function create() {
    try {
      const made = await api.newCommand({ id: "", title: form.title, run: form.run, description: form.description, timeout_secs: null, schedule: form.schedule.trim() || null });
      await loadKeymap();
      fresh = made.id;
      creating = false;
      form = { title: "", run: "", description: "", schedule: "" };
      toast("Command created", `${made.file} — it is in the palette now`, "success");
    } catch (e) { toast("Could not create the command", errText(e), "error"); }
  }

  onMount(() => { void loadKeymap(); });
</script>

{#snippet row(c: Cmd)}
  <li class="cmd" class:fresh={fresh === c.id}>
    <div class="main">
      <div class="title">{c.title}</div>
      <div class="sub">
        <code>{c.id}</code>
        {#if c.description}<span class="desc">{c.description}</span>{/if}
        {#if c.file}<span class="origin" class:claude={c.origin?.by === "agent"}>{origin(c)}</span>{/if}
        {#if c.schedule}
          <span class="sched" title="Runs by itself while Atlas is open (.atlas/cache/schedule.log)">⏱ {c.schedule}{#if c.lastRun} · last {rel(c.lastRun.time)} <b class:bad={!c.lastRun.ok}>{c.lastRun.ok ? "ok" : "failed"}</b>{:else} · not run yet{/if}</span>
        {/if}
      </div>
      {#if output[c.id]}<pre class="out" class:err={!output[c.id].ok}>{output[c.id].text}</pre>{/if}
    </div>
    <div class="side">
      <ShortcutButton cmd={c} />
      {#if c.file}<button class="icon-btn" onclick={() => openPath(c.file!)} title="Edit {c.file}"><Icon name="edit" size={13} /></button>{/if}
      <button class="run" onclick={() => run(c)} disabled={running === c.id} title="Run {c.title}">{running === c.id ? "Running…" : "Run"}</button>
    </div>
  </li>
{/snippet}

<div class="commands">
  <header>
    <h1><Icon name="command" size={18} /> Commands</h1>
    <input class="filter" placeholder="Filter commands, ids, shortcuts…" bind:value={q} spellcheck="false" aria-label="Filter commands" />
    <button class="btn primary" onclick={() => (creating = !creating)}><Icon name="plus" size={14} /> New command</button>
  </header>
  <div class="body">
    {#if creating}
      <form class="new" onsubmit={(e) => { e.preventDefault(); void create(); }}>
        <p class="hint">A command is a shell command line run in the workspace folder; it lands in <code>.atlas/commands/</code>, shows in the command bar ({keysOf('ui.palette') ?? 'Super+E'}) and can get a shortcut. Its output appears here.</p>
        <label>Title <input bind:value={form.title} placeholder="Papers: rebuild refs.bib" required /></label>
        <label>Command line <input class="mono" bind:value={form.run} placeholder={"python3 projects/x/make_figs.py && echo done"} required spellcheck="false" /></label>
        <label>Description <input bind:value={form.description} placeholder="What it does, in one line (optional)" /></label>
        <label>Schedule <input bind:value={form.schedule} placeholder="optional — daily 03:00 · every 2h · hourly (runs while Atlas is open)" spellcheck="false" /></label>
        <div class="row-btns"><button class="btn primary" disabled={!form.title.trim() || !form.run.trim()}>Create</button><button type="button" class="btn" onclick={() => (creating = false)}>Cancel</button></div>
      </form>
    {/if}
    <h2>Workspace scripts <span class="n">{scripts.length}</span></h2>
    <p class="hint">Recurring jobs as buttons. Who added each one comes from git — the ones Claude wrote are yours to keep, edit or delete.</p>
    <ul>{#each scripts as c (c.id)}{@render row(c)}{:else}<li class="empty">No scripts yet — “New command” makes one.</li>{/each}</ul>
    <h2>Atlas <span class="n">{atlas.length}</span></h2>
    <ul>{#each atlas as c (c.id)}{@render row(c)}{/each}</ul>
  </div>
</div>

<style>
  .commands { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  header { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  h1 { display: inline-flex; gap: 8px; align-items: center; margin: 0 8px 0 0; font-size: calc(17px * var(--ui-scale, 1)); color: var(--heading); }
  input { font: inherit; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 5px 9px; }
  input:focus { outline: none; border-color: var(--accent); }
  .filter { flex: 1; min-width: 220px; }
  .mono { font-family: var(--font-mono); }
  .btn { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border-strong); }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: .45; }
  .body { flex: 1; overflow: auto; padding: 8px 16px 40px; }
  h2 { margin: 18px 0 2px; font-size: calc(11px * var(--ui-scale, 1)); text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted); }
  .n { color: var(--text-faint); font-weight: 500; }
  .hint { margin: 2px 0 8px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  ul { list-style: none; margin: 0; padding: 0; }
  .cmd { display: flex; gap: 12px; align-items: flex-start; padding: 8px 10px; border-radius: var(--radius-sm); border-bottom: 1px solid var(--border); }
  .cmd:hover { background: var(--bg-hover); }
  .cmd.fresh { box-shadow: inset 2px 0 0 var(--accent); }
  .main { flex: 1; min-width: 0; }
  .title { color: var(--heading); font-weight: 550; }
  .sub { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); margin-top: 2px; }
  .sub code { color: var(--text-faint); font-size: .95em; }
  .origin { color: var(--text-muted); }
  .origin.claude { color: var(--accent); }
  .sched { color: var(--text-muted); }
  .sched b { font-weight: 600; color: var(--green); }
  .sched b.bad { color: var(--red); }
  .out { margin: 6px 0 0; padding: 6px 9px; max-height: 220px; overflow: auto; background: var(--bg-alt); border-radius: var(--radius-sm); font-size: calc(12px * var(--ui-scale, 1)); white-space: pre-wrap; color: var(--text); }
  .out.err { color: var(--red); }
  .side { display: flex; gap: 6px; align-items: center; flex: none; }
  .icon-btn { display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .icon-btn:hover { background: var(--bg-active); color: var(--text); }
  .run { padding: 3px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); }
  .run:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .new { display: flex; flex-direction: column; gap: 8px; max-width: 720px; margin: 10px 0; padding: 12px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--bg-alt); }
  .new label { display: flex; flex-direction: column; gap: 3px; color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  .row-btns { display: flex; gap: 8px; }
  .empty { color: var(--text-faint); padding: 8px 10px; }
</style>
