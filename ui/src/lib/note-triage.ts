// Note triage: the notes that need a decision — unsorted, untagged, orphaned, stale — as a Base, so they are listed,
// sorted, edited (a tag typed in the table is written to the note) and opened like any other table. The Base is a file
// of the vault, `.atlas/note-triage.base`, written once from the vault's folders the first time the command runs and
// never again: from then on it is the owner's, its views edited like any Base's.
import { api } from "./api";
import { open } from "./dock";
import { settings } from "./settings.svelte";
import { toast } from "./state.svelte";
import { errText } from "./text";

export const NOTE_TRIAGE = ".atlas/note-triage.base";

/** Folders whose notes are not the owner's to file: the day's logs, what features write (mail, references), agents'. */
function generated(logDir: string): string[] {
  return [logDir, "mail", "refs", "docs/memory", "templates"].filter(Boolean);
}

const q = (s: string) => JSON.stringify(s);

/** The Base's text: four views over the vault's own notes, each a question to answer for every row. */
export function noteTriageBase(logDir: string): string {
  const scope = [
    'file.ext == "md"',
    "'!file.path.startsWith(\".\")'",
    ...generated(logDir).map((f) => `'!file.inFolder(${q(f)})'`),
  ];
  const view = (name: string, why: string, filters: string[], sort: string, dir: "ASC" | "DESC") => [
    `  # ${why}`,
    "  - type: table",
    `    name: ${name}`,
    ...(filters.length ? ["    filters:", "      and:", ...filters.map((f) => `        - ${f}`)] : []),
    "    order:",
    "      - file.name",
    "      - file.folder",
    "      - file.tags",
    "      - formula.links",
    "      - file.mtime",
    "    sort:",
    `      - property: ${sort}`,
    `        direction: ${dir}`,
  ];
  return [
    "# Note triage: the notes that wait for a decision. Written once by Atlas (the command \"Notes: triage\"); yours to",
    "# edit from now on — change a view, add one. Mail, references, the day's logs and agents' files are left out.",
    "filters:",
    "  and:",
    ...scope.map((f) => `    - ${f}`),
    "formulas:",
    "  links: file.backlinks.length + file.links.length",
    "properties:",
    "  file.mtime:",
    "    displayName: Modified",
    "  formula.links:",
    "    displayName: Links in and out",
    "views:",
    ...view("Unsorted", "at the vault's top, in no folder: move each where it belongs", ['file.folder == ""'], "file.mtime", "DESC"),
    ...view("Untagged", "no tag yet: type one in the tags cell", ["file.tags.isEmpty()"], "file.mtime", "DESC"),
    ...view("Orphans", "nothing links here and it links nowhere: link it, merge it, or let it go", ["file.links.isEmpty()", "file.backlinks.isEmpty()"], "file.mtime", "ASC"),
    ...view("Stale", "untouched for six months and linked from nowhere", ['file.mtime < now() - "6 months"', "file.backlinks.isEmpty()"], "file.mtime", "ASC"),
    "",
  ].join("\n");
}

/** Opens the vault's note triage, writing its Base first when the vault has none. */
export async function openNoteTriage(): Promise<void> {
  try {
    if (!(await api.exists(NOTE_TRIAGE))) await api.createFile(NOTE_TRIAGE, noteTriageBase(settings.config?.log_dir ?? "log"));
  } catch (e) {
    toast("Note triage", errText(e), "error");
    return;
  }
  open({ kind: "base", path: NOTE_TRIAGE });
}
