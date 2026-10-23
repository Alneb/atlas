// A Bases filter condition as the filter editor shows it: a property, an operator in words, values — read from and
// written back to the expression Obsidian writes (`status == "done"`, `!tags.contains("x")`, `file.hasTag("a")`).
// An expression this cannot read stays an expression: the editor shows it as text and never rewrites it.
// Pure: no DOM, no requests.
import type { Filter } from "./gen/Filter";

/** How a property is compared: picks the operators and the value editor. */
export type FieldType = "text" | "number" | "date" | "list" | "bool" | "tags" | "folder" | "links";

export type OpId =
  | "is" | "isNot" | "contains" | "notContains" | "startsWith" | "endsWith"
  | "lt" | "le" | "gt" | "ge" | "empty" | "notEmpty" | "containsAny" | "containsAll"
  | "hasTag" | "notHasTag" | "inFolder" | "notInFolder" | "linksTo" | "notLinksTo" | "checked" | "unchecked";

export interface Condition { prop: string; op: OpId; values: string[] }

/** How many values an operator takes: none, one, or a list (typed comma-separated). */
type Arity = 0 | 1 | "many";
const ARITY: Record<OpId, Arity> = {
  is: 1, isNot: 1, contains: 1, notContains: 1, startsWith: 1, endsWith: 1, lt: 1, le: 1, gt: 1, ge: 1,
  empty: 0, notEmpty: 0, containsAny: "many", containsAll: "many", hasTag: "many", notHasTag: "many",
  inFolder: 1, notInFolder: 1, linksTo: 1, notLinksTo: 1, checked: 0, unchecked: 0,
};
export const arity = (op: OpId): Arity => ARITY[op];

/** The operators of each type, in Obsidian's order, with their words. */
export const OPS: Record<FieldType, [OpId, string][]> = {
  text: [["contains", "contains"], ["notContains", "does not contain"], ["is", "is"], ["isNot", "is not"], ["startsWith", "starts with"], ["endsWith", "ends with"], ["empty", "is empty"], ["notEmpty", "is not empty"]],
  number: [["is", "="], ["isNot", "≠"], ["lt", "<"], ["le", "≤"], ["gt", ">"], ["ge", "≥"], ["empty", "is empty"], ["notEmpty", "is not empty"]],
  date: [["is", "is on"], ["isNot", "is not on"], ["lt", "is before"], ["le", "is on or before"], ["gt", "is after"], ["ge", "is on or after"], ["empty", "is empty"], ["notEmpty", "is not empty"]],
  list: [["contains", "contains"], ["notContains", "does not contain"], ["containsAny", "contains any of"], ["containsAll", "contains all of"], ["empty", "is empty"], ["notEmpty", "is not empty"]],
  bool: [["checked", "is checked"], ["unchecked", "is not checked"]],
  tags: [["hasTag", "has tag"], ["notHasTag", "does not have tag"], ["empty", "has no tags"], ["notEmpty", "has tags"]],
  folder: [["inFolder", "is in folder"], ["notInFolder", "is not in folder"], ["is", "is"], ["isNot", "is not"]],
  links: [["linksTo", "links to"], ["notLinksTo", "does not link to"], ["empty", "has no links"], ["notEmpty", "has links"]],
};

/** The words for an operator on a type; an operator the type does not list (written by hand) gets the text words. */
export function opLabel(type: FieldType, op: OpId): string {
  const all = [...OPS[type], ...OPS.text, ...OPS.number, ...Object.values(OPS).flat()];
  return all.find(([o]) => o === op)?.[1] ?? op;
}

/** A new condition on a property: its type's first operator, no value yet. */
export const fresh = (prop: string, type: FieldType): Condition => ({ prop, op: OPS[type][0][0], values: [] });

/** Whether a condition can be written: every operator but the bare ones needs a value. */
export const complete = (c: Condition): boolean => arity(c.op) === 0 || c.values.some((v) => v.trim() !== "");

