<script lang="ts">
  // Settings → Calendar: every account's calendars and the subscriptions, each with its visibility and colour — what
  // the pane's checkboxes and colour menu write (`hidden`, `colors`, by id), saved through the section's ctx.
  import { onMount } from "svelte";
  import type { SettingsSectionContext } from "../../../../../ui/src/lib/plugin-api";
  import { hueColor, type Account, type Source } from "./api";

  let { ctx }: { ctx: SettingsSectionContext } = $props();
  const PALETTE = ["#3b82f6", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#64748b"];
  let sources = $state<Source[]>([]);
  let accounts = $state<Account[]>([]);
  let error = $state("");
  let hidden = $state<string[]>([]);
  let colors = $state<Record<string, string>>({});

  function read() {
    const s = ctx.settings();
    hidden = ((s.hidden as string[] | undefined) ?? []).slice();
    colors = Object.fromEntries(((s.colors as string[] | undefined) ?? []).flatMap((l) => { const i = l.lastIndexOf(":"); return i > 0 ? [[l.slice(0, i).trim(), l.slice(i + 1).trim()]] : []; }));
  }
  onMount(() => {
    read();
    ctx.call("sources", {}, 30).then((r) => { const a = r as { sources: Source[]; accounts: Account[] }; sources = a.sources; accounts = a.accounts ?? []; }, (e) => (error = String((e as Error)?.message ?? e)));
  });
  const groups = $derived([
    ...accounts.map((a) => ({ title: a.name, items: sources.filter((s) => s.account === a.name) })),
    { title: "Subscriptions", items: sources.filter((s) => s.kind === "ics") },
  ].filter((g) => g.items.length));
  const shown = (s: Source) => !hidden.includes(s.id) && !hidden.includes(s.name);
  const colorOf = (s: Source) => colors[s.id] ?? colors[s.name] ?? s.shown_color ?? s.color ?? hueColor(s.id);

  function toggle(s: Source) {
    hidden = shown(s) ? [...hidden, s.id] : hidden.filter((h) => h !== s.id && h !== s.name);
    void ctx.save({ hidden });
  }
  function paint(s: Source, c: string) {
    const next = Object.fromEntries(Object.entries(colors).filter(([k]) => k !== s.name));
    colors = { ...next, [s.id]: c };
    void ctx.save({ colors: Object.entries(colors).map(([k, v]) => `${k}: ${v}`) });
  }
</script>

{#if error}<p class="none">{error}</p>
{:else if !groups.length}<p class="none">No calendar yet: add an account above, then they show here.</p>{/if}
{#each groups as g (g.title)}
  <h4>{g.title}</h4>
  <ul>
    {#each g.items as s (s.id)}
      <li>
        <label><input type="checkbox" checked={shown(s)} onchange={() => toggle(s)} /> <span class="sq" style:--c={colorOf(s)}></span>{s.name}{#if !s.writable}<span class="ro"> · read-only</span>{/if}</label>
        <code>{s.id}</code>
        <span class="pal" role="radiogroup" aria-label="Colour of {s.name}">
          {#each PALETTE as c (c)}<button class="pc" role="radio" aria-checked={colorOf(s) === c} aria-label={c} style:--c={c} onclick={() => paint(s, c)}></button>{/each}
        </span>
      </li>
    {/each}
  </ul>
{/each}

<style>
  h4 { margin: 10px 0 4px; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
  label { display: flex; align-items: center; gap: 8px; flex: 1 1 12em; min-width: 0; color: var(--text); }
  .sq { width: 12px; height: 12px; border-radius: 4px; background: var(--c); flex: none; }
  .ro { color: var(--text-faint); }
  code { color: var(--text-faint); font-size: 0.8em; }
  .pal { display: flex; gap: 4px; }
  .pc { all: unset; cursor: pointer; width: 16px; height: 16px; border-radius: 50%; background: var(--c); }
  .pc[aria-checked="true"] { box-shadow: 0 0 0 2px var(--bg-elev, var(--bg)), 0 0 0 4px var(--c); }
  .pc:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .none { color: var(--text-faint); margin: 4px 0; }
</style>
