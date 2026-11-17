// The ledger (DESIGN-calendar-tasks-nudges.md §3.6): what the planner did and what the person answered, as Markdown
// notes, one per device and month (`plan/ledger/2026-11 laptop.md`), newest first, written only by this plugin. Every
// device reads the union; the latest line about a task is its state (snoozed until, nudged in this window, done).
//
//   - 2026-11-16 14:05 · nudged · [[notes/Thesis#^t3f9a|Write the introduction]] · score 2.4 · due tomorrow, ⏫, 50 min free
//   - 2026-11-16 14:21 · snoozed → 16:30 · [[notes/Thesis#^t3f9a|Write the introduction]]
//   - 2026-11-16 16:48 · done · [[notes/Thesis#^t3f9a|Write the introduction]] · from the notification
//   - 2026-11-16 17:02 · dismissed · [[notes/Thesis#^t3f9a|Write the introduction]] · line 1c9e04a2
//   - 2026-11-17 08:00 · digest · 1 overdue, 2 due today
//   - 2026-11-16 23:59 · used · 08:00–12:00, 14:00–15:00, 21:00–23:00
//
// A `used` line is a device's day of presence (§3.3a): the hours it was seen in use, written once, after the day
// (stamped 23:59 of it), for the quiet hours measured (plan.ts `quietOf`).
// A task is named by its block id when it has one (`[[note#^id|title]]`), else by its note and title
// (`[[note|title]]`): the key the plan, the notices and the ledger share.
import { fromStamp, stamp, wall, type Clock } from "./time";

export type Kind = "nudged" | "snoozed" | "done" | "dismissed" | "digest" | "used";
const KINDS: readonly Kind[] = ["nudged", "snoozed", "done", "dismissed", "digest", "used"];
/** The kinds about no task (no link on their line). */
const UNLINKED: readonly Kind[] = ["digest", "used"];

export interface Entry {
  at: number;
  kind: Kind;
  /** The task's key (`notes/Thesis.md#^t3f9a`, or `notes/Thesis.md|Write the introduction`); none for a digest. */
  key?: string;
  /** The task's note and title: what a task without a block id is known by, and what a recurring task's next
   *  occurrence shares with the one ticked. */
  titleKey?: string;
  /** A snooze's moment. */
  until?: number;
  /** A nudge that did not count against the day's budget (⏫/🔺, overdue, due today, a snooze kept). */
  important?: boolean;
  /** What follows, as written (the reasons, "from the notification"). */
  detail: string;
  /** The line as read (none for one not written yet). */
  line?: string;
}

/** What names a task: its note, its title, its block id. */
export interface TaskName { path: string; title: string; block?: string | null }

/** A title as a link's alias can hold it. */
export const alias = (title: string) => title.replace(/\|/g, "/").replace(/\[\[/g, "[").replace(/\]\]/g, "]").replace(/\s+/g, " ").trim();

export const titleKey = (t: TaskName) => `${t.path}|${alias(t.title)}`;
export const keyOf = (t: TaskName) => (t.block ? `${t.path}#^${t.block}` : titleKey(t));

/** The wikilink to a task: `[[note#^id|title]]`, or `[[note|title]]` (a note's path without `.md`, as Obsidian links). */
export function linkOf(t: TaskName): string {
  const note = t.path.replace(/\.md$/i, "");
  return `[[${note}${t.block ? `#^${t.block}` : ""}|${alias(t.title)}]]`;
}

