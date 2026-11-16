import { test, expect } from "@playwright/test";
import { dateTip, formatDate, fromNow, readDate, setDatePrefs, showDate } from "../src/lib/dates";

// One date form for the whole interface (lib/dates.ts): the vault's moment format when set, else near days by name.
// Pure; the same moment tokens and fromNow wording as the core's dates.rs.

const now = new Date("2026-11-16T15:00:00");

test("the automatic form names near days and shortens the rest", () => {
  setDatePrefs("", false);
  expect(showDate("2026-11-16", now)).toBe("Today");
  expect(showDate("2026-11-16 09:30", now)).toBe("09:30");
  expect(showDate("2026-11-15", now)).toBe("Yesterday");
  expect(showDate("2026-11-17T08:00", now)).toBe("Tomorrow 08:00");
  expect(showDate("2026-11-19", now)).toBe("Thursday");
  expect(showDate("2026-11-12", now)).toBe("Thu");
  expect(showDate("2026-10-03", now)).toBe("3 Oct");
  expect(showDate("2025-10-03", now)).toBe("3 Oct 2025");
  expect(showDate("2026-10-03 11:06", now)).toBe("3 Oct"); // no time once the day is not near
  expect(showDate("not a date", now)).toBe("not a date");
  expect(readDate("2026-02-30")).toBeNull(); // no 30 February
});

test("a vault's format decides, its time left out for a day without one; Spanish names", () => {
  setDatePrefs("DD/MM/YYYY HH:mm", false);
  expect(showDate("2026-11-16 09:30", now)).toBe("16/11/2026 09:30");
  expect(showDate("2026-11-16", now)).toBe("16/11/2026");
  setDatePrefs("dddd D [de] MMMM", true);
  expect(showDate("2026-11-16", now)).toBe("lunes 16 de noviembre");
  setDatePrefs("", false);
  expect(formatDate(new Date("2026-03-05T07:04:09"), "YY.M.D h:mm:ss a")).toBe("26.3.5 7:04:09 am");
});

test("how far a date is reads as moment's fromNow, and shows on hover", () => {
  setDatePrefs("", false);
  expect(fromNow(new Date("2026-11-16T14:59:40"), now)).toBe("a few seconds ago");
  expect(fromNow(new Date("2026-11-16T12:00:00"), now)).toBe("3 hours ago");
  expect(fromNow(new Date("2026-11-19T15:00:00"), now)).toBe("in 3 days");
  expect(fromNow(new Date("2026-09-16T15:00:00"), now)).toBe("2 months ago");
  expect(dateTip("2026-11-16 12:00", now)).toBe("Monday, 16 November 2026 12:00 · 3 hours ago");
});

test("impossible dates are text, every ISO offset is a date, and a month is never \"1 months\"", () => {
  setDatePrefs("", false);
  for (const bad of ["2026-13-05", "2026-00-10", "2026-02-30", "2026-02-31T10:00:00Z", "2025-04-31 08:00", "2026-11-16 25:00", "2026-11-16 10:61"]) expect(readDate(bad)).toBeNull();
  for (const ok of ["2026-11-16T14:05:00.000+01:00", "2026-11-16T14:05:00+01", "2026-11-16T14:05:00+0100", "2026-11-16T13:05:00Z"]) expect(readDate(ok)?.d.toISOString()).toBe("2026-11-16T13:05:00.000Z");
  expect(fromNow(new Date("2026-10-02T15:00:00"), now)).toBe("a month ago");
  expect(formatDate(new Date("2026-01-01T12:00:00"), "[W]W YYYY")).toBe("W1 2026");
  expect(formatDate(new Date("2026-11-16T12:00:00"), "WW")).toBe("47");
});

test("a date without a time keeps only the day part of the vault's format", () => {
  setDatePrefs("D MMM [at] HH:mm", false);
  expect(showDate("2026-10-03", now)).toBe("3 Oct");
  expect(showDate("2026-10-03 09:05", now)).toBe("3 Oct at 09:05");
  setDatePrefs("YYYY-MM-DDTHH:mm", false);
  expect(showDate("2026-10-03", now)).toBe("2026-10-03");
  setDatePrefs("HH:mm", false);
  expect(showDate("2026-10-03", now)).toBe("3 Oct"); // only a time: the automatic form for the day
  setDatePrefs("", false);
});
