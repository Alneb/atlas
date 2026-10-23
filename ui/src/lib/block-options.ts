// What a block can be told, as a list of fields: the page's "Options…" form is drawn from it
// (components/BlockOptions.svelte), so a block's options need no hand-written dialog and no YAML.
// A block without fields is still configured as text ("Edit layout"). A plugin's settings use the same
// form, with three more things (docs/guides/PLUGIN-API.md, "Settings"): `when`, `group` and lists of records.

/** Shown (and kept) only while each named sibling field has one of these values. */
export type When = Record<string, string | boolean | (string | boolean)[]>;
export type CardAction = { label: string; command: string; when?: When };
export type OptionField = {
  key: string; label: string; hint?: string; when?: When;
  /** Drawn with the other fields of that group, under a heading that starts closed. */
  group?: string;
  /** Shown, not typed (a secret the plugin sets itself: the form says only whether it is set). */
  readonly?: boolean;
  /** What a new card starts with. */
  default?: unknown;
} & (
  /** `suggestions`: values found on the machine (a plugin's `suggest`), offered beside the box */
  | { kind: "text"; suggestions?: { value: string; label: string }[] }
  /** Text of several lines (a signature): a box, Enter makes a new line. */
  | { kind: "longtext" }
  | { kind: "number" }
  | { kind: "toggle" }
  /** One of a fixed set; `""` in the list reads as "not set". */
  | { kind: "choice"; choices: string[] }
  /** Several values, written as a YAML list; typed separated by commas. */
  | { kind: "list" }
  /** A token or a password (a plugin's setting): typed blind, never shown back. `isSet`: one is stored. */
  | { kind: "secret"; isSet?: boolean }
  /** A list of cards, each a set of `fields`; the field `name` names a card (renaming a saved one keeps its secrets). */
  | { kind: "records"; fields: OptionField[]; add: string; name: string; actions: CardAction[]; listActions: { label: string; command: string }[];
      /** The secrets stored for the card of that name (keys of its fields). */
      secretsOf?: (card: string) => string[] }
);
export type RecordsField = Extract<OptionField, { kind: "records" }>;
/** One card while the form is open; `saved`: it is in the file, under the name `was` (a rename is sent as
 *  `renamed_from`, so the core moves its secrets and the plugin follows the new name). */
export type Card = { id: number; saved: boolean; was?: string; values: Record<string, FormValue> };
export type FormValue = string | boolean | Card[];

const path = (what: string): OptionField => ({ key: "path", label: "File", kind: "text", hint: `${what}, as a path from the vault's root` });

/** The options the core's row views read (`views.rs`: Spec). */
export const ROW_VIEW_FIELDS: OptionField[] = [
  { key: "from", label: "Rows from", kind: "text", hint: "section, note, tasks, next-actions, folder:<path> or base:<file>" },
  { key: "date", label: "Date property", kind: "text", hint: "the property a calendar places rows by (default: the date in the task)" },
  { key: "dated", label: "Only rows with a date", kind: "toggle" },
  { key: "by", label: "Group by", kind: "text", hint: "a property: the tree's parent link (default up), the board's column" },
  { key: "columns", label: "Columns", kind: "list", hint: "properties shown by a table, e.g. state, due" },
];

/** What a task block can be asked (crates/atlas-core/src/tasks.rs: Query). */
export const TASK_FIELDS: OptionField[] = [
  { key: "from", label: "Tasks from", kind: "choice", choices: ["", "section", "note", "tasks"], hint: "this section (default), this note, or every note of the vault (tasks)" },
  { key: "show", label: "Show", kind: "choice", choices: ["", "open", "done", "all"] },
  { key: "tag", label: "With any of these tags", kind: "list", hint: "without #; a tag takes its sub-tags (work also finds #work/thesis)" },
  { key: "path", label: "Only in this folder or file", kind: "text" },
  { key: "priority", label: "This priority or higher", kind: "choice", choices: ["", "lowest", "low", "normal", "medium", "high", "highest"] },
  { key: "due", label: "By date", kind: "choice", choices: ["", "overdue", "today", "week", "dated", "undated"], hint: "week: the next seven days and what is overdue" },
  { key: "sort", label: "Sort by", kind: "list", hint: "priority, due, start, file, title — in that order of importance" },
  { key: "group", label: "Group by", kind: "choice", choices: ["", "due", "priority", "file", "tag"] },
  { key: "limit", label: "At most", kind: "number" },
];

