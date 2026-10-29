<script lang="ts">
  // The sidebar (DESIGN-mail-ui §2): the views across every account (Inbox, Starred, Snoozed, Drafts, Sent,
  // Scheduled), then each account with its folders as a tree (roles first; Exchange's other stores and Gmail's views
  // folded away). Unread counts on the right; a row is a drop target for dragged conversations. `rail`: icons only.
  import Icon from "./Icon.svelte";
  import type { Folder } from "./api";
  import type { Mail, View, ViewName } from "./store.svelte";

  let { mail, rail = false, onpicked }: { mail: Mail; rail?: boolean; onpicked?: () => void } = $props();

  const VIEWS: [ViewName, string, string][] = [["inbox", "Inbox", "inbox"], ["unimportant", "Not important", "down"], ["starred", "Starred", "star"], ["snoozed", "Snoozed", "clock"], ["drafts", "Drafts", "draft"], ["sent", "Sent", "send"], ["scheduled", "Scheduled", "clock"], ["all", "All mail", "all"]];
  const ROLE_ICON: Record<string, string> = { inbox: "inbox", sent: "send", drafts: "draft", archive: "archive", junk: "spam", trash: "trash", snoozed: "clock", unimportant: "down", all: "all" };
  const ROLE_RANK: Record<string, number> = { inbox: 0, unimportant: 1, snoozed: 2, drafts: 3, sent: 4, archive: 5, junk: 6, trash: 7, all: 8 };
  const multi = $derived(mail.accounts.filter((a) => !a.error).length > 1);
  let folded = $state<Record<string, boolean>>(loadFolded());
  let over = $state<string | null>(null);

  function loadFolded(): Record<string, boolean> {
    try { return JSON.parse(localStorage.getItem("atlas-email-folded") ?? "{}"); } catch { return {}; }
  }
  function fold(key: string) {
    folded = { ...folded, [key]: !folded[key] };
    try { localStorage.setItem("atlas-email-folded", JSON.stringify(folded)); } catch { /* a private window */ }
  }

  interface Node { f: Folder; depth: number; children: number }
  /** An account's folders as a tree, in reading order: roles first, then the rest by name, children under parents. */
  function tree(account: string): { main: Node[]; other: Folder[] } {
    const fs = mail.folders.filter((f) => f.account === account);
    const other = fs.filter((f) => f.role === "other" || f.role === "view");
    const shown = fs.filter((f) => f.role !== "other" && f.role !== "view");
    const roles = shown.filter((f) => f.role && ROLE_RANK[f.role] !== undefined).sort((a, b) => ROLE_RANK[a.role!] - ROLE_RANK[b.role!]);
    const rest = shown.filter((f) => !roles.includes(f)).sort((a, b) => a.label.localeCompare(b.label));
    const out: Node[] = roles.map((f) => ({ f, depth: 0, children: 0 }));
    const parts = (f: Folder) => f.label.split(f.delimiter ?? "/");
    for (const f of rest) {
      const depth = parts(f).length - 1;
      const children = rest.filter((g) => g !== f && g.label.startsWith(f.label + (f.delimiter ?? "/"))).length;
      // a child of a folded parent stays hidden
      const hidden = rest.some((p) => p !== f && f.label.startsWith(p.label + (p.delimiter ?? "/")) && folded[`${account}:${p.path}`]);
      if (!hidden) out.push({ f, depth, children });
    }
    return { main: out, other };
  }
  const leaf = (f: Folder) => f.label.split(f.delimiter ?? "/").at(-1) ?? f.label;

  function go(v: View) {
    mail.go(v);
    onpicked?.();
  }
  const isView = (name: ViewName, account: string | null = null) => mail.view.name === name && mail.view.account === account;
  const isFolder = (f: Folder) => mail.view.name === "folder" && mail.view.account === f.account && mail.view.folder === f.path;
  const count = (name: string) => (["inbox", "snoozed", "drafts", "scheduled", "unimportant"].includes(name) ? mail.counts[name] : undefined);

  function drop(e: DragEvent, f: Folder) {
    e.preventDefault();
    over = null;
    const ids: number[] = JSON.parse(e.dataTransfer?.getData("application/x-atlas-mail") || "[]");
    const rows = mail.rows.filter((r) => ids.includes(r.id) && r.account === f.account);
    if (rows.length) mail.moveTo(f.path, f.label, rows);
    else if (ids.length) mail.toast("Mail moves within its own account", "error");
  }
</script>

