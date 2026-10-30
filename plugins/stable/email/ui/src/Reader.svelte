<script lang="ts">
  // The reader (DESIGN-mail-ui §3): a conversation as stacked cards — the read ones folded to a line, the newest and
  // the unread open. Above: the subject, its labels and the actions. Each open message: who, to whom, when, the
  // remote-content bar, an invitation's card, the body, a forwarded message inside, the files. Below: the reply box.
  import Icon from "./Icon.svelte";
  import InviteCard from "./InviteCard.svelte";
  import MailFrame from "./MailFrame.svelte";
  import Composer from "./Composer.svelte";
  import { askLine, askYes, display, fullDate, hue, initials, size, who, when, type Attachment, type Message } from "./api";
  import type { Mail } from "./store.svelte";

  let { mail, dark, narrow = false, onback, onpick }: { mail: Mail; dark: boolean; narrow?: boolean; onback: () => void; onpick: (kind: "move" | "label" | "snooze") => void } = $props();

  const t = $derived(mail.open);
  let openIds = $state<number[]>([]);
  let remoteOk = $state<number[]>([]);
  let menu = $state(false);
  let lastThread = -1;

  // which cards start open: the newest, the unread, the drafts
  $effect(() => {
    if (!t || t.thread === lastThread) return;
    lastThread = t.thread;
    const last = t.messages.at(-1);
    openIds = t.messages.filter((m) => !m.seen || m.draft || m === last).map((m) => m.id);
    remoteOk = [];
  });

  export function expandAll(open: boolean) {
    if (!t) return;
    openIds = open ? t.messages.map((m) => m.id) : [t.messages.at(-1)!.id];
  }
  const toggle = (id: number) => (openIds = openIds.includes(id) ? openIds.filter((x) => x !== id) : [...openIds, id]);
  const own = $derived(mail.own);
  const people = (ps: { name: string; addr: string }[]) => ps.map((p) => (own.includes(p.addr.toLowerCase()) ? "me" : p.name || p.addr)).join(", ");
  let wide = $state<string[]>([]);
  /** A long list of people folded: the first three and "and 12 more" (the full list on a click). */
  function few(ps: { name: string; addr: string }[], id: number, k: string) {
    const key = `${id}:${k}`;
    if (ps.length <= 4 || wide.includes(key)) return people(ps);
    return `${people(ps.slice(0, 3))} and ${ps.length - 3} more`;
  }
  const inline = $derived(mail.composers.find((c) => c.inline));
  const row = $derived(t ? mail.rows.find((r) => r.thread === t.thread) : undefined);
  const starred = $derived(!!t?.messages.some((m) => m.flagged));
  const unsub = $derived(t?.messages.findLast((m) => m.unsubscribe)?.unsubscribe ? t?.messages.findLast((m) => m.unsubscribe) : undefined);
  const role = $derived(t?.messages.at(-1)?.folder_role ?? null);

  async function openFile(m: Message, a: Attachment, beside = true) {
    try {
      const r = await mail.call<{ path: string }>("attachment", { id: m.id, part: a.part, name: a.name });
      mail.atlas.open(r.path, undefined, { beside });
    } catch (e) { mail.toast(`Cannot open ${a.name}: ${(e as Error).message}`, "error"); }
  }
  async function saveFile(m: Message, a: Attachment) {
    const to = await askLine(mail.atlas, `Save ${a.name} into which vault folder?`, "attachments");
    if (!to) return;
    try {
      const r = await mail.call<{ path: string }>("attachment", { id: m.id, part: a.part, name: a.name, to });
      mail.toast(`Saved ${r.path}`, "success", { action: { label: "Open", run: () => mail.atlas.open(r.path, undefined, { beside: true }) } });
    } catch (e) { mail.toast(`Cannot save ${a.name}: ${(e as Error).message}`, "error"); }
  }
  async function allow(m: Message) {
    const addr = m.from[0]?.addr;
    if (!addr) return;
    await mail.call("allow_remote", { sender: addr });
    remoteOk = [...remoteOk, ...t!.messages.filter((x) => x.from[0]?.addr === addr).map((x) => x.id)];
    mail.toast(`Pictures from ${addr} are shown from now on`);
  }
  async function unsubscribe() {
    if (!unsub || !(await askYes(mail.atlas, `Unsubscribe from ${unsub.from[0]?.name || unsub.from[0]?.addr}?`, { ok: "Unsubscribe" }))) return;
    try {
      const r = await mail.call<{ done?: string; open?: string }>("unsubscribe", { id: unsub.id });
      if (r.open) window.open(r.open, "_blank");
      else mail.toast(r.done === "mail" ? "Unsubscribe mail sent" : "Unsubscribed", "success");
    } catch (e) { mail.toast(`Could not unsubscribe: ${(e as Error).message}`, "error"); }
  }
  const icon = (mime: string) => (mime.startsWith("image/") ? "image" : mime === "text/calendar" ? "calendar" : "attach");