/** A link back to the task's key and title key. */
function fromLink(link: string): { key: string; titleKey: string } | null {
  const m = /^\[\[([^\]|#]+)(?:#\^([\w-]+))?(?:\|([^\]]*))?\]\]$/.exec(link.trim());
  if (!m) return null;
  const path = /\.\w+$/.test(m[1]) ? m[1] : `${m[1]}.md`;
  const t = { path, title: m[3] ?? "", block: m[2] };
  return { key: keyOf(t), titleKey: titleKey(t) };
}

const LINE = /^- (\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}) · (.*)$/;

/** One ledger line, or null for a line that is not one (a heading, a hand-written remark: kept, never read). */
export function parseLine(line: string, c: Clock): Entry | null {
  const m = LINE.exec(line.trim());
  const at = m && fromStamp(m[1], c);
  if (!m || at === null) return null;
  const parts = m[2].split(" · ");
  const head = parts[0].trim();
  const snooze = /^snoozed → (?:(\d{4}-\d{2}-\d{2}) )?(\d{1,2}:\d{2})$/.exec(head);
  const kind = (snooze ? "snoozed" : head) as Kind;
  if (!KINDS.includes(kind)) return null;
  const e: Entry = { at, kind, detail: "", line: line.trim() };
  if (snooze) e.until = fromStamp(`${snooze[1] ?? m[1].slice(0, 10)} ${snooze[2]}`, c) ?? undefined;
  let rest = parts.slice(1);
  if (!UNLINKED.includes(kind)) {
    const link = rest[0] && fromLink(rest[0]);
    if (!link) return null;
    Object.assign(e, link);
    rest = rest.slice(1);
  }
  e.important = rest.some((p) => p.trim() === "important");
  e.detail = rest.filter((p) => p.trim() !== "important").join(" · ");
  return e;
}

/** A day's hours in use (0–23) as a `used` line says them: `08:00–12:00, 14:00–15:00` (each range's end excluded). */
export function hoursText(hours: Iterable<number>): string {
  const hs = [...new Set(hours)].filter((h) => h >= 0 && h < 24).sort((a, b) => a - b);
  const out: string[] = [];
  const two = (h: number) => `${String(h).padStart(2, "0")}:00`;
  for (let i = 0; i < hs.length; ) {
    let j = i;
    while (j + 1 < hs.length && hs[j + 1] === hs[j] + 1) j += 1;
    out.push(`${two(hs[i])}–${two(hs[j] + 1)}`);
    i = j + 1;
  }
  return out.join(", ");
}

/** The hours a `used` line's detail names (the inverse of hoursText); a range it cannot read is left out. */
export function hoursOf(detail: string): number[] {
  const out: number[] = [];
  for (const m of detail.matchAll(/(\d{2}):00[–-](\d{2}):00/g)) {
    for (let h = Number(m[1]); h < Math.min(24, Number(m[2])); h++) out.push(h);
  }
  return out;
}

/** A ledger line for an entry about `task` (none for a digest or a day's use). */
export function renderLine(e: Entry, c: Clock, task?: TaskName): string {
  let head: string = e.kind;
  if (e.kind === "snoozed" && e.until !== undefined) {
    const a = wall(e.at, c), u = wall(e.until, c);
    head = `snoozed → ${u.day === a.day ? stamp(e.until, c).slice(11) : stamp(e.until, c)}`;
  }
  const parts = [stamp(e.at, c), head];
  if (task) parts.push(linkOf(task));
  if (e.important) parts.push("important");
  if (e.detail) parts.push(e.detail);
  return `- ${parts.join(" · ")}`;
}

/** Every entry of a ledger note, newest first. */
export function parse(text: string, c: Clock): Entry[] {
  return text.split("\n").map((l) => parseLine(l, c)).filter((e): e is Entry => e !== null).sort((a, b) => b.at - a.at);
}

/** The note `lines` go into: the device's month file. */
export const fileOf = (folder: string, month: string, device: string) => `${folder.replace(/\/+$/, "")}/${month} ${device.replace(/[\\/:*?"<>|]/g, "-")}.md`;

/** The note with `lines` (newest first) put on top of its entries, under its properties; a note not there yet is
 *  made. Lines written by hand stay where they are. */
export function add(text: string | null, lines: string[], device: string, month: string): string {
  const head = `---\ntype: plan-ledger\ndevice: ${device}\nmonth: ${month}\n---\n`;
  const body = text ?? head;
  const fm = /^---\n[\s\S]*?\n---\n/.exec(body);
  const top = fm ? fm[0] : head;
  const rest = fm ? body.slice(fm[0].length) : body;
  return top + lines.join("\n") + "\n" + rest.replace(/^\n+/, "");
}

/** A mark of a task's line as written (its block id aside: given on a snooze, it is no edit), so a dismissal can say
 *  which version of the task it was about: `line <8 hex digits>` in its detail (FNV-1a). */
export function lineMark(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.replace(/\s+\^[\w-]+\s*$/, "").trim()) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** The line mark a dismissal's detail carries, if any. */
export const markOf = (e: Entry): string | undefined => /(?:^|· )line ([0-9a-f]{8})\b/.exec(e.detail)?.[1];

/** The latest entry about a task (by its key, or — for a nudge's window rule — its title key). */
export function latest(entries: Entry[], key: string): Entry | undefined {
  return entries.find((e) => e.key === key);
}
