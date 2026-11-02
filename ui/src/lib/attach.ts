// Files pasted or dropped into text: copied into a note's attachment folder (`POST /api/attach`), answered with
// their embeds. The one path for the editor and the capture popup.
import { api } from "./api";
import { errText } from "./text";
import { toast } from "./state.svelte";

/** Obsidian's name for clipboard images, which arrive as a bare "image.png". */
export function attachmentName(f: File): string {
  if (f.name && !/^image\.\w+$/.test(f.name)) return f.name;
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  return `Pasted image ${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

export type Attached = { path: string; embed: string };

/** Attaches each file beside `note` → those that made it (saved path + embed); a failure is said and skipped. */
export async function attachFiles(note: string, files: File[]): Promise<Attached[]> {
  const done: Attached[] = [];
  for (const f of files) {
    try { done.push(await api.attach(note, attachmentName(f), f)); }
    catch (err) { toast(`Could not attach ${f.name || "the pasted file"}`, errText(err), "error"); }
  }
  return done;
}

/** The files a paste or a drop carries (none for plain text). */
export function filesOf(data: DataTransfer | null): File[] {
  return data ? [...data.files] : [];
}

/** A paste that carries nothing at all: WebKitGTK's paste-as-plain-text (Ctrl+Shift+V, Vim mode's paste) of a
 *  picture hands over an empty text and no files. The picture is still on the desktop's clipboard. */
function pastedNothing(data: DataTransfer | null): boolean {
  if (!data || data.files.length) return false;
  return [...data.types].every((t) => t === "text/plain") && !data.getData("text/plain");
}

/** The picture on the desktop's clipboard, read by the core (`GET /api/clipboard/image`); null when there is none. */
async function clipboardPicture(): Promise<File | null> {
  try {
    const blob = await api.clipboardImage();
    if (!blob) return null;
    return new File([blob], `image.${(blob.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: blob.type || "image/png" });
  } catch { return null; }
}

/** The files of a paste or a drop, or null when it is text (the default goes on). Call it in the event handler itself:
 *  when it answers files it has already taken the event (preventDefault), even if they come later from the core. */
export function takeFiles(e: ClipboardEvent | DragEvent): Promise<File[]> | null {
  const data = "clipboardData" in e ? e.clipboardData : e.dataTransfer;
  const files = filesOf(data);
  if (files.length) { e.preventDefault(); return Promise.resolve(files); }
  if (!("clipboardData" in e) || !pastedNothing(data)) return null;
  e.preventDefault();
  return clipboardPicture().then((f) => (f ? [f] : []));
}
