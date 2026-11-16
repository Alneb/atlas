import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseTaskLine } from "../src/lib/task-line";
import { chipsOf } from "../src/lib/task-chips";

// The Tasks plugin's fields as the core's tasks.rs reads them (lib/task-fields.ts): its alternative markers and the
// emoji variation selector too. Pure.

test("every due and scheduled marker, with or without the variation selector", () => {
  const t = parseTaskLine("- [ ] call Ana 📆 2026-10-12 ⌛ 2026-10-10 ⏫️ 🔁 every week");
  expect([t.description, t.due, t.scheduled, t.priority, t.repeat]).toEqual(["call Ana", "2026-10-12", "2026-10-10", "high", "every week"]);
  expect(parseTaskLine("- [ ] b 🗓️ 2026-11-01").due).toBe("2026-11-01");
  expect(parseTaskLine("1. [x] c 📅 2026-11-02 ✅ 2026-11-03").doneOn).toBe("2026-11-03");
  const now = new Date("2026-10-12T09:00:00");
  expect(chipsOf("x 📆 2026-10-12 ⌛ 2026-10-13", now).map((c) => [c.kind, c.text])).toEqual([["due", "today"], ["scheduled", "tomorrow"]]);
});

// One fixture list for both readers (the core's tests read it too: tasks.rs): what this reader makes of each line is
// what the core makes of it, so the dialog's fields, written back by the core's writer, give the same line.
test("the task dialog's reader agrees with the core on every fixture line", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/task-lines.json", import.meta.url), "utf8")) as { lines: { line: string; fields: Record<string, unknown> }[] };
  const blank = { lead: "- ", status: " ", blockId: "", description: "", done: false, priority: "none", repeat: "", created: "", start: "", scheduled: "", due: "", doneOn: "" };
  expect(fixture.lines.length).toBeGreaterThanOrEqual(10);
  for (const { line, fields } of fixture.lines) expect({ ...parseTaskLine(line) }, line).toEqual({ ...blank, ...fields });
});
