<script lang="ts">
  // The triage card (`email.inbox` block on Home, and the side tool): what needs the user, from the index at once —
  // important conversations, then people's mail (unread first), newsletters and notifications folded to one line each.
  // Each row archives, stars, snoozes, marks read on hover or by key (j/k e s h u r Enter while the card has focus),
  // with Undo; r answers inline under the row (sent after the Undo-send delay). Live: it redraws when mail arrives.
  import Icon from "./Icon.svelte";
  import { call, hue, initials, senders, setting, snoozeTimes, when, type Account, type Draft, type Moved, type PluginApi, type Row } from "./api";

  let { atlas, options = {}, onopen }: { atlas: PluginApi; options?: Record<string, unknown>; onopen: (detail: Record<string, unknown>) => void } = $props();
  const limit = $derived(Number(options.limit ?? 8) || 8);
  const account = $derived(String(options.account ?? ""));

  type Counts = Record<string, { total: number; unread: number }>;
  let important = $state<Row[]>([]);
  let people = $state<Row[]>([]);
  let counts = $state<Counts>({});
  let accounts = $state<Account[]>([]);
  let own = $state<string[]>([]);
  let error = $state("");
  let loaded = $state(false);
  let cursor = $state<number | null>(null);
  // today's events, from the Calendar plugin when it is there
  let today = $state<{ time: string; line: string; summary?: string; location?: string }[]>([]);
  let note = $state<{ text: string; undo?: () => Promise<void> } | null>(null);
  let snoozing = $state<number | null>(null);
  let reply = $state<{ id: number; text: string; draft: Partial<Draft> | null; sending: boolean } | null>(null);
  let root: HTMLDivElement | undefined = $state();

  const all = $derived([...important, ...people]);
  const busy = new Set<number>();

  async function load() {
    try {
      const base = { view: "inbox", account };
      const [a, imp, unread, recent, c] = await Promise.all([
        call<{ accounts: Account[]; own: string[] }>(atlas, "accounts", {}, 30),
        call<{ rows: Row[] }>(atlas, "list", { ...base, quick: "starred", limit: 6 }, 30),
        call<{ rows: Row[] }>(atlas, "list", { ...base, kind: "person", quick: "unread", limit }, 30),
        call<{ rows: Row[] }>(atlas, "list", { ...base, kind: "person", limit }, 30),
        call<Counts>(atlas, "count", { account }, 30),
      ]);
      accounts = account ? a.accounts.filter((x) => x.name === account) : a.accounts;
      own = a.own;
      important = imp.rows.filter((r) => !busy.has(r.id));
      // people: the unread ones (however old), then the newest read ones, without the important ones
      const seen = new Set(important.map((r) => r.thread));
      const take = (rs: Row[]) => rs.filter((r) => !seen.has(r.thread) && !busy.has(r.id) && (seen.add(r.thread), true));
      people = [...take(unread.rows), ...take(recent.rows)].slice(0, limit);
      counts = c;
      error = "";
      call<{ events: typeof today } | null>(atlas, "agenda", { days: 1 }, 20).then((a) => { today = a?.events ?? []; }).catch(() => {});
      if (cursor !== null && !all.some((r) => r.id === cursor)) cursor = null;
    } catch (e) { error = (e as Error).message; }
    loaded = true;
  }
  $effect(() => {
    load();
    const offs = [atlas.helper.on("changed", () => load()), atlas.helper.on("new", () => load())];
    return () => offs.forEach((o) => o());
  });

  function say(text: string, undo?: () => Promise<void>) {
    note = { text, undo };
    const mine = note;
    setTimeout(() => { if (note === mine) note = null; }, 6000);
  }

  // the row leaves at once; the server is told behind; Undo puts it back
  async function leave(r: Row, label: string, run: () => Promise<{ moved: Moved[] }>) {
    busy.add(r.id);
    const was = { important: important.slice(), people: people.slice() };
    important = important.filter((x) => x.id !== r.id);
    people = people.filter((x) => x.id !== r.id);
    try {
      const { moved } = await run();
      say(label, moved?.length ? async () => { await call(atlas, "undo", { moved }); load(); } : undefined);
    } catch (e) {
      important = was.important; people = was.people;
      say(`${label} failed: ${(e as Error).message}`);
    } finally { busy.delete(r.id); }
  }
  const archive = (r: Row) => leave(r, "Archived", () => call(atlas, "archive", { ids: [r.id] }));
  const snooze = (r: Row, at: number, label: string) => { snoozing = null; return leave(r, `Snoozed until ${label}`, () => call(atlas, "snooze", { ids: [r.id], until: at })); };

  async function mark(r: Row, what: "read" | "starred", on: boolean) {
    const before = { unread: r.unread, flagged: r.flagged };
    if (what === "read") r.unread = on ? 0 : 1; else r.flagged = on;
    try {
      await call(atlas, "mark", { ids: [r.id], [what]: on });
      say(what === "read" ? (on ? "Marked read" : "Marked unread") : on ? "Starred" : "Unstarred", async () => { await call(atlas, "mark", { ids: [r.id], [what]: !on }); load(); });
      if (what === "starred") load();
    } catch (e) { r.unread = before.unread; r.flagged = before.flagged; say(`Failed: ${(e as Error).message}`); }
  }

  async function startReply(r: Row) {
    reply = { id: r.id, text: "", draft: null, sending: false };
    try {
      const d = await call<Partial<Draft>>(atlas, "compose_for", { id: r.id, mode: "reply" });
      if (reply?.id === r.id) reply.draft = d;
    } catch (e) { say(`Cannot answer: ${(e as Error).message}`); reply = null; }
  }
  async function sendReply() {
    if (!reply?.draft || !reply.text.trim()) return;
    const payload = { ...reply.draft, body: reply.text };
    const to = reply.draft.to ?? "";
    reply.sending = true;
    const wait = Number(setting(atlas, "undo_send", 10)) * 1000;
    let undone = false;
    const kept = reply;
    reply = null;
    say(`Sending to ${to.replace(/<.*?>/g, "").trim() || to}…`, async () => { undone = true; reply = { ...kept, sending: false }; });
    setTimeout(async () => {
      if (undone) return;
      try { await call(atlas, "send", payload, 300); say("Sent"); load(); }
      catch (e) { reply = { ...kept, sending: false }; say(`Not sent: ${(e as Error).message}`); }
    }, wait);
  }

  function key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest("textarea, input")) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReply(); }
      else if (e.key === "Escape") { reply = null; root?.focus(); }
      e.stopPropagation();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const i = all.findIndex((r) => r.id === cursor);
    const r = all[i];
    const step = (by: number) => { const n = all[Math.max(0, Math.min(all.length - 1, (i < 0 ? -1 : i) + by))]; if (n) cursor = n.id; };
    const acts: Record<string, () => void> = {
      j: () => step(1), ArrowDown: () => step(1), k: () => step(-1), ArrowUp: () => step(-1),
      Enter: () => r && onopen({ id: r.id }), o: () => r && onopen({ id: r.id }),
      e: () => r && archive(r), s: () => r && mark(r, "starred", !r.flagged),
      u: () => r && mark(r, "read", r.unread > 0), h: () => r && (snoozing = r.id), r: () => r && startReply(r),
      c: () => onopen({ compose: {} }),
    };
    const f = acts[e.key];
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    f();
  }

  const folded = $derived(([["newsletter", "Newsletters", "news"], ["notification", "Notifications", "bell"]] as const).map(([k, label, icon]) => ({ k, label, icon, n: counts[k]?.unread ?? 0 })).filter((x) => x.n > 0));
  const peopleUnread = $derived(counts.person?.unread ?? 0);
