<script lang="ts">
  // Workspace commands (.atlas/commands/*.toml): what exists, what runs by itself, who added it.
  import { onMount } from "svelte";
  import { allCommands, keymap, loadKeymap } from "../../lib/keymap.svelte";
  import { open, openPath } from "../../lib/dock";
  import { rel } from "../../lib/time";
  import { gitTree, knowRepo } from "../../lib/gitstatus.svelte";
  import ShortcutButton from "../ShortcutButton.svelte";
  import Icon from "../Icon.svelte";

  const scripts = $derived.by(() => { void keymap.server; void keymap.overrides; return allCommands().filter((c) => c.source === "script"); });
  onMount(() => { if (!keymap.loaded) void loadKeymap(); knowRepo(); });
  // its schedule and last run, and who added it (git's answer; outside git, nobody to name)
  const sub = (c: (typeof scripts)[number]) => [
    c.schedule && `${c.schedule}${c.lastRun ? ` · last ${rel(c.lastRun.time)} ${c.lastRun.ok ? "ok" : "failed"}` : ""}`,
    c.origin ? `by ${c.origin.by === "agent" ? (c.origin.agent ?? "an agent") : "you"}` : gitTree.repo === "repo" && "not committed yet",
  ].filter(Boolean).join(" · ");
</script>

<section class="settings-panel scripts">
  <h3>Workspace commands <span class="n">{scripts.length}</span></h3>
  <p class="desc">Shell lines saved as commands in <code>.atlas/commands/</code>: in the palette, with a shortcut, optionally on a schedule.</p>
  <ul>
    {#each scripts as c (c.id)}
      <li>
        <div class="main">
          <button class="t" onclick={() => c.file && openPath(c.file)} title="Edit {c.file}">{c.title}</button>
          <span class="sub">{#if c.schedule}<Icon name="clock" size={11} /> {/if}{sub(c)}</span>
        </div>
        <ShortcutButton cmd={c} />
      </li>
    {:else}<li class="muted">None yet.</li>{/each}
  </ul>
  <button class="btn" onclick={() => open({ kind: "commands" })}>Open Commands (run, make new) →</button>
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .n { color: var(--text-faint); }
  .desc, .muted { margin: 0 0 6px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; gap: 10px; align-items: center; padding: 5px 0; border-top: 1px solid var(--border); }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { padding: 0; text-align: left; color: var(--text); font-weight: 500; }
  .t:hover { color: var(--accent); }
  .sub { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .btn { margin: 8px 0 4px; padding: 3px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); }
  .btn:hover { background: var(--bg-hover); }
</style>
