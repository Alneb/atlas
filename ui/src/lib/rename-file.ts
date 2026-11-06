// Renaming a file from where it is open: the palette, the tab's menu, and a note's inline title (typed in place).
// One rule for the new name (`renameTo`); open tabs follow the file.
import { api } from "./api";
import { openPath } from "./dock";
import { movedTabs } from "./gone-files";
import { pick } from "./palette.svelte";
import { toast } from "./state.svelte";
import { errText } from "./text";

/** The parts of a path a rename needs: its folder, its name, and a note's `.md` (outside the explorer it has none). */
function parts(path: string) {
  const slash = path.lastIndexOf("/"), dir = slash < 0 ? "" : path.slice(0, slash + 1), name = path.slice(slash + 1);
  const ext = /\.md$/i.test(name) ? ".md" : "";
  /** The file's new name from what was typed: no folder separators; a note keeps its .md. */
  const target = (typed: string) => {
    const to = typed.trim().replace(/[\\/]/g, "-");
    return !to || !ext || to.toLowerCase().endsWith(ext) ? to : to + ext;
  };
  return { dir, name, ext, target };
}

/** Renames `path` to the typed name (beside it); the open tabs follow. False when nothing changed or it failed (said). */
export async function renameTo(path: string, typed: string): Promise<boolean> {
  const { dir, name, target } = parts(path);
  const to = target(typed);
  if (!to || to === name) return false;
  try {
    const follow = movedTabs(path, dir + to);
    await api.move(path, dir + to);
    for (const p of follow) openPath(p);
    return true;
  } catch (e) { toast("Could not rename", errText(e), "error"); return false; }
}

export function renameFile(path: string): void {
  const { name, ext, target } = parts(path);
  pick({
    placeholder: `New name for ${name}`, tag: "Rename", icon: "edit", items: [], seed: ext ? name.slice(0, -ext.length) : name,
    // the name as it stands offers nothing to do
    typed: (t) => { const to = target(t); return to && to !== name ? `Rename to ${to}` : null; }, typedAs: { section: "", icon: "edit" },
    onpick: (typed) => void renameTo(path, typed),
  });
}
