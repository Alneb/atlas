import { test, expect } from "@playwright/test";

// The terminal (vertical tabs): the button shows / hides the panel; the sidebar
// says hidden/shown truthfully; one click docks it right or bottom.
test("terminal: button shows/hides, hidden state is live, dock right and back", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // the Terminal heading of the tab list is always there, with the panel's buttons
  const btn = page.getByTestId("sidebar").locator(".group-head", { hasText: "Terminal" }).getByRole("button", { name: /the terminal panel/ });
  const term = page.locator(".xterm").first();
  await btn.click();
  await expect(term).toBeVisible();
  await btn.click(); // visible → hide
  await expect(term).toBeHidden();
  const sidebar = page.getByTestId("sidebar");
  await sidebar.getByRole("button", { name: "Show the terminal panel" }).click();
  await expect(term).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Show the terminal panel" })).toHaveCount(0); // the button follows
  await sidebar.getByRole("button", { name: "Dock terminal on the right" }).click();
  await expect.poll(async () => (await term.boundingBox())!.height).toBeGreaterThan(500); // full height = right
  await sidebar.getByRole("button", { name: "Dock terminal at the bottom" }).click();
  await expect.poll(async () => (await term.boundingBox())!.height).toBeLessThan(500);
});

// each order in a test of its own: a fresh window (a reload would bring the first order's tabs back)
for (const order of [["Meta+j", "Meta+Shift+F"], ["Meta+Shift+F", "Meta+j"]]) {
  test(`the terminal spans the bottom, under the side panel, whichever was opened first (${order.join(" then ")})`, async ({ page }) => {
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    for (const key of order) { await page.keyboard.press(key); await page.waitForTimeout(500); }
    await expect(page.locator(".side-pane").first()).toBeVisible();
    await expect(page.locator(".xterm").first()).toBeVisible();
    const files = await box(".side-pane"), term = await box(".xterm");
    expect(term.x, "the terminal starts under the side panel, at the window's left").toBeLessThan(files.x + files.width - 20);
    expect(files.y + files.height, "the side panel ends above the terminal").toBeLessThanOrEqual(term.y + 2);
  });
}

// "if i close the main editor tab and then open it the whole layout gets a bit crazy": with no
// editor left, the next one goes back between the two tool panels, which keep their sizes
test("closing the last editor tab and opening one keeps the layout", async ({ page }) => {
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (const key of ["Meta+Shift+F", "Meta+j"]) { await page.keyboard.press(key); await page.waitForTimeout(500); }
  const before = { files: await box(".side-pane"), term: await box(".xterm") };
  await page.getByText("Finish the GW notes.").click();
  await page.keyboard.press("Control+w");
  await expect(page.locator(".dv-tab", { hasText: "Today" })).toHaveCount(0);
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("Home (your home");
  await page.getByTestId("palette").getByText("Home (your home document)").first().waitFor();
  await page.keyboard.press("Enter");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.waitForTimeout(400);
  const files = await box(".side-pane"), term = await box(".xterm"), today = await box(".atlas-pane-page");
  expect(Math.abs(files.width - before.files.width), "the side panel keeps its width").toBeLessThan(12);
  expect(Math.abs(term.height - before.term.height), "the terminal keeps its height").toBeLessThan(12);
  expect(today.x, "the editor is right of the side panel").toBeGreaterThanOrEqual(files.x + files.width - 2);
  expect(today.y + today.height, "the editor is above the terminal").toBeLessThanOrEqual(term.y + 2);
  expect(term.x, "the terminal still spans the window").toBeLessThan(files.x + files.width - 20);
  // docking right and back keeps the shape too
  const sidebar = page.getByTestId("sidebar");
  await sidebar.getByRole("button", { name: "Dock terminal on the right" }).click();
  await expect.poll(async () => (await box(".xterm")).height).toBeGreaterThan(500);
  await sidebar.getByRole("button", { name: "Dock terminal at the bottom" }).click();
  await expect.poll(async () => (await box(".xterm")).x).toBeLessThan(files.x + files.width - 20);
});
