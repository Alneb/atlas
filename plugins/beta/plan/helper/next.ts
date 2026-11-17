// `plan/next.md` (DESIGN-calendar-tasks-nudges.md §3.7): the planning device's next nudges, as a note every device
// reads once synced. It says which device planned and when; another device plans for itself once it is STALE (the
// planner's computer is off or asleep), so a nudge still comes. Rewritten when the plan changes, and at least every
// REFRESH so its age means something. Pure: helper.ts reads and writes the file.
import { alias } from "./ledger";
import type { Planned } from "./plan";
import { fromStamp, HOUR, stamp, type Clock } from "./time";

/** A plan this old is no longer the planner's word: another device plans for itself. */
export const STALE = 2 * HOUR;
/** The plan is written again after this even when it has not changed. */
export const REFRESH = HOUR;

/** Who planned, and when. */
export interface Next { device: string; plannedAt: number }

/** The note beside the ledger folder: `plan/ledger` → `plan/next.md`. */
export const nextFileOf = (ledger: string) => {
  const i = ledger.replace(/\/+$/, "").lastIndexOf("/");
  return `${i < 0 ? "plan" : ledger.slice(0, i)}/next.md`;
};

/** One planned notice as a line: when, the task's link, why. */
function lineOf(p: Planned, c: Clock): string {
  const when = stamp(Date.parse(p.at), c);
  if (p.id.startsWith("plan:digest:")) return `- ${when} · digest · ${p.title.replace(/^Today: /, "")}`;
  const note = (p.subject ?? p.open ?? "").replace(/\.md(?=#|$)/i, "");
  return `- ${when} · ${note ? `[[${note}|${alias(p.title)}]]` : alias(p.title)}${p.body ? ` · ${p.body}` : ""}`;
}

export function renderNext(planned: Planned[], device: string, at: number, c: Clock): string {
  const lines = [...planned].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((p) => lineOf(p, c));
  return [
    "---",
    "type: plan-next",
    `device: ${device}`,
    `planned_at: ${stamp(at, c)}`,
    "---",
    `The next nudges, as planned by ${device}. Written by the Plan plugin each time the plan changes; edits are replaced.`,
    "",
    ...(lines.length ? lines : ["- nothing planned"]),
    "",
  ].join("\n");
}

/** The device and the moment of a plan note; null for no note or one that is not ours. */
export function readNext(text: string | null, c: Clock): Next | null {
  const head = text && /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  if (!head || !/^type: plan-next$/m.test(head)) return null;
  const device = /^device: (.+)$/m.exec(head)?.[1]?.trim();
  const at = fromStamp(/^planned_at: (.+)$/m.exec(head)?.[1] ?? "", c);
  return device && at !== null ? { device, plannedAt: at } : null;
}

const body = (text: string) => text.replace(/^planned_at: .*$/m, "");

/** Whether the planner writes its note now: it changed, or its last writing is REFRESH old — unless another device
 *  that plans too (no `schedules_on` named: every computer runs the schedules) holds a fresh one: one writer, so sync
 *  never makes a conflict copy of it. */
export function shouldWrite(old: string | null, fresh: string, self: string, now: number, c: Clock): boolean {
  const was = readNext(old, c);
  if (!was) return true;
  if (was.device !== self) return now - was.plannedAt >= STALE;
  return body(old!) !== body(fresh) || now - was.plannedAt >= REFRESH;
}

/** Why a device that does not run the schedules plans for itself — the planner's note is missing or stale — or null
 *  when the planner's word holds. */
export function localReason(next: Next | null, now: number, c: Clock): string | null {
  if (!next) return "no device has written the plan";
  if (now - next.plannedAt < STALE) return null;
  return `${next.device} last planned ${stamp(next.plannedAt, c)}`;
}