<nav class="side" class:rail aria-label="Mail folders">
  <button class="compose" onclick={() => mail.compose()} title="New message (c)"><Icon name="pen" size={17} />{#if !rail}<span>New message</span>{/if}</button>

  <div class="group">
    {#each VIEWS as [name, label, icon] (name)}
      {@const c = count(name)}
      {#if (name !== "scheduled" && name !== "unimportant") || (c?.total ?? 0) > 0}
        <button class="row" class:on={isView(name)} onclick={() => go({ name, account: null, folder: null, label: multi && name === "inbox" ? "All inboxes" : label })} title={label}>
          <Icon name={icon} />
          {#if !rail}<span class="name">{multi && name === "inbox" ? "All inboxes" : label}</span>{/if}
          {#if c && (name === "inbox" ? c.unread : c.total)}<span class="n" class:strong={name === "inbox"}>{name === "inbox" ? c.unread : c.total}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>

  {#each mail.accounts as a (a.name)}
    {@const key = `acct:${a.name}`}
    {@const t = tree(a.name)}
    <div class="group">
      <button class="head" onclick={() => fold(key)} aria-expanded={!folded[key]} title={a.user ?? a.name}>
        {#if rail}<span class="dot" class:busy={a.syncing} class:bad={a.error || a.status?.state === "error"}></span>
        {:else}
          <Icon name={folded[key] ? "right" : "down"} size={12} />
          <span class="acct">{a.name}</span>
          {#if a.syncing || a.status?.state === "syncing"}<span class="spin" title="Checking for mail…"></span>{/if}
          {#if a.status?.state === "offline"}<span class="faint" title={a.status.error}>offline</span>{/if}
        {/if}
      </button>
      {#if a.error || a.status?.state === "error"}
        <div class="err" role="alert">
          <span>{a.error ?? a.status?.error}</span>
          {#if a.outlook}<button class="link" onclick={() => window.dispatchEvent(new CustomEvent("atlas-email:signin", { detail: a.name }))}>Sign in…</button>{/if}
          <button class="link" onclick={() => mail.atlas.plugin.openSettings()}>Settings…</button>
        </div>
      {/if}
      {#if !folded[key] && !a.error}
        {#each t.main as { f, depth, children } (f.path)}
          <div class="frow" style:--depth={rail ? 0 : depth}>
            <button class="row" class:on={isFolder(f)} class:over={over === `${a.name}:${f.path}`} title={f.label}
              onclick={() => go({ name: "folder", account: a.name, folder: f.path, label: f.label })}
              ondragover={(e) => { e.preventDefault(); over = `${a.name}:${f.path}`; }} ondragleave={() => (over = null)} ondrop={(e) => drop(e, f)}>
              <Icon name={ROLE_ICON[f.role ?? ""] ?? "folder"} />
              {#if !rail}<span class="name">{leaf(f)}</span>{/if}
              {#if f.unread && f.role !== "sent" && f.role !== "trash" && f.role !== "junk" && f.role !== "drafts"}<span class="n" class:strong={f.role === "inbox"}>{f.unread}</span>{/if}
            </button>
            {#if children && !rail}<button class="twist" onclick={() => fold(`${a.name}:${f.path}`)} aria-label={folded[`${a.name}:${f.path}`] ? "Show the folders in it" : "Hide the folders in it"}><Icon name={folded[`${a.name}:${f.path}`] ? "right" : "down"} size={12} /></button>{/if}
          </div>
        {/each}
        {#if t.other.length && !rail}
          <button class="row faint" onclick={() => fold(`${key}:other`)}><Icon name={folded[`${key}:other`] ? "down" : "right"} size={12} /><span class="name">More ({t.other.length})</span></button>
          {#if folded[`${key}:other`]}
            {#each t.other as f (f.path)}
              <button class="row" style:--depth={1} class:on={isFolder(f)} onclick={() => go({ name: "folder", account: a.name, folder: f.path, label: f.label })}><Icon name="folder" /><span class="name">{f.label}</span></button>
            {/each}
          {/if}
        {/if}
        {#if !rail}<button class="row faint add" onclick={() => window.dispatchEvent(new CustomEvent("atlas-email:new-folder", { detail: a.name }))}><Icon name="plus" size={14} /><span class="name">New folder…</span></button>{/if}
      {/if}
    </div>
  {:else}
    {#if !rail}
      <div class="empty">
        <p>No mail account yet.</p>
        <button class="atlas-btn" onclick={() => mail.atlas.plugin.openSettings()}>Add an account…</button>
      </div>
    {/if}
  {/each}
</nav>

<style>
  .side { display: flex; flex-direction: column; gap: 10px; padding: 10px 8px 16px; overflow-y: auto; height: 100%; box-sizing: border-box; font-size: 0.95em; }
  .compose { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 9px 14px; border-radius: var(--radius); background: var(--accent); color: var(--accent-fg); font-weight: 600; box-shadow: var(--shadow-sm); }
  .compose:hover { filter: brightness(1.06); }
  .compose:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 2px; }
  .rail .compose { justify-content: center; padding: 9px; }
  .group { display: flex; flex-direction: column; gap: 1px; }
  .row { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 9px; cursor: pointer; padding: 5px 8px 5px calc(8px + var(--depth, 0) * 14px); border-radius: var(--radius-sm); color: var(--text-muted); min-height: 28px; flex: 1; min-width: 0; }
  .row:hover { background: var(--bg-hover); color: var(--text); }
  .row.on { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .row.over { outline: 2px dashed var(--accent); background: var(--accent-soft); }
  .row:focus-visible, .head:focus-visible, .twist:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .rail .row { justify-content: center; padding: 6px; }
  .frow { display: flex; align-items: center; }
  .twist { all: unset; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); color: var(--text-faint); }
  .twist:hover { background: var(--bg-hover); color: var(--text); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { font-size: 0.85em; color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .n.strong { color: var(--text); font-weight: 600; }
  .rail .n { display: none; }
  .head { all: unset; display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px 8px 4px; color: var(--text-faint); font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; min-width: 0; }
  .head:hover { color: var(--text-muted); }
  .rail .head { justify-content: center; padding: 8px 0 4px; }
  .acct { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: none; letter-spacing: 0; font-size: 1.15em; }
  .faint { color: var(--text-faint); font-weight: 400; }
  .add { font-size: 0.9em; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); }
  .dot.busy { background: var(--accent); }
  .dot.bad { background: var(--red); }
  .spin { width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  .err { margin: 2px 6px 6px; padding: 8px 10px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--red) 12%, transparent); color: var(--text); font-size: 0.88em; display: flex; flex-wrap: wrap; gap: 6px 10px; }
  .err span { flex-basis: 100%; overflow-wrap: anywhere; }
  .link { all: unset; cursor: pointer; color: var(--accent); }
  .empty { padding: 14px 8px; color: var(--text-muted); display: grid; gap: 8px; justify-items: start; }
  .empty p { margin: 0; }
</style>
