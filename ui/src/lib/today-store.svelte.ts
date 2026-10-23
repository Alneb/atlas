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

export function refreshToday(): Promise<void> {
  return (inflight ??= api.today().then(
    (t) => { todayData.v = t; todayData.error = ""; },
    (e) => { todayData.error = errText(e); },
  ).finally(() => { inflight = null; }));
}

/** First use: fetch, then follow file events (debounced). */
export function useToday(): void {
  if (!todayData.v) void refreshToday();
  if (watching) return;
  watching = true;
  let t: ReturnType<typeof setTimeout> | undefined, missed = false;
  // a hidden page (a phone in a pocket, a background tab) does not ask: once shown, one refresh catches up
  const later = () => { if (document.hidden) missed = true; else void refreshToday(); };
  // each refresh walks the vault (recent changes, tasks): not for Atlas's own cache writes
  on("fs", (e) => { if (e.paths.length && e.paths.every(isBookkeeping)) return; clearTimeout(t); t = setTimeout(later, 300); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && missed) { missed = false; void refreshToday(); } });
}
