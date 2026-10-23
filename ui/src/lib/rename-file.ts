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
  pick({
    placeholder: `New name for ${name}`, tag: "Rename", icon: "edit", items: [], seed: ext ? name.slice(0, -ext.length) : name,
    typed: (t) => `Rename to ${t.trim()}${ext && !t.trim().toLowerCase().endsWith(ext) ? ext : ""}`,
    onpick: async (typed) => {
      let to = typed.trim().replace(/[\\/]/g, "-");
      if (!to) return;
      if (ext && !to.toLowerCase().endsWith(ext)) to += ext; // a note keeps its .md (outside the explorer it has none)
      if (to === name) return;
      try {
        const follow = movedTabs(path, dir + to);
        await api.move(path, dir + to);
        for (const p of follow) openPath(p);
      } catch (e) { toast("Could not rename", errText(e), "error"); }
    },
  });
}
