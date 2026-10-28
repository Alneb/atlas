// What a capture box's text will become, before it is sent ("a to-do, due Friday"), and the day words offered after
// `@`: the core's own rules and words (capture.rs `describe`, `days`), asked as the text changes — the same answer
// the desktop box and the phone show.
import { api } from "./api";
import type { CaptureDay } from "./gen/CaptureDay";
import type { CaptureHint } from "./gen/CaptureHint";

const NONE: CaptureHint = { task: false, due: null, says: "" };

/** How long typing must pause before the core is asked: not one request per key. */
const SETTLE_MS = 120;
let last: { key: string; hint: Promise<CaptureHint> } | null = null;
/** The core's hint for one text in one vault. The hint line and the to-do list ask about the same text together: one
 *  request answers both. */
export function describeCapture(text: string, vault?: string): Promise<CaptureHint> {
  const key = `${vault ?? ""}\n${text}`;
  if (last?.key !== key) {
    const hint = api.describeCapture(text, vault);
    last = { key, hint };
    hint.catch(() => { if (last?.key === key) last = null; });
  }
  return last.hint;
}

/** Waits for typing to settle; false when another key came meanwhile (`still()` says whether this ask is the latest). */
export const settled = (still: () => boolean) => new Promise<boolean>((r) => setTimeout(() => r(still()), SETTLE_MS));

/** The core's hint for `text()`, kept current as it changes (asked once typing settles; an answer for an older text is
 *  dropped). Call it while a component starts; `vault()`: the vault written to, when it is not this window's. */
export function captureHint(text: () => string, vault?: () => string | undefined): { readonly current: CaptureHint } {
  let hint = $state(NONE);
  let seq = 0;
  $effect(() => {
    const t = text(), v = vault?.(), my = ++seq;
    if (!t.trim()) { hint = NONE; return; }
    void settled(() => my === seq).then((ok) => { if (ok) void describeCapture(t, v).then((h) => { if (my === seq) hint = h; }, () => {}); });
    return () => { if (my === seq) seq++; };
  });
  return { get current() { return hint; } };
}

let days: { on: string; list: Promise<CaptureDay[]> } | null = null;
/** The day words and the day each names today, asked once a day. */
export function captureDays(): Promise<CaptureDay[]> {
  const on = new Date().toDateString();
  if (days?.on !== on) days = { on, list: api.captureDays().catch(() => { days = null; return []; }) };
  return days.list;
}
