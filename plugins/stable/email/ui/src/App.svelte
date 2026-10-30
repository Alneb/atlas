<script lang="ts">
  // The Email pane (DESIGN-mail-ui; docs/refactor/REFACTOR-email-rust.md): sidebar | list | reader, or the reader below
  // the list, or the list then the message — chosen in the pane and kept per vault. The pane's own width decides how
  // much shows: three panes when wide, the sidebar as an icon strip in between, one column at a time when narrow
  // (the phone), the selection kept. Every command has a key (keys.ts); Ctrl+K lists them all.
  import { onMount } from "svelte";
  import Sidebar from "./Sidebar.svelte";
  import MessageList from "./MessageList.svelte";
  import Reader from "./Reader.svelte";
  import Composer from "./Composer.svelte";
  import Toasts from "./Toasts.svelte";
  import Shortcuts from "./Shortcuts.svelte";
  import { RULES_DIALOG } from "./rules-host";
  import Icon from "./Icon.svelte";
  import { Mail, type Kind, type Quick } from "./store.svelte";
  import { BY_KEY, COMMANDS, PREFIXES, keyOf, shown, type Ui } from "./keys";
  import { askLine, parseWhen, snoozeTimes, type Folder, type PluginApi, type Row, type Template } from "./api";

  let { atlas }: { atlas: PluginApi } = $props();
  // svelte-ignore state_referenced_locally
  const mail = new Mail(atlas);

  type Layout = "three" | "below" | "full";
  const stored = (k: string, d: string) => { try { return localStorage.getItem(`atlas-email-${k}`) ?? d; } catch { return d; } };
  const store = (k: string, v: string) => { try { localStorage.setItem(`atlas-email-${k}`, v); } catch { /* private window */ } };
  // svelte-ignore state_referenced_locally
  let layout = $state<Layout>(stored("layout", String(atlas.plugin.settings.layout ?? "three")) as Layout);
  // svelte-ignore state_referenced_locally
  let compact = $state(stored("density", String(atlas.plugin.settings.density ?? "comfortable")) === "compact");
  let sideW = $state(Number(stored("side-w", "232")));
  let listW = $state(Number(stored("list-w", "420")));
  let listH = $state(Number(stored("list-h", "320")));
  let width = $state(1200);
  let screen = $state<"side" | "list" | "reader">("list");
  let help = $state(false);
  let dark = $state(document.documentElement.dataset.theme !== "light");
  let searchBox: HTMLInputElement | undefined = $state();
  let reader: Reader | undefined = $state();
  let searchText = $state("");
  let bigComposer = $state(false);

  const narrow = $derived(width < 700);
  const rail = $derived(!narrow && width < 1100);
  // side by side only while the reader keeps a readable width; else the list, then the message over it
  const roomy = $derived(width - (rail ? 56 : sideW) - listW >= 460);
  const mode = $derived<Layout>(narrow || (layout === "three" && !roomy) ? "full" : layout);
  const showReader = $derived(mode === "full" ? mail.openId !== null || mail.reading : true);
  const windows = $derived(mail.composers.filter((c) => !c.inline));

  // ----- the commands' helpers

  function back() {
    if (help) { help = false; return; }
    if (mail.checked.length) { mail.checked = []; return; }
    if (mail.openId !== null) { mail.close(); screen = "list"; return; }
    if (mail.query) { searchText = ""; mail.search(""); return; }
  }
  function open(r: Row) {
    if (r.draft && r.count === 1) { mail.editDraft(r.id); return; }
    mail.read(r.id);
    if (narrow) screen = "reader";
  }
  const accountOfTargets = () => mail.targets()[0]?.account ?? mail.view.account ?? mail.accounts[0]?.name;

  function pick(kind: "move" | "label" | "snooze" | "go" | "template") {
    if (kind === "snooze") {
      atlas.pick({
        placeholder: "Snooze until… (tomorrow 9, mon 14:00, 3h, 2026-11-02 08:00)", tag: "Snooze",
        items: snoozeTimes().map((s) => ({ value: String(s.at), title: s.label })),
        typed: (t) => { const at = parseWhen(t); return at ? `Until ${new Date(at * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", hourCycle: "h23", minute: "2-digit" })}` : "Type a time: tomorrow 9, mon 14:00, 3h"; },
        onpick: (v, isNew) => { const at = isNew ? parseWhen(v) : Number(v); if (at) mail.snooze(at); },
      });
    } else if (kind === "move" || kind === "go") {
      const acc = kind === "move" ? accountOfTargets() : null;
      const fs: Folder[] = mail.folders.filter((f) => (!acc || f.account === acc) && f.role !== "other" && f.role !== "view" && f.role !== "all");
      atlas.pick({
        placeholder: kind === "move" ? "Move to which folder?" : "Go to which folder?", tag: kind === "move" ? "Move" : "Go to",
        items: fs.map((f) => ({ value: `${f.account}\u0000${f.path}`, title: f.label, detail: mail.accounts.length > 1 ? f.account : f.role ?? undefined, section: mail.accounts.length > 1 ? f.account : undefined })),
        typed: kind === "move" ? (t) => `New folder “${t}”` : undefined,
        onpick: async (v, isNew) => {
          if (isNew && kind === "move") {
            try {
              const r = await mail.call<{ path: string }>("folder_create", { account: acc, name: v });
              await mail.loadFolders();
              mail.moveTo(r.path, v);
            } catch (e) { mail.toast(`No folder made: ${(e as Error).message}`, "error"); }
            return;
          }
          const [a, path] = v.split("\u0000");
          const f = mail.folders.find((x) => x.account === a && x.path === path);
          if (kind === "move") mail.moveTo(path, f?.label ?? path);
          else mail.go({ name: "folder", account: a, folder: path, label: f?.label ?? path });
        },
      });
    } else if (kind === "label") {
      const have = new Set(mail.rows.flatMap((r) => r.labels));
      const on = new Set(mail.targets().flatMap((r) => r.labels));
      atlas.pick({
        placeholder: "Label… (a label it has is taken off)", tag: "Label",
        items: [...have].sort().map((l) => ({ value: l, title: l.replace(/^\$/, ""), detail: on.has(l) ? "on it — pick to take it off" : undefined })),
        typed: (t) => `New label “${t}”`,
        onpick: (l) => (on.has(l) ? mail.label([], [l]) : mail.label([l], [])),
      });
    } else {
      atlas.pick({
        placeholder: "Write from a template… (notes in mail/templates/)", tag: "Template",
        items: async () => (await mail.call<{ templates: Template[] }>("templates")).templates.map((t) => ({ value: JSON.stringify(t), title: t.name, detail: t.subject })),
        onpick: (v) => { const t = JSON.parse(v) as Template; mail.compose({ subject: t.subject ?? "", to: t.to ?? "", cc: t.cc ?? "", body: t.body }); },
      });
    }
  }

  function palette() {
    atlas.pick({
      placeholder: "Do what? (every command of the Email pane)", tag: "Email",
      items: COMMANDS.filter((c) => c.id !== "palette" && (!c.when || c.when(mail))).map((c) => ({ value: c.id, title: c.title, detail: shown(c.keys).join("  ·  ") || undefined, section: c.group })),
      onpick: (id) => COMMANDS.find((c) => c.id === id)?.run(mail, ui),
    });
  }

  function chooseLayout() {
    atlas.pick({
      placeholder: "Layout of the Email pane", tag: "Layout",
      items: [
        { value: "three", title: "Three panes", detail: "folders, list, reader side by side" },
        { value: "below", title: "Reader below the list", detail: "the list on top, the message under it" },
        { value: "full", title: "List, then message", detail: "the message opens over the list; u goes back" },
        { value: compact ? "comfortable" : "compact", title: compact ? "Comfortable rows" : "Compact rows", detail: compact ? "two lines with a preview" : "one line each, more on screen" },
      ],
      onpick: (v) => {
        if (v === "compact" || v === "comfortable") { compact = v === "compact"; store("density", v); }
        else { layout = v as Layout; store("layout", v); }
      },
    });
  }

  const ui: Ui = {
    pick, palette, back,
    focusSearch: () => { searchBox?.focus(); searchBox?.select(); },
    help: () => (help = !help),
    expandAll: (o) => reader?.expandAll(o),
    // a dialog over the app (API 20); a tab of its own on an older one
    rules: () => (typeof atlas.openDialog === "function" ? void atlas.openDialog(RULES_DIALOG, { title: "Rules", width: 860, height: 640 }) : atlas.openView(RULES_DIALOG, { title: "Email rules", icon: "mail" })),
    layout: chooseLayout,
  };

  // ----- keys: single keys, sequences (g i, * a), never while typing

  let pending = $state("");
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  function key(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog] input")) {
      if (e.key === "Escape" && t === searchBox) { searchBox?.blur(); }
      return;
    }
    if (!root?.contains(t) && t !== document.body) return;
    const k = keyOf(e);
    if (["shift", "control", "alt", "meta"].includes(e.key.toLowerCase())) return;
    const seq = pending ? `${pending} ${k}` : k;
    clearTimeout(pendingTimer);
    if (!pending && PREFIXES.has(k)) {
      pending = k;
      pendingTimer = setTimeout(() => (pending = ""), 1200);
      e.preventDefault();
      return;
    }
    pending = "";
    const c = BY_KEY.get(seq);
    if (!c || (c.when && !c.when(mail))) return;
    e.preventDefault();
    e.stopPropagation();
    c.run(mail, ui);
  }

  // ----- the search box: a search as you type (the index answers), the server too on Enter

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function typed() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => mail.search(searchText), 140);
  }
  async function searchServer() {
    mail.search(searchText);
    if (!searchText.trim()) return;
    try {
      const r = await mail.call<{ added: number }>("search_server", { query: searchText }, 300);
      if (r.added) { mail.toast(`${r.added} more from the server`); mail.load(); }
    } catch (e) { mail.toast(`The server search failed: ${(e as Error).message}`, "error"); }
  }
  function quick(q: Quick) { mail.quick = mail.quick === q ? "" : q; mail.load(); }
  function tab(k: Kind) { mail.kind = k; mail.load(); }

  // ----- resizing

  function drag(e: PointerEvent, what: "side" | "list" | "listH") {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, s0 = sideW, l0 = listW, h0 = listH;
    const mv = (ev: PointerEvent) => {
      if (what === "side") sideW = Math.max(170, Math.min(420, s0 + ev.clientX - x0));
      else if (what === "list") listW = Math.max(300, Math.min(900, l0 + ev.clientX - x0));
      else listH = Math.max(160, Math.min(900, h0 + ev.clientY - y0));
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); store("side-w", String(sideW)); store("list-w", String(listW)); store("list-h", String(listH)); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  let root: HTMLDivElement | undefined = $state();
  onMount(() => {
    mail.start();
    const offs = [
      atlas.helper.on("changed", () => mail.later()),
      atlas.helper.on("bodies", () => mail.later("list")),
      atlas.helper.on("status", (d) => {
        const s = d as { account: string; state: string; error?: string };
        const a = mail.accounts.find((x) => x.name === s.account);
        if (a) { a.status = s as never; a.syncing = s.state === "syncing"; }
      }),
      atlas.helper.on("woke", () => { mail.toast("Snoozed mail is back in the inbox"); mail.later(); }),
      atlas.helper.on("rule", (d) => { const r = d as { rule: string; count: number }; mail.toast(`Rule “${r.rule}”: ${r.count} message${r.count === 1 ? "" : "s"}`); }),
    ];
    const theme = new MutationObserver(() => (dark = document.documentElement.dataset.theme !== "light"));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const newFolder = async (e: Event) => {
      const account = (e as CustomEvent<string>).detail;
      const name = await askLine(mail.atlas, `A new folder in ${account}:`);
      if (!name) return;
      try { await mail.call("folder_create", { account, name }); await mail.loadFolders(); mail.toast(`Folder “${name}” made`, "success"); }
      catch (err) { mail.toast(`No folder made: ${(err as Error).message}`, "error"); }
    };
    const signedIn = () => { mail.loadAccounts(); mail.later(); };
    window.addEventListener("atlas-email:new-folder", newFolder);
    window.addEventListener("atlas-email:signed-in", signedIn);
    // another part of Atlas asks to open a message or write one (a note's Reply, the inbox block, a notice)
    const openAsk = (e: Event) => {
      const d = (e as CustomEvent<{ id?: number; view?: string; account?: string; kind?: Kind; compose?: Record<string, unknown>; reply?: { id: number; mode: "reply" | "all" | "forward" }; search?: string }>).detail ?? {};
      if (d.account || d.view === "inbox") mail.go({ name: "inbox", account: d.account ?? null, folder: null, label: "Inbox" });
      // the Home card's folded Newsletters / Notifications: that tab, or that search when the inbox is not split
      if (d.kind) { if (mail.split) { mail.kind = d.kind; mail.load(); } else mail.search(`in:inbox is:${d.kind}`); }
      if (d.search) { searchText = d.search; mail.search(d.search); } // a rule's "show what it matches", from Settings
      if (d.id) { mail.read(d.id); if (narrow) screen = "reader"; }
      if (d.compose) mail.compose(d.compose);
      if (d.reply) mail.reply(d.reply.mode, d.reply.id, false);
    };
    window.addEventListener("atlas-email:open", openAsk);
    const pendingOpen = (window as unknown as { __atlasEmailOpen?: unknown }).__atlasEmailOpen;
    if (pendingOpen) { openAsk(new CustomEvent("x", { detail: pendingOpen })); (window as unknown as { __atlasEmailOpen?: unknown }).__atlasEmailOpen = undefined; }
    return () => {
      offs.forEach((o) => o());
      theme.disconnect();
      window.removeEventListener("atlas-email:new-folder", newFolder);
      window.removeEventListener("atlas-email:signed-in", signedIn);
      window.removeEventListener("atlas-email:open", openAsk);
    };
  });

  const title = $derived(mail.query ? "Search" : mail.view.label);
  const TABS: [Kind, string, string][] = [["person", "People", "person"], ["newsletter", "Newsletters", "news"], ["notification", "Notifications", "bell"]];
</script>

<svelte:window onkeydown={key} />

<div class="mail" class:narrow class:dark bind:this={root} bind:clientWidth={width}
  style:--side-w="{rail ? 56 : sideW}px" style:--list-w="{listW}px" style:--list-h="{listH}px">
  {#if !narrow || screen === "side"}
    <aside class="side" aria-label="Folders">
      <Sidebar {mail} {rail} onpicked={() => { if (narrow) screen = "list"; }} />
      {#if !rail && !narrow}<div class="grip v" role="separator" aria-orientation="vertical" aria-label="Resize the folders" onpointerdown={(e) => drag(e, "side")}></div>{/if}
    </aside>
  {/if}

  {#if !narrow || screen !== "side"}
    <div class="work" class:below={mode === "below"} class:full={mode === "full"}>
      {#if !(mode === "full" && showReader && (!narrow || screen === "reader"))}
        <section class="listpane" aria-label={title}>
          <header class="lhead">
            <div class="row1">
              {#if narrow}<button class="tool" onclick={() => (screen = "side")} title="Folders"><Icon name="menu" /></button>{/if}
              <div class="search">
                <Icon name="search" size={15} />
                <input bind:this={searchBox} bind:value={searchText} oninput={typed} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchServer(); } else if (e.key === "Escape") { searchText = ""; mail.search(""); searchBox?.blur(); } else if (e.key === "ArrowDown") { searchBox?.blur(); } }}
                  placeholder="Search mail…" aria-label="Search mail" title="Words, or from: to: subject: has:attachment is:unread before: after:" />
                {#if searchText}<button class="tool" onclick={() => { searchText = ""; mail.search(""); }} aria-label="Clear the search"><Icon name="x" size={14} /></button>{/if}
              </div>
              <button class="tool" onclick={() => COMMANDS.find((c) => c.id === "refresh")?.run(mail, ui)} title="Check for new mail (⇧G)"><Icon name="refresh" /></button>
              <button class="tool" onclick={chooseLayout} title="Layout and density"><Icon name="layout" /></button>
              <button class="tool" onclick={palette} title="All commands (Ctrl+K)"><Icon name="keyboard" /></button>
            </div>
            {#if mail.chips.length}
              <div class="chips">{#each mail.chips as [op, v] (op + v)}<span class="chip"><b>{op}:</b>{v}</span>{/each}{#if mail.query}<button class="link" onclick={searchServer}>Search the servers too ↵</button>{/if}</div>
            {/if}
            {#if mail.checked.length}
              <div class="selbar" role="toolbar" aria-label="Checked conversations">
                <button class="tool" onclick={() => mail.selectWhere("none")} title="Uncheck all (Esc)"><Icon name="x" /></button>
                <b>{mail.checked.length} checked</b>
                <span class="grow"></span>
                <button class="tool" onclick={() => mail.archive()} title="Archive (e)"><Icon name="archive" /></button>
                <button class="tool" onclick={() => mail.trash()} title="Delete (#)"><Icon name="trash" /></button>
                <button class="tool" onclick={() => mail.mark("read", true)} title="Mark read (⇧I)"><Icon name="read" /></button>
                <button class="tool" onclick={() => mail.mark("read", false)} title="Mark unread (⇧U)"><Icon name="unread" /></button>
                <button class="tool" onclick={() => mail.toggleStar()} title="Star (s)"><Icon name="star" /></button>
                <button class="tool" onclick={() => pick("snooze")} title="Snooze (h)"><Icon name="clock" /></button>
                <button class="tool" onclick={() => pick("move")} title="Move (v)"><Icon name="folder" /></button>
                <button class="tool" onclick={() => pick("label")} title="Label (l)"><Icon name="label" /></button>
              </div>
            {:else}
              <div class="row2">
                <h1>{title}</h1>
                <span class="faint">{mail.total ? `${mail.total} conversation${mail.total === 1 ? "" : "s"}` : ""}{mail.unread ? ` · ${mail.unread} unread` : ""}</span>
                <span class="grow"></span>
                <div class="seg" role="group" aria-label="Show only">
                  <button class:on={mail.quick === "unread"} onclick={() => quick("unread")}>Unread</button>
                  <button class:on={mail.quick === "starred"} onclick={() => quick("starred")}>Starred</button>
                  <button class:on={mail.quick === "attachments"} onclick={() => quick("attachments")}>Files</button>
                  <button class:on={mail.quick === "mentions"} onclick={() => quick("mentions")} title="Mail where I am on To">To me</button>
                </div>
              </div>
              {#if mail.split && !mail.query}
                <div class="tabs" role="tablist">
                  {#each TABS as [k, label, icon] (k)}
                    {@const c = mail.counts[k]}
                    <button role="tab" aria-selected={(mail.kind || "person") === k} class:on={(mail.kind || "person") === k} onclick={() => tab(k)}><Icon name={icon} size={14} />{label}{#if c?.unread}<span class="n">{c.unread}</span>{/if}</button>
                  {/each}
                </div>
              {/if}
            {/if}
          </header>
          {#if mail.error}
            <div class="atlas-notice error">{mail.error}<div class="actions"><button class="atlas-btn" onclick={() => mail.load()}>Try again</button><button class="atlas-btn" onclick={() => atlas.plugin.openSettings()}>Settings…</button></div></div>
          {:else if !mail.loading && !mail.rows.length}
            <div class="empty">
              {#if mail.query}<p>Nothing in the index matches.</p><button class="atlas-btn" onclick={searchServer}>Search the servers too</button>
              {:else if !mail.accounts.length}<p>No mail account yet.</p><button class="atlas-btn" onclick={() => atlas.plugin.openSettings()}>Add an account…</button>
              {:else if mail.view.name === "inbox" && !mail.quick}<p class="zero">Inbox zero.</p><p class="faint">Nothing to answer. c writes a new message.</p>
              {:else}<p class="faint">Nothing here{mail.quick ? " with that filter" : ""}.</p>{/if}
            </div>
          {:else}
            <MessageList {mail} {compact} onopen={open} />
          {/if}
        </section>
      {/if}
      {#if mode !== "full"}<div class="grip" class:h={mode === "below"} class:v={mode === "three"} role="separator" aria-label="Resize the list" onpointerdown={(e) => drag(e, mode === "below" ? "listH" : "list")}></div>{/if}
      {#if showReader && (!narrow || screen === "reader")}
        <div class="readerpane">
          <Reader bind:this={reader} {mail} {dark} narrow={mode === "full"} onback={() => { mail.close(); screen = "list"; }} onpick={pick} />
        </div>
      {/if}
    </div>
  {/if}

  {#if windows.length}
    <div class="windows" class:big={bigComposer || narrow}>
      {#each windows as c (c.key)}<div class="win"><Composer {mail} {c} bind:big={bigComposer} /></div>{/each}
    </div>
  {/if}
  {#if help}<Shortcuts onclose={() => (help = false)} />{/if}
  <Toasts {mail} />
  {#if pending}<div class="pending">{pending} …</div>{/if}
</div>

<style>
  .mail { position: relative; height: 100%; display: flex; color: var(--text); background: var(--bg); font-size: calc(14px * var(--ui-scale, 1)); container-type: inline-size; overflow: hidden; }
  .side { position: relative; flex: none; width: var(--side-w); border-right: 1px solid var(--border); background: var(--bg-alt); min-height: 0; }
  .narrow .side { width: 100%; }
  .work { flex: 1; min-width: 0; display: flex; min-height: 0; }
  .work.below { flex-direction: column; }
  .listpane { flex: none; width: var(--list-w); display: flex; flex-direction: column; min-height: 0; min-width: 0; border-right: 1px solid var(--border); }
  .below .listpane { width: auto; height: var(--list-h); border-right: 0; border-bottom: 1px solid var(--border); }
  .full .listpane { flex: 1; width: auto; border-right: 0; }
  .readerpane { flex: 1; min-width: 0; min-height: 0; container-type: inline-size; }
  .grip { flex: none; background: transparent; position: relative; z-index: 3; }
  .grip.v { width: 5px; margin: 0 -3px; cursor: col-resize; }
  .grip.h { height: 5px; margin: -3px 0; cursor: row-resize; }
  .side .grip.v { position: absolute; top: 0; bottom: 0; right: -3px; margin: 0; }
  .grip:hover { background: var(--accent-soft); }
  .lhead { flex: none; padding: 8px 10px 6px; display: grid; gap: 6px; border-bottom: 1px solid var(--border); }
  .row1, .row2, .selbar, .chips { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; background: var(--bg-hover); border: 1px solid transparent; border-radius: var(--radius); padding: 0 6px 0 10px; color: var(--text-faint); }
  .search:focus-within { border-color: var(--accent); background: var(--bg); color: var(--text); }
  .search input { all: unset; flex: 1; min-width: 0; padding: 7px 0; color: var(--text); }
  .search input::placeholder { color: var(--text-faint); }
  h1 { margin: 0; font-size: 1.05em; font-weight: 650; color: var(--heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 4.5em; }
  .row2 { flex-wrap: wrap; row-gap: 4px; }
  .faint { color: var(--text-faint); font-size: 0.86em; white-space: nowrap; }
  .grow { flex: 1; }
  .seg { display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; flex: none; }
  .seg button { all: unset; cursor: pointer; padding: 3px 8px; font-size: 0.82em; color: var(--text-muted); }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button:hover { background: var(--bg-hover); color: var(--text); }
  .seg button.on { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .seg button:focus-visible, .tabs button:focus-visible, .tool:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .tabs { display: flex; gap: 2px; margin-bottom: -7px; }
  .tabs button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 6px 12px 7px; color: var(--text-muted); border-bottom: 2px solid transparent; font-size: 0.92em; }
  .tabs button:hover { color: var(--text); }
  .tabs button.on { color: var(--accent-strong); border-bottom-color: var(--accent); font-weight: 600; }
  .n { font-size: 0.8em; padding: 0 6px; border-radius: 999px; background: var(--accent); color: var(--accent-fg); }
  .chips { flex-wrap: wrap; }
  .chip { font-size: 0.82em; padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); }
  .chip b { font-weight: 600; margin-right: 2px; }
  .link { all: unset; cursor: pointer; color: var(--accent); font-size: 0.85em; }
  .selbar { background: var(--accent-soft); border-radius: var(--radius-sm); padding: 2px 4px; }
  .tool { all: unset; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); color: var(--text-muted); display: grid; place-items: center; min-width: 24px; min-height: 24px; flex: none; }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .empty { flex: 1; display: grid; align-content: center; justify-items: center; gap: 8px; padding: 30px; text-align: center; color: var(--text-muted); }
  .empty p { margin: 0; }
  .zero { font-size: 1.3em; font-weight: 600; color: var(--heading); }
  .windows { position: absolute; right: 16px; bottom: 0; z-index: 40; display: flex; gap: 12px; align-items: flex-end; max-width: calc(100% - 32px); }
  .win { width: min(560px, calc(100vw - 32px)); max-height: 85%; overflow: auto; border-radius: var(--radius) var(--radius) 0 0; box-shadow: var(--shadow-md, 0 8px 30px rgba(0, 0, 0, 0.3)); }
  .windows.big { inset: 12px; right: 12px; bottom: 12px; }
  .windows.big .win { width: 100%; height: 100%; max-height: none; border-radius: var(--radius); }
  .pending { position: absolute; right: 16px; top: 12px; z-index: 30; font: 600 0.9em var(--font-mono); padding: 4px 10px; border-radius: var(--radius-sm); background: var(--bg-elev); border: 1px solid var(--border-strong); }
  @container (max-width: 900px) { .seg { display: none; } }
</style>
