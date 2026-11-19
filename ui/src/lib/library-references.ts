// References (Zotero-like) as a library source (plugin-api.ts `LibrarySource`, registered in core-libraries.ts): refs/<key>/<key>.md, whose properties are the
// entry's fields, read through the catalog-papers helper's endpoints. Keys: Enter opens the PDF, r reads, n notes,
// c copies the citekey.
import { api } from "./api";
import { openExplorer } from "./file-sources.svelte";
import { on, touches } from "./bus";
import { openPath } from "./dock";
import { errText } from "./text";
import { openReadingNote, readPaper } from "./papers";
import { toast } from "./state.svelte";
import { noteProps } from "./plugin-host-api.svelte";
import type { Paper } from "./types";
import type { LibraryItem, LibrarySource } from "./plugin-api";

// Zotero's item types grouped as a reader thinks of them (2026-10-18: books, theses and lecture notes are references too)
const typeOf = (p: Paper) =>
  p.kind === "book" || p.kind === "bookSection" ? "book" : p.kind === "thesis" ? "thesis" : p.kind === "manuscript" || p.kind === "report" ? "notes" : "paper";
/** Zotero's item type in words: `journalArticle` → `journal article`. */
const typeWords = (kind: string) => kind.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const lastNames = (p: Paper) => {
  const n = p.authors.map((a) => a.split(",")[0].trim());
  return n.length > 3 ? `${n[0]} et al.` : n.join(", ");
};
const split = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast(`Copied ${what}`, text.length > 80 ? undefined : text); }
  catch (e) { toast("Copy failed", String(e), "error"); }
}

