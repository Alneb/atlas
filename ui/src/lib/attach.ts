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
