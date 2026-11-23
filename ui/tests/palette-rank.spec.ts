import { test, expect } from "@playwright/test";

// A name typed in the command bar finds the note first: a command whose letters are only strewn over its title follows
// the files named by it, and a note leads the pictures and scripts named like it.
const H = { "x-atlas": "1" };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("typing a note's name puts the note first, before scattered commands and its pictures", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/Spin-statistics theorem.md", text: "# Spin-statistics theorem\n" } });
  for (const name of ["spin-statistics-jost.png", "spin-statistics-path.png"])
    expect((await request.put(`/api/raw?path=${encodeURIComponent(`notes/attachments/${name}`)}`, { headers: H, data: Buffer.from(PNG, "base64") })).ok()).toBeTruthy();
  await request.put("/api/file", { headers: H, data: { path: "notes/note_spin_statistics.py", text: "print(1)\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const bar = page.getByTestId("palette");
  await page.keyboard.press("F1");
  await expect(bar.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("spin");
  await expect(bar.locator(".item.sel .title")).toHaveText("Spin-statistics theorem", { timeout: 10_000 });
  await expect(bar.locator(".section").first()).toHaveText(/files/i);
});
