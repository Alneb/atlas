<script lang="ts">
  // The one web capture box: the in-app popup (QuickCapture.svelte) and the quick-capture window (CaptureWindow.svelte)
  // are frames around it. The core's capture (the day's log, a to-do with its date), the hint line, completions, the
  // guides, a pasted or dropped file beside today's log with its embed in the text, the vault it goes to.
  // Enter saves (`onsaved`), Esc asks to close (`onclose`); a failure stays in the box, the text kept.
  import { tick } from "svelte";
  import { api } from "../lib/api";
  import { thumbUrl } from "../lib/raw";
  import { shownPath, IMAGE_RE } from "../lib/paths";
  import { errText } from "../lib/text";
  import { complete } from "../lib/textarea-complete";
  import { captureHint } from "../lib/capture-hints.svelte";
  import { attachFiles, filesOf, type Attached } from "../lib/attach";
  import { PROMPT } from "../lib/capture-guides";
  import type { CaptureResult } from "../lib/gen/CaptureResult";
  import Icon from "./Icon.svelte";
  import CaptureGuides from "./CaptureGuides.svelte";

  type Vault = { name: string; path: string };
  let {
    text = $bindable(""),
    vault = $bindable(""),
    vaults = [],
    saved = "",
    onsaved,
    onclose,
    ontriage,
    escape = "later",
    lines = 2,
    testid = "quick-capture",
  }: {
    text?: string;
    /** The vault written to; "" or `vaults[0]` (this window's own) = this one. */
    vault?: string;
    /** This window's vault first, then the other known ones; the picker shows when there are two or more. */
    vaults?: Vault[];
    /** Where the last capture went, once saved (the box is then read-only until its frame closes it). */
    saved?: string;
    onsaved: (r: CaptureResult, text: string) => void;
    onclose: () => void;
    /** Opens the captures still to triage; without it, the count is not shown. */
    ontriage?: () => void;
    /** What Esc does, as the keys line says it. */
    escape?: string;
    /** How many lines the empty box shows (it grows as the text does). */
    lines?: number;
    testid?: string;
  } = $props();

  let box = $state<HTMLTextAreaElement>();
  let sending = $state(false);
  let attaching = $state(0);
  let failed = $state("");
  let untriaged = $state(0);
  let attached = $state<Attached[]>([]); // this draft's attachments; shown while their embed is in the text
  const other = $derived(vault && vault !== vaults[0]?.path ? vault : undefined); // undefined = this window's vault
  const pictures = $derived(attached.filter((a) => IMAGE_RE.test(a.path) && text.includes(a.embed)));
  const hint = captureHint(() => text, () => other);
  const isTodo = $derived(/^\s*(\[\s?\]|todo\b)/i.test(text));
  const where = $derived(attaching ? "attaching…" : text.trim() ? hint.current.says : `to ${other ? vaults.find((v) => v.path === other)?.name ?? "that vault" : "today"}'s log`);

  /** Gives the box the focus, the caret at the end (the frame calls it when it opens). */
  export function focus() {
    void tick().then(() => { box?.focus(); box?.setSelectionRange(box.value.length, box.value.length); autosize(); });
  }
  $effect(() => { if (ontriage) void api.captures().then((l) => { untriaged = l.open; }, () => {}); });
  $effect(() => { void text; failed = ""; });

  function autosize() { if (box) { box.style.height = "auto"; box.style.height = `${Math.min(box.scrollHeight, 320)}px`; } }
  function toggleTodo() {
    text = isTodo ? text.replace(/^\s*(\[\s?\]|todo\b)\s*/i, "") : `[] ${text}`;
    box?.focus();
  }
  async function send() {
    const value = text.trim();
    if (!value || sending || attaching || saved) return;
    sending = true;
    try {
      const r = await api.capture(value, other);
      text = "";
      attached = [];
      onsaved(r, value);
    } catch (e) { failed = errText(e); box?.focus(); }
    finally { sending = false; }
  }
  /** The next vault (or the one before), without leaving the box. */
  function stepVault(by: 1 | -1) {
    const i = Math.max(0, vaults.findIndex((v) => v.path === (vault || vaults[0]?.path))), n = vaults.length;
    vault = vaults[(i + by + n) % n].path;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return; // a completion list took it
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); }
    else if (e.key === "Escape") { e.preventDefault(); onclose(); }
    // Super+↑/↓ as in the native box (Alt, its first keys, too)
    else if ((e.metaKey || e.altKey) && (e.key === "ArrowDown" || e.key === "ArrowUp") && vaults.length > 1) {
      e.preventDefault();
      stepVault(e.key === "ArrowDown" ? 1 : -1);
    }
  }
  /** Files from a paste or drop → their embeds at the caret, each on its own line. */
  async function attach(e: ClipboardEvent | DragEvent) {
    const files = filesOf("clipboardData" in e ? e.clipboardData : e.dataTransfer);
    if (!files.length) return; // plain text: the textarea's own paste
    e.preventDefault();
    // files go beside this vault's log; the core takes them nowhere else yet
    if (other) { failed = "files go only into this window's vault"; return; }
    attaching++;
    try {
      const done = await attachFiles((await api.todayLog()).path, files);
      if (!done.length) return;
      attached = [...attached, ...done];
      const embeds = done.map((a) => a.embed);
      const t = text, at = box?.selectionStart ?? t.length;
      const before = t.slice(0, at), after = t.slice(at);
      const insert = `${before && !before.endsWith("\n") ? "\n" : ""}${embeds.join("\n")}${after && !after.startsWith("\n") ? "\n" : ""}`;
      text = before + insert + after;
      await tick();
      box?.focus(); box?.setSelectionRange(at + insert.length, at + insert.length); autosize();
    } catch (err) { failed = `could not attach: ${errText(err)}`; }
    finally { attaching--; }
  }
  /** Takes a picture's embed (and its line, when alone on it) out of the text; the file stays beside the log. */
  function unembed(a: Attached) {
    const line = [`\n${a.embed}`, `${a.embed}\n`].find((x) => text.includes(x)) ?? a.embed;
    text = text.replace(line, "");
    box?.focus(); void tick().then(autosize);
  }
