// A note's properties as the panel sees them: the frontmatter's place in the text, each property's
// kind (from the vault's spec, else guessed from the value's shape) and the value conversions of
// each control. Pure: no DOM, no requests — the panel draws, `frontmatter-edit.ts` writes.
import { parse } from "yaml";
import type { PropertyKind, PropertySpecs } from "./types";

export type Props = Record<string, unknown>;
export interface Frontmatter { /** the YAML between the fences */ yaml: string; /** offset just after the closing fence */ end: number; data: Props | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
export const WIKI = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
// Obsidian's two list keys with a meaning of their own (not a vault's list of names)
const isTagKey = (k: string) => /^(tags?|aliases?|cssclasses)$/i.test(k);

/** The note's frontmatter (`---` on the first line to the next `---` / `...`), or null. */
export function frontmatterOf(text: string): Frontmatter | null {
  const m = /^---\r?\n/.exec(text);
  if (!m) return null;
  const close = /^(---|\.\.\.)[ \t]*$/m;
  const rest = text.slice(m[0].length);
  const c = close.exec(rest);
  if (!c) return null;
  const yaml = rest.slice(0, c.index).replace(/\r?\n$/, "");
  return { yaml, end: m[0].length + c.index + c[0].length, data: parseYaml(yaml) };
}

/** The YAML as a mapping, or null when it does not parse to one (the panel then says so). */
export function parseYaml(yaml: string): Props | null {
  if (!yaml.trim()) return {};
  try {
    const v = parse(yaml);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Props) : v == null ? {} : null;
  } catch { return null; }
}

/** The kind of a value by its shape alone, for a vault without a spec (or a key it does not list). */
export function inferKind(key: string, v: unknown): PropertyKind {
  if (Array.isArray(v)) return isTagKey(key) ? "tags" : v.length && v.every((x) => WIKI.test(String(x))) ? "links" : "list";
  if (isTagKey(key)) return "tags";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return "number";
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  if (DATE.test(s)) return "date";
  if (DATETIME.test(s) || v instanceof Date) return "datetime";
  if (WIKI.test(s)) return "link";
  return "text";
}

/** The spec's kind for `key`, else the shape of its value. A `list` under Obsidian's tag keys is
 *  drawn as tags (a refinement: the file is the same list). */
export function kindOf(spec: PropertySpecs | null, key: string, v: unknown): PropertyKind {
  const k = spec?.properties[key]?.kind;
  if (!k) return inferKind(key, v);
  return k === "list" && /^tags?$/i.test(key) ? "tags" : k;
}

/** What a kind holds: a list kind writes a YAML list. */
export const isListKind = (k: PropertyKind) => k === "list" || k === "tags" || k === "links";

/** A value as a list of strings (a scalar is a list of one; empty is none). */
export function listOf(v: unknown): string[] {
  if (v == null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== "").map(scalarText);
}

/** A scalar as the text a control shows. */
export const scalarText = (v: unknown): string => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 16).replace("T", " ") : String(v));

/** `[[Note]]` / `[[Note|label]]` → the target; plain text stays. */
export const linkTarget = (s: string) => WIKI.exec(s.trim())?.[1] ?? s.trim();
/** The label of a link pill. */
export const linkLabel = (s: string) => { const w = WIKI.exec(s.trim()); return w ? (w[2] ?? w[1].split("/").pop()!) : s; };
/** What the user typed in a link field → a wikilink (a bare name gets its brackets; an address stays). */
export function asLink(s: string): string {
  const t = s.trim();
  if (!t || WIKI.test(t) || /^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
  return `[[${t.replace(/^\[\[|\]\]$/g, "")}]]`;
}
/** A tag as written in a list: no leading `#`. */
export const asTag = (s: string) => s.trim().replace(/^#/, "");

interface Parts { y: string; mo: string; d: string; h: string; mi: string; s: string }
function partsOf(v: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v.trim());
  return m ? { y: m[1], mo: m[2], d: m[3], h: m[4] ?? "00", mi: m[5] ?? "00", s: m[6] ?? "00" } : null;
}

/** A stored date → the value of an `<input type=date|datetime-local>` ("" when it is not a date). */
export function toInput(v: unknown, kind: "date" | "datetime"): string {
  const p = partsOf(scalarText(v));
  if (!p) return "";
  return kind === "date" ? `${p.y}-${p.mo}-${p.d}` : `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`;
}

/** An input's value → the text the file keeps: the spec's `format` (YYYY MM DD HH mm ss), else the
 *  shape the old value had (a `T` or a space), else `YYYY-MM-DD` / `YYYY-MM-DD HH:mm`. */
export function fromInput(input: string, kind: "date" | "datetime", format: string, old: unknown): string {
  const p = partsOf(input);
  if (!p) return "";
  const fmt = format || (kind === "date" ? "YYYY-MM-DD" : /T/.test(scalarText(old)) ? "YYYY-MM-DDTHH:mm" : "YYYY-MM-DD HH:mm");
  const tok: Record<string, string> = { YYYY: p.y, MM: p.mo, DD: p.d, HH: p.h, mm: p.mi, ss: p.s };
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => tok[t]);
}

/** Typed text of a number field → a number, or null for an empty or unreadable field. */
export function asNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** One row of the panel: a property the note has, or one its `type:` asks for and it lacks. */
export interface Row { key: string; value: unknown; kind: PropertyKind; missing: boolean }

/** The panel's rows: the note's keys in file order, then the keys its `type:` requires and lacks. */
export function rowsOf(data: Props, spec: PropertySpecs | null): Row[] {
  const rows: Row[] = Object.entries(data).map(([key, value]) => ({ key, value, kind: kindOf(spec, key, value), missing: false }));
  const type = typeof data.type === "string" ? data.type : "";
  for (const key of spec?.types[type]?.required ?? []) {
    if (!(key in data)) rows.push({ key, value: null, kind: kindOf(spec, key, null), missing: true });
  }
  return rows;
}

/** Keys worth offering in "Add a property": the note type's own first, then the rest of the spec. */
export function addable(data: Props, spec: PropertySpecs | null): string[] {
  if (!spec) return [];
  const t = spec.types[typeof data.type === "string" ? data.type : ""];
  const first = t ? [...t.required, ...t.optional] : [];
  return [...new Set([...first, ...Object.keys(spec.properties)])].filter((k) => !(k in data));
}

/** The value a new property starts with. */
export const emptyValue = (k: PropertyKind): unknown => (k === "bool" ? false : null);
