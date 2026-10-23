// `![[x.base]]` / `![[x.base#View]]` embeds: markdown renders a placeholder, this mounts the
// live table into it (editor widgets and reading views alike), with the note as `this`.
import { mount, unmount } from "svelte";
import BaseTable from "../components/BaseTable.svelte";
import { resolveWikilink } from "./links";

/** → unmounts the tables it mounted (a mounted one pins its note's whole view after the note is closed). */
export function hydrateBases(root: HTMLElement, notePath: string): () => void {
  const tables: ReturnType<typeof mount>[] = [];
  let gone = false;
  for (const el of root.querySelectorAll<HTMLElement>(".base-embed:not([data-mounted])")) {
    el.dataset.mounted = "1";
    const [target, view] = (el.dataset.target ?? "").split("#");
    void resolveWikilink(target, notePath).then((path) => {
      if (gone) return;
      el.replaceChildren();
      tables.push(mount(BaseTable, { target: el, props: { path, thisPath: notePath, view: view || undefined, embedded: true } }));
    });
  }
  return () => { gone = true; for (const t of tables.splice(0)) void unmount(t); };
}
