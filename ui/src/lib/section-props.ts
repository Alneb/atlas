// Section properties (docs/guides/EXPRESSIONS.md). A line `key:: value` under a heading is a property of that
// heading's section, and the sections inside it inherit it — so `run:: X` under "## Results" is known
// to every expression and block below that heading, and the note's frontmatter to all of them.
// Pure text in, plain data out: used by expressions, by blocks (`ctx.props()`) and by tests.
import { parse as parseYaml } from "yaml";

export type Props = Record<string, unknown>;
export interface Task { text: string; done: boolean; line: number; due?: string }
/** What a place in a note knows: its frontmatter, its section's own and inherited properties, both
 *  merged (`props`: the nearest wins), the heading it is under, and the tasks of that section. */
export interface Scope { note: Props; section: Props; props: Props; heading: string; tasks: Task[] }

interface Section { level: number; heading: string; start: number; end: number; own: Props; parent: Section | null }

// `key:: value` alone on a line (optionally a list item), or `[key:: value]` inside a sentence
// (a space must follow the `::` — `std::vector` in a sentence is not a property)
const LINE_FIELD = /^\s*(?:[-*+]\s+(?:\[.\]\s+)?)?([\p{L}_][\p{L}\p{N}_ /-]*?)::(?:[ \t]+(.*))?$/u;
const BRACKET_FIELD = /[[(]([\p{L}_][\p{L}\p{N}_ /-]*?)::[ \t]+([^\])]*)[\])]/gu;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TASK = /^\s*[-*+]\s+\[(.)\]\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;

/** `3` → 3, `true` → true, anything else stays text (a date, a `[[link]]`, a sentence). */
export function fieldValue(raw: string): unknown {
  const v = raw.trim();
  if (v === "true" || v === "false") return v === "true";
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function setField(into: Props, key: string, raw: string): void {
  const k = key.trim(), value = fieldValue(raw);
  into[k] = value;
  // `Sample size:: 4` is also `sample_size`, which an expression can write without quotes
  const plain = k.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_");
  if (plain !== k) into[plain] = value;
}

/** The frontmatter as data, and the line (0-based) where the body starts. */
function frontmatter(lines: string[]): { note: Props; body: number } {
  if (lines[0]?.trim() !== "---") return { note: {}, body: 0 };
  const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
  if (end < 0) return { note: {}, body: 0 };
  try {
    const v: unknown = parseYaml(lines.slice(1, end).join("\n"));
    return { note: v && typeof v === "object" && !Array.isArray(v) ? (v as Props) : {}, body: end + 1 };
  } catch { return { note: {}, body: end + 1 }; }
}

/** Every section of a note (the part before the first heading is level 0), with its own properties. */
function sections(lines: string[], body: number): Section[] {
  const root: Section = { level: 0, heading: "", start: body, end: lines.length, own: {}, parent: null };
  const all = [root];
  let cur = root, fenced = false;
  for (let i = body; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue; // code is not prose: `a::b` in a snippet is not a property
    const h = HEADING.exec(line);
    if (h) {
      let parent: Section = cur;
      while (parent.level >= h[1].length && parent.parent) { parent.end = i; parent = parent.parent; }
      cur = { level: h[1].length, heading: h[2], start: i, end: lines.length, own: {}, parent };
      all.push(cur);
      continue;
    }
    const f = LINE_FIELD.exec(line);
    if (f) setField(cur.own, f[1], f[2] ?? "");
    else for (const m of line.matchAll(BRACKET_FIELD)) setField(cur.own, m[1], m[2]);
  }
  return all;
}

function tasksIn(lines: string[], s: Section): Task[] {
  const out: Task[] = [];
  let fenced = false;
  for (let i = s.start; i < s.end; i++) {
    if (FENCE.test(lines[i])) { fenced = !fenced; continue; }
    const t = fenced ? null : TASK.exec(lines[i]);
    if (t) out.push({ text: t[2].replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/u, "").trim(), done: t[1] !== " ", line: i + 1, due: /📅\s*(\d{4}-\d{2}-\d{2})/u.exec(t[2])?.[1] });
  }
  return out;
}

// the last note read: every expression of a note asks about the same text, one after the other
let memo: { text: string; lines: string[]; note: Props; body: number; all: Section[] } | null = null;
function read(text: string) {
  if (memo?.text === text) return memo;
  const lines = text.split(/\r?\n/);
  const { note, body } = frontmatter(lines);
  return (memo = { text, lines, note, body, all: sections(lines, body) });
}

/** What line `line` (1-based) of the note `text` knows. */
export function scopeAt(text: string, line: number): Scope {
  const { lines, note, body, all } = read(text);
  const at = Math.max(body, Math.min(lines.length - 1, line - 1));
  // the deepest section holding the line: the last one that starts at or before it and has not ended
  const here = [...all].reverse().find((s) => s.start <= at && at < s.end) ?? all[0];
  const chain: Section[] = [];
  for (let s: Section | null = here; s; s = s.parent) chain.unshift(s);
  const section = Object.assign({}, ...chain.map((s) => s.own)) as Props;
  return { note, section, props: { ...note, ...section }, heading: here.heading, tasks: tasksIn(lines, here) };
}

/** The line (1-based) of the first place `needle` appears in `text` (a block finds itself by its YAML). */
export function lineOf(text: string, needle: string): number {
  const i = needle.trim() ? text.indexOf(needle.trim()) : -1;
  return i < 0 ? 1 : text.slice(0, i).split("\n").length;
}
