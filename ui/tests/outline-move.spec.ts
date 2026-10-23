import { test, expect } from "@playwright/test";

// Dragging a heading in the Outline moves its whole section (subsections included) in the note;
// Alt+Up/Down on a heading does the same past its neighbour. One edit, so one undo.
const H = { "x-atlas": "1" };
const NOTE = "# Plan\n\n## One\nfirst\n\n### Deep\ninside one\n\n## Two\nsecond\n\n## Three\nthird\n";

test("a heading dragged in the outline takes its section along; Alt+arrows move it too", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/move-me.md", text: NOTE } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("move-me.md");
  await expect(page.getByTestId("palette").getByText("move-me", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("inside one");
  await page.keyboard.press("Meta+o");
  const head = (name: string) => page.locator(".outline .head", { hasText: name });
  await expect(page.locator(".outline .head")).toHaveText(["Plan", "One", "Deep", "Two", "Three"]);
  const text = () => page.evaluate(() => (window as any).__atlas.editor().text as string);

  // One (with Deep) dropped on the lower half of Three: it goes to the end, the final newline stays
  const box = (await head("Three").boundingBox())!;
  await head("One").dragTo(head("Three"), { targetPosition: { x: 20, y: box.height - 3 } });
  await expect(page.locator(".outline .head")).toHaveText(["Plan", "Two", "Three", "One", "Deep"]);
  expect(await text()).toBe("# Plan\n\n## Two\nsecond\n\n## Three\nthird\n\n## One\nfirst\n\n### Deep\ninside one\n");

  // dropped inside itself: nothing moves
  await head("One").dragTo(head("Deep"), { targetPosition: { x: 20, y: 3 } });
  await expect(page.locator(".outline .head")).toHaveText(["Plan", "Two", "Three", "One", "Deep"]);

  // the keys: One up past Three, twice → first; a third time stops under its parent
  await head("One").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Alt+ArrowUp");
  await expect(page.locator(".outline .head")).toHaveText(["Plan", "One", "Deep", "Two", "Three"]);
  await expect(head("One")).toBeFocused();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.locator(".outline .head")).toHaveText(["Plan", "Two", "One", "Deep", "Three"]);
  expect(await text()).toBe("# Plan\n\n## Two\nsecond\n\n## One\nfirst\n\n### Deep\ninside one\n\n## Three\nthird\n");
});
