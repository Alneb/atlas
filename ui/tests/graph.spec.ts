import { test, expect } from "@playwright/test";
import { openFile } from "./open";

test("graph of notes: counts, local neighbourhood of the active note, hover shows the note", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "hubbard.md");
  await expect(page.locator(".cm-content")).toContainText("Energy");
  await page.keyboard.press("Meta+Shift+G");
  const pane = page.locator(".graph-pane");
  await expect(pane.locator(".meta")).toHaveText(/[1-9]\d* notes · [1-9]\d* links/); // loaded, not the initial 0
  const links = Number((await pane.locator(".meta").textContent())!.match(/(\d+) links/)![1]);
  expect(links).toBeGreaterThanOrEqual(4); // related→hubbard, journal→hubbard, l1/l2→Topic
  // Orphans off: only notes with a link, the links all kept
  const all = Number((await pane.locator(".meta").textContent())!.match(/(\d+) notes/)![1]);
  await pane.getByLabel("Orphans").uncheck();
  await expect(pane.locator(".meta")).toHaveText(new RegExp(` notes · ${links} links`));
  expect(Number((await pane.locator(".meta").textContent())!.match(/(\d+) notes/)![1])).toBeLessThan(all);
  await pane.getByLabel("Orphans").check();
  // Local: hubbard.md and the two notes that link to it
  await pane.getByLabel("Local (active note)").check();
  await expect(pane.locator(".meta")).toHaveText("3 notes · 2 links");
  // the layout settles around the centre: hovering it finds a note
  await page.waitForTimeout(1500);
  const box = (await page.getByTestId("graph-canvas").boundingBox())!;
  let found = false;
  for (let dx = -60; dx <= 60 && !found; dx += 6) {
    for (let dy = -60; dy <= 60 && !found; dy += 6) {
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      found = await pane.locator(".tip").isVisible();
    }
  }
  expect(found).toBe(true);
  await expect(pane.locator(".tip")).toContainText("click to open");
});
