import { test, expect } from "@playwright/test";

// A rendered note hydrates only once the file index is in: before it, `![[x.svg]]` can only be guessed beside the
// note, and the guess was fetched (a 404) on every first Home load whose log embeds a picture kept elsewhere.
const H = { "x-atlas": "1" };
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#345"/></svg>`;

test("Home's log picture kept in another folder is fetched from there, never guessed beside the log", async ({ page, request }) => {
  const r = await request.post("/api/capture", { headers: H, data: { text: "early probe" } });
  const { path } = await r.json();
  const before = ((await (await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text.replace(/^.*early probe.*\n?/m, "");
  const dir = path.slice(0, path.lastIndexOf("/"));
  const kept = `${dir}/early-probe-files/early-probe.svg`;
  await request.put(`/api/raw?path=${encodeURIComponent(kept)}`, { headers: H, data: SVG });
  await request.post("/api/capture", { headers: H, data: { text: "Early\n![[early-probe.svg]]" } });

  const guessed: string[] = [];
  page.on("request", (q) => { if (decodeURIComponent(q.url()).includes(`${dir}/early-probe.svg`)) guessed.push(q.url()); });
  try {
    await page.goto("/");
    const card = page.locator(".card", { has: page.getByRole("heading", { name: /log/i }) });
    const img = card.locator("li.log-entry", { hasText: "Early" }).locator("img.embed-img");
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    expect(guessed).toEqual([]);
  } finally {
    await request.post(`/api/fs/trash?path=${encodeURIComponent(`${dir}/early-probe-files`)}`, { headers: H });
    await request.put("/api/file", { headers: H, data: { path, text: before } });
  }
});
