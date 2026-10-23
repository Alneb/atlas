/** A day as the user's calendar has it (`YYYY-MM-DD` in local time). Never `toISOString().slice(0, 10)`: that is the
 *  UTC day, a day off for hours around midnight (in CEST, 00:00–02:00 was still "yesterday"). */
export const localDay = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
