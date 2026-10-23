import { test, expect } from "@playwright/test";

// "ansi colors support": a file holding ANSI SGR codes is drawn in the
// terminal's palette with the codes hidden; on the line being edited they show (lib/editor/ansi.ts).
const H = { "x-atlas": "1" };
const LOG = "step 1 \x1b[31mERROR\x1b[0m bad input\n\x1b[1;32mok\x1b[0m done\n\x1b[38;5;208morange\x1b[0m and \x1b[38;2;10;20;30mrgb\x1b[0m\n\x1b[33mcarried\nover\x1b[0m plain\n";

test("ANSI codes in a log are hidden and their colours drawn; the edited line shows them", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "logs/run.log", text: LOG } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "logs/run.log" } } });
  const ed = page.locator(".dv-active-group .cm-editor");
  await expect(ed).toContainText("bad input");
  // the style as written, spaces out (the browser writes "color: var(--ansi-red);")
  const styled = (text: string) => ({ style: () => ed.locator(".cm-line span[style]", { hasText: new RegExp(`^${text}$`) }).first().evaluate((e) => (e.getAttribute("style") ?? "").replace(/\s/g, "")) });
  await expect.poll(styled("ERROR").style).toMatch(/color:var\(--ansi-red\)/);
  await expect.poll(styled("ok").style).toMatch(/color:var\(--ansi-green\).*font-weight:700/);
  await expect.poll(styled("orange").style).toMatch(/color:rgb\(255,135,0\)/);
  await expect.poll(styled("rgb").style).toMatch(/color:rgb\(10,20,30\)/);
  await expect.poll(styled("over").style).toMatch(/color:var\(--ansi-yellow\)/); // carried to the next line
  await expect(ed.locator(".cm-line").nth(2)).not.toContainText("[38;5"); // hidden where the caret is not
  await ed.locator(".cm-line", { hasText: "bad input" }).click();
  await expect(ed.locator(".cm-line", { hasText: "bad input" })).toContainText("[31m"); // shown where it is
});
