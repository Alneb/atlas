import { test, expect } from "@playwright/test";

// A capture's picture in the day's log is a thumbnail: the capture writes `![[x|160]]`, Home draws the line with its time in a column and the picture
// small, and the log note keeps the entry and its picture on the timeline, the markdown under the caret quieted.
const H = { "x-atlas": "1" };
const TALL = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="900"><rect width="400" height="900" fill="#345"/></svg>`;

test("a captured picture is a thumbnail on Home and in the log note; the log line is drawn as a timeline", async ({ page, request }) => {
  const r = await request.post("/api/capture", { headers: H, data: { text: "thumb probe #shots" } });
  const { path } = await r.json();
  // the day's log as it was before this spec's two captures: put back at the end, or every later page with Home asks
  // for the picture this spec removes (a 404 in the console of the specs after it — gate)
  const before = ((await (await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text.replace(/^.*thumb probe #shots.*\n?/m, "");
  const dir = path.slice(0, path.lastIndexOf("/"));
  await request.put(`/api/raw?path=${encodeURIComponent(`${dir}/thumb-probe.svg`)}`, { headers: H, data: TALL });
  await request.put(`/api/raw?path=${encodeURIComponent(`${dir}/thumb-probe.txt`)}`, { headers: H, data: "a\n".repeat(400) });
  await request.post("/api/capture", { headers: H, data: { text: "Screen\n![[thumb-probe.svg]]\n![[thumb-probe.txt]]" } });
  const text = await (await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json();
  expect(text.text).toContain("![[thumb-probe.svg|160]]\n  ![[thumb-probe.txt]]");

  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const card = page.locator(".card", { has: page.getByRole("heading", { name: /log/i }) });
  const entry = card.locator("li.log-entry", { hasText: "Screen" });
  await expect(entry.locator(".log-time")).toHaveText(/^\d{1,2}:\d{2}$/);
  await expect(card.locator("li.log-entry", { hasText: "thumb probe" }).locator(".tag")).toHaveText("#shots");
  const img = entry.locator("img.embed-img");
  await expect(img).toBeVisible();
  const box = (await img.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(141);
  expect(box.height).toBeLessThanOrEqual(141);
  await expect(entry.locator(".file-card")).toBeVisible(); // the text file a card, not its 400 lines

  await card.locator(".log-open").click();
  const more = page.locator(".cm-line.cm-log-more");
  await expect(more.first().locator(".cm-embed-image")).toBeVisible();
  const ibox = (await more.first().locator(".cm-embed-image").boundingBox())!;
  expect(ibox.height).toBeLessThanOrEqual(161);
  await expect(page.locator(".cm-log-more .cm-embed-chip", { hasText: "thumb-probe.txt" })).toBeVisible(); // a chip, not the file
  // the caret on the entry: its `- ` shows quietly, the time stays in its column
  const line = page.locator(".cm-line.cm-log-entry", { hasText: "Screen" });
  await line.click({ position: { x: (await line.boundingBox())!.width - 4, y: 8 } });
  await expect(line.locator(".cm-log-src")).toHaveText("- ");
  await expect(line.locator(".cm-log-time")).toBeVisible();

  for (const f of ["thumb-probe.svg", "thumb-probe.txt"]) await request.post(`/api/fs/trash?path=${encodeURIComponent(`${dir}/${f}`)}`, { headers: H });
  await request.put("/api/file", { headers: H, data: { path, text: before } });
});