</script>

{#snippet line(r: Row)}
  <div class="row" class:unread={r.unread > 0} class:cursor={cursor === r.id} role="option" aria-selected={cursor === r.id} tabindex="-1">
    <button class="open" onclick={() => { cursor = r.id; onopen({ id: r.id }); }} title={r.subject}>
      <span class="av" style:--h={hue(r.from.at(-1)?.addr ?? "")}>{initials(r.from.at(-1))}</span>
      <span class="main">
        <span class="l1"><span class="who">{senders(r.from, own)}{#if r.count > 1}<span class="cnt">{r.count}</span>{/if}</span>{#if r.flagged}<Icon name="star" size={12} filled />{/if}<time>{when(r.date)}</time></span>
        <span class="l2"><span class="subj">{r.subject || "(no subject)"}</span>{#if r.snippet}<span class="snip">{" — "}{r.snippet}</span>{/if}</span>
      </span>
    </button>
    <span class="acts">
      <button onclick={() => archive(r)} title="Archive (e)"><Icon name="archive" size={15} /></button>
      <button onclick={() => mark(r, "starred", !r.flagged)} title={r.flagged ? "Unstar (s)" : "Star (s)"}><Icon name="star" size={15} filled={r.flagged} /></button>
      <button onclick={() => (snoozing = snoozing === r.id ? null : r.id)} title="Snooze (h)"><Icon name="clock" size={15} /></button>
      <button onclick={() => startReply(r)} title="Reply (r)"><Icon name="reply" size={15} /></button>
    </span>
  </div>
  {#if snoozing === r.id}
    <div class="snooze" role="menu">
      {#each snoozeTimes() as t (t.label)}<button role="menuitem" onclick={() => snooze(r, t.at, t.label.split(" · ")[0])}>{t.label}</button>{/each}
    </div>
  {/if}
  {#if reply?.id === r.id}
    <div class="reply">
      <!-- svelte-ignore a11y_autofocus -->
      <textarea bind:value={reply.text} rows="3" placeholder={reply.draft ? `Reply to ${(reply.draft.to ?? "").replace(/<.*?>/g, "").trim()}…  (Ctrl+Enter sends)` : "…"} autofocus disabled={!reply.draft}></textarea>
      <div class="rbar">
        <button class="ghost" onclick={() => { onopen({ reply: { id: r.id, mode: "reply" } }); reply = null; }}>Open in Email</button>
        <span class="grow"></span>
        <button class="ghost" onclick={() => (reply = null)}>Cancel</button>
        <button class="primary" disabled={!reply.draft || !reply.text.trim()} onclick={sendReply}><Icon name="send" size={13} /> Send</button>
      </div>
    </div>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="card" bind:this={root} tabindex="0" onkeydown={key} role="listbox" aria-label="Mail to answer">
  <header>
    {#each accounts as a (a.name)}
      <button class="acct" class:bad={!!a.error || a.status?.state === "error"} onclick={() => onopen({ view: "inbox", account: a.name })} title={a.error ?? a.status?.error ?? a.user}>
        <i style:--h={hue(a.user ?? a.name)} class:spin={a.status?.state === "syncing"}></i><span>{a.name}</span>{#if a.error}<b>!</b>{:else if a.unread}<b>{a.unread}</b>{/if}
      </button>
    {/each}
    <span class="grow"></span>
    <button class="icon" onclick={() => onopen({ compose: {} })} title="New message (c)"><Icon name="pen" size={15} /></button>
    <button class="icon" onclick={() => onopen({})} title="Open the Email pane"><Icon name="open" size={15} /></button>
  </header>

  {#if today.length}
    <div class="today" title="Today, from your calendar">
      <Icon name="calendar" size={13} />
      {#each today.slice(0, 4) as ev, i (i)}<span><b>{ev.time}</b> {ev.summary ?? ev.line}</span>{/each}
      {#if today.length > 4}<span class="faint">+{today.length - 4}</span>{/if}
    </div>
  {/if}
  {#if error}<p class="quiet">{error}</p>
  {:else if loaded && !all.length && !folded.length}<p class="quiet zero">Inbox zero — nothing waiting for you.</p>{/if}

  {#if important.length}
    <div class="section"><Icon name="star" size={11} filled /> Important</div>
    {#each important as r (r.thread)}{@render line(r)}{/each}
  {/if}
  {#if people.length}
    <div class="section">People{#if peopleUnread}<span class="n">{peopleUnread} unread</span>{/if}</div>
    {#each people as r (r.thread)}{@render line(r)}{/each}
  {/if}
  {#if folded.length}
    <div class="folded">
      {#each folded as f (f.k)}
        <button onclick={() => onopen({ view: "inbox", kind: f.k })}><Icon name={f.icon} size={14} />{f.label}<b>{f.n}</b></button>
      {/each}
    </div>
  {/if}
  {#if note}
    <div class="note" role="status">{note.text}{#if note.undo}<button onclick={() => { const u = note?.undo; note = null; u?.(); }}>Undo</button>{/if}</div>
  {/if}
</div>

<style>
  .card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; font-size: calc(13px * var(--ui-scale, 1)); container-type: inline-size; outline: none; position: relative; }
  .card:focus-visible { box-shadow: 0 0 0 2px var(--accent); border-radius: var(--radius-sm); }
  header { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 4px; }
  .grow { flex: 1; }
  .acct { all: unset; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--border-strong); font-size: 0.9em; }
  .acct:hover { background: var(--bg-hover); }
  .acct i { width: 7px; height: 7px; border-radius: 50%; background: hsl(var(--h) 55% 50%); }
  .acct i.spin { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .acct i.spin { animation: none; } }
  .acct.bad { border-color: var(--red); }
  .acct b { font-weight: 650; }
  .icon { all: unset; cursor: pointer; display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .icon:hover { background: var(--bg-hover); color: var(--text); }
  .section { display: flex; align-items: center; gap: 5px; font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); margin: 8px 0 2px; font-weight: 600; }
  .section .n { text-transform: none; letter-spacing: 0; font-weight: 500; margin-left: 4px; color: var(--accent); }
  .row { position: relative; display: flex; align-items: center; border-radius: var(--radius-sm); min-width: 0; }
  .row:hover, .row.cursor { background: var(--bg-hover); }
  .card:focus-within .row.cursor { box-shadow: inset 2px 0 0 var(--accent); }
  .open { all: unset; box-sizing: border-box; cursor: pointer; flex: 1; min-width: 0; display: flex; gap: 9px; align-items: center; padding: 5px 6px; }
  .open:focus-visible { outline: 2px solid var(--accent); border-radius: var(--radius-sm); }
  .av { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 10px; font-weight: 600; background: hsl(var(--h) 45% 46%); }
  .main { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
  .l1 { display: flex; gap: 6px; align-items: center; color: var(--text); }
  .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cnt { color: var(--text-faint); font-size: 0.88em; margin-left: 5px; }
  time { flex: none; color: var(--text-faint); font-size: 0.88em; font-variant-numeric: tabular-nums; }
  .l2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
  .snip { color: var(--text-faint); }
  .unread .who, .unread .subj { font-weight: 650; color: var(--heading, var(--text)); }
  .acts { display: none; gap: 1px; padding-right: 4px; background: var(--bg-hover); }
  .row:hover .acts, .row.cursor .acts { display: flex; }
  .row:hover time, .row.cursor time { visibility: hidden; }
  .acts { position: absolute; right: 0; top: 4px; }
  .acts button { all: unset; cursor: pointer; display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .acts button:hover { background: var(--bg-active, var(--bg)); color: var(--text); }
  @media (hover: none) { .acts { display: flex; position: static; background: none; } .row time { visibility: visible !important; } }
  .snooze { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 6px 6px 41px; }
  .snooze button, .folded button, .note button, .rbar button { all: unset; cursor: pointer; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border-strong); font-size: 0.9em; display: inline-flex; gap: 6px; align-items: center; }
  .snooze button:hover, .folded button:hover { background: var(--bg-hover); }
  .reply { display: grid; gap: 6px; padding: 4px 6px 8px 41px; }
  .reply textarea { box-sizing: border-box; width: 100%; resize: vertical; font: inherit; padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); }
  .reply textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .rbar { display: flex; gap: 6px; align-items: center; }
  .rbar .ghost { border-color: transparent; color: var(--text-muted); }
  .rbar .primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
  .rbar .primary:disabled { opacity: 0.5; cursor: default; }
  .folded { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .folded b { font-weight: 650; color: var(--accent); }
  .note { display: flex; gap: 10px; align-items: center; margin-top: 6px; color: var(--text-muted); font-size: 0.92em; }
  .note button { color: var(--accent); border-color: transparent; padding: 1px 6px; }
  .quiet { color: var(--text-faint); margin: 4px 0; }
  .today { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 4px 6px; margin-bottom: 2px; color: var(--text-muted); font-size: 0.92em; border-radius: var(--radius-sm); background: var(--accent-soft); }
  .today b { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
  .today .faint { color: var(--text-faint); }
  .zero { padding: 6px 0; }
  @container (max-width: 360px) { .snip { display: none; } .acct span { display: none; } }
</style>
