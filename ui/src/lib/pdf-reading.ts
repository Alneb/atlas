// Where you are in a PDF, said in its note — the same properties the phone's reader writes (plugins/beta/books/android
// Shelf.java): `reading_page: 12`, `progress: 42.5%`, `last_read: <ISO>`. So a PDF read on the desktop is continued on
// the phone and the other way round, the Libraries' Continue row lists it, and Audiobookshelf's read-along sees it.
// Only a note that already exists is written: opening a PDF never makes one (the one-note rule,
// DESIGN-server-libraries.md §5: a thing gets its note when it becomes yours, which a reader alone does not decide).
import { api } from "./api";
import { frontmatterOf } from "./property-model";

/** The PDF's one note as the core says (a paper's note, a claiming note, else the one beside it), if it exists. */
export async function readingNote(pdf: string): Promise<string | null> {
  try {
    const note = (await api.companion({ path: pdf, title: null, properties: {}, block: null, find: true })).path;
    await api.file(note); // throws when there is none yet
    return note;
  } catch { return null; }
}

/** The page the note says, with when it was said (ms since the epoch); null when it says none. */
export async function notedPlace(note: string): Promise<{ page: number; at: number } | null> {
  try {
    const p = frontmatterOf((await api.file(note)).text)?.data ?? {};
    const page = Number(p.reading_page), at = Date.parse(String(p.last_read ?? ""));
    return Number.isInteger(page) && page > 0 ? { page, at: Number.isFinite(at) ? at : 0 } : null;
  } catch { return null; }
}

/** `0.4251` → `42.5%`, the phone's legible form. */
export const percent = (f: number): string => `${Math.round(Math.min(1, Math.max(0, f)) * 1000) / 10}%`;

/** The place written into the note: page, how far, when (no milliseconds, as the phone writes it). */
export async function writePlace(note: string, page: number, pages: number, now = new Date()): Promise<void> {
  const set = (key: string, text: string) => api.setProperty({ path: note, key, text, list: false });
  await set("reading_page", String(page));
  if (pages > 0) await set("progress", percent(page / pages));
  await set("last_read", now.toISOString().replace(/\.\d+Z$/, "Z"));
}
