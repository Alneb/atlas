import { test, expect, type Route } from "@playwright/test";
import { realpathSync, writeFileSync } from "node:fs";
import { WS } from "../playwright.config";

// A local vault's mirror, v2 (docs/design/DESIGN-mirror-v2.md): every file is read and saved in this vault, whether the
// server answers or not; the core asks the server for a lease before each write (mirror_guard.rs, unreachable here:
// written here only) and splices the live rooms to it. The interface only shows the link, the `⇄ host` chip. The
// server's answers to the page (through the bridge) are played by the page's own routes.
const H = { "x-atlas": "1" };
const LIST = `${WS}-vaults.toml`;
const MIRROR = "https://mirror.invalid/v/ws/";
const NOTE = "notes/mirrored.md";

test.afterEach(() => writeFileSync(LIST, "")); // no other spec meets a mirror

async function open(page: import("@playwright/test").Page, up: boolean): Promise<{ mirrorFileCalls: () => number }> {
  writeFileSync(LIST, `[[vault]]\nname = "ws"\npath = ${JSON.stringify(realpathSync(WS))}\nlast_opened = 1\nmirror = "${MIRROR}"\n`);
  let calls = 0;
  const answer = (route: Route, body: unknown) => route.fulfill({ status: up ? 200 : 502, contentType: "application/json", body: JSON.stringify(up ? body : { error: "bad gateway" }) });
  await page.route("**/remote/mirror.invalid/v/ws/api/workspace", (r) => answer(r, { name: "ws" }));
  // nothing of the note goes to the server through the page any more
  await page.route("**/remote/mirror.invalid/v/ws/api/file**", (r) => { calls++; return answer(r, { error: "not asked" }); });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("mirrored.md");
  await expect(page.getByTestId("palette").getByText("mirrored", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  return { mirrorFileCalls: () => calls };
}

test("a note of a mirrored vault is read and saved here, the chip saying it is live with the server", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: NOTE, text: "# Here\n\nthe local copy\n" } });
  const m = await open(page, true);
  await expect(page.locator(".cm-content")).toContainText("the local copy");
  await expect(page.locator(".mirror-chip")).toHaveText("⇄ mirror.invalid");
  await expect(page.locator(".mirror-chip")).toHaveAttribute("title", /This device writes the note/);

  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("GkA"); // the test vault has vim on: the end of "the local copy"
  await page.keyboard.type(" typed on the desktop");
  await expect.poll(async () => (await (await request.get(`/api/file?path=${NOTE}`, { headers: H })).json()).text, { timeout: 15_000 })
    .toBe("# Here\n\nthe local copy typed on the desktop\n");
  expect(m.mirrorFileCalls()).toBe(0);
});

test("with the mirror not answering, the note is saved here all the same and the chip says so", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: NOTE, text: "# Same\n\nin step\n" } });
  const m = await open(page, false);
  await expect(page.locator(".mirror-chip")).toHaveText("⇄ mirror.invalid · offline");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("GkA");
  await page.keyboard.type(" offline");
  await expect.poll(async () => (await (await request.get(`/api/file?path=${NOTE}`, { headers: H })).json()).text, { timeout: 15_000 })
    .toBe("# Same\n\nin step offline\n");
  await expect(page.getByText(/is not answering/)).toHaveCount(0); // no held banner: nothing waits for the server
  expect(m.mirrorFileCalls()).toBe(0);
});
