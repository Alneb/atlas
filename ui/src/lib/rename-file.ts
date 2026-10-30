// Renaming a file from where it is open: the palette, the tab's
// menu. The name is typed in the palette's box, starting from the current one; open tabs follow the file.
import { api } from "./api";
import { openPath } from "./dock";
import { movedTabs } from "./gone-files";
import { pick } from "./palette.svelte";
import { toast } from "./state.svelte";
import { errText } from "./text";

export function renameFile(path: string): void {
  const slash = path.lastIndexOf("/"), dir = slash < 0 ? "" : path.slice(0, slash + 1), name = path.slice(slash + 1);
  const ext = /\.md$/i.test(name) ? ".md" : "";
  /** The file's new name: no folder separators; a note keeps its .md (outside the explorer it has none). */
  const target = (typed: string) => {
    const to = typed.trim().replace(/[\\/]/g, "-");
    return !to || !ext || to.toLowerCase().endsWith(ext) ? to : to + ext;
  };
  pick({
    placeholder: `New name for ${name}`, tag: "Rename", icon: "edit", items: [], seed: ext ? name.slice(0, -ext.length) : name,
    // the name as it stands offers nothing to do
    typed: (t) => { const to = target(t); return to && to !== name ? `Rename to ${to}` : null; }, typedAs: { section: "", icon: "edit" },
    onpick: async (typed) => {
      const to = target(typed);
      if (!to || to === name) return;
      try {
        const follow = movedTabs(path, dir + to);
        await api.move(path, dir + to);
        for (const p of follow) openPath(p);
      } catch (e) { toast("Could not rename", errText(e), "error"); }
    },
  });
}
