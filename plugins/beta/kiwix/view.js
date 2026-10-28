// Kiwix — the search pane: a book of the server (its catalog, OPDS), titles suggested while typing (`/suggest`), the
// full text searched on Enter (`/search`, its hits with their snippets). An article is a link: Atlas opens it as a web
// page (a tab, as `[web] open_links` says). Save captures its address; the catalog files it as a note.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const BOOK_KEY = "atlas.kiwix.book";

export default function mount(host, atlas) {
  const root = el("div", "kx");
  host.append(style(), root);
  const server = String(atlas.plugin.settings?.server ?? "").trim().replace(/\/+$/, "");
  if (!server) {
    root.append(el("p", "kx-note", "Set your Kiwix server's address in Settings → Plugins → Kiwix."));
    return () => {};
  }
  const bar = el("div", "kx-bar"), q = el("input", "kx-q"), book = el("select", "kx-book");
  Object.assign(q, { type: "search", placeholder: "Search the offline library…", spellcheck: false });
  q.setAttribute("aria-label", "Search");
  book.setAttribute("aria-label", "Book");
  bar.append(q, book);
  const status = el("div", "kx-status", "Reading the library…"), list = el("ol", "kx-hits");
  root.append(bar, status, list);
  let gone = false, asked = 0;

  const get = async (path) => {
    const r = await atlas.fetch(`${server}${path}`, { timeout: 30 });
    if (!r.ok) throw new Error(r.signin ? `sign in to ${r.signin.host} first (Atlas offers it)` : `${server} answered ${r.status}`);
    return r.text();
  };
  const xml = (text) => new DOMParser().parseFromString(text, "application/xml");
  const plain = (html) => new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  const articleUrl = (path) => `${server}/content/${encodeURIComponent(book.value)}/${path.split("/").map(encodeURIComponent).join("/")}`;

  /** The server's books, those the setting names first-class (the others hidden unless none match). */
  async function books() {
    const doc = xml(await get("/catalog/v2/entries?count=-1"));
    const all = [...doc.querySelectorAll("entry")].map((e) => {
      const href = [...e.querySelectorAll("link")].map((l) => l.getAttribute("href") ?? "").find((h) => h.startsWith("/content/")) ?? "";
      return { id: decodeURIComponent(href.slice("/content/".length)), title: e.querySelector("title")?.textContent ?? "", name: e.querySelector("name")?.textContent ?? "", lang: e.querySelector("language")?.textContent ?? "", count: Number(e.querySelector("articleCount")?.textContent ?? 0) };
    }).filter((b) => b.id);
    const words = String(atlas.plugin.settings?.books ?? "").toLowerCase().split(",").map((w) => w.trim()).filter(Boolean);
    const named = words.length ? all.filter((b) => words.some((w) => `${b.name} ${b.title}`.toLowerCase().includes(w))) : all;
    return (named.length ? named : all).sort((a, b) => a.title.localeCompare(b.title) || a.lang.localeCompare(b.lang) || b.id.localeCompare(a.id));
  }

  function show(hits, said) {
    list.replaceChildren(...hits.map((h) => {
      const li = el("li", "kx-hit"), a = el("a", "kx-title", h.title), save = el("button", "kx-save", "Save");
      a.href = articleUrl(h.path);
      save.title = "Capture the article's address: the catalog files it as a note";
      save.onclick = async () => {
        try { await atlas.capture(a.href); atlas.toast("Saved", `${h.title} — captured; the catalog files it`, "success"); }
        catch (e) { atlas.toast("Not saved", String(e?.message ?? e), "error"); }
      };
      const head = el("div", "kx-head"); head.append(a, save);
      li.append(head);
      if (h.snippet) li.append(el("p", "kx-snip", h.snippet));
      return li;
    }));
    status.textContent = said;
  }

  async function suggest() {
    const term = q.value.trim(), mine = ++asked;
    if (!term) return show([], "");
    try {
      const got = JSON.parse(await get(`/suggest?content=${encodeURIComponent(book.value)}&term=${encodeURIComponent(term)}&count=12`));
      if (mine !== asked || gone) return;
      const hits = got.filter((s) => s.kind === "path" && s.path).map((s) => ({ title: s.value, path: s.path }));
      show(hits, hits.length ? "Titles — Enter searches the full text" : "No title — Enter searches the full text");
    } catch (e) { if (mine === asked && !gone) show([], String(e?.message ?? e)); }
  }

  async function search() {
    const term = q.value.trim(), mine = ++asked;
    if (!term) return;
    status.textContent = "Searching…";
    try {
      const doc = xml(await get(`/search?content=${encodeURIComponent(book.value)}&pattern=${encodeURIComponent(term)}&format=xml&pageLength=25`));
      if (mine !== asked || gone) return;
      const prefix = `/content/${book.value}/`;
      const hits = [...doc.querySelectorAll("item")].map((i) => {
        const link = decodeURIComponent(i.querySelector("link")?.textContent ?? "");
        return { title: i.querySelector("title")?.textContent ?? "", path: link.startsWith(prefix) ? link.slice(prefix.length) : "", snippet: plain(i.querySelector("description")?.textContent ?? "").trim() };
      }).filter((h) => h.path);
      const total = doc.getElementsByTagNameNS("http://a9.com/-/spec/opensearch/1.1/", "totalResults")[0]?.textContent ?? String(hits.length);
      show(hits, hits.length ? `${total} articles — the first ${hits.length}` : "Nothing found");
    } catch (e) { if (mine === asked && !gone) show([], String(e?.message ?? e)); }
  }

  let t = 0;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(suggest, 200); });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(t); void search(); } });
  book.addEventListener("change", () => { try { localStorage.setItem(BOOK_KEY, book.value); } catch { /* kept for this pane */ } if (q.value.trim()) void suggest(); });

  books().then((bs) => {
    if (gone) return;
    // the id past the name says which of two copies of a book this is (wikipedia_es_all_maxi_2026-05: "maxi 2026-05")
    const variant = (b) => (b.name && b.id.startsWith(b.name) ? b.id.slice(b.name.length).replace(/^[_-]+/, "").replace(/_/g, " ") : "");
    for (const b of bs) book.append(Object.assign(el("option", "", `${b.title}${b.lang ? ` (${b.lang})` : ""}${variant(b) ? ` · ${variant(b)}` : ""}`), { value: b.id, title: `${b.id} · ${b.count.toLocaleString()} articles` }));
    let kept = null;
    try { kept = localStorage.getItem(BOOK_KEY); } catch { /* none */ }
    if (kept && bs.some((b) => b.id === kept)) book.value = kept;
    status.textContent = bs.length ? `${bs.length} books on ${new URL(server).host}` : "The server lists no book";
    q.focus();
  }, (e) => { status.textContent = String(e?.message ?? e); });

  return () => { gone = true; clearTimeout(t); };
}

