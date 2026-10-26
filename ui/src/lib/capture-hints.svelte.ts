// What a capture box's text will become, before it is sent ("a to-do, due Friday"), and the day words offered after
// `@`: the core's own rules and words (capture.rs `describe`, `days`), asked as the text changes — the same answer
// the desktop box and the phone show.
import { api } from "./api";
import type { CaptureDay } from "./gen/CaptureDay";
import type { CaptureHint } from "./gen/CaptureHint";

const NONE: CaptureHint = { task: false, due: null, says: "" };

/** The core's hint for `text()`, kept current as it changes (an answer for an older text is dropped). Call it while a
 *  component starts; `vault()`: the vault written to, when it is not this window's. */
export function captureHint(text: () => string, vault?: () => string | undefined): { readonly current: CaptureHint } {
  let hint = $state(NONE);
  $effect(() => {
    const t = text(), v = vault?.();
    if (!t.trim()) { hint = NONE; return; }
    let live = true;
    api.describeCapture(t, v).then((h) => { if (live) hint = h; }, () => {});
    return () => { live = false; };
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
