import { test, expect } from "@playwright/test";

test("TSV opens as a sortable, filterable table", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("sweep.tsv");
  await expect(page.getByTestId("palette").getByText("sweep.tsv").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".table-pane");
  await expect(pane.locator("th", { hasText: "E_kin" })).toBeVisible();
  await expect(pane.getByText("3 rows · 3 columns · tab-separated")).toBeVisible();
  const firstU = () => pane.locator("tbody tr:not(.spacer)").first().locator("td").nth(1).textContent();
  expect(await firstU()).toBe("3.0");
  await pane.locator("th", { hasText: "Z" }).click(); // ascending Z → U = 5.5 first
  expect(await firstU()).toBe("5.5");
  await pane.getByPlaceholder("Filter rows…").fill("4.0");
  await expect(pane.locator("tbody tr:not(.spacer)")).toHaveCount(1);
});

test("table cells: click selects, arrows move, shift extends, Ctrl+C copies TSV", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("sweep.tsv");
  await expect(page.getByTestId("palette").getByText("sweep.tsv").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".table-pane");
  await pane.locator("td", { hasText: "3.0" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(pane.locator("td.cursor")).toHaveText("-1.25");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(pane.locator("td.sel")).toHaveCount(2);
  await page.keyboard.press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("-1.25\n-0.90");
});

test("Plot: numeric columns against each other, with a hover readout", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("sweep.tsv");
  await expect(page.getByTestId("palette").getByText("sweep.tsv").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".table-pane");
  await pane.getByRole("button", { name: "Plot" }).click();
  const plot = pane.locator(".plot svg");
  // defaults by shape: U is not sorted, so X = the row number; Y = the first column that varies
  await expect(plot).toHaveAttribute("aria-label", "U against row");
  await pane.getByLabel("X column").click();
  await page.getByRole("option", { name: "U", exact: true }).click();
  await pane.getByRole("button", { name: "E_kin", exact: true }).click();
  await expect(plot).toHaveAttribute("aria-label", "E_kin against U");
  await expect(plot.locator("path")).toHaveCount(1);
  await pane.getByRole("button", { name: "Z", exact: true }).click(); // a second Y
  await expect(plot.locator("path")).toHaveCount(2);
  await plot.hover({ position: { x: 80, y: 100 } }); // nearest point: the smallest U
  await expect(pane.locator("figcaption .at")).toHaveText("at U = 3");
  await expect(pane.locator("figcaption")).toContainText("E_kin = -1.25");
});
