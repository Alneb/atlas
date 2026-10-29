<script lang="ts">
  // The list (DESIGN-mail-ui §3): one row per conversation — unread dot, senders with the count, the date, the subject
  // (bold when unread), a line of preview, labels and marks; on hover its actions, so the mouse never travels. Only the
  // rows in view are drawn (thousands scroll smoothly). A checked row shows a check where the avatar is; rows drag onto
  // a folder; on a touch screen a swipe left archives, right marks read / unread.
  import { untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import { hue, initials, senders, snoozeTimes, when, type Row } from "./api";
  import type { Mail } from "./store.svelte";

  let { mail, compact = false, onopen }: { mail: Mail; compact?: boolean; onopen: (r: Row) => void } = $props();

  const H = $derived(compact ? 34 : 76);
  // the inbox's important conversations come first (the engine's order) under their own heading, the rest under another
  const HDR = 28;
  const pinned = $derived.by(() => {
    if (!mail.pinning) return 0;
    const i = mail.rows.findIndex((r) => !r.flagged);
    return i < 0 ? mail.rows.length : i;
  });
  const y = (i: number) => i * H + (pinned ? (i < pinned ? HDR : 2 * HDR) : 0);
  let box: HTMLDivElement | undefined = $state();
  let top = $state(0);
  let height = $state(600);
  const first = $derived(Math.max(0, Math.floor(top / H) - 8));
  const last = $derived(Math.min(mail.rows.length, Math.ceil((top + height) / H) + 8));
  const shown = $derived(mail.rows.slice(first, last));

  // the cursor stays in view as j / k move it — only when the cursor moves: rows added below must not scroll back
  $effect(() => {
    void mail.cursor;
    const i = untrack(() => mail.index());
    if (!box || i < 0) return;
    const at = untrack(() => y(i));
    if (at < box.scrollTop) box.scrollTop = Math.max(0, at - (i === 0 || i === pinned ? HDR : 0));
    else if (at + H > box.scrollTop + box.clientHeight) box.scrollTop = at + H - box.clientHeight;
  });

  // rows scrolled to whose message was never fetched get their preview, once the scroll rests
  let rest: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const rows = shown;
    clearTimeout(rest);
    rest = setTimeout(() => untrack(() => mail.fillSnippets(rows)), 250);
    return () => clearTimeout(rest);
  });

  function scrolled() {
    if (!box) return;
    top = box.scrollTop;
    if (box.scrollTop + box.clientHeight > box.scrollHeight - H * 10) mail.more();
  }

  function click(e: MouseEvent, r: Row) {
    if (e.shiftKey) { mail.extend(r.id); return; }
    if (e.ctrlKey || e.metaKey) { mail.toggle(r.thread); mail.cursor = r.id; return; }
    onopen(r);
  }

  function drag(e: DragEvent, r: Row) {
    const ids = mail.checked.includes(r.thread) ? mail.rows.filter((x) => mail.checked.includes(x.thread)).map((x) => x.id) : [r.id];
    e.dataTransfer?.setData("application/x-atlas-mail", JSON.stringify(ids));
    e.dataTransfer?.setData("text/plain", `${ids.length} conversation${ids.length === 1 ? "" : "s"}`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  // swipe (touch): a row follows the finger; past a third of its width it acts
  let swipe = $state<{ id: number; x0: number; dx: number } | null>(null);
  function down(e: PointerEvent, r: Row) {
    if (e.pointerType !== "touch") return;
    swipe = { id: r.id, x0: e.clientX, dx: 0 };
  }
  function moveP(e: PointerEvent) {
    if (swipe) swipe.dx = e.clientX - swipe.x0;
  }
  function up(e: PointerEvent, r: Row) {
    if (!swipe || swipe.id !== r.id) return;
    const w = (e.currentTarget as HTMLElement).clientWidth;
    const dx = swipe.dx;
    swipe = null;
    if (dx < -w / 3) mail.archive([r]);
    else if (dx > w / 3) mail.toggleRead([r]);
  }
  const labelHue = (l: string) => hue(l);
</script>

<div class="list" class:compact bind:this={box} bind:clientHeight={height} onscroll={scrolled} role="listbox" aria-label="Conversations" aria-multiselectable="true" tabindex="-1">
  <div class="pad" style:height="{mail.rows.length * H + (pinned ? 2 * HDR : 0)}px">
    {#if pinned}
      <div class="sect" style:top="0"><Icon name="star" size={13} filled /> Important<span class="faint">{pinned}</span></div>
      {#if pinned < mail.rows.length}<div class="sect" style:top="{pinned * H + HDR}px">Everything else</div>{/if}
    {/if}
    {#each shown as r, i (r.thread)}
      {@const at = first + i}
      {@const checked = mail.checked.includes(r.thread)}
      {@const sx = swipe?.id === r.id ? swipe.dx : 0}
      <div class="row" class:unread={r.unread > 0} class:cursor={mail.cursor === r.id} class:open={mail.openId === r.id} class:checked
        style:top="{y(at)}px" style:height="{H}px" style:transform={sx ? `translateX(${sx}px)` : undefined}
        role="option" aria-selected={checked || mail.openId === r.id} tabindex="-1" draggable="true"
        onclick={(e) => click(e, r)} onkeydown={() => {}} ondragstart={(e) => drag(e, r)}
        onpointerdown={(e) => down(e, r)} onpointermove={moveP} onpointerup={(e) => up(e, r)} onpointercancel={() => (swipe = null)}>
        {#if sx}<div class="swipe" class:left={sx < 0}>{sx < 0 ? "Archive" : r.unread ? "Read" : "Unread"}</div>{/if}
        <button class="avatar" style:--h={hue(r.from.at(-1)?.addr ?? r.subject)} onclick={(e) => { e.stopPropagation(); mail.toggle(r.thread); }} aria-label={checked ? "Uncheck" : "Check"} aria-pressed={checked}>
          {#if checked}<Icon name="check" size={15} />{:else if compact}<span class="dotonly" class:on={r.unread > 0}></span>{:else}{initials(r.from.at(-1))}{/if}
        </button>
        <div class="main">
          <div class="line1">
            {#if r.unread > 0 && !compact}<span class="udot" aria-label="unread"></span>{/if}
            <span class="who">{r.draft && r.count === 1 ? "Draft" : senders(r.from, mail.own)}{#if r.count > 1}<span class="count">{r.count}</span>{/if}{#if r.draft && r.count > 1}<span class="draftmark"> · Draft</span>{/if}</span>
            {#if compact}<span class="subject">{r.subject || "(no subject)"}<span class="snip"> — {r.snippet}</span></span>{/if}
            <span class="marks">
              {#if r.has_attachments}<Icon name="attach" size={13} title="has files" />{/if}
              {#if r.saved}<Icon name="note" size={13} title="saved as a note" />{/if}
              {#if r.flagged}<span class="star"><Icon name="star" size={14} filled title="starred" /></span>{/if}
            </span>
            <time class="date" datetime={new Date(r.date * 1000).toISOString()}>{when(r.date)}</time>
          </div>
          {#if !compact}
            <div class="line2"><span class="subject">{r.subject || "(no subject)"}</span></div>
            <div class="line3">
              {#if mail.view.name !== "folder" && mail.view.account === null && mail.accounts.length > 1}<span class="chip acct">{r.account}</span>{/if}
              {#each r.labels.slice(0, 3) as l (l)}<span class="chip" style:--h={labelHue(l)}>{l.replace(/^\$/, "")}</span>{/each}
              <span class="snip">{r.snippet_missing ? "…" : r.snippet}</span>
            </div>
          {/if}
        </div>
        <div class="hover" role="toolbar" aria-label="Actions">
          <button onclick={(e) => { e.stopPropagation(); mail.archive([r]); }} title="Archive (e)"><Icon name="archive" /></button>
          <button onclick={(e) => { e.stopPropagation(); mail.trash([r]); }} title="Delete (#)"><Icon name="trash" /></button>
          <button onclick={(e) => { e.stopPropagation(); mail.toggleRead([r]); }} title={r.unread ? "Mark read" : "Mark unread"}><Icon name={r.unread ? "read" : "unread"} /></button>
          <button onclick={(e) => { e.stopPropagation(); mail.snooze(snoozeTimes()[0].at, [r]); }} title="Snooze (h for when)"><Icon name="clock" /></button>
        </div>
      </div>
    {/each}
  </div>
  {#if mail.loading && !mail.rows.length}
    {#each Array(8) as _, i (i)}<div class="ghost" style:top="{i * H}px" style:height="{H}px"><span></span><span></span></div>{/each}
  {/if}
</div>

<style>
  .list { position: relative; overflow-y: auto; height: 100%; outline: none; contain: strict; }
  .pad { position: relative; }
  .row { position: absolute; left: 0; right: 0; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 10px; border-bottom: 1px solid var(--border); cursor: default; user-select: none; transition: transform 120ms var(--ease); }
  .row:hover { background: var(--bg-hover); }
  .row.cursor { box-shadow: inset 3px 0 0 var(--accent); }
  .row.open { background: var(--accent-soft); }
  .row.checked { background: var(--accent-sel); }
  .avatar { all: unset; flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 600; color: #fff; background: hsl(var(--h) 45% 46%); cursor: pointer; }
  .compact .avatar { width: 20px; height: 20px; background: transparent; color: var(--text-faint); }
  .checked .avatar { background: var(--accent); color: var(--accent-fg); }
  .avatar:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .dotonly { width: 8px; height: 8px; border-radius: 50%; }
  .dotonly.on { background: var(--accent); }
  .main { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .line1, .line2, .line3 { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .udot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }
  .who { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .compact .who { flex: 0 0 28%; }
  .unread .who, .unread .subject { font-weight: 650; color: var(--heading); }
  .count { margin-left: 5px; color: var(--text-faint); font-size: 0.86em; font-weight: 400; }
  .draftmark { color: var(--red); font-weight: 400; }
  .marks { margin-left: auto; display: flex; gap: 4px; align-items: center; color: var(--text-faint); }
  .star { color: var(--yellow); }
  .date { flex: none; color: var(--text-muted); font-size: 0.85em; font-variant-numeric: tabular-nums; }
  .unread .date { color: var(--text); font-weight: 600; }
  .subject { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .compact .subject { flex: 1; }
  .snip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-size: 0.92em; }
  .chip { flex: none; font-size: 0.78em; padding: 0 6px; border-radius: 999px; background: hsl(var(--h, 220) 60% 50% / 0.16); color: var(--text); line-height: 1.6; }
  .chip.acct { background: var(--bg-active); color: var(--text-muted); }
  /* over the date's line (hidden on hover), not over the subject; centred in a one-line compact row */
  .hover { position: absolute; right: 8px; top: 5px; display: none; gap: 0; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 1px; box-shadow: var(--shadow-sm); }
  .row:hover .hover { display: flex; }
  .compact .hover { top: 50%; transform: translateY(-50%); }
  .row:hover .date, .row:hover .marks { visibility: hidden; }
  .hover button { all: unset; cursor: pointer; padding: 2px 5px; border-radius: var(--radius-sm); color: var(--text-muted); min-width: 22px; min-height: 20px; display: grid; place-items: center; }
  .hover button:hover { background: var(--bg-hover); color: var(--text); }
  .swipe { position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-start; padding: 0 20px; color: #fff; background: var(--green); font-weight: 600; z-index: -1; }
  .swipe.left { justify-content: flex-end; background: var(--accent); }
  .ghost { position: absolute; left: 0; right: 0; padding: 14px 16px 0 54px; display: grid; gap: 8px; border-bottom: 1px solid var(--border); }
  .ghost span { height: 10px; border-radius: 4px; background: var(--bg-hover); width: 40%; }
  .ghost span + span { width: 75%; }
  @media (prefers-reduced-motion: reduce) { .row { transition: none; } }
  .sect { position: absolute; left: 0; right: 0; height: 28px; display: flex; align-items: center; gap: 6px; padding: 0 14px; font-size: 0.78em; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); background: var(--bg-secondary, var(--bg)); border-bottom: 1px solid var(--border); }
  .sect .faint { font-weight: 400; margin-left: 2px; }
  @media (hover: none) { .hover { display: none !important; } }
</style>
