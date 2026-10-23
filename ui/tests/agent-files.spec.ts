import { test, expect } from "@playwright/test";

// "completely separate claude notes from the rest of the notes … and this includes the links system":
// the agent's files (editor.index_exclude, by default docs/memory) are in the file tree only — not in
// search, quick open, `[[` completion or a link by name — unless the Search pane's switch asks.
const H = { "x-atlas": "1" };

test("the agent's files are found only when the Search pane is asked to include them", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "docs/memory/zebra-agent.md", text: "# Agent memory\n\nquagga-token in a session log\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/zebra-mine.md", text: "# Mine\n\nquagga-token in my note, see [[zebra-agent]]\n" } });
  // quick open and [[ completion ask the same endpoint by file name
  const names = async (agent: boolean) => (await (await request.get(`/api/search?q=zebra${agent ? "&agent=true" : ""}`, { headers: H })).json()).files as string[];
  expect(await names(false)).toEqual(["notes/zebra-mine.md"]);
  expect((await names(true)).sort()).toEqual(["docs/memory/zebra-agent.md", "notes/zebra-mine.md"]);

  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+Shift+F");
  const pane = page.locator(".dv-groupview .side-pane").first();
  await pane.locator("input").first().fill("quagga-token");
  await expect(pane.locator(".hit-file")).toHaveCount(1);
  await expect(pane.locator(".hit-file")).toContainText("zebra-mine");
  await pane.getByRole("button", { name: "Include the agent's files" }).click();
  await expect(pane.locator(".hit-file")).toHaveCount(2);

  // a link by name from my note does not land on the agent's file
  await page.keyboard.press("Control+p");
  await page.keyboard.type("zebra");
  const palette = page.getByTestId("palette");
  await expect(palette.getByText("zebra-mine", { exact: true }).first()).toBeVisible();
  await expect(palette.getByText("zebra-agent", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("quagga-token in my note");
  await expect(page.locator(".cm-content .is-unresolved", { hasText: "zebra-agent" })).toBeVisible();
});