/** Fields of the built-in blocks, by type. A plugin gives its own to `registerBlock`. */
export const BUILTIN_FIELDS: Record<string, OptionField[]> = {
  "task-list": TASK_FIELDS,
  note: [path("The note shown")],
  text: [{ key: "text", label: "Text", kind: "text", hint: "markdown" }],
  base: [path("The database (.base)"), { key: "table", label: "View", kind: "text", hint: "one of the database's views, by name (default: the first)" }],
  editor: [path("The file edited in place")],
  pdf: [path("The PDF")],
  image: [path("The image")],
  "file-table": [path("The CSV / TSV file")],
  excalidraw: [path("The drawing")],
  page: [path("The page (.page)")],
  web: [{ key: "url", label: "Address", kind: "text", hint: "https://…" }],
  search: [{ key: "q", label: "Search for", kind: "text", hint: "the same words as in the Search pane, e.g. tag:run" }],
  terminal: [{ key: "preset", label: "Runs", kind: "choice", choices: ["shell", "claude"] }],
  "library.paper": [
    { key: "key", label: "Paper", kind: "text", hint: "its citekey (default: the note's citekey property, else the paper whose folder holds the note)" },
    { key: "hide_pdf", label: "Hide the PDF", kind: "toggle", hint: "only the details, no embedded PDF" },
    { key: "pdf_height", label: "PDF height", kind: "number", hint: "in pixels (default 760)" },
  ],
  review: [{ key: "types", label: "Keep as…", kind: "list", hint: "the note types offered when keeping a note (default: literature, atomic, project)" }],
};

let cardIds = 0;
const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The form's value for an option's value (records: one card per entry, all saved). */
export function shown(f: OptionField, v: unknown): FormValue {
  if (f.kind === "toggle") return v === true;
  if (f.kind === "secret") return ""; // never shown back
  if (f.kind === "list") return Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
  if (f.kind === "records") return (Array.isArray(v) ? v : []).map((c) => card(f, asObject(c), true));
  return v === undefined || v === null ? "" : String(v);
}

function card(f: RecordsField, values: Record<string, unknown>, saved: boolean): Card {
  return { id: ++cardIds, saved, was: saved ? String(values[f.name] ?? "") : undefined, values: Object.fromEntries(f.fields.map((s) => [s.key, shown(s, values[s.key])])) };
}
/** A new card: every field at its default. */
export const newCard = (f: RecordsField): Card => card(f, Object.fromEntries(f.fields.map((s) => [s.key, s.default])), false);

/** Does the field apply, given its siblings' form values (an empty one counts as its default)? */
export function applies(f: { when?: When }, values: Record<string, FormValue>, siblings: OptionField[]): boolean {
  return Object.entries(f.when ?? {}).every(([key, want]) => {
    const sib = siblings.find((s) => s.key === key);
    const v = values[key] === "" || values[key] === undefined ? (sib ? shown(sib, sib.default) : undefined) : values[key];
    return (Array.isArray(want) ? want : [want]).some((w) => (typeof w === "boolean" ? v === w : String(v) === w));
  });
}

/** The fields in order, those of one group gathered where the group first appears. */
export function layout(fields: OptionField[]): ({ field: OptionField } | { group: string; fields: OptionField[] })[] {
  const out: ({ field: OptionField } | { group: string; fields: OptionField[] })[] = [];
  for (const f of fields) {
    if (!f.group) { out.push({ field: f }); continue; }
    const g = out.find((x) => "group" in x && x.group === f.group);
    if (g && "group" in g) g.fields.push(f); else out.push({ group: f.group, fields: [f] });
  }
  return out;
}

/** What the form says under a secret: whether one is kept, never its value. */
export function secretHint(isSet: boolean, readonly: boolean | undefined, hint?: string): string | undefined {
  if (readonly) return hint; // the field itself reads "Set" / "Not set yet"
  const state = isSet ? "Set. Type to replace it; leave it empty to keep it." : "Not set yet. Kept outside the vault, never in plugin.toml.";
  return [hint, state].filter(Boolean).join(" — ");
}

/** A card as the options hold it: only the fields that apply, empty ones left out, secrets only when typed. */
function cardValue(f: RecordsField, c: Card): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of f.fields) {
    if (!applies(s, c.values, f.fields) || (s.kind === "secret" && s.readonly)) continue;
    store(out, s, c.values[s.key]);
  }
  const now = String(c.values[f.name] ?? "").trim();
  if (c.saved && c.was && now && now !== c.was) out.renamed_from = c.was;
  return out;
}

/** Put the form's value into the options; an empty one removes the key, so the file stays minimal. */
export function store(options: Record<string, unknown>, f: OptionField, v: FormValue): void {
  if (f.kind === "records") {
    const cards = Array.isArray(v) ? v.map((c) => cardValue(f, c)) : [];
    if (cards.length) options[f.key] = cards; else delete options[f.key];
    return;
  }
  const text = typeof v === "string" ? v.trim() : "";
  const value: unknown =
    f.kind === "toggle" ? v === true || undefined
    : f.kind === "number" ? (text && Number.isFinite(Number(text)) ? Number(text) : undefined)
    : f.kind === "list" ? ((l) => (l.length ? l : undefined))(text.split(",").map((x) => x.trim()).filter(Boolean))
    : text || undefined;
  if (value === undefined) delete options[f.key];
  else options[f.key] = value;
}