</script>

<section class="reader" aria-label="The conversation">
  {#if mail.reading && !t}
    <div class="loading"><div class="bar"></div><div class="bar short"></div><div class="bar"></div></div>
  {:else if mail.readError}
    <div class="atlas-empty"><p>{mail.readError}</p><button class="atlas-btn" onclick={() => mail.openId && mail.read(mail.openId)}>Try again</button></div>
  {:else if t}
    <header class="top">
      <div class="tools" role="toolbar" aria-label="Conversation actions">
        {#if narrow}<button class="tool" onclick={onback} title="Back to the list (u)"><Icon name="back" /></button>{/if}
        <button class="tool" onclick={() => mail.archive()} title="Archive (e)"><Icon name="archive" /></button>
        <button class="tool" onclick={() => mail.trash()} title={role === "trash" ? "Delete for good" : "Delete (#)"}><Icon name="trash" /></button>
        <button class="tool" onclick={() => mail.spam()} title={role === "junk" ? "Not spam" : "Spam (!)"}><Icon name="spam" /></button>
        <span class="sep"></span>
        <button class="tool" onclick={() => mail.toggleRead()} title="Mark unread (⇧U)"><Icon name="unread" /></button>
        <button class="tool" onclick={() => onpick("snooze")} title="Snooze (h)"><Icon name="clock" /></button>
        <button class="tool" onclick={() => onpick("move")} title="Move to (v)"><Icon name="folder" /></button>
        <button class="tool" onclick={() => onpick("label")} title="Label (l)"><Icon name="label" /></button>
        <span class="grow"></span>
        <button class="tool" onclick={() => mail.saveNote()} title={t.saved ? `Saved as ${t.saved} — save again to add new messages` : "Save as note (⇧N)"} class:on={!!t.saved}><Icon name="note" /></button>
        <div class="menu-wrap">
          <button class="tool" onclick={() => (menu = !menu)} aria-expanded={menu} title="More"><Icon name="more" /></button>
          {#if menu}
            <div class="menu" role="menu" tabindex="-1" onmouseleave={() => (menu = false)}>
              {#if t.saved}<button role="menuitem" onclick={() => { menu = false; mail.atlas.open(t.saved!, undefined, { beside: true }); }}>Open the note</button>{/if}
              <button role="menuitem" onclick={() => { menu = false; mail.importance(true); }}>Mark important</button>
              <button role="menuitem" onclick={() => { menu = false; mail.importance(false); }}>Not important…</button>
              {#if unsub}<button role="menuitem" onclick={() => { menu = false; unsubscribe(); }}>Unsubscribe</button>{/if}
              <button role="menuitem" onclick={() => { menu = false; mail.atlas.capture(`- [ ] ${t.subject} (mail from ${who(t.messages.at(-1)?.from[0], own)})`); mail.toast("Added a task to today's log"); }}>Make a task</button>
              <button role="menuitem" onclick={() => { menu = false; expandAll(true); }}>Expand all (;)</button>
            </div>
          {/if}
        </div>
      </div>
      <h2 class="subject">{t.subject || "(no subject)"}
        <button class="star" class:on={starred} onclick={() => mail.toggleStar()} title={starred ? "Unstar (s)" : "Star (s)"} aria-pressed={starred}><Icon name="star" size={18} filled={starred} /></button>
      </h2>
      <div class="meta">
        {#if row}{#each row.labels as l (l)}<span class="chip" style:--h={hue(l)}>{l.replace(/^\$/, "")}</span>{/each}{/if}
        <span class="faint">{`${t.messages.length} message${t.messages.length === 1 ? "" : "s"}${t.messages.at(-1)?.folder_label ? ` · ${t.messages.at(-1)?.folder_label}` : ""}`}</span>
        {#if unsub}<button class="link" onclick={unsubscribe}>Unsubscribe</button>{/if}
      </div>
    </header>

    <div class="cards">
      {#each t.messages as m (m.id)}
        {@const open = openIds.includes(m.id)}
        {@const allowed = !!m.body?.remote_allowed || remoteOk.includes(m.id)}
        <article class="card" class:open class:unread={!m.seen} class:draft={m.draft}>
          <button class="head" onclick={() => toggle(m.id)} aria-expanded={open}>
            <span class="avatar" style:--h={hue(m.from[0]?.addr ?? "")}>{initials(m.from[0])}</span>
            <span class="from"><b>{m.draft ? "Draft" : who(m.from[0], own)}</b>{#if open && !m.draft}<span class="addr">{m.from[0]?.addr}</span>{/if}</span>
            {#if !open}<span class="snip">{m.snippet || m.body?.text?.slice(0, 160)}</span>{/if}
            <span class="when" title={fullDate(m.date)}>{#if m.has_attachments}<Icon name="attach" size={13} />{/if}{when(m.date)}</span>
          </button>
          {#if open}
            <div class="detail">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="to" role="presentation" onclick={() => (wide = [...wide, `${m.id}:to`, `${m.id}:cc`])}>
                {#if m.to.length}<span>to {few(m.to, m.id, "to")}</span>{/if}
                {#if m.cc.length}<span>cc {few(m.cc, m.id, "cc")}</span>{/if}
                <span class="faint">{fullDate(m.date)}</span>
                <span class="grow"></span>
                {#if m.draft}<button class="atlas-btn" onclick={() => mail.editDraft(m.id)}>Edit the draft</button>
                {:else}
                  <button class="mini" onclick={() => mail.reply("reply", m.id)} title="Reply (r)"><Icon name="reply" size={15} /></button>
                  <button class="mini" onclick={() => mail.reply("all", m.id)} title="Reply all (a)"><Icon name="replyall" size={15} /></button>
                  <button class="mini" onclick={() => mail.reply("forward", m.id)} title="Forward (f)"><Icon name="forward" size={15} /></button>
                {/if}
              </div>
              {#if m.error}
                <div class="atlas-notice error">{m.error}</div>
              {:else if m.body}
                {#if m.body.remote && !allowed}
                  <div class="remote" role="status">
                    <Icon name="lock" size={14} />
                    <span>{m.body.remote} remote picture{m.body.remote === 1 ? "" : "s"} blocked (they can tell the sender you read it).</span>
                    <button class="link" onclick={() => (remoteOk = [...remoteOk, m.id])}>Show</button>
                    <button class="link" onclick={() => allow(m)}>Always from {m.from[0]?.addr}</button>
                  </div>
                {/if}
                {#if m.body.invite}<InviteCard {mail} id={m.id} invite={m.body.invite} />{/if}
                <MailFrame html={m.body.html} plain={m.body.plain} remote={allowed} {dark} />
                {#each m.body.forwarded as f, i (i)}
                  <div class="fwd">
                    <div class="fwdhead"><b>Forwarded:</b> {f.subject} · {f.from.map(display).join(", ")} · {when(f.date)}</div>
                    <MailFrame html={f.html} plain={f.plain} remote={allowed} {dark} />
                  </div>
                {/each}
                {#if m.body.attachments.length}
                  <div class="files">
                    {#each m.body.attachments as a (a.part)}
                      <div class="file">
                        <button class="fopen" onclick={() => openFile(m, a)} title="Open in Atlas"><Icon name={icon(a.mime)} /><span class="fname">{a.name}</span><span class="faint">{size(a.size)}</span></button>
                        <button class="mini" onclick={() => saveFile(m, a)} title="Save into the vault…"><Icon name="save" size={14} /></button>
                      </div>
                    {/each}
                  </div>
                {/if}
              {:else}
                <div class="loading"><div class="bar"></div></div>
              {/if}
            </div>
          {/if}
        </article>
      {/each}
    </div>

    <div class="answer">
      {#if inline}
        <Composer {mail} c={inline} inline />
      {:else}
        <div class="quick">
          <button class="atlas-btn" onclick={() => mail.reply("reply")}><Icon name="reply" size={15} /> Reply</button>
          <button class="atlas-btn" onclick={() => mail.reply("all")}><Icon name="replyall" size={15} /> Reply all</button>
          <button class="atlas-btn" onclick={() => mail.reply("forward")}><Icon name="forward" size={15} /> Forward</button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="atlas-empty nothing">
      <Icon name="inbox" size={40} />
      <p>{mail.rows.length ? "Choose a conversation to read it." : "Nothing here."}</p>
      <p class="faint">j / k to move, Enter to open, c to write, ? for every key.</p>
    </div>
  {/if}
</section>

<style>
  .reader { height: 100%; overflow-y: auto; display: flex; flex-direction: column; box-sizing: border-box; }
  .top { position: sticky; top: 0; z-index: 2; background: var(--bg); padding: 8px 20px 10px; border-bottom: 1px solid var(--border); display: grid; gap: 6px; }
  .tools { display: flex; align-items: center; gap: 2px; margin-left: -6px; }
  .tool { all: unset; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); color: var(--text-muted); min-width: 24px; min-height: 24px; display: grid; place-items: center; }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .tool.on { color: var(--accent); }
  .tool:focus-visible, .head:focus-visible, .mini:focus-visible, .fopen:focus-visible, .star:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .sep { width: 1px; height: 18px; background: var(--border-strong); margin: 0 4px; }
  .grow { flex: 1; }
  .subject { margin: 0; font-size: 1.32em; line-height: 1.3; font-weight: 600; color: var(--heading); display: flex; gap: 8px; align-items: flex-start; overflow-wrap: anywhere; }
  .star { all: unset; cursor: pointer; color: var(--text-faint); padding: 3px; border-radius: var(--radius-sm); margin-top: 1px; }
  .star.on { color: var(--yellow); }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 0.88em; }
  .chip { font-size: 0.9em; padding: 0 7px; border-radius: 999px; background: hsl(var(--h) 60% 50% / 0.16); }
  .faint { color: var(--text-faint); }
  .link { all: unset; cursor: pointer; color: var(--accent); }
  .link:hover { text-decoration: underline; }
  .menu-wrap { position: relative; }
  .menu { position: absolute; right: 0; top: 100%; z-index: 5; min-width: 200px; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-md, var(--shadow-sm)); padding: 4px; display: grid; }
  .menu button { all: unset; cursor: pointer; padding: 7px 10px; border-radius: var(--radius-sm); }
  .menu button:hover { background: var(--bg-hover); }
  .cards { padding: 12px 16px; display: grid; gap: 8px; }
  .card { border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-alt); overflow: hidden; }
  .card.open { background: var(--bg); box-shadow: var(--shadow-sm); }
  .card.draft { border-color: color-mix(in srgb, var(--red) 40%, transparent); }
  .head { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; min-width: 0; }
  .head:hover { background: var(--bg-hover); }
  .avatar { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 600; color: #fff; background: hsl(var(--h) 45% 46%); }
  .from { display: flex; gap: 8px; align-items: baseline; min-width: 0; flex: 0 1 auto; white-space: nowrap; }
  .unread .from b { color: var(--heading); }
  .addr { color: var(--text-faint); font-size: 0.86em; overflow: hidden; text-overflow: ellipsis; }
  .snip { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
  .when { margin-left: auto; flex: none; color: var(--text-muted); font-size: 0.85em; display: flex; gap: 5px; align-items: center; }
  .detail { padding: 0 16px 14px 54px; display: grid; gap: 10px; }
  .to { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; font-size: 0.86em; color: var(--text-muted); }
  .mini { all: unset; cursor: pointer; padding: 5px; border-radius: var(--radius-sm); color: var(--text-muted); display: grid; place-items: center; min-width: 24px; min-height: 24px; }
  .mini:hover { background: var(--bg-hover); color: var(--text); }
  .remote { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; padding: 7px 10px; border-radius: var(--radius-sm); background: var(--bg-hover); font-size: 0.86em; color: var(--text-muted); }
  .fwd { border-left: 3px solid var(--border-strong); padding-left: 12px; display: grid; gap: 6px; }
  .fwdhead { font-size: 0.86em; color: var(--text-muted); }
  .files { display: flex; flex-wrap: wrap; gap: 8px; }
  .file { display: flex; align-items: center; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--bg-alt); }
  .fopen { all: unset; cursor: pointer; display: flex; gap: 8px; align-items: center; padding: 7px 10px; max-width: 280px; }
  .fopen:hover { color: var(--accent); }
  .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .fopen .faint { white-space: nowrap; flex: none; font-size: 0.86em; }
  .answer { padding: 4px 16px 24px 16px; }
  .quick { display: flex; gap: 8px; flex-wrap: wrap; padding-left: 38px; }
  .quick .atlas-btn { display: inline-flex; gap: 6px; align-items: center; }
  .nothing { margin: auto; display: grid; justify-items: center; gap: 6px; color: var(--text-faint); text-align: center; padding: 40px; }
  .nothing p { margin: 0; }
  .loading { padding: 24px; display: grid; gap: 12px; }
  .bar { height: 12px; border-radius: 4px; background: var(--bg-hover); }
  .bar.short { width: 40%; }
  @container (max-width: 560px) { .detail { padding-left: 14px; } .quick { padding-left: 0; } .top { padding: 6px 12px 8px; } .cards { padding: 8px; } }
</style>
