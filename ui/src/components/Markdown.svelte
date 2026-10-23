<script lang="ts">
  // Read-only rendered markdown (markdown-it + KaTeX) with local images and wikilinks wired up.
  import { hydrateRendered } from "../lib/hydrate";
  import { errText } from "../lib/text";
  import { renderMarkdown, stripFrontmatter } from "../lib/markdown";
  import { onHighlightLanguage } from "../lib/highlight";
  import { markLogEntries } from "../lib/log-entries";
  import { openWikilink } from "../lib/links";
  import { onVaultChange, vaultReady } from "../lib/vault";
  import { openPath } from "../lib/dock";
  import { api } from "../lib/api";
  import { toast } from "../lib/state.svelte";

  // tickable: its to-dos can be ticked in `path` (a click, like the editor's checkbox); `hidden`:
  // how many lines of the file come before `text` (a header the view leaves out), to find the line
  /** `compact`: embeds as cards, not viewers (a card on Home). `log`: `HH:MM` items drawn as a day's log (log-entries.ts). */
  let { text, path = "", class: cls = "", tickable = false, hidden = 0, compact = false, log = false }: { text: string; path?: string; class?: string; tickable?: boolean; hidden?: number; compact?: boolean; log?: boolean } = $props();
  const dir = $derived(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  // re-render when the file list changes: embeds and unresolved-link styling depend on it
  let vaultTick = $state(0);
  $effect(() => { void vaultReady(); return onVaultChange(() => vaultTick++); });
  $effect(() => onHighlightLanguage(() => vaultTick++)); // a fence's language arrived: drawn highlighted
  const html = $derived((void vaultTick, renderMarkdown(stripFrontmatter(text), { dir })));
  let el: HTMLDivElement;

  $effect(() => {
    void html;
    if (el && tickable && path) el.querySelectorAll<HTMLInputElement>("input.task-checkbox:not(:checked)").forEach((b) => { b.disabled = false; b.title = "Tick it"; });
    if (el && log) markLogEntries(el);
    if (!el) return;
    return hydrateRendered(el, path, { compact, exprText: text }); // undone on a re-render and when the view goes, not while its tab is hidden
  });

  function onclick(e: MouseEvent) {
    const box = (e.target as HTMLElement).closest<HTMLInputElement>("input.task-checkbox");
    if (box && tickable && path && !box.disabled) {
      e.preventDefault(); // the file says when it is done: the view redraws from it
      const front = text.split("\n").length - stripFrontmatter(text).split("\n").length;
      const line = Number(box.dataset.line) + 1 + hidden + front;
      box.disabled = true;
      void api.tickTask(path, line).catch((err) => { box.disabled = false; toast("Could not tick it", errText(err), "error"); });
      return;
    }
    followLink(e, false);
  }
  /** A link of the vault opens in Atlas — `beside` for the middle button, as a browser's new tab. */
  function followLink(e: MouseEvent, beside: boolean) {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a");
    if (!a) return;
    if (a.classList.contains("internal-link")) {
      e.preventDefault();
      void openWikilink(a.dataset.href ?? "", path, { beside });
    } else if (a.getAttribute("href")?.startsWith("#")) {
      e.preventDefault();
    } else if (!/^[a-z]+:/i.test(a.getAttribute("href") ?? "")) {
      e.preventDefault(); // relative markdown link → open inside Atlas
      const href = decodeURI(a.getAttribute("href") ?? "");
      openPath(dir ? `${dir}/${href}`.replace(/\/\.\//g, "/") : href, undefined, { beside });
    }
  }
  const onauxclick = (e: MouseEvent) => { if (e.button === 1) followLink(e, true); };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="markdown {cls}" data-note={path || undefined} bind:this={el} {onclick} {onauxclick}>{@html html}</div>
