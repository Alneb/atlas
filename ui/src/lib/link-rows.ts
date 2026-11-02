// One row of a `[[` list, the same in every box that offers one (the note editor's list, md-complete.ts, and the
// capture boxes', textarea-complete.ts): what it shows and what goes between `[[` and `]]`. The rows and their order
// come from the core (link_targets.rs); this only words them.
import type { LinkTarget } from "./types";

export interface LinkRow {
  /** the name shown: the alias or title matched, else the link */
  label: string;
  /** a faint second part: the alias's note, the folder, "linked" when it is the note's neighbour */
  detail: string;
  /** between `[[` and `]]` */
  link: string;
}

export function linkRow(t: LinkTarget): LinkRow {
  const folder = t.path.includes("/") ? t.path.slice(0, t.path.lastIndexOf("/")) : "";
  return {
    label: t.alias ?? t.link,
    detail: [t.alias ? `→ ${t.link}` : "", folder, t.near ? "linked" : ""].filter(Boolean).join(" · "),
    link: t.alias ? `${t.link}|${t.alias}` : t.link,
  };
}
