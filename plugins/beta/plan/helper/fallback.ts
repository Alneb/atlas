// The ntfy fallback (DESIGN-calendar-tasks-nudges.md §3.7, §4 "Off-device fallback"): when no device of the person
// runs Atlas, the server sends the nudges that come due through the Notifications plugin's ntfy, with Done / Snooze
// buttons that call this plugin's hook (`press`, `on = "hook"`) back on the server — recorded as the notification's own
// buttons are. ntfy cannot take a message back, so it is the fallback only; the task's text leaves the server only
// when Settings allow it (`ntfy_text`). Pure: helper.ts asks the core and the Notifications plugin.
import type { Planned, Write } from "./plan";

/** A button of the message: its label and the action it stands for (a nudge's own action id: `done`, `snooze:…`). */
export interface Button { label: string; action: string }

/** One message to send: what the notification says, its buttons, and the ledger lines it stands for (written once
 *  it went). */
export interface Message { noticeId: string; title: string; text: string; buttons: Button[]; writes: Write[] }

/** The ledger mark of a nudge sent through ntfy (left out of its reasons while it rings). */
export const NTFY = " · (ntfy)";

/** The messages for what has just come due (the plan's `writes` of nudges and the digest), each with its planned
 *  notice. Without `showText` a message says nothing of the task: "A task is waiting" and the buttons. */
export function messagesOf(planned: Planned[], writes: Write[], showText: boolean): Message[] {
  const byId = new Map(planned.map((p) => [p.id, p]));
  const out: Message[] = [];
  for (const w of writes) {
    if (w.entry.kind === "nudged") {
      const p = byId.get(`plan:${w.entry.key}`);
      if (!p) continue;
      const buttons = p.actions.filter((a) => !a.id.startsWith("atlas:")).map((a) => ({ label: a.label, action: a.id }));
      out.push({
        noticeId: p.id,
        title: showText ? p.title : "A task is waiting",
        text: showText ? p.body || "Now is a good moment" : "Open Atlas to see it, or answer here.",
        buttons,
        writes: [w],
      });
    } else if (w.entry.kind === "digest") {
      const p = [...byId.values()].find((x) => x.id.startsWith("plan:digest:"));
      // nothing due: recorded, but no message (a notice saying so is noise, as on the devices)
      if (!p) continue;
      out.push({ noticeId: p.id, title: p.title, text: showText && p.body ? p.body : "Open Atlas for the list.", buttons: [], writes: [w] });
    }
  }
  return out;
}

/** The writes that are no message (a tick seen): written whether or not anything is sent. */
export const quietWrites = (writes: Write[]) => writes.filter((w) => w.entry.kind !== "nudged" && w.entry.kind !== "digest");

/** How long a button's token lives: a press the next morning still records Done (a Done on a task already done does
 *  nothing; a snooze to a moment gone is not kept). */
export const BUTTON_TTL = 24 * 3600;

/** The server's address for the buttons: Settings' when given, else as the core saw the devices reach it; null when
 *  neither is known (then the message goes without buttons). */
export function baseOf(setting: unknown, origin: unknown): string | null {
  const own = String(setting ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(own)) return own.replace(/\/v\/[^/]+$/, "").replace(/\/+$/, "");
  return typeof origin === "string" && /^https?:\/\/[^\s/]+$/.test(origin) ? origin : null;
}
