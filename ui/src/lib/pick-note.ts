// "Which note?" asked in the palette: the one note chooser plugins get (`atlas.pickNote`) and the app can reuse.
// Recent notes first, then every note the link index lists — mail saved as notes included (a link may go to a mail).
import { api } from "./api";
import { pick, type PickItem } from "./palette.svelte";
import { basename, dirOf } from "./paths";

const isNote = (p: string) => /\.md$/i.test(p);

function item(path: string, section: string): PickItem {
  return { value: path, title: basename(path).replace(/\.md$/i, ""), detail: dirOf(path), icon: path.startsWith("mail/") ? "mail" : "file-text", section };
}

/** The notes to offer, recent first, each once. */
async function notes(): Promise<PickItem[]> {
  const [recent, all] = await Promise.all([api.recent(30).catch(() => []), api.files({ index: true }).catch(() => [])]);
  const seen = new Set<string>();
  const first = recent.filter(isNote).filter((p) => !seen.has(p) && seen.add(p)).map((p) => item(p, "Recent"));
  return [...first, ...all.filter(isNote).filter((p) => !seen.has(p)).map((p) => item(p, "Notes"))];
}

/** A note chosen by the user, or null when the chooser closed with nothing chosen. */
export function pickNote(o: { placeholder?: string; tag?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    pick({ placeholder: o.placeholder ?? "Which note?", tag: o.tag ?? "Note", icon: "file-text", items: notes, onpick: (v) => resolve(v), oncancel: () => resolve(null) });
  });
}
