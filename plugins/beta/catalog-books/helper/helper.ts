// Open Library for the catalog: `lookup` finds a book by ISBN (an edition, then its work) or by its Open Library id, and
// answers the catalog's fields. Requests go through Atlas's core. Tests: books.test.ts (cut-down copies of Open
// Library's answers).
import type { Params } from "atlas-helper";

const OL = "https://openlibrary.org";

/** '1965', 'August 1990', 'Jun 01, 1990' → the year. */
export function yearOf(text: unknown): number | undefined {
  const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(String(text ?? ""));
  return m ? Number(m[1]) : undefined;
}

/** Open Library's descriptions are a string or `{type, value}`. */
function textOf(v: unknown): string | undefined {
  const s = v && typeof v === "object" ? (v as { value?: unknown }).value : v;
  return typeof s === "string" && s.trim() ? s.trim() : undefined;
}

function oneOrList(names: (string | undefined)[]): string | string[] | undefined {
  const all = names.filter((n): n is string => !!n);
  return all.length === 1 ? all[0] : all.length ? all : undefined;
}

const BOOKKEEPING = new Set(["accessible book", "protected daisy", "in library", "large type books", "fiction"]);

/** A few readable subjects as genres: not Open Library's bookkeeping ("Accessible book", "nyt:…", "Fiction, general"). */
function genres(subjects: unknown[] | undefined): string[] | undefined {
  const out: string[] = [];
  for (const s of subjects ?? []) {
    if (typeof s !== "string" || s.includes(":") || s.includes(",") || BOOKKEEPING.has(s.toLowerCase())) continue;
    const t = atlas.text.title(s.trim()); // "Arrakis (Imaginary place)" → "Arrakis (Imaginary Place)"
    if (!out.includes(t)) out.push(t);
  }
  return out.length ? out.slice(0, 5) : undefined;
}

interface Edition { title?: string; works?: { key?: string }[]; authors?: { key?: string }[]; covers?: number[]; number_of_pages?: number;
  publishers?: string[]; publish_date?: string; description?: unknown; isbn_13?: string[]; isbn_10?: string[]; contributors?: { name?: string; role?: string }[];
  by_statement?: string }
interface EditionMore { contributors?: { name?: string; role?: string }[]; by_statement?: string }

/** The edition's co-authors that the work's author list leaves out (Open Library links one author to a work and keeps
 *  the others as `contributors` with an author role, or only in the title page's `by_statement`, "[by] A [and] B"). A
 *  name is new when its last word is no listed author's. */
export function withCoauthors(authors: string[], edition: EditionMore): string[] {
  const out = [...authors];
  const surname = (n: string) => n.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  const add = (n: string | undefined) => {
    const name = (n ?? "").replace(/[[\]]/g, "").replace(/[.;,\s]+$/, "").trim();
    if (name.split(/\s+/).length >= 2 && !out.some((a) => surname(a) === surname(name))) out.push(name);
  };
  for (const c of edition.contributors ?? []) if (/author/i.test(c.role ?? "")) add(c.name);
  const by = /^\s*\[?by\]?\s+(.*)$/i.exec(edition.by_statement ?? "")?.[1];
  // only a statement of authors: "edited by", "translated by", "with a foreword by" name other roles
  if (by && !/\b(edit|translat|foreword|introduc|illustrat)/i.test(by))
    for (const n of by.split(/\s*(?:,|;|&|\[?\band\b\]?)\s*/i)) add(n);
  return out;
}

interface Work { title?: string; authors?: { author?: { key?: string } }[]; covers?: number[]; first_publish_date?: string; description?: unknown; subjects?: unknown[] }

const get = <T>(url: string) => atlas.fetchJson<T>(url);
const nameOf = async (key: string | undefined) => (key ? (await get<{ name?: string }>(`${OL}${key}.json`))?.name : undefined);

export async function lookup(params: Params) {
  const ids = (params.ids ?? {}) as Record<string, string>;
  const isbn = ids.isbn;
  let workId: string | undefined = ids.openlibrary;
  let edition: Edition | null = null;
  if (isbn) edition = await get<Edition>(`${OL}/isbn/${isbn}.json`);
  else if (ids.ol_edition) edition = await get<Edition>(`${OL}/books/${ids.ol_edition}.json`);
  if (edition && !workId) workId = (edition.works?.[0]?.key ?? "").split("/").pop() || undefined;
  if (!workId && !edition) {
    // a Goodreads link: the linked page names the ISBN, then this is asked again
    return ids.goodreads && !isbn ? { later: true } : { fields: {}, skipped: "Open Library does not know this book" };
  }
  const work: Work = (workId ? await get<Work>(`${OL}/works/${workId}.json`) : null) ?? {};
  let authors = await Promise.all((work.authors ?? []).slice(0, 4).map((a) => nameOf(a.author?.key)));
  if (!authors.some(Boolean) && edition) authors = await Promise.all((edition.authors ?? []).slice(0, 4).filter((a) => a.key).map((a) => nameOf(a.key)));
  const ed: Edition = edition ?? {};
  authors = withCoauthors(authors.filter((a): a is string => !!a), ed).slice(0, 4);
  const cover = (ed.covers ?? work.covers ?? []).find((c) => Number.isInteger(c) && c > 0);
  const fields: Record<string, unknown> = {
    title: work.title || ed.title,
    author: oneOrList(authors),
    year: yearOf(work.first_publish_date) ?? yearOf(ed.publish_date),
    pages: ed.number_of_pages,
    publisher: ed.publishers?.[0],
    genres: genres(work.subjects),
    description: textOf(work.description) ?? textOf(ed.description),
    cover: cover !== undefined ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : undefined,
  };
  const outIds: Record<string, string> = {};
  if (workId) outIds.openlibrary = workId;
  const isbns = [...(ed.isbn_13 ?? []), ...(ed.isbn_10 ?? [])];
  if (isbns.length && !isbn) outIds.isbn = isbns[0];
  const out: { ids: Record<string, string>; fields: Record<string, unknown>; kind?: string } = {
    ids: outIds, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "")),
  };
  return out; // book or reference book is the vault's choice (Catalog · Science installed or not), never a guess
}

atlas.methods({ lookup });
