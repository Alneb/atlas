<script lang="ts">
  // The composer (DESIGN-mail-ui §3): From (an identity, when the account has several), To / Cc / Bcc as chips with the
  // address book, the subject, the text in Markdown (a small toolbar; a preview of the mail as sent), files by drag and
  // drop, from disk or from the vault. Saved to the server's Drafts by itself after two quiet seconds. Send holds the
  // mail a few seconds with an Undo (`undo_send`), or sends it later; a mail that says "attached" with nothing attached
  // asks once. Inline under a conversation, or a window of its own (pop out / full size).
  import Icon from "./Icon.svelte";
  import AddressField from "./AddressField.svelte";
  import { parseWhen, setting, size, type FileRef } from "./api";
  import type { Composer, Mail } from "./store.svelte";

  let { mail, c, inline = false, big = $bindable(false) }: { mail: Mail; c: Composer; inline?: boolean; big?: boolean } = $props();

  const d = $derived(c.draft);
  // svelte-ignore state_referenced_locally
  let showCc = $state(!!d.cc);
  // svelte-ignore state_referenced_locally
  let showBcc = $state(!!d.bcc);
  let preview = $state<string | null>(null);
  let text: HTMLTextAreaElement | undefined = $state();
  let later = $state(false);
  let laterText = $state("");
  let over = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const account = $derived(mail.accounts.find((a) => a.name === d.account));
  const identities = $derived(account?.identities?.filter(Boolean) ?? []);
  const accounts = $derived(mail.accounts.filter((a) => !a.error));

  $effect(() => {
    // the cursor where writing starts: To for a new mail, the text for a reply
    if (!d.to) return;
    text?.focus();
  });

  function changed() {
    c.dirty = true;
    clearTimeout(timer);
    timer = setTimeout(save, 2000);
  }

  async function save() {
    if (!c.dirty || c.sending || !(d.body.trim() || d.subject.trim() || d.to.trim())) return;
    c.saving = true;
    try {
      const r = await mail.call<{ id: number | null }>("save_draft", { ...d });
      d.draft = r.id;
      c.savedAt = Date.now();
      c.dirty = false;
      c.error = "";
    } catch (e) { c.error = `Not saved: ${(e as Error).message}`; }
    finally { c.saving = false; }
  }

  // ----- Markdown helpers: the selection wrapped, or a line prefix

  function wrap(before: string, after = before, placeholder = "text") {
    if (!text) return;
    const { selectionStart: a, selectionEnd: b, value } = text;
    const sel = value.slice(a, b) || placeholder;
    d.body = value.slice(0, a) + before + sel + after + value.slice(b);
    changed();
    requestAnimationFrame(() => { text!.focus(); text!.setSelectionRange(a + before.length, a + before.length + sel.length); });
  }
  function prefix(p: string) {
    if (!text) return;
    const { selectionStart: a, selectionEnd: b, value } = text;
    const start = value.lastIndexOf("\n", a - 1) + 1;
    const lines = value.slice(start, b).split("\n").map((l) => p + l).join("\n");
    d.body = value.slice(0, start) + lines + value.slice(b);
    changed();
  }
  function link() {
    const url = prompt("Link to (address):", "https://");
    if (url) wrap("[", `](${url})`, "link text");
  }
  async function togglePreview() {
    if (preview !== null) { preview = null; return; }
    try { preview = (await mail.call<{ html: string }>("preview", { body: d.body })).html; } catch (e) { c.error = (e as Error).message; }
  }

  // ----- files

  async function addFiles(list: FileList | File[]) {
    for (const f of Array.from(list)) {
      const data = await new Promise<string>((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
        r.onerror = () => no(r.error);
        r.readAsDataURL(f);
      });
      d.files = [...d.files, { name: f.name, mime: f.type, size: f.size, data }];
    }
    changed();
  }
  function fromVault() {
    mail.atlas.pick({
      placeholder: "A file of the vault to attach…", tag: "Attach",
      items: async () => {
        try {
          const all = (await (await fetch("/api/files")).json()) as string[];
          return all.filter((p) => !p.startsWith(".atlas/")).slice(0, 5000).map((p) => ({ value: p, title: p.split("/").at(-1) ?? p, detail: p }));
        } catch { return []; }
      },
      typed: (t) => `Attach “${t}”`,
      onpick: (path) => { d.files = [...d.files, { name: path.split("/").at(-1) ?? path, path }]; changed(); },
    });
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    over = false;
    const vault = e.dataTransfer?.getData("text/x-atlas-path") || "";
    if (vault) { d.files = [...d.files, { name: vault.split("/").at(-1) ?? vault, path: vault }]; changed(); return; }
    if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
  }
  const removeFile = (f: FileRef) => { d.files = d.files.filter((x) => x !== f); changed(); };
  const totalSize = $derived(d.files.reduce((s, f) => s + (f.size ?? 0), 0));

  // ----- sending

  const FORGOT = /\b(attached|attachment|attaching|enclosed|ci-joint|pi[eè]ce jointe|adjunto|te adjunto|anexo|allegato|anhang|angeh[aä]ngt)\b/i;

  function check(): boolean {
    if (!d.to.trim() && !d.cc.trim() && !d.bcc.trim()) { c.error = "Who is it for? Fill in To."; return false; }
    if (!d.subject.trim() && !confirm("Send it without a subject?")) return false;
    const own = d.body.split(/\n\s*>|\nOn .* wrote:/)[0];
    if (FORGOT.test(own) && !d.files.length && !d.forward && !confirm("The text mentions an attachment, but nothing is attached. Send anyway?")) return false;
    return true;
  }

  async function send(at: number | null = null) {
    if (!check()) return;
    clearTimeout(timer);
    c.sending = true;
    const payload = { ...d, send_at: at };
    mail.closeComposer(c.key);
    if (at) {
      try {
        await mail.call("send", payload);
        mail.toast(`Will be sent ${new Date(at * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", hourCycle: "h23", minute: "2-digit" })}`, "success");
        mail.later();
      } catch (e) { reopen(e as Error); }
      return;
    }
    const wait = Number(setting(mail.atlas, "undo_send", 10)) * 1000;
    let undone = false;
    const go = async () => {
      if (undone) return;
      try {
        const r = await mail.call<{ refused: { address: string; why: string }[] }>("send", payload, 300);
        if (r.refused?.length) mail.toast(`Sent, but refused for ${r.refused.map((x) => x.address).join(", ")}`, "error");
        else mail.toast("Sent", "success");
        mail.later();
      } catch (e) { reopen(e as Error); }
    };
    const t = setTimeout(go, wait);
    mail.toast("Sending…", "info", {
      until: Date.now() + wait,
      undo: async () => { undone = true; clearTimeout(t); mail.compose({ ...payload }, c.inline); },
    });
  }
  function reopen(e: Error) {
    const again = mail.compose({ ...d }, c.inline);
    again.error = `Not sent: ${e.message}`;
    mail.toast(`Not sent: ${e.message}`, "error");
  }
  function sendLater() {
    const at = parseWhen(laterText);
    if (!at || at * 1000 < Date.now()) { c.error = "When? e.g. tomorrow 8, mon 14:00, 2026-11-02 09:00, 3h"; return; }
    later = false;
    send(at);
  }
  const laterChoices = () => {
    const at8 = (days: number) => { const x = new Date(); x.setDate(x.getDate() + days); x.setHours(8, 0, 0, 0); return Math.floor(x.getTime() / 1000); };
    const mon = (8 - new Date().getDay()) % 7 || 7;
    return [{ label: "Tomorrow morning", at: at8(1) }, { label: "Monday morning", at: at8(mon) }];
  };

  async function discard() {
    if ((c.dirty || d.draft) && (d.body.trim() || d.subject.trim()) && !confirm("Discard this message?")) return;
    clearTimeout(timer);
    mail.closeComposer(c.key);
    if (d.draft) {
      try { await mail.call("discard_draft", { id: d.draft }); mail.later(); } catch { /* it stays in Drafts */ }
    }
  }

  function key(e: KeyboardEvent) {
    e.stopPropagation(); // the pane's single keys are not for a composer
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "Enter") { e.preventDefault(); send(); }
    else if (ctrl && e.key.toLowerCase() === "s") { e.preventDefault(); c.dirty = true; save(); }
    else if (ctrl && e.key.toLowerCase() === "b" && e.target === text) { e.preventDefault(); wrap("**"); }
    else if (ctrl && e.key.toLowerCase() === "i" && e.target === text) { e.preventDefault(); wrap("*"); }
    else if (ctrl && e.key.toLowerCase() === "k" && e.target === text) { e.preventDefault(); link(); }
    else if (ctrl && e.shiftKey && e.key.toLowerCase() === "c") { e.preventDefault(); showCc = true; }
    else if (ctrl && e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); showBcc = true; }
    else if (e.key === "Escape" && !inline) { e.preventDefault(); save(); mail.closeComposer(c.key); }
  }
  function autosize() {
    if (!text) return;
    text.style.height = "auto";
    text.style.height = `${Math.min(Math.max(text.scrollHeight, inline ? 120 : 220), big ? 2000 : 520)}px`;
  }
  $effect(() => { void d.body; autosize(); });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="composer" class:inline class:over role="form" aria-label={d.reply_to ? "Reply" : d.forward ? "Forward" : "New message"}
  onkeydown={key} ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={(e) => { if (e.currentTarget === e.target) over = false; }} ondrop={drop}>
  {#if !inline}
    <header class="bar">
      <b>{d.subject || (d.reply_to ? "Reply" : d.forward ? "Forward" : "New message")}</b>
      <span class="grow"></span>
      <button class="tool" onclick={() => (big = !big)} title={big ? "Smaller" : "Full size"}><Icon name="layout" size={15} /></button>
      <button class="tool" onclick={() => { save(); mail.closeComposer(c.key); }} title="Close (kept in Drafts)"><Icon name="x" size={15} /></button>
    </header>
  {/if}
  <div class="fields">
    {#if accounts.length > 1 || identities.length > 1}
      <div class="from">
        <span class="label">From</span>
        <select value={`${d.account}\u0000${d.from}`} onchange={(e) => { const [a, f] = e.currentTarget.value.split("\u0000"); d.account = a; d.from = f; changed(); }}>
          {#each accounts as a (a.name)}
            {#each (a.identities?.length ? a.identities : [a.from ?? a.user ?? a.name]) as id (id)}
              <option value={`${a.name}\u0000${id === a.from ? "" : id}`}>{id}{accounts.length > 1 ? ` · ${a.name}` : ""}</option>
            {/each}
          {/each}
        </select>
      </div>
    {/if}
    <div class="torow">
      <div class="grow"><AddressField atlas={mail.atlas} label="To" bind:value={d.to} autofocus={!d.to && !inline} /></div>
      {#if !showCc}<button class="link" onclick={() => (showCc = true)}>Cc</button>{/if}
      {#if !showBcc}<button class="link" onclick={() => (showBcc = true)}>Bcc</button>{/if}
    </div>
    {#if showCc}<AddressField atlas={mail.atlas} label="Cc" bind:value={d.cc} />{/if}
    {#if showBcc}<AddressField atlas={mail.atlas} label="Bcc" bind:value={d.bcc} />{/if}
    {#if !inline || !d.reply_to}
      <input class="subject" placeholder="Subject" bind:value={d.subject} oninput={changed} aria-label="Subject" />
    {/if}
  </div>

  <div class="tb" role="toolbar" aria-label="Formatting">
    <button onclick={() => wrap("**")} title="Bold (Ctrl+B)"><b>B</b></button>
    <button onclick={() => wrap("*")} title="Italic (Ctrl+I)"><i>I</i></button>
    <button onclick={() => wrap("~~")} title="Strikethrough"><s>S</s></button>
    <button onclick={link} title="Link (Ctrl+K)"><Icon name="open" size={14} /></button>
    <button onclick={() => prefix("- ")} title="List">•</button>
    <button onclick={() => prefix("1. ")} title="Numbered list">1.</button>
    <button onclick={() => prefix("> ")} title="Quote">”</button>
    <button onclick={() => wrap("`")} title="Code"><code>{"<>"}</code></button>
    <span class="grow"></span>
    <button onclick={togglePreview} class:on={preview !== null} title="How it will look">{preview !== null ? "Edit" : "Preview"}</button>
  </div>

  {#if preview !== null}
    <!-- the engine's own Markdown → HTML: what the recipients get -->
    <div class="preview">{@html preview}</div>
  {:else}
    <textarea bind:this={text} bind:value={d.body} oninput={changed} placeholder={d.reply_to ? "Your reply…" : "Write… (Markdown: **bold**, *italic*, - lists, > quotes)"} aria-label="The message" spellcheck="true"></textarea>
  {/if}

  {#if d.files.length}
    <div class="files">
      {#each d.files as f (f.name + (f.path ?? "") + (f.from?.join() ?? ""))}
        <span class="file"><Icon name="attach" size={13} /><span>{f.name}</span>{#if f.size}<span class="faint">{size(f.size)}</span>{/if}{#if f.from}<span class="faint">(forwarded)</span>{/if}<button onclick={() => removeFile(f)} aria-label={`Remove ${f.name}`}>×</button></span>
      {/each}
      {#if totalSize > 20 * 1024 * 1024}<span class="warn">{size(totalSize)}: most servers take about 25 MB</span>{/if}
    </div>
  {/if}
  {#if c.error}<div class="error" role="alert">{c.error}</div>{/if}
  {#if over}<div class="drop">Drop to attach</div>{/if}

  <footer class="foot">
    <div class="send">
      <button class="atlas-btn primary" onclick={() => send()} disabled={c.sending} title="Send (Ctrl+Enter)">Send</button>
      <button class="atlas-btn primary more" onclick={() => (later = !later)} aria-expanded={later} title="Send later…"><Icon name="down" size={14} /></button>
      {#if later}
        <div class="later" role="dialog" aria-label="Send later">
          {#each laterChoices() as ch (ch.label)}<button onclick={() => { later = false; send(ch.at); }}>{ch.label}<span class="faint">{new Date(ch.at * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", hourCycle: "h23", minute: "2-digit" })}</span></button>{/each}
          <div class="custom"><input bind:value={laterText} placeholder="tomorrow 9, mon 14:00, 3h…" onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendLater(); } }} /><button class="atlas-btn" onclick={sendLater}>Schedule</button></div>
        </div>
      {/if}
    </div>
    <button class="tool" onclick={() => fileInput?.click()} title="Attach files"><Icon name="attach" /></button>
    <button class="tool" onclick={fromVault} title="Attach a file of the vault…"><Icon name="note" /></button>
    <input type="file" multiple hidden bind:this={fileInput} onchange={(e) => { if (e.currentTarget.files) addFiles(e.currentTarget.files); e.currentTarget.value = ""; }} />
    <span class="status faint">{c.saving ? "Saving…" : c.savedAt ? `Draft saved ${new Date(c.savedAt).toLocaleTimeString(undefined, { hour: "2-digit", hourCycle: "h23", minute: "2-digit" })}` : ""}</span>
    <span class="grow"></span>
    {#if inline}<button class="tool" onclick={() => { c.inline = false; }} title="Pop out"><Icon name="open" size={15} /></button>{/if}
    <button class="tool" onclick={discard} title="Discard"><Icon name="trash" /></button>
  </footer>
</div>

<style>
  .composer { position: relative; display: flex; flex-direction: column; gap: 6px; background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 0 14px 10px; box-shadow: var(--shadow-sm); min-width: 0; }
  .composer.inline { margin-left: 38px; padding-top: 6px; }
  .composer.over { outline: 2px dashed var(--accent); }
  .bar { display: flex; align-items: center; gap: 6px; margin: 0 -14px; padding: 8px 10px 8px 14px; background: var(--bg-alt); border-bottom: 1px solid var(--border); border-radius: var(--radius) var(--radius) 0 0; }
  .bar b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grow { flex: 1; min-width: 0; }
  .fields { display: grid; }
  .from { display: flex; gap: 8px; align-items: center; border-bottom: 1px solid var(--border); padding: 4px 0; }
  .from select { flex: 1; min-width: 0; background: transparent; color: var(--text); border: 0; padding: 4px 0; font: inherit; }
  .label { flex: none; width: 3.2em; color: var(--text-faint); font-size: 0.9em; }
  .torow { display: flex; align-items: flex-start; gap: 8px; }
  .torow .link { margin-top: 9px; }
  .link { all: unset; cursor: pointer; color: var(--text-muted); font-size: 0.9em; }
  .link:hover { color: var(--accent); }
  .subject { all: unset; padding: 8px 0; border-bottom: 1px solid var(--border); font-weight: 600; }
  .tb { display: flex; gap: 2px; align-items: center; padding-top: 2px; }
  .tb button { all: unset; cursor: pointer; min-width: 26px; height: 26px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--text-muted); font-size: 0.92em; padding: 0 4px; }
  .tb button:hover, .tb button.on { background: var(--bg-hover); color: var(--text); }
  textarea { all: unset; box-sizing: border-box; width: 100%; min-height: 120px; resize: none; white-space: pre-wrap; line-height: 1.55; font-size: 15px; font-family: var(--font-prose, var(--font-ui)); overflow-y: auto; }
  .preview { min-height: 120px; padding: 4px 0; line-height: 1.55; overflow-wrap: anywhere; }
  .preview :global(blockquote) { margin: 0.4em 0; padding-left: 0.9em; border-left: 3px solid var(--border-strong); color: var(--text-muted); }
  .files { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .file { display: inline-flex; gap: 6px; align-items: center; padding: 3px 4px 3px 8px; border-radius: var(--radius-sm); background: var(--bg-alt); border: 1px solid var(--border); font-size: 0.9em; max-width: 260px; }
  .file span:not(.faint) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file button { all: unset; cursor: pointer; width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; color: var(--text-muted); }
  .file button:hover { background: var(--bg-hover); }
  .warn { color: var(--orange); font-size: 0.86em; }
  .faint { color: var(--text-faint); }
  .error { color: var(--red); font-size: 0.9em; }
  .drop { position: absolute; inset: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 12%, var(--bg)); border-radius: var(--radius); font-weight: 600; color: var(--accent-strong); pointer-events: none; }
  .foot { display: flex; align-items: center; gap: 6px; padding-top: 4px; }
  .send { position: relative; display: flex; }
  .send .atlas-btn.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
  .send .atlas-btn:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); padding-inline: 18px; }
  .send .more { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; border-left: 1px solid color-mix(in srgb, var(--accent-fg) 25%, transparent) !important; padding-inline: 6px; display: grid; place-items: center; }
  .later { position: absolute; bottom: 110%; left: 0; z-index: 10; width: 280px; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-md, var(--shadow-sm)); padding: 6px; display: grid; gap: 2px; }
  .later > button { all: unset; cursor: pointer; display: flex; justify-content: space-between; padding: 7px 10px; border-radius: var(--radius-sm); }
  .later > button:hover { background: var(--bg-hover); }
  .custom { display: flex; gap: 6px; padding: 6px 4px 2px; border-top: 1px solid var(--border); margin-top: 4px; }
  .custom input { flex: 1; min-width: 0; background: var(--bg); color: var(--text); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 4px 8px; font: inherit; }
  .tool { all: unset; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); color: var(--text-muted); display: grid; place-items: center; min-width: 24px; min-height: 24px; }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .tool:focus-visible, .tb button:focus-visible, .link:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .status { font-size: 0.85em; }
  @container (max-width: 560px) { .composer.inline { margin-left: 0; } }
</style>
