<script lang="ts">
  import { closable, onScreen } from "../lib/back";
  // Settings (docs/guides/SETTINGS.md): a sidebar of areas, one page each — features to try, options, panels,
  // the next rung. Options are generated from the config schema (Rust doc comments → descriptions) and
  // placed by lib/settings-pages.ts, so a new config field shows up with no UI work. Search spans all pages.
  import { onMount } from "svelte";
  import { settings, loadSuggestions } from "../lib/settings.svelte";
  import { load, save } from "../lib/prefs";
  import { leaves, sectionDescription, isModified, fieldTitle, sectionTitle, shownOn } from "../lib/settings-schema";
  import { placeFields, GROUPS, hostOf, pageDef } from "../lib/settings-pages";
  import { nativeShell } from "../lib/native-shell.svelte";
  import { apiBase } from "../lib/api";
  import { me, loadMe } from "../lib/me.svelte";
  import { phone } from "../lib/phone.svelte";
  import { actions } from "../lib/actions";
  import Icon from "../components/Icon.svelte";
  import SettingsPage from "../components/settings/SettingsPage.svelte";
  import PluginPage from "../components/settings/PluginPage.svelte";
  import AccountsPage from "../components/settings/AccountsPage.svelte";
  import { accountLists, refreshStatus, statuses } from "../lib/accounts.svelte";
  import { isIconName } from "../lib/icons";
  import { pluginBlocked } from "../lib/plugins.svelte";
  import { plugins, loadPlugins } from "../lib/plugins.svelte";
  import { settingsNav, pluginPageId } from "../lib/settings-nav.svelte";
  import { isOff } from "../lib/plugin-manage";
  import SettingField from "../components/settings/SettingField.svelte";
  import { forgetPaths } from "../components/settings/SettingField.svelte";
  import type { PaneProps } from "../lib/dock";

  let { panel: _panel }: PaneProps<"settings"> = $props();

  const PAGE_KEY = "atlas.settings.page";
  const ACCOUNTS = "accounts";
  let current = $state(load<string>(PAGE_KEY, "overview"));
  let filter = $state("");
  let body = $state<HTMLElement>();
  let search = $state<HTMLInputElement>();
  let navEl = $state<HTMLElement>();

  const fields = $derived.by(() => { void settings.schema; return leaves(); });
  const host = $derived(hostOf({ server: !!me.info?.server, phone: nativeShell.on, path: apiBase() }));
  // a setting that does nothing here (a terminal's on the phone) is not offered (its `x-hosts`)
  const pages = $derived(placeFields([...fields].filter(([, s]) => shownOn(s, host)).map(([p]) => p), host, sectionTitle));
  // each plugin with settings is a page of its own, under the core's (components/settings/PluginPage.svelte)
  const pluginPages = $derived(plugins.list.filter((p) => p.fields.length).sort((a, b) => a.title.localeCompare(b.title)));
  const builtinPages = $derived(pages.filter((p) => p.plugin));
  // every plugin has a page (its problems, actions); the bar lists those with settings
  const plugin = $derived(current.startsWith("plugin:") ? plugins.list.find((p) => pluginPageId(p.id) === current) : undefined);
  const accounts = $derived(current === ACCOUNTS);
  // a plugin's page before the plugins load: nothing yet, not Overview (a plugin since removed: Overview)
  const page = $derived(plugin || accounts || (current.startsWith("plugin:") && !plugins.loaded) ? undefined : (pages.find((p) => p.page === current) ?? pages[0]));
  // the lit entry in sight: a page opened from elsewhere may sit below the fold (Plugins' list is long)
  // (and again once laid out, a frame after the pane's kept scroll is put back: lib/pane-scroll.ts)
  const showLit = () => requestAnimationFrame(() => requestAnimationFrame(() => navEl?.querySelector(".nav.on")?.scrollIntoView({ block: "nearest" })));
  $effect(() => { void [plugin, page, pluginPages]; showLit(); });
  $effect(() => { if (!navEl) return; const ro = new ResizeObserver(showLit); ro.observe(navEl); return () => ro.disconnect(); });
  // a plugin with no settings has no entry of its own: the Plugins page it is opened from stays lit
  const navOn = (id: string): boolean => !words.length && (id === page?.page || (id === "plugins" && !!plugin && !plugin.fields.length));
  const accountCount = $derived(accountLists().reduce((n, l) => n + (Array.isArray(l.plugin.settings?.[l.setting.key]) ? (l.plugin.settings[l.setting.key] as unknown[]).length : 0), 0));
  // an account in trouble shows on the Accounts entry: a red dot, without opening the page
  const accountTrouble = $derived(Object.values(statuses).some((m) => Object.values(m).some((x) => x.state === "error")));
  const pluginIcon = (p: { icon?: string | null }) => (isIconName(p.icon ?? "") ? p.icon : "plugin") as "plugin";
  const pluginTrouble = (p: (typeof plugins.list)[number]) => !!(p.error ?? plugins.errors[p.id] ?? (!isOff(p.id) && pluginBlocked(p)));
  // opened at a page from elsewhere (a plugin's openSettings(), the phone app): followed, and once
  $effect(() => { const want = settingsNav.want; if (want) { settingsNav.want = ""; go(want); } });

  // a phone: the list of areas, or one area's page (with its way back) — never both side by side
  let reading = $state(false);
  $effect(() => { if (phone.on && reading) return closable(() => (reading = false), () => onScreen(body)); }); // Back: the list of areas, while on screen (lib/back.ts)

  function go(id: string) {
    current = id;
    reading = true;
    filter = "";
    save(PAGE_KEY, id);
    body?.scrollTo({ top: 0 });
  }

  // search: words must all appear in the label, path, description, section or page title
  const words = $derived(filter.toLowerCase().split(/\s+/).filter(Boolean));
  const hits = $derived.by(() => {
    if (!words.length) return [];
    return pages.flatMap((p) => {
      const feats = (pageDef(p.page)?.features ?? []).flatMap((id) => { const a = actions.find((x) => x.id === id); return a ? [a] : []; })
        .filter((a) => words.every((w) => a.title.toLowerCase().includes(w)));
      const opts = p.fields.filter((path) => {
        const s = fields.get(path);
        const hay = `${fieldTitle(path)} ${path} ${s?.description ?? ""} ${sectionDescription(path.split(".")[0])} ${p.title}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      return opts.length || feats.length ? [{ page: p, opts, feats }] : [];
    });
  });
  // the search box by keyboard: Esc empties it (VS Code), ↓ or Enter goes to the first option found
  function searchKeys(e: KeyboardEvent) {
    if (e.key === "Escape" && filter) { e.preventDefault(); e.stopPropagation(); filter = ""; }
    else if ((e.key === "ArrowDown" || e.key === "Enter") && words.length) {
      const first = body?.querySelector<HTMLElement>(".hit :is(input, select, textarea, button):not(.hit-h):not([disabled])");
      if (first) { e.preventDefault(); first.focus(); }
    }
  }
  const changedIn = (fs: string[]) => fs.filter(isModified).length;

  // the accounts' statuses once the plugins are known, for the sidebar's dot
  let asked = false;
  $effect(() => { if (plugins.loaded && !asked) { asked = true; for (const l of accountLists()) void refreshStatus(l); } });

  onMount(() => {
    forgetPaths();
    if (!phone.on) search?.focus({ preventScroll: true }); // typing right away searches (VS Code); on a phone that would raise the keyboard
    loadSuggestions().catch(() => {});
    void loadMe();
    if (!plugins.loaded) void loadPlugins();
  });
</script>

<div class="settings" class:phone={phone.on} class:reading={reading && !words.length} class:searching={words.length > 0}>
  <nav aria-label="Settings pages" bind:this={navEl}>
    <h1>Settings</h1>
    <input class="filter" placeholder="Search settings…" bind:this={search} bind:value={filter} onkeydown={searchKeys} spellcheck="false" aria-label="Search settings" />
    <button class="nav accounts" class:on={!words.length && accounts} onclick={() => go(ACCOUNTS)} aria-current={!words.length && accounts ? "page" : undefined}>
      <span class="ico acc"><Icon name="user" size={14} /></span> <span>Accounts</span>{#if accountTrouble}<b class="bad" title="An account has a problem"></b>{:else if accountCount}<i>{accountCount}</i>{/if}
    </button>
    <!-- the groups in their order (settings-pages.ts GROUPS); under Plugins the list and Automation, then each plugin's
         own page: the built-ins' first (their fields come from the config schema like the core's) -->
    {#each GROUPS as g (g.id)}
      {@const own = pages.filter((p) => !p.plugin && p.group === g.id)}
      {#if own.length || g.id === "plugins"}
      <h2 class="group">{g.title}</h2>
      {#each own as p (p.page)}
        {@const n = changedIn(p.fields)}
        <button class="nav" class:on={navOn(p.page)} onclick={() => go(p.page)} aria-current={navOn(p.page) ? "page" : undefined}>
          <span class="ico"><Icon name={p.icon} size={14} /></span> <span>{p.title}</span>{#if n}<i title="{n} changed">{n}</i>{/if}
        </button>
      {/each}
      {#if g.id === "plugins"}
      {#each builtinPages as p (p.page)}
        {@const n = changedIn(p.fields)}
        <button class="nav plugin" class:on={navOn(p.page)} class:off={isOff(p.plugin ?? "")} onclick={() => go(p.page)} aria-current={navOn(p.page) ? "page" : undefined}>
          <span class="ico plug"><Icon name={p.icon} size={14} /></span> <span>{p.title}</span>{#if n}<i title="{n} changed">{n}</i>{/if}
        </button>
      {/each}
      {#each pluginPages as p (p.id)}
        <button class="nav plugin" class:on={!words.length && plugin?.id === p.id} class:off={isOff(p.id)} onclick={() => go(pluginPageId(p.id))} aria-current={!words.length && plugin?.id === p.id ? "page" : undefined}>
          <span class="ico plug"><Icon name={pluginIcon(p)} size={14} /></span> <span>{p.title}</span>{#if pluginTrouble(p)}<b class="bad" title="It has a problem"></b>{/if}
        </button>
      {/each}
      {/if}
      {/if}
    {/each}
  </nav>

  <main bind:this={body}>
    {#if phone.on && !words.length}<button class="all" onclick={() => (reading = false)}><span class="flip"><Icon name="chevron" size={16} /></span> All settings</button>{/if}
    {#if !settings.config || !settings.schema}
      <p class="muted">Loading…</p>
    {:else if words.length}
      {@const n = hits.reduce((n, h) => n + h.opts.length, 0)}
      {#if hits.length}<p class="muted">{n} {n === 1 ? "option matches" : "options match"} “{filter}”</p>{/if}
      {#each hits as h (h.page.page)}
        <section class="hit">
          <button class="hit-h" onclick={() => go(h.page.page)}><Icon name={h.page.icon} size={14} /> {h.page.title} →</button>
          {#each h.feats as a (a.id)}<button class="feat" onclick={() => void a.run()}>{a.title} <span>Try</span></button>{/each}
          {#each h.opts as path (path)}{@const s = fields.get(path)}{#if s}<SettingField {path} schema={s} />{/if}{/each}
        </section>
      {:else}<p class="muted">No option matches “{filter}”. Try other words — descriptions are searched too.</p>{/each}
    {:else if accounts}
      <AccountsPage />
    {:else if plugin}
      {#key plugin.id}<PluginPage {plugin} />{/key}
    {:else if page}
      <SettingsPage {page} {fields} {pages} {go} />
      {#if page.page === "overview"}<p class="where">Saved to <code>{settings.path}</code> for this workspace · changes apply at once</p>{/if}
    {/if}
  </main>
</div>

<style>
  .settings { height: 100%; display: flex; background: var(--bg-alt); }
  nav { flex: none; width: 236px; display: flex; flex-direction: column; gap: 1px; padding: 14px 8px; border-right: 1px solid var(--border); overflow-y: auto; }
  .filter { margin: 0 2px 10px; font: inherit; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 9px; }
  .filter:focus { outline: none; border-color: var(--accent); }
  .nav { display: flex; gap: 10px; align-items: center; padding: 5px 8px; border-radius: 8px; color: var(--text); text-align: left; }
  /* each entry's icon on a small tile, as System Settings does: the eye finds an area by its colour and shape */
  .nav .ico { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; color: var(--text-muted); background: var(--bg-elev); border: 1px solid var(--border); }
  .ico.acc { color: var(--accent-fg); border-color: transparent; background: var(--accent); }
  .ico.plug { color: var(--accent); background: var(--accent-soft); border-color: transparent; }
  .nav.on .ico:not(.acc) { color: var(--accent); border-color: var(--accent); }
  .nav.accounts { margin-bottom: 4px; padding-block: 7px; font-weight: 600; }
  .bad { width: 8px; height: 8px; border-radius: 50%; background: var(--red); }
  .nav > span:not(.ico) { flex: 1; }
  .nav:hover { background: var(--bg-hover); color: var(--text); }
  .nav.on { background: var(--accent-soft); color: var(--text); font-weight: 600; }
  .group { margin: 14px 10px 4px; font-size: calc(10.5px * var(--ui-scale, 1)); letter-spacing: .07em; text-transform: uppercase; color: var(--text-faint); font-weight: 600; }
  .nav.plugin.off { opacity: .55; }
  .nav i { font-style: normal; font-size: calc(10.5px * var(--ui-scale, 1)); color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 0 6px; }
  main { flex: 1; min-width: 0; overflow-y: auto; padding: 28px max(24px, calc(50% - 420px)) 80px; }
  h1 { margin: 0 10px 10px; font-size: calc(17px * var(--ui-scale, 1)); color: var(--heading); letter-spacing: -.01em; }
  .muted { color: var(--text-muted); }
  .where { margin-top: 18px; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .hit { margin-top: 14px; padding: 6px 18px 8px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); }
  .hit-h { display: inline-flex; gap: 8px; align-items: center; margin: 8px 0 4px; font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); }
  .hit-h:hover { color: var(--accent); }
  .feat { display: flex; gap: 8px; padding: 6px 0; color: var(--text); }
  .feat span { color: var(--accent); font-size: .85em; font-weight: 600; }
  @media (max-width: 640px) { nav { width: 150px; } }
  /* a phone (lib/phone.svelte.ts): the areas as a full-width list of finger-sized rows; one opens as its own page */
  .all { display: none; }
  .phone nav { width: 100%; border-right: 0; padding: 12px 12px 24px; }
  .phone .nav { min-height: 48px; padding: 0 12px; gap: 14px; font-size: calc(15px * var(--ui-scale, 1)); }
  .phone .filter { min-height: 44px; font-size: 16px; margin: 0 0 10px; } /* 16 px: the phone's browser does not zoom in on focus */
  .phone h1 { font-size: calc(22px * var(--ui-scale, 1)); margin: 4px 4px 12px; }
  .phone main { display: none; padding: 8px 16px 96px; }
  .phone.reading nav { display: none; }
  .phone.reading main { display: block; }
  /* searching on a phone: the box stays above its results (hiding the list hid the box being typed in) */
  .phone.searching { flex-direction: column; }
  .phone.searching nav { flex: none; overflow: visible; padding-bottom: 0; }
  .phone.searching :is(.nav, .group) { display: none; }
  .phone.searching main { display: block; flex: 1; }
  .flip { display: grid; transform: rotate(180deg); }
  .phone .all { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; color: var(--accent); font-weight: 600; }
</style>
