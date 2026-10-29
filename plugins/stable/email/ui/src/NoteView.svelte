<script lang="ts">
  // A saved mail note drawn as the mail (notes.rs, DESIGN-mail-notes.md): a conversation's sections, or an old single
  // mail note, from the note alone — no server. The older messages folded to a line, the newest and the unread open;
  // Reply / Reply all / Forward find the message in the index and open the composer in the Email pane.
  import Icon from "./Icon.svelte";
  import MailFrame from "./MailFrame.svelte";
  import { call, hue, initials, type PluginApi } from "./api";

  let { atlas, note, onmail }: { atlas: PluginApi; note: { path: string; text: string; props: Record<string, unknown>; showNote(): void }; onmail: (detail: Record<string, unknown>) => void } = $props();

  interface M { from: string; to?: string; cc?: string; date: string; message_id?: string; seen?: boolean; html: string; text: string; files: string[] }
  const MARK = /^<!-- mail (\{.*\}) -->$/gm;
  const FILES = /^- !\[\[([^\]]+)\]\]$/gm;
  const dir = $derived(note.path.replace(/[^/]*$/, ""));

  function part(head: Record<string, unknown>, body: string): M {
    const files = [...body.matchAll(FILES)].map((m) => (m[1].includes("/") ? m[1] : dir + m[1]));
    const rest = body.replace(FILES, "").replace(/^## Attachments\s*$/m, "").trim();
    const html = rest.startsWith('<div class="email-html">') ? rest.replace(/\sdata-remote-src=/gi, " data-src=") : "";
    return { from: String(head.from ?? ""), to: head.to as string, cc: head.cc as string, date: String(head.date ?? ""), message_id: head.message_id as string, seen: head.seen !== false, html, text: html ? "" : rest, files };
  }
  const messages: M[] = $derived.by(() => {
    if (note.props.type === "email-thread") {
      const marks = [...note.text.matchAll(MARK)];
      return marks.flatMap((m, i) => {
        try {
          const head = JSON.parse(m[1]);
          let body = note.text.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1].index : note.text.length);
          const next = /^## /m.exec(body);
          if (next) body = body.slice(0, next.index);
          return [part(head, body)];
        } catch { return []; }
      });
    }
    const body = note.text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^# .*\n+/, "");
    return [part({ ...note.props, seen: true }, body)];
  });
  let opened = $state<number[] | null>(null);
  const open = $derived(opened ?? messages.map((m, i) => (i === messages.length - 1 || !m.seen ? i : -1)).filter((i) => i >= 0));
  const subject = $derived(String(note.props.subject ?? note.text.match(/^# (.+)$/m)?.[1] ?? ""));
  const dark = document.documentElement.dataset.theme !== "light";
  const name = (from: string) => from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || from;
  const date = (d: string) => (d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit" }) : "");

  async function reply(mode: "reply" | "all" | "forward", m: M) {
    try {
      const r = await call<{ id: number | null }>(atlas, "find", { message_id: m.message_id, account: note.props.account });
      if (r.id) onmail({ reply: { id: r.id, mode } });
      else atlas.toast("Email", "That message is not in the mail index (it may be gone from the server).", "error");
    } catch (e) { atlas.toast("Email", (e as Error).message, "error"); }
  }
</script>

<div class="nv">
  <h1>{subject || "(no subject)"}</h1>
  <div class="where">{note.props.account ?? ""}{note.props.folder ? ` · ${note.props.folder}` : ""} · {messages.length} message{messages.length === 1 ? "" : "s"}
    <button class="link" onclick={() => note.showNote()}>Show as a note</button>
  </div>
  {#each messages as m, i (i)}
    <article class="msg" class:unread={!m.seen}>
      <button class="head" onclick={() => (opened = open.includes(i) ? open.filter((x) => x !== i) : [...open, i])} aria-expanded={open.includes(i)}>
        <span class="av" style:--h={hue(m.from)}>{initials({ name: name(m.from), addr: m.from })}</span>
        <b>{name(m.from)}</b>
        <span class="date">{date(m.date)}</span>
      </button>
      {#if open.includes(i)}
        <div class="body">
          {#if m.to}<div class="meta">to {m.to}{m.cc ? ` · cc ${m.cc}` : ""}</div>{/if}
          {#if m.html}<MailFrame html={m.html} {dark} />{:else}<div class="text">{m.text}</div>{/if}
          {#if m.files.length}<div class="files">{#each m.files as f (f)}<button class="file" onclick={() => atlas.open(f, undefined, { beside: true })}><Icon name="attach" size={13} />{f.split("/").at(-1)}</button>{/each}</div>{/if}
          {#if m.message_id}
            <div class="acts">
              <button class="atlas-btn" onclick={() => reply("reply", m)}><Icon name="reply" size={14} /> Reply</button>
              <button class="atlas-btn" onclick={() => reply("all", m)}><Icon name="replyall" size={14} /> Reply all</button>
              <button class="atlas-btn" onclick={() => reply("forward", m)}><Icon name="forward" size={14} /> Forward</button>
            </div>
          {/if}
        </div>
      {/if}
    </article>
  {/each}
</div>

<style>
  .nv { max-width: 980px; margin: 0 auto; padding: 18px 22px 48px; font-size: calc(14px * var(--ui-scale, 1)); color: var(--text); }
  h1 { font-size: 1.35em; margin: 0 0 4px; color: var(--heading); font-weight: 650; }
  .where { color: var(--text-faint); font-size: 0.88em; margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap; }
  .link { all: unset; cursor: pointer; color: var(--accent); }
  .msg { border: 1px solid var(--border); border-radius: var(--radius); margin: 0 0 10px; background: var(--bg); }
  .head { all: unset; box-sizing: border-box; width: 100%; display: flex; gap: 10px; align-items: center; padding: 10px 14px; cursor: pointer; }
  .head:hover { background: var(--bg-hover); }
  .unread b::after { content: " ●"; color: var(--accent); }
  .av { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 600; color: #fff; background: hsl(var(--h) 45% 46%); }
  .date { margin-left: auto; color: var(--text-faint); font-size: 0.86em; }
  .body { padding: 0 14px 14px 52px; display: grid; gap: 10px; }
  .meta { color: var(--text-muted); font-size: 0.88em; }
  .text { white-space: pre-wrap; line-height: 1.55; }
  .files, .acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .file { all: unset; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; padding: 5px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius); }
  .file:hover { color: var(--accent); }
  .acts .atlas-btn { display: inline-flex; gap: 6px; align-items: center; }
</style>
