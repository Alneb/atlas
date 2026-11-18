// Kiwix in Atlas's search: the vault's search asks `search` (`on = "search"`), which answers the articles whose titles
// match the words (kiwix-serve's `/suggest`, fast, in the first book the `books` setting names, then the next), each
// opened as a web page — a tab, as `[web] open_links` says — where Save captures it. Tests: helper.test.ts.
import type { Params } from "atlas-helper";

type Book = { id: string; title: string; name: string };

/** The server's books, kept a while: listed once, not on every keystroke of a search. */
let kept: { server: string; at: number; books: Book[] } | null = null;
const KEEP_MS = 10 * 60_000;

const serverOf = (p: Params) => String(p.settings?.server ?? "").trim().replace(/\/+$/, "");
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "";
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
const decoded = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
/** The server's own path root (kiwix-serve --urlRootLocation /kiwix: its links are /kiwix/content/…). */
const contentRoot = (server: string) => `${server.replace(/^https?:\/\/[^/]+/, "")}/content/`;

/** The books an OPDS catalog lists: each entry's content link names it. */
export function booksOf(xml: string, server: string): Book[] {
  const root = contentRoot(server);
  return xml.split("<entry").slice(1).map((e) => {
    const href = [...e.matchAll(/<link[^>]*href="([^"]*)"/g)].map((m) => unescape(m[1])).find((h) => h.startsWith(root)) ?? "";
    return { id: decoded(href.slice(root.length)).replace(/\/+$/, ""), title: unescape(tag(e, "title")), name: unescape(tag(e, "name")) };
  }).filter((b) => b.id);
}

/** The books to search: those whose name or title holds a word of `setting` (comma-separated), else every one. */
export function chosen(books: Book[], setting: string): Book[] {
  const words = setting.toLowerCase().split(",").map((w) => w.trim()).filter(Boolean);
  const named = words.length ? books.filter((b) => words.some((w) => `${b.name} ${b.title}`.toLowerCase().includes(w))) : books;
  return named.length ? named : books;
}

async function books(server: string): Promise<Book[]> {
  if (kept && kept.server === server && Date.now() - kept.at < KEEP_MS) return kept.books;
  const xml = await atlas.fetch(`${server}/catalog/v2/entries?count=-1`, { timeout: 5 });
  kept = { server, at: Date.now(), books: booksOf(xml ?? "", server) };
  return kept.books;
}

const articleUrl = (server: string, book: string, path: string) =>
  `${server}/content/${encodeURIComponent(book)}/${path.split("/").map(encodeURIComponent).join("/")}`;

atlas.methods({
  /** {q, limit} → `{hits}`: the articles whose titles match, each {title, detail, url} (PLUGIN-API.md, on = "search"). */
  search: async (params: Params) => {
    const server = serverOf(params), q = String(params.q ?? "").trim(), limit = Math.max(1, Math.min(20, Number(params.limit ?? 8)));
    if (!server || q.length < 2) return { hits: [] };
    const hits: { title: string; detail: string; url: string }[] = [];
    for (const b of chosen(await books(server), String(params.settings?.books ?? "")).slice(0, 2)) {
      const got = await atlas.fetch(`${server}/suggest?content=${encodeURIComponent(b.id)}&term=${encodeURIComponent(q)}&count=${limit}`, { timeout: 3 });
      let list: { kind?: string; value?: string; path?: string }[] = [];
      try { list = JSON.parse(got ?? "[]"); } catch { continue; }
      for (const s of list) if (s.kind === "path" && s.path && s.value) hits.push({ title: s.value, detail: b.title || b.name, url: articleUrl(server, b.id, s.path) });
      if (hits.length >= limit) break;
    }
    return { hits: hits.slice(0, limit) };
  },
});