/** The References library. One per page: it keeps the papers it read, by citekey, for their actions. */
export function referencesSource(): LibrarySource {
  const papers = new Map<string, Paper>();
  const paper = (i: LibraryItem) => papers.get(i.id)!;
  const openPdf = (p: Paper) => (p.pdf ? openPath(p.pdf) : toast("No PDF yet", `Drop one into ${p.dir}/`));
  let dir = "refs/papers";

  const item = (p: Paper): LibraryItem => ({
    id: p.key,
    note: `${p.dir}/${p.key}.md`,
    // its first page (the panel's picture; the list draws none): the core's thumbnail of the PDF
    cover: p.pdf ?? undefined,
    title: p.title,
    sub: [lastNames(p), p.year, p.venue].filter(Boolean).join(" · "),
    // only the exception is flagged: nearly every entry has its PDF and its note, so a badge on each said nothing;
    // one without a PDF is the one to act on (drop one on it)
    flags: p.pdf ? [] : [{ label: "no PDF", tone: "red" as const }],
    tab: typeOf(p),
    groups: p.collections,
    tags: p.tags,
    text: `${p.key} ${p.title} ${p.authors.join(" ")} ${p.year ?? ""} ${p.venue ?? ""} ${p.collections.join(" ")} ${p.tags.join(" ")}`,
    sort: { added: p.added ?? "", year: Number(p.year ?? 0), author: (p.authors[0] ?? "").split(",")[0].toLowerCase(), title: p.title },
  });

  return {
    id: "references", title: "References", icon: "library", noun: "references",
    async load() {
      const all = await api.refs();
      papers.clear();
      for (const p of all) papers.set(p.key, p);
      // the library's folder is catalog-papers' setting: read off the entries themselves (their folders' parent)
      dir = all[0]?.dir.replace(/\/[^/]*$/, "") || dir;
      return all.map(item);
    },
    tabs: [{ id: "paper", title: "Papers" }, { id: "book", title: "Books" }, { id: "thesis", title: "Theses" }, { id: "notes", title: "Notes" }],
    groupsTitle: "Collections",
    layouts: ["list"],
    sorts: [
      { id: "added", label: "date added", desc: true }, { id: "year", label: "year", desc: true },
      { id: "author", label: "first author" }, { id: "title", label: "title" },
    ],
    search: "Search title, author, year, key, tag…",
    empty: "No papers yet — add one by DOI or arXiv id.",
    async detail(i) {
      const p = paper(i);
      const props = await noteProps(`${p.dir}/${p.key}.md`).catch(() => ({} as Record<string, unknown>));
      return {
        kind: `${typeWords(p.kind)}${p.year ? ` · ${p.year}` : ""}`,
        title: p.title,
        lines: [{ text: p.authors.join("; ") }, ...(p.venue ? [{ text: p.venue, muted: true }] : [])],
        // what the reader wants to know about the work; the file's name and "has notes" are the buttons' business
        // (Open PDF is disabled without one, Notes says New notes), the addresses are links below
        fields: [
          ...noteFields(props),
          ...(p.pdf ? [] : [["PDF", "none yet — drop one here"] as [string, string]]),
          ...(p.added ? [["Added", p.added.slice(0, 10)] as [string, string]] : []),
          ["Citekey", p.key],
        ],
        actions: [
          // one button to read (it was beside an "Open PDF" that did the same): the PDF, or its notes when it has none
          { label: p.pdf ? "Read" : "Read the notes", icon: "pdf", primary: true, title: "Open the PDF (its note: “Note” in the PDF's bar) (R, Enter)", run: () => readPaper(p) },
          { label: p.has_notes ? "Notes" : "New notes", icon: "edit", run: () => openReadingNote(p.key) },
          { label: "Copy link", icon: "link", title: `[[${p.key}]]: citing is linking`, run: () => copy(`[[${p.key}]]`, "link") },
          { label: "Folder", icon: "folder-open", title: `${p.dir}: its PDF, its notes and its files, in the explorer`, run: () => openExplorer("vault", "", p.dir) },
          { label: "Copy citekey", icon: "copy", more: true, run: () => copy(p.key, "citekey") },
          { label: "Copy \\cite", icon: "copy", more: true, run: () => copy(`\\cite{${p.key}}`, "\\cite") },
          { label: "Copy BibTeX", icon: "copy", more: true, run: async () => copy(await api.refsBibtex(p.key), "BibTeX") },
          {
            label: "Edit", title: "Edit title, authors, year, venue, collections, tags",
            edit: {
              fields: [
                { key: "title", label: "Title", value: p.title, rows: 2 },
                { key: "authors", label: "Authors", hint: "“Last, First”; separated by ;", value: p.authors.join("; "), rows: 2 },
                { key: "date", label: "Year / date", value: p.year ?? "", half: true },
                { key: "venue", label: "Venue", value: p.venue ?? "", half: true },
                { key: "collections", label: "Collections", hint: "comma-separated", value: p.collections.join(", ") },
                { key: "tags", label: "Tags", hint: "comma-separated", value: p.tags.join(", ") },
              ],
              async save(v) {
                await api.refsEdit({ key: p.key, title: v.title, authors: split(v.authors, /;|\n/), date: v.date, venue: v.venue, collections: split(v.collections, /,/), tags: split(v.tags, /,/) });
                toast("Saved", `${p.key} — refs.bib updated`, "success");
              },
            },
          },
          {
            label: "Delete…", danger: true, more: true, title: "Remove this entry (its folder goes to the Trash)",
            confirm: { title: `Remove “${p.title}” (${p.key}) from the library?`, hint: "Its folder (metadata, PDF, notes) goes to the Trash; refs.bib is rewritten.", button: "Move to Trash" },
            run: async () => {
              const r = await api.refsDelete(p.key);
              toast(`Removed ${p.key}`, `Moved to ${r.to}; refs.bib updated`, "success");
            },
          },
        ],
        links: noteLinks(props, [
          ...(p.doi ? [{ label: `doi:${p.doi}`, url: `https://doi.org/${p.doi}` }] : []),
          ...(p.arxiv ? [{ label: `arXiv:${p.arxiv}`, url: `https://arxiv.org/abs/${p.arxiv}` }] : []),
        ]),
        body: p.abstract_text ? { title: "Abstract", text: p.abstract_text } : undefined,
        notes: await ownWords(`${p.dir}/${p.key}.md`).then((text) => (text ? { text, open: () => void openReadingNote(p.key) } : undefined)),
      };
    },
    add: {
      placeholder: "DOI, arXiv id or link — or drop a PDF", busy: "Adding…",
      async run(text) {
        const r = await api.refsAdd(text);
        toast(r.created ? `Added ${r.paper.key}` : `Already in the library: ${r.paper.key}`, r.paper.title + (r.created && r.pdf ? " · PDF downloaded" : ""), r.created ? "success" : "info");
        return r.paper.key;
      },
    },
    drop: {
      // metadata from a DOI / arXiv id inside, else the file name
      hint: "Drop PDFs to add them to the library", accept: /\.pdf$/i,
      async run(files) {
        let last: string | undefined;
        for (const f of files) {
          try {
            const r = await api.refsPdf(f.name, f);
            last = r.paper.key;
            toast(r.created ? `Added ${r.paper.key}` : `Already in the library: ${r.paper.key}`,
              r.paper.doi || r.paper.arxiv ? r.paper.title : `${r.paper.title} — no DOI/arXiv id found: complete its fields in its note`, r.created ? "success" : "info", 7000);
          } catch (err) { toast(`Could not add ${f.name}`, errText(err), "error", 9000); }
        }
        return last;
      },
    },
    // Zotero → plain files through a command of the vault (Zotero is only read): any `refs.<verb>-zotero`, a sync first
    async tools() {
      const mine = (await api.commands()).filter((c) => /^refs\.[\w-]*zotero$/.test(c.id));
      const z = mine.find((c) => c.id.includes("sync")) ?? mine[0];
      if (!z) return [];
      return [{
        label: "Sync from Zotero", title: `${z.title} — Zotero is only read; running it again brings only what changed`,
        run: async () => {
          const before = papers.size;
          const r = await api.cmd(z.id);
          if (!r.ok) throw new Error(`${r.error ?? "it failed"} — the command is .atlas/commands/${z.id}.toml`);
          const now = (await api.refs()).length;
          toast("Zotero: done", `${now - before} new · ${now} papers in the library`, "success");
        },
      }];
    },
    watch: (reload) => on("fs", (e) => { if (touches(e.paths, (p) => p.startsWith(dir))) reload(); }),
    keys: { r: (i) => readPaper(paper(i)), n: (i) => void openReadingNote(i.id), c: (i) => void copy(i.id, "citekey") },
    open: (i) => openPdf(paper(i)),
  };
}