</script>

<div class="cb" class:sending data-testid="capture-box" data-state={saved ? "saved" : failed ? "failed" : sending ? "sending" : "typing"}>
  <div class="head">
    <Icon name="plus" size={15} />
    <span class="title">Capture</span>
    {#if saved}<span class="where ok" data-testid="capture-ok">Saved to {saved}</span>
    {:else if failed}<span class="where bad" role="alert" data-testid="capture-failed">Not saved: {failed}</span>
    {:else}<span class="where" data-testid="capture-what">{where}</span>{/if}
    {#if vaults.length > 1 && !saved}
      <select bind:value={vault} aria-label="Vault" title="The vault it goes to (Super+↑ / Super+↓)" data-testid="capture-vault">
        {#each vaults as v (v.path)}<option value={v.path}>{v.name}</option>{/each}
      </select>
    {/if}
    {#if ontriage && untriaged}<button class="inbox" onclick={ontriage} title="The captures still to triage">{untriaged} to triage</button>{/if}
  </div>
  <!-- the list hangs from this wrapper (textarea-complete.ts places it by the box's parent), not from the whole box -->
  <div class="field"><textarea bind:this={box} bind:value={text} {onkeydown} oninput={autosize} onpaste={attach} ondrop={attach} use:complete={{ vault: () => other }} rows={lines} style:min-height="calc({lines * 1.5}em + 14px)"
    placeholder={PROMPT} aria-label="Capture text" readonly={!!saved} data-testid={testid}></textarea></div>
  {#if pictures.length}
    <div class="thumbs" aria-label="Attached pictures">
      {#each pictures as a (a.path)}
        <figure title={shownPath(a.path)}>
          <!-- /api/raw needs the x-atlas header, which an <img> cannot send: the core's small copy as a blob: URL -->
          {#await thumbUrl(a.path, 128) then src}<img {src} alt={shownPath(a.path)} />{/await}
          <button onclick={() => unembed(a)} title="Take it out of the capture" aria-label="Remove {shownPath(a.path)}"><Icon name="close" size={11} /></button>
        </figure>
      {/each}
    </div>
  {/if}
  <div class="foot">
    <button class="chip" class:on={isTodo} aria-pressed={isTodo} onclick={toggleTodo} title="Make it a to-do ([] in front)"><Icon name="check" size={13} /> To-do</button>
    {#if !text.trim()}<span class="guides" data-testid="capture-guides-line"><CaptureGuides {box} /></span>{/if}
    <span class="keys"><kbd>Enter</kbd> save · <kbd>Shift</kbd><kbd>Enter</kbd> new line · <kbd>Esc</kbd> {escape}</span>
    <button class="save" onclick={() => void send()} disabled={!text.trim() || sending || attaching > 0 || !!saved}>Save</button>
  </div>
</div>

<style>
  .cb { display: flex; flex-direction: column; min-width: 0; }
  .cb.sending { opacity: .7; }
  .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px 4px; color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  .title { color: var(--text); font-weight: 600; }
  .where { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-faint); }
  .where.ok { color: var(--green); }
  .where.bad { color: var(--red); }
  select { font: inherit; color: var(--accent-strong); background: var(--accent-soft); border: 0; border-radius: 999px; padding: 1px 8px; max-width: 16ch; }
  .inbox { border: 1px solid var(--border); background: var(--bg); color: var(--accent); border-radius: 999px; padding: 1px 9px; font: inherit; cursor: pointer; }
  .field { position: relative; display: flex; flex-direction: column; }
  textarea { border: 0; outline: 0; resize: none; background: transparent; color: var(--text); font: inherit; font-size: calc(15px * var(--ui-scale, 1));
    line-height: 1.5; padding: 6px 14px 8px; box-sizing: border-box; }
  textarea::placeholder { color: var(--text-faint); }
  .thumbs { display: flex; gap: 8px; padding: 0 14px 10px; overflow-x: auto; }
  .thumbs figure { position: relative; margin: 0; flex: none; }
  .thumbs img { display: block; height: 64px; max-width: 160px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); }
  .thumbs button { position: absolute; top: 3px; right: 3px; display: grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0;
    border-radius: 999px; background: color-mix(in srgb, var(--bg-elev) 85%, transparent); color: var(--text); cursor: pointer; opacity: 0; }
  .thumbs figure:hover button, .thumbs button:focus-visible { opacity: 1; }
  .foot { display: flex; align-items: center; gap: 10px; padding: 8px 10px 10px 12px; border-top: 1px solid var(--border); font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-faint); }
  .chip { flex: none; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border); background: var(--bg); color: var(--text-muted); border-radius: 999px; padding: 2px 10px; font: inherit; cursor: pointer; }
  .chip.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: var(--accent-soft); }
  /* one line: what fits of the syntax guides, faded at the cut; the keys to save stay whole */
  .guides { flex: 1 1 0; min-width: 0; overflow: hidden; white-space: nowrap; mask-image: linear-gradient(to left, transparent, var(--text) 24px); }
  .guides > :global(*) { flex-wrap: nowrap; }
  .keys { flex: none; margin-left: auto; white-space: nowrap; }
  .keys kbd { font-family: var(--font-mono); font-size: .9em; border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; background: var(--bg); }
  .save { border: 0; border-radius: var(--radius-sm); background: var(--accent); color: var(--accent-fg, #fff); padding: 5px 14px; font: inherit; font-weight: 600; cursor: pointer; }
  .save:disabled { opacity: .45; cursor: default; }
  @media (max-width: 640px) { .keys { display: none; } }
</style>
