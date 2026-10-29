<script lang="ts">
  // The `captures` block (docs/design/DESIGN-capture-triage.md): every capture — a line of a day's log, a note of the
  // inbox — by day, with what became of it, and the answers that triage it. Each answer is written into the capture's
  // own file by the core (`POST /api/captures/triage`); this only lists and asks.
  //   type: captures
  //   show: open        # open (default: still to triage) | tasks | all
  import { onMount } from "svelte";
  import { listVault } from "../../lib/vault";
  import { reloadOnChange } from "../../lib/reload-on-change";
  import { parse as parseYaml } from "yaml";
  import { api } from "../../lib/api";
  import { openPath } from "../../lib/dock";
  import { md } from "../../lib/markdown";
  import { pick } from "../../lib/palette.svelte";
  import { shownName, shownPath } from "../../lib/paths";
  import { followRenderedLink } from "../../lib/rendered-links";
  import { settings } from "../../lib/settings.svelte";
  import { toast } from "../../lib/state.svelte";
  import { errText } from "../../lib/text";
  import Icon from "../Icon.svelte";
  import type { CaptureItem } from "../../lib/gen/CaptureItem";
  import type { CaptureState } from "../../lib/gen/CaptureState";
  import type { TriageAction } from "../../lib/gen/TriageAction";
  import type { IconName } from "../../lib/panes";

  type Show = "open" | "tasks" | "all";
  let { src = "" }: { src?: string } = $props();
  const asked = $derived.by((): Show => {
    try { const s = String((parseYaml(src) ?? {}).show ?? ""); return s === "tasks" || s === "all" ? s : "open"; } catch { return "open"; }
  });
  let chosen = $state<Show | null>(null);
  const show = $derived(chosen ?? asked);

  let items = $state<CaptureItem[]>([]);
  let open = $state(0);
  let error = $state("");
  let loaded = $state(false);
  let busy = $state(new Set<string>());

  const SHOWN: Record<Show, (c: CaptureItem) => boolean> = { open: (c) => c.state === "open", tasks: (c) => c.state === "task", all: () => true };
  const shown = $derived(items.filter(SHOWN[show]));
  const tasks = $derived(items.filter(SHOWN.tasks).length);
  const byDay = $derived.by(() => {
    const out: { day: string; rows: CaptureItem[] }[] = [];
    for (const c of shown) (out.at(-1)?.day === c.day ? out.at(-1)! : (out.push({ day: c.day, rows: [] }), out.at(-1)!)).rows.push(c);
    return out;
  });

  const key = (c: CaptureItem) => `${c.path}:${c.line}`;
  const dayLabel = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Undated");
  const STATE: Record<CaptureState, { label: string; icon: IconName | null }> = {
    open: { label: "To triage", icon: null }, task: { label: "Task", icon: null }, done: { label: "Done", icon: "check" },
    filed: { label: "Filed", icon: "arrow-right" }, dismissed: { label: "Dismissed", icon: "minus" },
  };

  async function load() {
    try { const l = await api.captures(); items = l.items; open = l.open; error = ""; }
    catch (e) { error = errText(e); }
    loaded = true;
  }
  onMount(() => {
    void load();
    return reloadOnChange(() => void load(), { wait: 400, wants: (p) => p.endsWith(".md") });
  });

  async function triage(c: CaptureItem, action: TriageAction) {
    busy = new Set(busy).add(key(c));
    try { await api.triageCapture({ path: c.path, line: c.line, source: c.source, action }); }
    catch (e) { toast("Could not triage the capture", /409/.test(String(e)) ? "The line changed since it was listed — shown again as it is now." : errText(e), "error"); }
    busy.delete(key(c));
    busy = new Set(busy);
    await load();
  }
  /** "File into…": an existing note, or a new one named as typed (in the notes folder). */
  function fileInto(c: CaptureItem) {
    const dir = (settings.config?.notes.dir ?? "notes").replace(/\/+$/, "");
    pick({
      placeholder: `File “${c.text.slice(0, 60)}” into…`, tag: "Note", icon: "file-text",
      items: async () => (await listVault()).filter((p) => /\.md$/i.test(p) && p !== c.path).map((p) => ({ value: p, title: shownName(p), detail: shownPath(p) })),
      typed: (t) => `New note “${t}”`,
      onpick: (v, isNew) => triage(c, { kind: "file", note: isNew ? `${dir ? `${dir}/` : ""}${v.replace(/\.md$/i, "")}.md` : v }),
    });
  }
  const where = (c: CaptureItem) => (c.kind === "note" ? `Open ${c.path}` : `Open ${c.path} at line ${c.line}`);
  function onTextClick(e: MouseEvent, c: CaptureItem) {
    if (followRenderedLink(e, c.path, e.button === 1)) return;
    if ((e.target as HTMLElement).closest("a")) return;
    openPath(c.path, c.line || undefined);
  }
</script>

