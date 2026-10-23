// Workspace-relative path arithmetic shared by the renderer and the link resolver.
/** Join a note-relative path onto the note's directory, normalising `.` and `..`. */
export function resolveRel(path: string, dir?: string): string {
  if (path.startsWith("/")) return path.slice(1);
  const parts = (dir ? `${dir}/${path}` : path).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

/** The folder a vault path is in ("" at the root). */
export const dirOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/** A path's last part, a trailing slash ignored ("notes/" → "notes"). */
export const basename = (p: string): string => p.replace(/\/+$/, "").split("/").pop() || p;

/** A picture: it opens in the image pane and keeps its extension in its name. */
export const IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i;

/** A text note: its extension is never shown outside the file explorers. */
const NOTE_EXT = /\.(md|markdown|txt|page)$/i;

/** A file as the interface names it: a text note without its extension (`hubbard`), every other file — a PDF, a
 *  picture, a drawing, a table — with it (`paper.pdf`), so a note and a PDF of the same name stay apart; the file explorers (tree,
 *  explorer pane, phone list) show real names. The one place an extension is dropped: paths typed, copied or linked
 *  keep the real name. */
export function shownName(p: string): string {
  const b = basename(p);
  return NOTE_EXT.test(b) && !/\.excalidraw\.md$/i.test(b) ? b.replace(NOTE_EXT, "") : b;
}

/** A file's path as the interface shows it: its folders, then its shown name. */
export function shownPath(p: string): string {
  const q = p.replace(/\/+$/, "");
  return q.slice(0, q.length - (basename(q).length - shownName(q).length));
}

/** A new name typed for a file shown without its extension: the old name's extension comes back unless typed again. */
export function keepExt(old: string, typed: string): string {
  const ext = basename(old).slice(shownName(old).length);
  return !ext || typed.toLowerCase().endsWith(ext.toLowerCase()) ? typed : typed + ext;
}