/** What the paper's note says beyond the title, authors, year and venue shown above: its status, the journal's
 *  volume, issue and pages, when it was published, the publisher, ISBN / ISSN, its language, topics and project. */
const NOTE_FIELDS: [string, string][] = [
  ["status", "Status"], ["published", "Published"], ["volume", "Volume"], ["issue", "Issue"], ["pages", "Pages"],
  ["numPages", "Pages in all"], ["edition", "Edition"], ["publisher", "Publisher"], ["place", "Place"], ["series", "Series"],
  ["ISBN", "ISBN"], ["ISSN", "ISSN"], ["language", "Language"], ["topics", "Topics"], ["project", "Project"],
];
/** The note's web addresses (`sources`, `url`) as links after the item's own (DOI, arXiv), each address once, named by
 *  its site: an address is something to open, not a field to read character by character. */
function noteLinks(props: Record<string, unknown>, own: { label: string; url: string }[]): { label: string; url: string }[] {
  const urls = [props.sources, props.url].flat().map((v) => (v == null ? "" : String(v).trim())).filter((u) => /^https?:\/\//i.test(u));
  const seen = new Set(own.map((l) => l.url.toLowerCase()));
  const site = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  return [...own, ...urls.filter((u) => !seen.has(u.toLowerCase()) && seen.add(u.toLowerCase())).map((u) => ({ label: site(u), url: u }))];
}
/** The person's own words in a paper's note: its text with the properties, the blocks the generator puts there
 *  (the paper, its marks), embeds, its title line, HTML tags (Zotero's notes) and empty headings left out — the first ~500 characters, or "" when none. */
async function ownWords(path: string): Promise<string> {
  const text = await api.file(path).then((f) => f.text, () => "");
  const own = text
    .replace(/^---[\s\S]*?\n---\n?/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/^\s*# .*\n/, "") // the note's own title, the panel's heading already
    // a note from Zotero is HTML: its words, a paragraph or a line break as a new line
    .replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .split("\n")
    .filter((l) => !/^#{1,6}\s*\S*\s*$/.test(l.trim()) || l.trim().split(/\s+/).length > 2) // a lone template heading
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return own.length > 500 ? `${own.slice(0, 500).replace(/\s+\S*$/, "")}…` : own;
}

function noteFields(props: Record<string, unknown>): [string, string][] {
  const text = (v: unknown): string => Array.isArray(v) ? v.map(text).filter(Boolean).join(", ") : v == null ? "" : String(v).replace(/^\[\[|\]\]$/g, "").replace(/\|.*$/, "").trim();
  // Zotero's `published` says the date twice ("1994-04-15 1994-4-15"): the first is enough
  return NOTE_FIELDS.map(([k, label]) => [label, k === "published" ? text(props[k]).split(" ")[0] : text(props[k])] as [string, string]).filter(([, v]) => v);
}