const IDENT = /^[A-Za-z_][\w]*$/;
/** A property as an expression names it: `status`, `file.name`, `formula.x`, `note["a key"]`. */
export function ref(prop: string): string {
  const [root, ...rest] = prop.split(".");
  if (rest.length === 1 && ["file", "formula", "note"].includes(root) && IDENT.test(rest[0])) return prop;
  if (IDENT.test(prop)) return prop;
  return `note[${JSON.stringify(prop.replace(/^note\./, ""))}]`;
}

/** A value as a literal: a number stays a number for a number property, anything else is quoted. */
function lit(v: string, type: FieldType): string {
  const t = v.trim();
  if (type === "number" && /^-?\d+(\.\d+)?$/.test(t)) return t;
  return JSON.stringify(t);
}

/** The expression a condition writes. */
export function write(c: Condition, type: FieldType): string {
  const p = ref(c.prop);
  const vals = c.values.map((v) => v.trim()).filter(Boolean);
  const one = lit(vals[0] ?? "", type);
  const list = (f: (v: string) => string = (v) => JSON.stringify(v)) => vals.map(f).join(", ");
  const CMP: Partial<Record<OpId, string>> = { is: "==", isNot: "!=", lt: "<", le: "<=", gt: ">", ge: ">=" };
  switch (c.op) {
    case "is": case "isNot": case "lt": case "le": case "gt": case "ge":
      return type === "folder" ? `file.folder ${CMP[c.op]} ${one}` : `${p} ${CMP[c.op]} ${one}`;
    case "contains": return `${p}.contains(${one})`;
    case "notContains": return `!${p}.contains(${one})`;
    case "startsWith": return `${p}.startsWith(${one})`;
    case "endsWith": return `${p}.endsWith(${one})`;
    case "empty": return `${p}.isEmpty()`;
    case "notEmpty": return `!${p}.isEmpty()`;
    case "containsAny": return `${p}.containsAny(${list()})`;
    case "containsAll": return `${p}.containsAll(${list()})`;
    case "hasTag": return `file.hasTag(${list((v) => JSON.stringify(v.replace(/^#/, "")))})`;
    case "notHasTag": return `!file.hasTag(${list((v) => JSON.stringify(v.replace(/^#/, "")))})`;
    case "inFolder": return `file.inFolder(${one})`;
    case "notInFolder": return `!file.inFolder(${one})`;
    case "linksTo": return `file.hasLink(${one})`;
    case "notLinksTo": return `!file.hasLink(${one})`;
    case "checked": return `${p} == true`;
    case "unchecked": return `${p} != true`;
  }
}

// --- reading ---------------------------------------------------------------------------------------------------------

const REF = String.raw`((?:file|formula|note)\.[A-Za-z_]\w*|note\["(?:[^"\\]|\\.)*"\]|[A-Za-z_]\w*)`;
const TOKEN = /\s*("(?:[^"\\]|\\.)*"|'[^']*'|-?\d+(?:\.\d+)?|true|false)\s*(,|$)/y;

/** `"a", 'b', 3` → their texts; null when anything else is in the list. */
function literals(src: string): string[] | null {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  if (!src.trim()) return out;
  while (TOKEN.lastIndex < src.length) {
    const m = TOKEN.exec(src);
    if (!m) return null;
    const t = m[1];
    out.push(t.startsWith('"') ? JSON.parse(t) : t.startsWith("'") ? t.slice(1, -1) : t);
    if (!m[2]) break;
  }
  return TOKEN.lastIndex >= src.length ? out : null;
}

/** `note["a key"]` → `a key`; other names as written. */
const propOf = (r: string) => (r.startsWith('note["') ? JSON.parse(r.slice(5, -1)) as string : r);

