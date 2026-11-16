import { test, expect } from "@playwright/test";

// The core's notices on the page (lib/notices.ts): a notice's buttons on its toast, a press posted to the core's
// router (POST /api/notices/action, answered as a press on the system's notification), a later notice of the same id
// replacing the toast, and `withdraw` — by the notice's id or its subject (a task done) — taking it away.
test("a notice's toast shows its buttons, a press reaches the core, and a withdrawal takes it away", async ({ page }) => {
  let toPage: ((m: string) => void) | undefined;
  await page.routeWebSocket("**/api/events", (ws) => {
    const server = ws.connectToServer();
    server.onMessage((m) => ws.send(m));
    toPage = (m) => ws.send(m);
  });
  const pressed: unknown[] = [];
  await page.route("**/api/notices/action", async (r) => { pressed.push(r.request().postDataJSON()); await r.fulfill({ status: 204 }); });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect.poll(() => !!toPage).toBe(true);
  const say = (e: object) => toPage!(JSON.stringify(e));

  const subject = "notes/Report.md#^t3f9a";
  say({ type: "notify", title: "Send the report", body: "Due today", source: "plan", id: "plan:t1", open: "notes/Report.md", subject,
    actions: [{ id: "done", label: "Done" }, { id: "atlas:snooze:10", label: "Snooze 10 min" }] });
  const t = page.locator(".toast", { hasText: "Send the report" });
  await expect(t.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(t.getByRole("button", { name: "Snooze 10 min" })).toBeVisible();
  await t.hover(); // its time stops while looked at
  await page.screenshot({ path: test.info().outputPath("notice-toast-light.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: test.info().outputPath("notice-toast-dark.png") });

  await t.getByRole("button", { name: "Snooze 10 min" }).click();
  await expect.poll(() => pressed).toEqual([{ action: "atlas:snooze:10", source: "plan", notice: "plan:t1", open: "notes/Report.md" }]);
  await expect(t).toHaveCount(0, { timeout: 2000 }); // a press closes it

  // the same id again replaces it in place; the task done withdraws it by its subject
  say({ type: "notify", title: "Send the report", body: "Due in 1 h", id: "plan:t1", subject, actions: [{ id: "done", label: "Done" }] });
  say({ type: "notify", title: "Send the report", body: "Due now", id: "plan:t1", subject, actions: [{ id: "done", label: "Done" }] });
  await expect(page.locator(".toast", { hasText: "Send the report" })).toHaveCount(1);
  await expect(page.locator(".toast", { hasText: "Send the report" })).toContainText("Due now");
  say({ type: "notify", title: "3 new mails", id: "mail:inbox" });
  say({ type: "withdraw", id: subject });
  await expect(page.locator(".toast", { hasText: "Send the report" })).toHaveCount(0);
  await expect(page.locator(".toast", { hasText: "3 new mails" })).toBeVisible();
  say({ type: "withdraw", id: "mail:inbox" });
  await expect(page.locator(".toast", { hasText: "3 new mails" })).toHaveCount(0);
});
