// Paperless-ngx's API as this plugin uses it, without a page or a helper around it: its documents turned into what
// Atlas shows (the library's rows, a document's note), and the addresses it asks (pl.test.mjs runs these on cut-down
// copies of its answers). Written from Paperless-ngx 2.x's REST API: /api/documents/ (paged, `query` for its full-text
// search, `truncate_content`), /api/tags/, /api/correspondents/, /api/document_types/, a document's /thumb/ and
// /download/ (the archived PDF, or `?original=true` the file as it came in).

/** How many documents one page of the list asks for: Paperless allows up to 100 000, the core's answer up to 32 MB;
 *  100 with the content cut keeps each answer small and the first page quick. */
export const PAGE = 100;

/** The address of one page of documents: the newest first, the content cut to a few hundred characters (the library
 *  searches it), or those Paperless's own full-text search finds for `query`. */
export function listPath(page = 1, query = "") {
  const q = String(query ?? "").trim();
  return `/api/documents/?page=${page}&page_size=${PAGE}&ordering=-created&truncate_content=true${q ? `&query=${encodeURIComponent(q)}` : ""}`;
}

/** Paperless names things by number (a tag 3, a correspondent 7): one of its lists (`results` of /api/tags/…) → a map
 *  from the number to the name. */
export function namesOf(answer) {
  return new Map((answer?.results ?? []).map((x) => [Number(x.id), String(x.name ?? x.id)]));
}

/** A document's date, `2026-03-02`: `created` (a date since 2.16, a time before), else the older `created_date`. */
export const dateOf = (d) => String(d?.created ?? d?.created_date ?? "").slice(0, 10);

/** A document of /api/documents/ → the library's row, its numbers named by `names` ({ tags, correspondents, types }). */
export function rowOf(d, names = {}) {
  const name = (map, id) => (id == null ? "" : map?.get(Number(id)) ?? "");
  const tags = (d.tags ?? []).map((t) => name(names.tags, t)).filter(Boolean);
  return {
    id: Number(d.id), title: String(d.title || d.original_file_name || `document ${d.id}`), date: dateOf(d),
    correspondent: name(names.correspondents, d.correspondent), type: name(names.types, d.document_type), tags,
    asn: d.archive_serial_number ?? null, pages: Number(d.page_count) || 0, file: String(d.original_file_name ?? ""),
    // the PDF Paperless made (searchable, OCR'd) is what it downloads by default; a document it could not archive has none
    archived: d.archived_file_name !== null, content: String(d.content ?? ""), added: d.added ? Date.parse(d.added) : 0,
  };
}

/** The line under a document's title: who sent it, what it is, when. */
export const subOf = (r) => [r.correspondent, r.type, r.date].filter(Boolean).join(" · ");

/** Where the document opens in Paperless's own pages. */
export const detailsUrl = (base, id) => `${base}/documents/${id}/details`;

/** The file kept for a document (`.atlas/remote/paperless/documents/<id>/<name>`): the archived PDF under its title
 *  (a scan's name is a number), else the original under its own name; nothing that would leave the folder. */
export function fileName(r) {
  const safe = (s) => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^\.+/, "").trim().slice(0, 120);
  if (r.archived) return `${safe(r.title) || `document ${r.id}`}.pdf`;
  return safe(r.file) || `document ${r.id}`;
}

/** The download's address: the archived PDF, or the original when Paperless made none. */
export const downloadPath = (r) => `/api/documents/${r.id}/download/${r.archived ? "" : "?original=true"}`;

/** What the catalog's `note` tool asks to find (or make) a document's note — the one rule for every thing a server
 *  keeps (docs/design/DESIGN-server-libraries.md §3): found by its Paperless id wherever the note is, made only when
 *  asked (`why`); what Paperless says of it fills the note's gaps, and the user's own text is never touched. */
export function thingOf(r, base, why = "asked") {
  const fields = {
    title: r.title, ...(r.date ? { date: r.date } : {}), ...(r.correspondent ? { correspondent: r.correspondent } : {}),
    ...(r.type ? { document_type: r.type } : {}), ...(r.tags.length ? { tags: r.tags } : {}),
    ...(base ? { paperless: detailsUrl(base, r.id) } : {}),
  };
  return { kind: "paperwork", ids: { paperless: String(r.id) }, fields, why };
}

/** A document as an agent reads it (the `get` and `search` tools): its fields and, for `get`, its whole text. */
export function forAgent(r, base, withText = false) {
  return {
    id: r.id, title: r.title, date: r.date || null, correspondent: r.correspondent || null, type: r.type || null, tags: r.tags,
    ...(r.asn != null ? { asn: r.asn } : {}), pages: r.pages || null, url: base ? detailsUrl(base, r.id) : null,
    ...(withText ? { text: r.content } : {}),
  };
}

/** The kinds of file Paperless-ngx consumes (its own list: PDFs, pictures, plain text; office files and mail need its
 *  Tika/Gotenberg, which a server may lack — offered, and its refusal shown). */
export const SENDABLE = ["pdf", "png", "jpg", "jpeg", "tif", "tiff", "webp", "gif", "txt", "docx", "odt", "doc", "rtf", "xlsx", "ods", "pptx", "odp", "eml"];
export const sendable = (path) => !!path && !path.endsWith("/") && SENDABLE.includes(String(path).split(".").pop().toLowerCase());

/** Paperless's upload (`POST /api/documents/post_document/`): the file as the form's `document` part, titled by its
 *  name without the extension (Paperless would use the file name too, extension and all). The answer is the
 *  consumption task's id: the document appears once Paperless has read it. */
export function uploadRequest(path) {
  const stem = String(path).split("/").pop().replace(/\.[^.]+$/, "");
  return { path: "/api/documents/post_document/", init: { method: "POST", multipart: { file: path, field: "document", fields: { title: stem } } } };
}

/** The plugin API version that sends `multipart` (older apps drop it and would send an empty POST). */
export const MULTIPART_API = 37;
