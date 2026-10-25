import { test, expect } from "@playwright/test";

// Atlas's own templates (docs/guides/TEMPLATES.md): a template's {{prompt:…}} questions are asked after the
// name, together in one form (a choice as a list, a date as a date), and its values, filters and blocks fill the note.
test("a template asks its questions after the name and fills values, filters and blocks", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await request.put("/api/file", { headers: H, data: { path: "templates/meeting.md", text: "---\ntype: meeting\nwith: {{prompt:Who | link}}\nkind: {{prompt:Kind | choice:weekly,ad hoc}}\nwhen: {{prompt:When | date}}\n---\n# {{title}} — {{prompt:Who}}\n\nAbout: {{prompt:Topic | default:anything}}\n{{#if day}}Day: {{day:dddd}}{{/if}}\n{{cursor}}\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  await page.keyboard.press("Meta+n");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await palette.getByText("Meeting", { exact: true }).click(); // a template is listed by its label (templateLabel)
  await page.keyboard.type("Sync with Ada");
  await palette.getByText("Create “Sync with Ada”").click();
  // the questions together, in one form, by their own words; a choice as a list, a date as a date
  const form = page.getByRole("dialog", { name: "“Sync with Ada”" });
  await form.getByLabel("Who").fill("Ada Lovelace");
  await form.getByLabel("Topic").fill("the DMFT fit");
  await expect(form.getByLabel("Kind")).toHaveValue("weekly");
  await form.getByLabel("Kind").selectOption("ad hoc");
  await form.getByLabel("When").fill("2026-11-02");
  await form.getByRole("button", { name: "Create" }).click();
  await expect(page.locator(".cm-content")).toContainText("About: the DMFT fit");
  const made = await (await request.get("/api/file?path=" + encodeURIComponent("notes/Sync with Ada.md"), { headers: H })).json() as { text: string };
  expect(made.text).toContain("with: [[Ada Lovelace]]");
  expect(made.text).toContain("# Sync with Ada — Ada Lovelace");
  expect(made.text).toContain("kind: ad hoc\nwhen: 2026-11-02\n");
  expect(made.text).toMatch(/Day: (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/);
});