function style() {
  const s = document.createElement("style");
  s.textContent = `
    .kx { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--text); }
    .kx-bar { display: flex; gap: 8px; padding: 12px 14px 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .kx-q { flex: 1 1 220px; min-width: 0; padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); background: var(--bg); color: var(--text); font: inherit; }
    .kx-q:focus { outline: none; border-color: var(--accent); }
    .kx-book { flex: 0 1 260px; min-width: 0; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); background: var(--bg); color: var(--text); font: inherit; }
    .kx-status { padding: 6px 16px; font-size: .86em; color: var(--text-faint); }
    .kx-hits { list-style: none; margin: 0; padding: 0 8px 24px; overflow: auto; flex: 1; min-height: 0; }
    .kx-hit { padding: 8px 8px; border-radius: var(--radius-sm, 6px); }
    .kx-hit:hover { background: var(--bg-hover); }
    .kx-head { display: flex; align-items: baseline; gap: 10px; }
    .kx-title { flex: 1; min-width: 0; color: var(--accent); text-decoration: none; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kx-title:hover { text-decoration: underline; }
    .kx-save { flex: none; padding: 2px 10px; border: 1px solid var(--border); border-radius: 999px; color: var(--text-muted); font-size: .85em; background: transparent; }
    .kx-save:hover { color: var(--text); border-color: var(--accent); }
    .kx-snip { margin: 4px 0 0; color: var(--text-muted); font-size: .9em; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .kx-note { padding: 24px 16px; color: var(--text-muted); }
  `;
  return s;
}
