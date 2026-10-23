<script lang="ts">
  // One commit: who (you / Claude), subject, age. Click opens the commit's diff.
  import type { GitCommit } from "../lib/types";
  import { open } from "../lib/dock";
  import { rel } from "../lib/time";
  import Icon from "./Icon.svelte";

  let { c, compact = false }: { c: GitCommit; compact?: boolean } = $props();
</script>

<button class="commit" class:claude={c.by === "agent"} class:house={c.kind === "housekeeping"} class:compact
  onclick={() => open({ kind: "commit", hash: c.hash, subject: c.subject })} title={`${c.hash} · ${c.files} file${c.files === 1 ? "" : "s"}`}>
  <span class="who" title={c.by === "agent" ? (c.agent ?? "Agent") : "You"}>{#if c.by === "agent"}<Icon name="claude" size={13} />{:else}<span class="dot"></span>{/if}</span>
  <span class="subject">{c.subject}</span>
  <span class="when">{rel(c.time)}</span>
</button>

<style>
  .commit { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 8px; align-items: center; width: calc(100% + 16px); margin: 0 -8px; padding: 5px 8px;
    border-radius: var(--radius-sm); text-align: left; color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  .commit:hover { background: var(--bg-hover); }
  .compact { padding: 3px 8px; }
  .who { display: grid; place-items: center; color: var(--purple); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
  .subject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .commit:not(.claude) .subject { font-weight: 550; color: var(--heading); }
  .claude .subject { color: var(--text-muted); }
  .house .subject, .house .who { opacity: .55; }
  .when { color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); white-space: nowrap; }
</style>