const RULES: [RegExp, (m: RegExpExecArray) => Condition | null][] = [
  [new RegExp(String.raw`^(!?)\s*file\.(hasTag|inFolder|hasLink)\((.*)\)$`), (m) => {
    const vals = literals(m[3]);
    if (!vals) return null;
    const neg = !!m[1];
    const [prop, op]: [string, OpId] = m[2] === "hasTag" ? ["file.tags", neg ? "notHasTag" : "hasTag"]
      : m[2] === "inFolder" ? ["file.folder", neg ? "notInFolder" : "inFolder"] : ["file.links", neg ? "notLinksTo" : "linksTo"];
    if (op !== "hasTag" && op !== "notHasTag" && vals.length !== 1) return null;
    return { prop, op, values: vals };
  }],
  [new RegExp(String.raw`^(!?)\s*${REF}\.(isEmpty|isNotEmpty)\(\)$`), (m) => {
    const empty = (m[3] === "isEmpty") !== !!m[1];
    return { prop: propOf(m[2]), op: empty ? "empty" : "notEmpty", values: [] };
  }],
  [new RegExp(String.raw`^(!?)\s*${REF}\.(contains|startsWith|endsWith|containsAny|containsAll)\((.*)\)$`), (m) => {
    const vals = literals(m[4]);
    const neg = !!m[1];
    if (!vals || (neg && m[3] !== "contains")) return null;
    if ((m[3] !== "containsAny" && m[3] !== "containsAll") && vals.length !== 1) return null;
    const op = (m[3] === "contains" && neg ? "notContains" : m[3]) as OpId;
    return { prop: propOf(m[2]), op, values: vals };
  }],
  [new RegExp(String.raw`^${REF}\s*(==|!=|>=|<=|>|<)\s*(.+)$`), (m) => {
    const vals = literals(m[3]);
    if (!vals || vals.length !== 1) return null;
    const prop = propOf(m[1]);
    if (vals[0] === "true" && (m[2] === "==" || m[2] === "!=")) return { prop, op: m[2] === "==" ? "checked" : "unchecked", values: [] };
    if (vals[0] === "false" && m[2] === "==") return { prop, op: "unchecked", values: [] };
    const op = ({ "==": "is", "!=": "isNot", "<": "lt", "<=": "le", ">": "gt", ">=": "ge" } as const)[m[2] as "=="];
    return { prop, op, values: vals };
  }],
];

/** The condition an expression states, or null when it is more than one (it then stays an expression). */
export function read(expr: string): Condition | null {
  const e = expr.trim();
  for (const [re, make] of RULES) {
    const m = re.exec(e);
    if (m) return make(m);
  }
  return null;
}

// --- groups ----------------------------------------------------------------------------------------------------------

export type GroupOp = "and" | "or" | "not";
export interface Group { op: GroupOp; items: Filter[] }

/** A filter as one group: none is an empty "all of", a lone expression a group of one. */
export function asGroup(f: Filter | null | undefined): Group {
  if (f === null || f === undefined) return { op: "and", items: [] };
  if (typeof f === "string") return { op: "and", items: [f] };
  const op = (Object.keys(f)[0] ?? "and") as GroupOp;
  return { op, items: (f as Record<GroupOp, Filter[]>)[op] ?? [] };
}
/** A group inside a group, or null for an expression. */
export const subGroup = (f: Filter): Group | null => (typeof f === "string" ? null : asGroup(f));
export const toFilter = (g: Group): Filter => ({ [g.op]: g.items }) as Filter;
/** What the file gets: nothing for an empty top group (the key goes away, as in Obsidian). */
export const topFilter = (g: Group): Filter | null => (g.items.length ? toFilter(g) : null);
/** How many conditions a filter holds (the toolbar's badge). */
export function countConditions(f: Filter | null | undefined): number {
  if (f === null || f === undefined) return 0;
  if (typeof f === "string") return 1;
  return asGroup(f).items.reduce((n, x) => n + countConditions(x), 0);
}
