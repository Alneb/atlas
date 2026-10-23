import { test, expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// "I also would like previews in links and in the left panel list of tabs" / "also no previews on
// hover": resting the pointer on a [[link]], on a [text](note.md) link, or on a tab in the left bar
// shows what it leads to; moving away, a click or a key hides it.
const H = { "x-atlas": "1" };

async function openNote(page: Page, name: string) {
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
}

test("links and left-bar tabs preview what they lead to", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/peek.md", text: "# Peek\n\nSee [[hubbard]] and [the related](sub/related.md) and [the web](https://example.org/x).\n\nLast line.\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openNote(page, "peek.md");
  const content = page.locator(".cm-content:visible").first();
  await content.getByText("Last line.").click(); // the caret away from the links: they are drawn as links
  const card = page.getByTestId("hover-preview");

  await content.locator(".cm-hmd-internal-link", { hasText: "hubbard" }).hover();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Energy"); // hubbard.md, rendered
  await page.mouse.move(5, 880);
  await expect(card).toBeHidden();

  await content.locator(".cm-link", { hasText: "the related" }).hover();
  await expect(card).toContainText("See the");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();

  await content.locator(".cm-link", { hasText: "the web" }).hover();
  await expect(card).toContainText("example.org");
  await page.mouse.move(5, 880);

  // a tab in the left bar
  await openNote(page, "hubbard.md");
  await expect(page.locator(".cm-content:visible").first()).toContainText("Energy");
  await page.getByTestId("sidebar").locator(".tab", { hasText: "peek" }).hover();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Last line.");
  await page.getByTestId("sidebar").locator(".tab", { hasText: "peek" }).click();
  await expect(card).toBeHidden();
});

// "the hover works but only for pure text or images, not pages such as settings, or pdfs": any tab
// shows itself as last seen, even from the background (its pane is detached, not gone).
test("a tab of any kind previews itself: Settings from the background", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Settings");
  await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click();
  await expect(page.getByText("What Atlas can do").first()).toBeVisible();
  await openNote(page, "hubbard.md"); // Settings goes to the background
  await expect(page.locator(".cm-content:visible").first()).toContainText("Energy");
  const card = page.getByTestId("hover-preview");
  await page.getByTestId("sidebar").locator(".tab", { hasText: "Settings" }).hover();
  await expect(card.locator(".preview-mini")).toBeVisible();
  await expect(card).toContainText("What Atlas can do");
  // the copy is inert and carries no test ids or tab ids of its own
  await expect(card.locator("[data-testid], [data-tab-id]")).toHaveCount(0);
  await page.mouse.move(900, 880);
  await expect(card).toBeHidden();
});
