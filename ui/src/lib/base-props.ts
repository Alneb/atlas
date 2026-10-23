// The properties a base can show, filter and sort on — the notes' frontmatter, `file.*` and `formula.*` — with their
// kinds and names: one table every Bases editor reads (the toolbar's popovers, the header menu, the cell editors).
// Pure: no DOM, no requests.
import type { BaseResult } from "./gen/BaseResult";
import type { BaseView } from "./gen/BaseView";
import type { PropertyKind } from "./gen/PropertyKind";
import type { PropertySpecs } from "./gen/PropertySpecs";
import type { FieldType } from "./base-filter";

/** Obsidian's file properties, with the names its Bases menus give them. */
export const FILE_PROPS: { id: string; label: string; kind: PropertyKind; type: FieldType }[] = [
  { id: "file.name", label: "File name", kind: "text", type: "text" },
  { id: "file.path", label: "File path", kind: "text", type: "text" },
  { id: "file.folder", label: "Folder", kind: "text", type: "folder" },
  { id: "file.ext", label: "Extension", kind: "text", type: "text" },
  { id: "file.size", label: "File size", kind: "number", type: "number" },
  { id: "file.ctime", label: "Created time", kind: "datetime", type: "date" },
  { id: "file.mtime", label: "Modified time", kind: "datetime", type: "date" },
  { id: "file.tags", label: "Tags", kind: "tags", type: "tags" },
  { id: "file.links", label: "Links", kind: "links", type: "links" },
  { id: "file.backlinks", label: "Backlinks", kind: "links", type: "list" },
];

/** A frontmatter key of a column id (`note.x` / `x`); null for `file.*` / `formula.*`. */
export const noteKey = (id: string): string | null => (/^(file|formula)\./.test(id) ? null : id.replace(/^note\./, ""));

/** Two ids naming one column (`status` and `note.status`). */
export const sameProp = (a: string, b: string) => a === b || (noteKey(a) !== null && noteKey(a) === noteKey(b));

/** The kind of a property: the vault's spec, else the shape its values have across the vault. */
export function kindOf(id: string, res: BaseResult | null, spec: PropertySpecs | null): PropertyKind {
  const file = FILE_PROPS.find((f) => f.id === id);
  if (file) return file.kind;
  const key = noteKey(id);
  if (key === null) return "text"; // a formula: its value says, not its name
  const k = spec?.properties[key]?.kind ?? res?.kinds[key] ?? "text";
  return k === "list" && /^tags?$/i.test(key) ? "tags" : k;
}

/** How the filter editor compares a property of that kind. */
export function fieldType(id: string, res: BaseResult | null, spec: PropertySpecs | null): FieldType {
  const file = FILE_PROPS.find((f) => f.id === id);
  if (file) return file.type;
  const k = kindOf(id, res, spec);
  const by: Record<PropertyKind, FieldType> = {
    text: "text", enum: "text", link: "text", number: "number", bool: "bool", date: "date", datetime: "date",
    list: "list", tags: "list", links: "list",
  };
  return by[k];
}

/** A column's name: its display name in this view, Obsidian's file names, else the key as written. */
export function propLabel(id: string, view: BaseView | null): string {
  const col = view?.columns.find((c) => sameProp(c.id, id));
  if (col) return col.label;
  const file = FILE_PROPS.find((f) => f.id === id);
  if (file) return file.label;
  return id.replace(/^(note|formula)\./, "");
}

/** Every property a base can use, the view's columns first, then the notes' properties (commonest first), the
 *  base's formulas and the file properties; each once. */
export function allProps(view: BaseView, res: BaseResult): string[] {
  const out: string[] = [];
  const add = (id: string) => { if (!out.some((x) => sameProp(x, id))) out.push(id); };
  view.columns.forEach((c) => add(c.id));
  view.properties.forEach(add);
  Object.keys(res.kinds).sort((a, b) => a.localeCompare(b)).forEach(add);
  res.formulas.forEach((f) => add(`formula.${f}`));
  FILE_PROPS.forEach((f) => add(f.id));
  return out;
}