<section class="captures" aria-label="Captures" data-testid="captures">
  <header>
    <span class="label">Captures</span>
    <div class="tabs" role="tablist">
      {#each [["open", `To triage`, open], ["tasks", "Tasks", tasks], ["all", "All", items.length]] as const as [s, label, n] (s)}
        <button role="tab" class="tab" class:on={show === s} aria-selected={show === s} onclick={() => (chosen = s)}>{label}<span class="n">{n}</span></button>
      {/each}
    </div>
  </header>
  {#if error}<p class="view-error">{error}</p>
  {:else if loaded && !shown.length}
    <p class="empty">{show === "open" ? "Nothing to triage: every capture has found its place." : show === "tasks" ? "No open tasks among the captures." : "Nothing captured yet."}</p>
  {:else}
    {#each byDay as g (g.day)}
      <h3 class="day">{dayLabel(g.day)}</h3>
      <ul>
        {#each g.rows as c (key(c))}
          <li class="row st-{c.state}" class:busy={busy.has(key(c))} data-state={c.state}>
            <span class="time">{c.time ?? ""}</span>
            <span class="mark" title={STATE[c.state].label}>
              {#if c.state === "task"}<button class="box" aria-label="Mark done: {c.text}" title="Done" onclick={() => triage(c, { kind: "done" })}></button>
              {:else if STATE[c.state].icon}<Icon name={STATE[c.state].icon!} size={13} />
              {:else}<span class="dot"></span>{/if}
            </span>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <span class="text" title={where(c)} onclick={(e) => onTextClick(e, c)}>
              {#if c.kind === "note"}<Icon name="inbox" size={12} />{/if}
              {@html md.renderInline(c.text)}
              {#if c.filed}<span class="filed">→ {c.filed}</span>{/if}
            </span>
            <span class="acts">
              {#if c.state === "open"}
                <button class="act" onclick={() => triage(c, { kind: "task" })} title="Make it a to-do (- [ ])"><Icon name="list-todo" size={13} />Task</button>
              {/if}
              {#if c.state === "open" || c.state === "task"}
                <button class="act" onclick={() => fileInto(c)} title="Add it to a note, and link it from here"><Icon name="arrow-right" size={13} />File…</button>
                <button class="act" onclick={() => triage(c, { kind: "dismiss" })} title="Seen; nothing to do ([-])"><Icon name="close" size={13} />Dismiss</button>
              {:else}
                <button class="act" onclick={() => triage(c, { kind: "reopen" })} title="Back to the captures to triage"><Icon name="undo" size={13} />Reopen</button>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</section>

<style>
  .captures { display: flex; flex-direction: column; gap: 2px; font-size: calc(14px * var(--ui-scale, 1)); }
  header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
  .label { font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted); }
  .tabs { display: flex; gap: 4px; margin-left: auto; }
  .tab { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; min-height: 26px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .tab:hover { background: var(--bg-hover); color: var(--text); }
  .tab.on { background: color-mix(in srgb, var(--accent) 14%, transparent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--text); }
  .n { font-variant-numeric: tabular-nums; color: var(--text-faint); font-size: .92em; }
  .day { margin: 10px 0 2px; font-size: calc(12px * var(--ui-scale, 1)); font-weight: 600; color: var(--text-muted); letter-spacing: .02em; }
  ul { list-style: none; margin: 0; padding: 0; }
  /* one grid for every capture: time | marker | text | answers — a task's box sits where a note's dot does */
  .row { display: grid; grid-template-columns: 3.4em 1.4em minmax(0, 1fr) auto; align-items: baseline; column-gap: 6px; padding: 4px 0; line-height: 1.45; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  .row:first-child { border-top: 0; }
  .row.busy { opacity: .5; pointer-events: none; }
  .time { text-align: right; font-size: .82em; font-variant-numeric: tabular-nums; color: var(--text-muted); font-weight: 500; }
  .mark { display: inline-flex; justify-content: center; align-self: center; color: var(--text-faint); }
  .dot { width: 8px; height: 8px; border-radius: 50%; border: 2px solid var(--accent); box-sizing: border-box; }
  .box { width: 14px; height: 14px; border: 1.5px solid var(--text-faint); border-radius: 4px; background: transparent; padding: 0; transform: translateY(2px); }
  .box:hover { border-color: var(--accent); }
  .text { cursor: pointer; overflow-wrap: anywhere; min-width: 0; }
  .text :global(.icon) { vertical-align: -1px; margin-right: 4px; color: var(--text-faint); }
  .filed { margin-left: 6px; color: var(--text-faint); font-size: .88em; }
  .st-done .text, .st-dismissed .text { color: var(--text-muted); }
  .st-dismissed .text { text-decoration: line-through; text-decoration-color: var(--text-faint); }
  .acts { display: inline-flex; gap: 4px; opacity: .55; transition: opacity .12s; }
  .row:hover .acts, .row:focus-within .acts { opacity: 1; }
  .act { display: inline-flex; align-items: center; gap: 4px; min-height: 24px; padding: 0 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: calc(12px * var(--ui-scale, 1)); }
  .act:hover { background: var(--bg-hover); border-color: var(--border-strong); }
  .empty { margin: 6px 0; color: var(--text-muted); }
  @media (max-width: 560px) { .row { grid-template-columns: 3em 1.2em minmax(0, 1fr); } .acts { grid-column: 3; opacity: 1; } }
</style>
