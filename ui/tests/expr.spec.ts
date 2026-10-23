import { test, expect, type Page } from "@playwright/test";
import { scopeAt, lineOf } from "../src/lib/section-props";

// Notes that compute (docs/design/EXPRESSIONS.md): inline code that starts with `=` shows its value, in the
// editor and in the reading view; `key:: value` lines are properties of their section, inherited by
// the sections inside it.
const H = { "x-atlas": "1" };
const NOTE = `---
budget: 100
due: 2030-01-10
---
# Trip
cost:: 40
Left: \`= note.budget - section.cost\`

## Hotel
cost:: 15
nights:: 3
Inherited: \`= props.budget - props.cost\` open \`= tasks.filter(t => !t.done).length\`
- [ ] book it 📅 2030-01-02
- [x] ask Ana
Bad: \`= nope.x\` net: \`= typeof fetch\` code: \`plain\`

\`\`\`js
inside:: a fence
\`\`\`
`;

test("section properties: inherited downward, the nearest wins, code and C++ paths are not properties", () => {
  const top = scopeAt(NOTE, 7);
  expect(top.note).toMatchObject({ budget: 100 });
  expect(top.section).toEqual({ cost: 40 });
  expect(top.heading).toBe("Trip");
  expect(top.tasks.map((t) => t.text)).toEqual(["book it", "ask Ana"]); // a section holds its subsections

  const hotel = scopeAt(NOTE, 12);
  expect(hotel.heading).toBe("Hotel");
  expect(hotel.props).toMatchObject({ budget: 100, cost: 15, nights: 3 });
  expect(hotel.tasks).toEqual([{ text: "book it", done: false, line: 13, due: "2030-01-02" }, { text: "ask Ana", done: true, line: 14, due: undefined }]);
  expect(hotel.props).not.toHaveProperty("inside");

  const prose = scopeAt("# A\nuse std::vector here\nSample size:: 4\n- [done:: yes] and (who:: Ana)\n", 2);
  expect(prose.section).toEqual({ "Sample size": 4, sample_size: 4, done: "yes", who: "Ana" });
  expect(lineOf(NOTE, "nights:: 3")).toBe(11);
});

const exprs = (page: Page) => page.locator(".cm-content code.expr");

test("inline expressions: values in the editor, the source at the caret, live on edit, frozen as text, and in the reading view", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/trip.md", text: NOTE } });
  await request.put("/api/file", { headers: H, data: { path: "Trip.page", text: "rows:\n  - [{note: notes/trip.md}]\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type("trip.md");
  await expect(page.getByTestId("palette").getByText("trip", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-editor.cm-focused")).toBeVisible();

  // values, each in its own section's scope; an error is a mark with the reason; the network is closed
  await expect(exprs(page)).toHaveText(["60", "85", "1", "⚠", "undefined"]);
  await expect(exprs(page).nth(3)).toHaveAttribute("title", /nope is not defined/);
  await expect(page.locator(".cm-content .cm-inline-code", { hasText: "plain" })).toBeVisible(); // ordinary code is untouched

  // the caret in a formula shows its source; leaving shows the value again
  await exprs(page).first().click();
  await expect(page.locator(".cm-content")).toContainText("= note.budget - section.cost");
  await expect(exprs(page)).toHaveCount(4);

  // editing a property recomputes what depends on it (vim is on in the fixture: insert mode via `A`)
  await page.locator(".cm-line", { hasText: "cost:: 40" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("A");
  await page.keyboard.type("0");
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-line", { hasText: "cost:: 400" })).toBeVisible();
  await page.locator(".cm-line", { hasText: "nights:: 3" }).click();
  await expect(exprs(page).first()).toHaveText("-300");

  // the value as a thing: freeze replaces the formula by its text
  await exprs(page).nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: /Freeze as text/ }).click();
  await expect(page.locator(".cm-line", { hasText: "Inherited: 85 open" })).toBeVisible();

  // the reading view (a note block on a page) computes too
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type("Trip.page");
  await expect(page.getByTestId("palette").getByText("Trip", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const read = page.locator(".page-pane, .atlas-block").locator("code.expr");
  await expect(read.first()).toHaveText("-300");
  await expect(read.last()).toHaveText("undefined");
});

test("an expression that never ends is stopped, and the others still compute", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/loop.md", text: "# Loop\nn:: 2\nstuck `= (() => { for (;;) {} })()`\n\nfine `= section.n * 21`\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type("loop.md");
  await expect(page.getByTestId("palette").getByText("loop", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(exprs(page).first()).toHaveAttribute("title", /took longer than 3 s/, { timeout: 8000 });
  // the one that was waiting behind it is asked again in the new worker
  await expect(exprs(page).nth(1)).toHaveText("42", { timeout: 8000 });
});
