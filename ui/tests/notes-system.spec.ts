import { test, expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// The generic pieces of a note system (docs/design/NOTES-SYSTEM.md): a review queue kept in the notes'
// own properties, next actions, typed links, a tree by a property — and the starter kit built on them.
const H = { "x-atlas": "1" };
const put = (page: Page, path: string, text: string) => page.request.put("/api/file", { headers: H, data: { path, text } });
const read = (page: Page, path: string) => page.request.get(`/api/file?path=${path}`, { headers: H }).then((r) => r.json()).then((j) => String(j.text ?? ""));

async function openFile(page: Page, q: string) {
  await page.keyboard.press("Control+p");
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(q);
  await expect(palette.getByText(shownName(q), { exact: true }).first()).toBeVisible(); // as the palette names it (no .page)
  await page.keyboard.press("Enter");
}

test("review: one note at a time; each answer is a property written to the note", async ({ page }) => {
  await put(page, "inbox/alpha.md", "---\ntype: fleeting\n---\nAn idea about **bath fitting**.\n");
  await put(page, "inbox/beta.md", "---\ntype: fleeting\n---\nAsk Ana about the cluster.\n");
  await put(page, "Inbox.page", "title: Inbox\nrows:\n  - [{view: review, filters: 'type == \"fleeting\"'}]\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "Inbox.page");

  const review = page.getByTestId("review");
  await expect(review.locator(".count")).toHaveText("1 of 2");
  await expect(review.locator(".title")).toHaveText("alpha");
  await expect(review.locator(".body")).toContainText("bath fitting");

  // Later: comes back in 2 days, and the gap doubles
  await review.getByRole("button", { name: /Later/ }).click();
  await expect(review.locator(".title")).toHaveText("beta");
  await expect(review.locator(".count")).toHaveText("1 of 1");
  await expect.poll(() => read(page, "inbox/alpha.md")).toMatch(/review: "?\d{4}-\d{2}-\d{2}"?[\s\S]*review_interval: "?4"?/);

  // by keyboard: Keep as… gives the note a type, and it leaves the queue for good
  await review.focus();
  await page.keyboard.press("k");
  const palette = page.getByTestId("palette");
  await palette.getByText("atomic", { exact: true }).click();
  await expect(review.getByText("Nothing is waiting for review.")).toBeVisible();
  await expect.poll(() => read(page, "inbox/beta.md")).toMatch(/review: "?done"?/);
  const beta = await read(page, "inbox/beta.md");
  expect(beta).toMatch(/type: "?atomic"?/);
  expect(beta).toContain("Ask Ana about the cluster."); // the note's text is untouched
});

test("next actions, a tree by `up`, and typed backlinks come from the notes' own properties", async ({ page }) => {
  await put(page, "proj/Thesis.md", "---\ntype: project\nstate: active\n---\n# Thesis\n- [ ] ask for the template 📅 2026-10-20\n");
  await put(page, "proj/Paper.md", "---\ntype: project\ndue: 2026-11-01\nup: \"[[Thesis]]\"\n---\n- [x] outline\n- [ ] write the intro\n- [ ] figures\n");
  await put(page, "proj/Someday.md", "---\ntype: project\nstart: 2999-01-01\nup: \"[[Thesis]]\"\n---\n- [ ] not yet\n");
  await put(page, "Work.page", "title: Work\nrows:\n  - [{view: list, from: next-actions, filters: 'type == \"project\"', title: Next actions}]\n  - [{view: tree, by: up, filters: 'type == \"project\"', title: Projects}]\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "Work.page");

  // one row per project: its first open task, the dated one first; a project that starts later is not shown
  const rows = page.locator(".atlas-block .list li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("ask for the template");
  await expect(rows.nth(0)).toContainText("Thesis");
  await expect(rows.nth(1)).toContainText("write the intro");
  await expect(rows.nth(1)).toContainText("2026-11-01"); // the note's due date stands in for the task's

  // the tree nests notes under the note their `up` names
  const tree = page.locator(".atlas-block .tree");
  await expect(tree.locator("> ul > li")).toHaveCount(1);
  await expect(tree.locator("> ul > li > .row .title")).toHaveText("Thesis");
  await expect(tree.locator("ul ul .title")).toHaveText(["Paper", "Someday"]);
  await tree.getByRole("button", { name: "Collapse Thesis" }).click();
  await expect(tree.locator("ul ul")).toHaveCount(0);

  // on the parent note, backlinks say which notes point to it and as what
  await tree.locator(".title", { hasText: "Thesis" }).click();
  const bl = page.locator(".backlinks");
  await expect(bl).toBeVisible();
  if (!(await bl.locator(".list").isVisible())) await bl.locator(".head").click();
  await expect(bl.locator(".typed .rel")).toHaveText("up");
  await expect(bl.locator(".typed .chip")).toHaveText(["Paper", "Someday"]);
});

test("the starter kit adds only missing files after a confirm; a note from a template; quick-open creates a note", async ({ page }) => {
  await put(page, "Next.page", "# mine\ntitle: My own next page\nrows:\n  - [tasks]\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");

  await page.keyboard.press("Meta+e");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("Starter kit");
  await palette.getByText("Starter kit: add the note system's files").click();
  await expect(palette.getByText(".atlas/pages/Next.page", { exact: true })).toBeVisible();
  await expect(palette.locator(".item, [role=option]", { hasText: "Next.page" })).toContainText("kept as it is");
  expect(await read(page, "templates/project.md")).toBe(""); // listed, nothing written yet
  await palette.getByText(/Add the \d+ missing files/).click();
  await expect(page.locator(".cm-content")).toContainText("The four kinds of notes");
  await expect.poll(() => read(page, "templates/project.md")).toContain("type: project");
  expect(await read(page, "Next.page")).toContain("My own next page"); // an existing file is never replaced…
  expect(await read(page, ".atlas/pages/Next.page"), "…nor doubled in the kit's own folder").toBe("");
  // the kit's pages go to .atlas/pages/, out of the vault's root, and its links still find them
  expect(await read(page, ".atlas/pages/Projects.base")).toContain("type");
  const listed = (await (await page.request.get("/api/files", { headers: H })).json()) as string[];
  expect(listed, "the core lists .atlas/pages/, so links and quick open find the pages").toContain(".atlas/pages/Projects.base");
  await expect(page.locator(".cm-content .is-unresolved"), "[[Inbox.page|Inbox]] in Start here resolves").toHaveCount(0);

  // New note from a template: the template is filled in
  await page.keyboard.press("Meta+n");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await palette.getByText("Project", { exact: true }).click(); // the list says it readably (templateLabel)
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("Bath fit");
  await palette.getByText("Create “Bath fit”").click();
  await expect(page.locator(".cm-content")).toContainText("Done when:");
  // "make sure that markdowns files are created in the corresponding folders": the kit's note is in
  // the notes folder, and a note made from it goes beside it — nothing lands in the vault's root
  expect(await read(page, "notes/Start here.md")).toContain("The four kinds of notes");
  expect(await read(page, "Start here.md")).toBe("");
  expect(await read(page, "Bath fit.md")).toBe("");
  const made = await read(page, "notes/Bath fit.md");
  expect(made).toMatch(/type: project\ncreated: \d{4}-\d{2}-\d{2}/);
  expect(made).toContain("# Bath fit");

  // quick open: a name that matches nothing offers to create the note
  await page.keyboard.press("Control+p");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("Zeta idea qq");
  await palette.getByText("Create note “Zeta idea qq”").click();
  await expect(page.getByTestId("sidebar").locator(".tab.active", { hasText: "Zeta idea qq" })).toBeVisible();
});
