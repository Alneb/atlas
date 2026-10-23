<script lang="ts">
  import { errText } from "../../lib/text";
  import { shownName, shownPath } from "../../lib/paths";
  import { superOf } from "../../lib/keys";
  // The `review` block (docs/design/NOTES-SYSTEM.md): notes waiting to be looked at, one at a time — an inbox
  // of fleeting notes, or anything asked to come back later. Each answer is one property written to
  // the note (`review:` a date or "done", `review_interval:` days), so the queue is in the files.
  //   type: review
  //   filters: 'type == "fleeting"'    # Bases filters: which notes; without it, notes that have `review:`
  //   types: [literature, atomic, project]   # what "Keep as…" offers
  import { onMount } from "svelte";
  import { parse as parseYaml, stringify } from "yaml";
  import { api } from "../../lib/api";
  import { queryRows, type Row } from "../../lib/base-rows";
  import { on } from "../../lib/bus";
  import { openPath } from "../../lib/dock";
  import { pick } from "../../lib/palette.svelte";
  import Markdown from "../Markdown.svelte";

  let { src, doc }: { src: string; doc: string } = $props();
  const options = $derived.by(() => { try { return (parseYaml(src) ?? {}) as Record<string, unknown>; } catch { return {}; } });
  const types = $derived(Array.isArray(options.types) ? options.types.map(String) : ["literature", "atomic", "project"]);

  let queue = $state<Row[]>([]);
  let at = $state(0);
  let text = $state("");
  let error = $state("");
  let loaded = $state(false);
  const cur = $derived(queue[Math.min(at, queue.length - 1)]);
  const name = shownName;

  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  /** Waiting now: never answered (in a filtered inbox), or its date has come. "done" never returns. */
  function due(r: Row): boolean {
    const v = r.review === null || r.review === undefined ? "" : String(r.review).slice(0, 10);
    if (!v) return options.filters !== undefined;
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= iso(new Date());
  }

  async function load() {
    try {
      const yaml = stringify({ ...(options.filters === undefined ? {} : { filters: options.filters }), views: [{ type: "table", order: ["file.name", "review", "review_interval"] }] });
      const keep = cur?.path;
      queue = (await queryRows(yaml, doc)).filter(due).sort((a, b) => String(a.review ?? "").localeCompare(String(b.review ?? "")) || a.path.localeCompare(b.path));
      at = Math.max(0, keep ? queue.findIndex((r) => r.path === keep) : 0);
      error = "";
    } catch (e) { error = errText(e); }
    loaded = true;
  }
  // the note itself, read when it becomes the current one
  $effect(() => {
    const p = cur?.path;
    text = "";
    if (p) void api.file(p).then((f) => { if (cur?.path === p) text = f.text.split("\n").slice(0, 80).join("\n"); }, () => {});
  });
  onMount(() => {
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = on("fs", (e) => { if (!e.paths.length || e.paths.some((p) => p.endsWith(".md"))) { clearTimeout(t); t = setTimeout(load, 600); } });
    return () => { off(); clearTimeout(t); };
  });

  /** One answer: write the properties, and show the next note at once (the file event confirms). */
  async function answer(props: Record<string, string>) {
    const r = cur;
    if (!r) return;
    queue = queue.filter((x) => x.path !== r.path);
    try { for (const [key, value] of Object.entries(props)) await api.setProperty({ path: r.path, key, text: value, list: false }); }
    catch (e) { error = errText(e); void load(); }
  }
  const tomorrow = () => answer({ review: inDays(1) });
  /** Snooze with a doubling gap: 2 days, then 4, 8… (spaced, so what matters keeps coming back less often) */
  const later = () => { const n = Math.max(2, Number(cur?.review_interval) || 2); return answer({ review: inDays(n), review_interval: String(n * 2) }); };
  const done = () => answer({ review: "done" });
  function keepAs() {
    const r = cur;
    if (!r) return;
    pick({
      placeholder: `Keep “${name(r.path)}” as…`, tag: "Type", icon: "file-text",
      items: types.map((t) => ({ value: t, title: t })),
      typed: (t) => `Another type: ${t}`,
      onpick: (v) => void answer({ type: v, review: "done" }),
    });
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey || superOf(e) || !cur) return;
    const run: Record<string, () => void> = {
      o: () => openPath(cur.path), Enter: () => openPath(cur.path), t: () => void tomorrow(), l: () => void later(), d: () => void done(), k: keepAs,
      n: () => { at = (at + 1) % queue.length; }, p: () => { at = (at - 1 + queue.length) % queue.length; },
    };
    const f = run[e.key];
    if (f) { e.preventDefault(); f(); }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<section class="review" tabindex="0" aria-label="Review" {onkeydown} data-testid="review">
  {#if queue.length}
    <header>
      <span class="label">Review</span>
      <span class="count">{Math.min(at, queue.length - 1) + 1} of {queue.length}</span>
    </header>
  {/if}
  {#if error}<p class="view-error">{error}</p>
  {:else if cur}
    <button class="title" onclick={() => openPath(cur.path)} title="Open {cur.path}">{name(cur.path)}</button>
    <div class="where">{shownPath(cur.path)}</div>
    <div class="body">{#if text}<Markdown {text} path={cur.path} />{/if}</div>
    <footer>
      <button class="act primary" onclick={() => openPath(cur.path)}>Open <kbd>O</kbd></button>
      <button class="act" onclick={keepAs} title="It is a real note now: give it a type">Keep as… <kbd>K</kbd></button>
      <button class="act" onclick={tomorrow}>Tomorrow <kbd>T</kbd></button>
      <button class="act" onclick={later} title="Not now: in {Math.max(2, Number(cur.review_interval) || 2)} days, then twice as long each time">Later <kbd>L</kbd></button>
      <button class="act" onclick={done} title="Seen; it will not come back">Done <kbd>D</kbd></button>
      {#if queue.length > 1}<button class="act skip" onclick={() => (at = (at + 1) % queue.length)}>Skip <kbd>N</kbd></button>{/if}
    </footer>
  {:else if loaded}
    <p class="empty">Nothing is waiting for review.</p>
  {/if}
</section>

<style>
  .review { display: flex; flex-direction: column; gap: 6px; outline: none; border-radius: var(--radius); }
  .review:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
  header { display: flex; align-items: baseline; gap: 8px; }
  .label { font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted); }
  .count { margin-left: auto; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); font-variant-numeric: tabular-nums; }
  .title { align-self: flex-start; text-align: left; font-size: calc(19px * var(--ui-scale, 1)); font-weight: 650; letter-spacing: -.01em; color: var(--heading); text-wrap: balance; }
  .title:hover { color: var(--accent); }
  .where { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); font-family: var(--font-mono); }
  .body { max-height: 240px; overflow: auto; padding: 4px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); min-height: 48px; }
  footer { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
  .act { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--text); font-size: calc(12.5px * var(--ui-scale, 1)); background: var(--bg); }
  .act:hover { background: var(--bg-hover); border-color: var(--border-strong); }
  .act.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .act.primary:hover { background: var(--accent-strong); }
  .act.primary kbd { background: color-mix(in srgb, var(--accent-fg) 18%, transparent); color: inherit; border-color: transparent; }
  .act.skip { margin-left: auto; color: var(--text-muted); }
  .empty { margin: 0; color: var(--text-muted); }
</style>
