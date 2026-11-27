<script lang="ts">
  // FreshRSS's reader (the command "FreshRSS: read"): the feeds with their unread counts on the left (All, Starred,
  // then each feed by folder), the articles of the one chosen in the middle (unread ones bold, newest first, more on
  // scrolling), the article on the right — its HTML, cleaned by the helper with the core's one cleaner, in the shared
  // frame the mail reader uses (ui/src/components/HtmlFrame.svelte). Opening an article marks it read on FreshRSS;
  // Star, Mark unread, Keep (a note of it, the helper's `save`) and Open (its page, as Atlas opens links) under its
  // title. Keys while the pane has them: j / k the next / previous article, s star, m read or unread, o open, v keep.
  // Everything goes through the helper (helper/helper.ts), so the pane never holds a password or a token.
  import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
  import HtmlFrame from "../../../../../ui/src/components/HtmlFrame.svelte";
  // @ts-ignore — plain JavaScript shared with the helper
  import { ALL, STARRED } from "../../fr.js";

  type Feed = { id: string; title: string; folder: string; site: string | null; unread: number };
  type Article = { id: string; title: string; url: string | null; feed: string; feedId: string; author: string; published: number; html: string; read: boolean; starred: boolean };

  let { atlas }: { atlas: PluginApi } = $props();
  const api = $derived(atlas);

  let feeds = $state<Feed[]>([]);
  let total = $state(0);
  let stream = $state<string>(ALL);
  let onlyUnread = $state(true);
  let list = $state<Article[]>([]);
  let more = $state("");
  let current = $state<Article | null>(null);
  let error = $state("");
  let loading = $state(false);
  let root: HTMLElement | undefined = $state();
  const remote = $derived(api.plugin.settings?.remote_images !== false);

  const call = <T,>(method: string, params: Record<string, unknown> = {}) => api.helper.call(method, params, { timeout: 60 }) as Promise<T>;
  const when = (ms: number) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
  const folders = $derived.by(() => {
    const by = new Map<string, Feed[]>();
    for (const f of feeds) by.set(f.folder, [...(by.get(f.folder) ?? []), f]);
    return [...by.entries()];
  });

  async function loadFeeds() {
    try {
      const r = await call<{ feeds: Feed[]; unread: number }>("feeds");
      feeds = r.feeds;
      total = r.unread;
      error = "";
    } catch (e) {
      error = String((e as Error)?.message ?? e);
    }
  }

  async function loadArticles(next = false) {
    if (loading) return;
    loading = true;
    try {
      const r = await call<{ articles: Article[]; more: string }>("articles", { stream, unread: onlyUnread && stream !== STARRED, more: next ? more : "" });
      list = next ? [...list, ...r.articles] : r.articles;
      more = r.more;
      error = "";
    } catch (e) {
      error = String((e as Error)?.message ?? e);
    } finally {
      loading = false;
    }
  }

  function choose(id: string) {
    stream = id;
    current = null;
    void loadArticles();
  }

  /** A mark sent to FreshRSS, shown at once and undone when FreshRSS refuses it. */
  async function mark(a: Article, what: "read" | "unread" | "star" | "unstar") {
    const was = { read: a.read, starred: a.starred };
    if (what === "read" || what === "unread") a.read = what === "read";
    else a.starred = what === "star";
    const feed = feeds.find((f) => f.id === a.feedId);
    const delta = what === "read" && !was.read ? -1 : what === "unread" && was.read ? 1 : 0;
    if (feed) feed.unread = Math.max(0, feed.unread + delta);
    total = Math.max(0, total + delta);
    try {
      await call("mark", { ids: [a.id], mark: what });
    } catch (e) {
      a.read = was.read;
      a.starred = was.starred;
      if (feed) feed.unread = Math.max(0, feed.unread - delta);
      total = Math.max(0, total - delta);
      api.toast?.("FreshRSS", `Not marked: ${String((e as Error)?.message ?? e)}`, "error");
    }
  }

  function show(a: Article) {
    current = a;
    if (!a.read) void mark(a, "read");
  }

  async function keep(a: Article) {
    try {
      const r = await call<{ path: string; made: boolean }>("save", { id: a.id });
      if (!r.made) api.toast?.("FreshRSS", `${r.path} is already there`);
      api.open(r.path, undefined, { beside: true });
    } catch (e) {
      api.toast?.("FreshRSS: not kept", String((e as Error)?.message ?? e), "error");
    }
  }

  const visit = (a: Article) => { if (a.url) void api.openLink?.(a.url); };

  function step(by: number) {
    if (!list.length) return;
    const i = current ? list.findIndex((a) => a.id === current!.id) : -1;
    const next = list[Math.min(list.length - 1, Math.max(0, i + by))];
    if (next) {
      show(next);
      root?.querySelector(`[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }

  function keys(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
    const a = current;
    const act: Record<string, () => void> = {
      j: () => step(1), k: () => step(-1),
      s: () => a && void mark(a, a.starred ? "unstar" : "star"),
      m: () => a && void mark(a, a.read ? "unread" : "read"),
      o: () => a && visit(a), v: () => a && void keep(a),
    };
    const run = act[e.key];
    if (run) { e.preventDefault(); run(); }
  }

  function scrolled(e: Event) {
    const el = e.currentTarget as HTMLElement;
    if (more && !loading && el.scrollTop + el.clientHeight > el.scrollHeight - 300) void loadArticles(true);
  }

  $effect(() => {
    if (!String(api.plugin.settings?.server ?? "").trim()) { error = "Set the FreshRSS address and your API password in Settings → Plugins → FreshRSS."; return; }
    void loadFeeds();
    void loadArticles();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="fr" bind:this={root} tabindex="0" onkeydown={keys} role="application" aria-label="FreshRSS">
  <nav class="feeds" aria-label="Feeds">
    <button class="feed" class:on={stream === ALL} onclick={() => choose(ALL)}><span>All articles</span>{#if total}<b>{total}</b>{/if}</button>
    <button class="feed" class:on={stream === STARRED} onclick={() => choose(STARRED)}><span>Starred</span></button>
    {#each folders as [folder, fs] (folder)}
      {#if folder}<div class="folder">{folder}</div>{/if}
      {#each fs as f (f.id)}
        <button class="feed" class:on={stream === f.id} onclick={() => choose(f.id)} title={f.title}><span>{f.title}</span>{#if f.unread}<b>{f.unread}</b>{/if}</button>
      {/each}
    {/each}
  </nav>

  <section class="list" onscroll={scrolled} aria-label="Articles">
    <div class="bar">
      <label><input type="checkbox" bind:checked={onlyUnread} onchange={() => loadArticles()} disabled={stream === STARRED} /> Unread only</label>
      <button class="ghost" onclick={() => { void loadFeeds(); void loadArticles(); }} title="Read FreshRSS again">Refresh</button>
    </div>
    {#if error}<p class="error">{error}</p>{/if}
    {#each list as a (a.id)}
      <button class="item" class:unread={!a.read} class:on={current?.id === a.id} data-id={a.id} onclick={() => show(a)}>
        <span class="title">{#if a.starred}<span class="star" aria-label="starred">★</span>{/if}{a.title}</span>
        <small>{a.feed}{a.published ? ` · ${when(a.published)}` : ""}</small>
      </button>
    {:else}
      {#if !error && !loading}<p class="empty">{onlyUnread ? "Nothing unread here." : "No articles here."}</p>{/if}
    {/each}
    {#if loading}<p class="empty">Reading FreshRSS…</p>{/if}
  </section>

  <article class="reading" aria-label="Article">
    {#if current}
      {@const a = current}
      <header>
        <h2>{#if a.url}<a href={a.url} onclick={(e) => { e.preventDefault(); visit(a); }}>{a.title}</a>{:else}{a.title}{/if}</h2>
        <small>{[a.feed, a.author, when(a.published)].filter(Boolean).join(" · ")}</small>
        <div class="actions">
          <button onclick={() => mark(a, a.starred ? "unstar" : "star")}>{a.starred ? "Unstar" : "Star"}</button>
          <button onclick={() => mark(a, a.read ? "unread" : "read")}>{a.read ? "Mark unread" : "Mark read"}</button>
          <button onclick={() => keep(a)} title="Make a note of this article">Keep</button>
          {#if a.url}<button onclick={() => visit(a)}>Open</button>{/if}
        </div>
      </header>
      {#key a.id}<HtmlFrame html={a.html} {remote} quotes={false} title={a.title} atlas={api} />{/key}
    {:else}
      <p class="empty">Choose an article. Keys: j / k next and previous, s star, m read, o open, v keep.</p>
    {/if}
  </article>
</div>

<style>
  .fr { display: grid; grid-template-columns: minmax(160px, 220px) minmax(240px, 360px) 1fr; height: 100%; min-height: 0; background: var(--bg); color: var(--text); font-family: var(--font-ui); font-size: calc(14px * var(--ui-scale, 1)); outline: none; }
  .feeds, .list, .reading { min-height: 0; overflow-y: auto; }
  .feeds { border-right: 1px solid var(--border); padding: 8px 6px; background: var(--bg-alt, var(--bg)); }
  .list { border-right: 1px solid var(--border); }
  .feed { display: flex; width: 100%; gap: 6px; align-items: center; padding: 4px 8px; border: 0; border-radius: 6px; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .feed span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .feed b { font-weight: 600; font-size: .85em; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .feed:hover { background: var(--bg-hover, var(--bg)); }
  .feed.on { background: var(--accent-soft, var(--bg-hover)); color: var(--heading, var(--text)); }
  .folder { margin: 10px 8px 2px; color: var(--text-faint); font-size: .8em; text-transform: uppercase; letter-spacing: .04em; }
  .bar { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--bg); color: var(--text-muted); font-size: .9em; }
  .bar label { display: flex; gap: 5px; align-items: center; cursor: pointer; }
  .item { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 8px 12px; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text-muted); font: inherit; text-align: left; cursor: pointer; }
  .item .title { color: var(--text); line-height: 1.35; }
  .item.unread .title { font-weight: 600; color: var(--heading, var(--text)); }
  .item small { color: var(--text-faint); font-size: .82em; }
  .item:hover { background: var(--bg-hover, var(--bg)); }
  .item.on { background: var(--accent-soft, var(--bg-hover)); }
  .star { color: var(--yellow, #c9a227); margin-right: 4px; }
  .reading { padding: 16px 24px 32px; }
  .reading header { max-width: 760px; margin-bottom: 12px; }
  .reading h2 { margin: 0 0 4px; font-size: 1.35em; line-height: 1.3; color: var(--heading, var(--text)); }
  .reading h2 a { color: inherit; text-decoration: none; }
  .reading h2 a:hover { text-decoration: underline; }
  .reading small { color: var(--text-faint); }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .actions button, .ghost { padding: 3px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font: inherit; font-size: .9em; cursor: pointer; }
  .actions button:hover, .ghost:hover { border-color: var(--border-strong, var(--border)); }
  .reading :global(.frame) { max-width: 760px; }
  .empty { padding: 16px; color: var(--text-faint); }
  .error { padding: 10px 12px; color: var(--red); }
</style>
