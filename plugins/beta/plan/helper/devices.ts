// The device rule (DESIGN-calendar-tasks-nudges.md §3.7): which of the person's devices a nudge rings on, from their
// presence as the mirror server shares it (`GET /api/device` → `devices`). The same rule on every device, so they agree
// without asking each other. Pure: helper.ts asks the core.
import { MIN, stamp, type Clock } from "./time";

/** A desktop used this recently is where the person is. */
export const AT_DESKTOP = 5 * MIN;
/** A phone whose core reported this recently is running Atlas, so it can ring. */
export const PHONE_UP = 10 * MIN;
/** A phone's exact alarm for a `plan/next.md` stamp covers a nudge whose moment is this much earlier than the stamp
 *  (the planner's rounds, 5 minutes apart, move a nudge not yet rung to the round's minute)… */
export const ARMED_BEFORE = 5 * MIN;
/** …or up to this much later: the phone wakes 2 minutes after the stamp and rings what its own plan has due, and its
 *  ledger line takes a moment to reach the planner (the nudge's 30 minutes of ringing, plan.ts RING). */
export const ARMED_AFTER = 30 * MIN;

export type Kind = "desktop" | "phone";

/** What a phone armed (its app's `.atlas/cache/alarms.json`, carried by its presence report): whether its alarms are
 *  exact, and the `plan/next.md` stamps (ms) it set them for — a wake each, one after the other. */
export interface Alarms { exact: boolean; nudges: number[] }

/** One device as the core lists it. */
export interface Seen { id: string; name: string; kind: Kind; activeAt: number | null; reportedAt: number; here: boolean; alarms: Alarms | null }

function alarmsOf(a: any): Alarms | null {
  if (!a || typeof a !== "object" || !Array.isArray(a.nudges)) return null;
  return { exact: a.exact === true, nudges: a.nudges.filter((t: unknown): t is number => typeof t === "number" && Number.isFinite(t)) };
}

/** The device picked and why, or null when the presence known picks none (no mirror, every device silent): then the
 *  device that runs the schedules nudges, as without the rule. */
export interface Pick { device: Seen; why: string }

/** The core's `devices`, as far as they are well-formed. */
export function seenOf(raw: unknown): Seen[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((d: any) =>
    d && typeof d.id === "string" && (d.kind === "desktop" || d.kind === "phone")
      ? [{ id: d.id, name: String(d.name ?? d.id), kind: d.kind, activeAt: typeof d.active_at === "number" ? d.active_at : null, reportedAt: Number(d.reported_at) || 0, here: d.here === true, alarms: alarmsOf(d.alarms) }]
      : []);
}

const latest = (a: Seen, b: Seen) => ((b.activeAt ?? 0) > (a.activeAt ?? 0) ? b : a);

/** The desktop used last when one was used in the last AT_DESKTOP; else the phone used last among those running
 *  Atlas; else — for the nudge at `moment`, when one is named — a phone that set an exact alarm for it (armedFor);
 *  else none. */
export function pick(devices: Seen[], now: number, c: Clock, moment?: number): Pick | null {
  const desks = devices.filter((d) => d.kind === "desktop" && d.activeAt !== null && now - d.activeAt <= AT_DESKTOP);
  if (desks.length) {
    const d = desks.reduce(latest);
    return { device: d, why: `${d.name} was used at ${stamp(d.activeAt!, c).slice(11)}` };
  }
  const phones = devices.filter((d) => d.kind === "phone" && now - d.reportedAt <= PHONE_UP);
  if (phones.length) {
    const d = phones.reduce(latest);
    return { device: d, why: `no computer used for ${AT_DESKTOP / MIN} min; ${d.name} runs Atlas` };
  }
  const armed = moment === undefined ? null : armedFor(devices, moment);
  return armed && { device: armed.device, why: `no computer used for ${AT_DESKTOP / MIN} min; ${armed.device.name} set an exact alarm for ${stamp(armed.stamp, c).slice(11)}` };
}

/** The phone trusted with the nudge at `moment` while its app is closed: one whose report says its alarms are exact
 *  and set for a stamp from ARMED_BEFORE after the moment to ARMED_AFTER before it (the latest used, when several).
 *  Per nudge, so it is safe: a nudge the phone never saw in `plan/next.md` (a new one, a moved one) is no stamp it
 *  armed, and stays with the planner; an inexact alarm (the permission withheld) may come minutes late in Doze. */
export function armedFor(devices: Seen[], moment: number): { device: Seen; stamp: number } | null {
  let best: { device: Seen; stamp: number } | null = null;
  for (const d of devices) {
    if (d.kind !== "phone" || !d.alarms?.exact) continue;
    const s = d.alarms.nudges.find((t) => moment >= t - ARMED_BEFORE && moment <= t + ARMED_AFTER);
    if (s !== undefined && (!best || (d.activeAt ?? 0) > (best.device.activeAt ?? 0))) best = { device: d, stamp: s };
  }
  return best;
}

/** The devices whose core runs (reported in the last PHONE_UP, desktop or phone): one of them rings the nudges, by the
 *  rule above or as the planner, so the server's ntfy fallback stays silent. */
export function running(devices: Seen[], now: number): Seen[] {
  return devices.filter((d) => now - d.reportedAt <= PHONE_UP);
}
