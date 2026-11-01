// Today's data (focus, log, tasks, activity), fetched once and shared by every part that shows it —
// the Today pane and the home document's view blocks — so a part mounts from the cache at once
// (the UI must not be slower than the backend) and one file event refreshes them all.
import { errText } from "./text";
import { api } from "./api";
import { isBookkeeping, on } from "./bus";
import type { Today } from "./types";

export const todayData = $state({ v: null as Today | null, error: "" });
let inflight: Promise<void> | null = null;
let watching = false;
/** Parts showing Today now; with none, a file event only marks the data stale (each refresh walks the vault: typing
 *  in a note saves every second, and Today closed long ago asked again each time). */
let users = 0, stale = false;

export function refreshToday(): Promise<void> {
  return (inflight ??= api.today().then(
    (t) => { todayData.v = t; todayData.error = ""; },
    (e) => { todayData.error = errText(e); },
  ).finally(() => { inflight = null; }));
}

/** A part shows Today: fetched (again, when files changed while none showed it), then file events followed (debounced)
 *  while any part does. Returns the release, for when the part goes. */
export function useToday(): () => void {
  users++;
  if (!todayData.v || stale) { stale = false; void refreshToday(); }
  watch();
  let released = false;
  return () => { if (!released) { released = true; users--; } };
}

function watch(): void {
  if (watching) return;
  watching = true;
  let t: ReturnType<typeof setTimeout> | undefined, missed = false;
  // a hidden page (a phone in a pocket, a background tab) does not ask: once shown, one refresh catches up
  const later = () => { if (!users) stale = true; else if (document.hidden) missed = true; else void refreshToday(); };
  // each refresh walks the vault (recent changes, tasks): not for Atlas's own cache writes
  on("fs", (e) => {
    if (e.paths.length && e.paths.every(isBookkeeping)) return;
    if (!users) { stale = true; return; }
    clearTimeout(t);
    t = setTimeout(later, 300);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && missed) { missed = false; if (users) void refreshToday(); else stale = true; } });
}
