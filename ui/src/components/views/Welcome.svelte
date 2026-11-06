<script lang="ts">
  // The `welcome` block (Home.page's first row in a new vault): where the main functions are, each a button that runs
  // the same command as its key (shown beside it, so the key is learnt by using the button), and the release's plugins
  // one click from being installed. "Remove from Home" takes the block out of the home page's file, nothing else.
  import Icon from "../Icon.svelte";
  import type { IconName } from "../../lib/panes";
  import { allCommands, keysOf } from "../../lib/keymap.svelte";
  import { api } from "../../lib/api";
  import { errText } from "../../lib/text";
  import { toast } from "../../lib/state.svelte";
  import { installFrom } from "../../lib/plugin-manage";
  import type { Available } from "../../lib/gen/Available";

  let { doc }: { doc?: string } = $props();

  /** The tour: what each does, in a line, and the command it runs. A command missing here (a phone) is left out. */
  const TOUR: { id: string; icon: IconName; title: string; what: string }[] = [
    { id: "ui.palette", icon: "command", title: "Commands", what: "Everything Atlas does, by name: type a few letters" },
    { id: "ui.quickOpen", icon: "file", title: "Open a file", what: "Any note, PDF or drawing, by a part of its name" },
    { id: "ui.search", icon: "search", title: "Search", what: "The words inside every note" },
    { id: "ui.note.new", icon: "file-text", title: "New note", what: "From a template, filed where it belongs" },
    { id: "ui.capture", icon: "inbox", title: "Capture", what: "A thought, a task or a link into today's log, without leaving what you do" },
    { id: "ui.sidePanel", icon: "panel-left", title: "Side panel", what: "Files, search, the outline and git, beside the page" },
    { id: "ui.libraries", icon: "library", title: "Libraries", what: "Papers, books, drawings, films: your collections" },
    { id: "ui.terminal.new", icon: "terminal", title: "Terminal", what: "A shell in the vault; AI agents run here too" },
    { id: "ui.settings", icon: "settings", title: "Settings", what: "Every option, with features to try on each page" },
  ];
  const known = new Set(allCommands().map((c) => c.id));
  const tour = TOUR.filter((t) => known.has(t.id));
  const run = (id: string) => void allCommands().find((c) => c.id === id)?.run();

  let offered = $state<Available[] | null>(null);
  let failed = $state("");
  let busy = $state<string | null>(null);
  const load = () => api.availablePlugins().then((a) => { offered = a.filter((p) => p.installed === undefined && p.runs_here).sort((x, y) => (x.tier === y.tier ? x.title.localeCompare(y.title) : x.tier === "stable" ? -1 : 1)); }, (e) => { failed = errText(e); });
  void load();

  async function install(p: Available) {
    busy = p.id;
    if (await installFrom(p.url)) await load();
    busy = null;
  }

  /** The home page without this block: its `- [welcome]` row, or `welcome` in a row of several. */
  async function removeFromHome() {
    if (!doc) return;
    try {
      const f = await api.file(doc);
      const text = f.text.replace(/^[ \t]*- \[welcome\][ \t]*\n/m, "").replace(/\bwelcome,\s*|,\s*welcome\b/, "");
      if (text === f.text) { toast("Not removed", `Take the welcome block out of ${doc} by hand: it is not a row of its own there.`, "info"); return; }
      await api.putFile(doc, text, f.mtime);
    } catch (e) { toast("Not removed", errText(e), "error"); }
  }
</script>

<section class="welcome">
  <header>
    <h2>Getting started</h2>
    <p>Each button does what its key does: use the button a few times and the key comes on its own.</p>
  </header>
  <div class="tour">
    {#each tour as t (t.id)}
      <button class="stop" onclick={() => run(t.id)} data-command={t.id}>
        <Icon name={t.icon} size={18} />
        <span class="name">{t.title}</span>
        {#if keysOf(t.id)}<kbd>{keysOf(t.id)}</kbd>{/if}
        <span class="what">{t.what}</span>
      </button>
    {/each}
  </div>

  <h3>Add features</h3>
  {#if failed}
    <p class="faint">The release's plugins could not be read ({failed}). Settings → Plugins → Install… takes a folder or an address too.</p>
  {:else if offered === null}
    <p class="faint">Reading the release's plugins…</p>
  {:else if offered.length === 0}
    <p class="faint">Every plugin of the release that runs here is installed. Settings → Plugins switches them on and off.</p>
  {:else}
    <ul class="plugins">
      {#each offered as p (p.id)}
        <li>
          <span class="title" title={p.title}>{p.title}</span>
          {#if p.tier !== "stable"}<span class="tier">{p.tier}</span>{/if}
          <button class="install" disabled={busy !== null} onclick={() => install(p)}>{busy === p.id ? "Installing…" : "Install"}</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if doc}<footer><button class="link" onclick={removeFromHome}>Remove this guide from {doc}</button></footer>{/if}
</section>

<style>
  .welcome { display: flex; flex-direction: column; gap: 12px; }
  header h2 { margin: 0; font-size: 1.15em; color: var(--heading); }
  header p { margin: 4px 0 0; color: var(--text-muted); }
  h3 { margin: 6px 0 0; font-size: .78em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); }
  .tour { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
  .stop { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: "icon name key" "what what what"; align-items: center; gap: 4px 8px;
    text-align: left; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius, 8px); background: var(--bg); color: var(--text); cursor: pointer; }
  .stop:hover { border-color: var(--accent); background: var(--accent-soft); }
  .stop :global(svg) { grid-area: icon; color: var(--accent); }
  .name { grid-area: name; font-weight: 600; }
  kbd { grid-area: key; font-family: var(--font-mono); font-size: .78em; padding: 1px 6px; border: 1px solid var(--border); border-radius: 5px; color: var(--text-muted); background: var(--bg-alt); white-space: nowrap; }
  .what { grid-area: what; color: var(--text-muted); font-size: .9em; line-height: 1.35; }
  .plugins { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }
  .plugins li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius, 8px); }
  .plugins .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tier { font-size: .75em; color: var(--text-faint); border: 1px solid var(--border); border-radius: 8px; padding: 0 6px; }
  .install { padding: 2px 10px; border-radius: 6px; background: var(--accent); color: var(--accent-fg); border: none; cursor: pointer; }
  .install:disabled { opacity: .6; cursor: default; }
  .faint { margin: 0; color: var(--text-faint); }
  footer { display: flex; justify-content: flex-end; }
  .link { background: none; border: none; color: var(--text-faint); cursor: pointer; font-size: .85em; text-decoration: underline; }
  .link:hover { color: var(--text); }
</style>
