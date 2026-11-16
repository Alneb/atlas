import { showDate } from "./dates";

// Relative times for activity lists (short, for narrow rows); all server times are ms since the epoch. Older than a
// month: the interface's date (lib/dates.ts).
export function rel(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return showDate(ms);
}
