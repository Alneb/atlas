import { test, expect } from "@playwright/test";

// Keys typed right after a shortcut belong to the pane it opens — even while that pane's code is
// still loading (they used to land in Today's capture box), and with a second shortcut in between.
test("typing straight after Ctrl+Shift+F (then Ctrl+Shift+H) fills the search box, not the capture", async ({ page }) => {
  await page.goto("/");
  const home = () => page.request.get("/api/file?path=Home.md", { headers: { "x-atlas": "1" } }).then((r) => r.json()).then((j) => j.text as string);
  const before = await home();
  await page.keyboard.press("Control+Shift+F");
  await page.keyboard.type("hubbard", { delay: 5 });
  await page.keyboard.press("Control+Shift+h");
  await expect(page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("hubbard");
  await expect(page.getByLabel("Replace with")).toHaveValue("");
  await expect(page.getByTestId("capture")).toHaveValue("");
  expect(await home()).toBe(before); // no key reached the home note (vim would read them as commands)
});
