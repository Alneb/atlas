// What a PhD user does in a day, as journeys over a copy of their real workspace. `want: true` steps
// are things a user would reasonably expect (from the plan, the handout and their feedback) — when
// they fail the report lists them as MISSING, which is the backlog. Selectors are deliberately
// user-level (placeholders, roles, visible text) so the journeys survive refactors.
import { expect } from "@playwright/test";
import { journey } from "./harness";

const T = { timeout: 6000 };

journey("Morning check-in", "Open Atlas, see what matters today, jot a thought without losing focus", async (u) => {
  const p = u.page;
  await u.step("App opens on Today", { budget: 2500 }, async () => {
    await p.goto("/");
    await expect(p.getByTestId("capture")).toBeVisible(T);
  });
  await u.step("Capture a thought with math", { budget: 800 }, async () => {
    await u.press("Control+Alt+c");
    await u.type("Idea: compare $\\Sigma(i\\omega_n)$ tails between CDMFT and DCA");
    await u.press("Enter");
    await expect(p.getByTestId("capture-ok")).toBeVisible(T);
  });
  await u.step("The capture shows in today's log", {}, async () => {
    await expect(p.getByText("compare", { exact: false }).first()).toBeVisible(T);
  });
  await u.step("Open tasks are listed", {}, async () => {
    await expect(p.getByText("Open tasks")).toBeVisible(T);
  });
  await u.step("Browse earlier days' logs from Today (‹ ›)", { why: "daily notes: previous/next day" }, async () => {
    await u.click(p.getByRole("button", { name: "Previous day" }));
    await expect(p.getByRole("button", { name: "Next day" })).toBeVisible(T);
  });
});

journey("Lecture notes", "Start today's lecture note fast and write math the way Obsidian's LaTeX Suite does", async (u) => {
  const p = u.page;
  await p.goto("/");
  await expect(p.getByTestId("capture")).toBeVisible(T);
  await u.step("New lecture note (Ctrl+Alt+L, pick a course)", { budget: 2000 }, async () => {
    await u.press("Control+Alt+l");
    await expect(p.getByTestId("palette")).toBeVisible(T);
    await u.type("Quantum Matter");
    await p.getByTestId("palette-item").first().waitFor(T);
    await u.press("Enter");
    await expect(p.locator(".cm-content")).toBeVisible(T);
  });
  await u.step("The note is titled with the course's name", { why: "the title should read like the course, not its folder slug" }, async () => {
    await expect(p.locator(".cm-content")).toContainText("Quantum Matter", { timeout: 2000 });
  });
  // the user's own inline-math trigger (whatever expands to $…$ in their LaTeX Suite file)
  const trigger = await p.evaluate(async () => {
    const d = await (await fetch("/api/snippets", { headers: { "x-atlas": "1" } })).json();
    return /trigger:\s*["']([^"']+)["'],\s*replacement:\s*["']\$\$0\$["']/.exec(d.sources.join("\n"))?.[1] ?? "mk";
  });
  await u.step(`Write a heading and inline math via the snippet "${trigger}"`, { budget: 3000 }, async () => {
    await p.locator(".cm-content").click();
    await u.press("Control+End");
    await u.write(`\n## Green functions\nThe retarded ${trigger}`);
    await u.type("G");
    await expect(p.locator(".cm-content")).toContainText("$", T);
  });
  await u.step("Link a topic note with [[ completion", { budget: 2000 }, async () => {
    await u.press("Tab"); // leave the math (LaTeX Suite tabout)
    await u.write(" see [[Condensed");
    await expect(p.locator(".cm-tooltip-autocomplete")).toBeVisible(T);
    await u.press("Enter");
    await expect(p.locator(".cm-content")).toContainText("Condensed Matter", T);
  });
  await u.step("Cite a paper from the Library while writing (@author)", { budget: 1500 }, async () => {
    await u.write(" @hubbard");
    await expect(p.locator(".cm-tooltip-autocomplete li").first()).toBeVisible({ timeout: 2500 });
    await u.press("Enter");
    await expect(p.locator(".cm-content")).toContainText(/\[@\w+\]/, T);
  });
  await u.step("Insert a figure by pasting or a slash command", { want: false, budget: 1500 }, async () => {
    await u.write("\n/emb");
    await expect(p.locator(".cm-tooltip-autocomplete")).toContainText("Embed", T);
  });
});

journey("Find and connect notes", "Get to a topic note, see what belongs to it, follow the links", async (u) => {
  const p = u.page;
  await p.goto("/");
  await expect(p.getByTestId("capture")).toBeVisible(T);
  await u.step("Open a topic note with Ctrl+P", { budget: 1500 }, async () => {
    await u.openFile("Condensed Matter.md");
    await expect(p.locator(".cm-content")).toBeVisible(T);
  });
  await u.step("Its database (Base) lists the lectures", { budget: 3000 }, async () => {
    await expect(p.locator(".base-embed .base tbody tr").first()).toBeVisible({ timeout: 8000 });
  });
  await u.step("Linked mentions show who links here", {}, async () => {
    await expect(p.locator(".backlinks .head")).toContainText("Linked mentions", T);
  });
  await u.step("Unlinked mentions: where the topic is named but not linked", { budget: 1500 }, async () => {
    const head = p.locator(".backlinks .head");
    if (!(await p.locator(".backlinks .list").isVisible())) await u.click(head);
    await expect(p.locator(".backlinks .list")).toBeVisible(T); // count may be 0 on a well-linked vault
  });
  await u.step("Open a lecture from the table", { budget: 1500 }, async () => {
    await u.click(p.locator(".base-embed .base tbody .link").first());
    await expect(p.locator("[data-testid=sidebar] :is(.tab, .pin).active")).not.toContainText("Condensed Matter", T);
  });
  await u.step("Full-text search finds a physics term", { budget: 1500 }, async () => {
    await u.press("Control+Shift+f");
    await u.type("Hubbard");
    await expect(p.locator(".hit").first()).toBeVisible(T);
  });
  await u.step("See the notes as a graph (Ctrl+Alt+G)", { budget: 2500, why: "Obsidian graph view (plan slice 4)" }, async () => {
    await u.press("Control+Alt+g");
    await expect(p.locator(".graph-pane .meta")).toHaveText(/^[1-9]\d* notes · \d+ links$/, T);
    await p.waitForTimeout(1500); // let the layout settle for the screenshot
  });
  await u.openFile("Condensed Matter.md");
  await expect(p.locator(".base-embed .base tbody tr").first()).toBeVisible({ timeout: 8000 });
  if (!(await p.locator(".base-embed .base td.editable:not(.bool)").count())) {
    u.skip("Edit a property in a Base cell (Notion-style)", "the user's bases show only computed columns (formulas, file.*) — nothing to edit there; covered by tests/bases.spec.ts");
  } else {
    await u.step("Edit a property in a Base cell (Notion-style)", { budget: 1500, why: "inline-editable database cells (plan D19)" }, async () => {
      await p.locator(".base-embed .base td.editable:not(.bool)").first().click(); // a checkbox would toggle at once
      await expect(p.locator(".base-embed .cell-edit")).toBeVisible(T);
      await u.press("Escape"); // look, don't touch
    });
  }
});

journey("Read a paper", "Find a paper in the library, read it, take notes, cite it", async (u) => {
  const p = u.page;
  await p.goto("/");
  await expect(p.getByTestId("capture")).toBeVisible(T);
  await u.step("Open the Library (Ctrl+Shift+L)", { budget: 1500 }, async () => {
    await u.press("Control+Shift+l");
    await expect(p.locator(".library .row").first()).toBeVisible(T);
  });
  await u.step("Search by author/topic", { budget: 800 }, async () => {
    await p.getByPlaceholder(/Search title/).click();
    await u.type("hubbard");
    await expect(p.locator(".library .row").first()).toBeVisible(T);
  });
  await u.step("Open a paper's PDF", { budget: 3000 }, async () => {
    await p.getByPlaceholder(/Search title/).fill("");
    const withPdf = p.locator(".library .row", { has: p.locator(".flag.pdf") }).first();
    await u.click(withPdf);
    await u.click(p.locator(".detail").getByRole("button", { name: /Open PDF/ }));
    await expect(p.locator(".pdf-pane .page, .pdf-pane canvas").first()).toBeVisible({ timeout: 10000 });
  });
  await u.step("Copy its \\cite", {}, async () => {
    await u.press("Control+Shift+l");
    await u.click(p.locator(".detail").getByRole("button", { name: "\\cite" }));
  });
  await u.step("Drop a PDF into the Library to add it", { budget: 15_000, why: "Zotero: drag-and-drop import" }, async () => {
    await u.press("Control+Shift+l");
    // a real PDF of the sample (already in the library: it must be recognised, not duplicated)
    const hits: string[] = await p.request.get("/api/search?q=.pdf", { headers: { "x-atlas": "1" } }).then((r) => r.json()).then((j) => j.files);
    const pdf = hits.find((f) => f.startsWith("refs/papers/"));
    if (!pdf) throw new Error("no PDF in the sample library");
    await p.evaluate(async (path) => {
      const blob = await (await fetch(`/api/raw?path=${encodeURIComponent(path)}`, { headers: { "x-atlas": "1" } })).blob();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], path.split("/").pop()!, { type: "application/pdf" }));
      const el = document.querySelector(".library")!;
      el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, pdf);
    await expect(p.locator(".toast").filter({ hasText: /Added|Already in the library/ }).first()).toBeVisible({ timeout: 15_000 });
  });
});

journey("Code and Claude", "Work on a physics script with real code intelligence, and hand a piece to Claude", async (u) => {
  const p = u.page;
  await p.goto("/");
  await expect(p.getByTestId("capture")).toBeVisible(T);
  await u.step("Open a Python script", { budget: 1500 }, async () => {
    await u.press("Control+p");
    await u.type(".py");
    await p.getByTestId("palette-item").first().waitFor(T);
    await u.press("Enter");
    await expect(p.locator(".cm-content")).toBeVisible(T);
  });
  await u.step("Hover a function for its docs (language server)", { budget: 6000 }, async () => {
    const call = p.locator(".cm-line", { hasText: /^\s*(def|import|from) / }).first();
    await call.hover({ position: { x: 60, y: 8 } });
    await expect(p.locator(".cm-tooltip-hover")).toBeVisible({ timeout: 8000 });
  });
  await u.step("LaTeX: the language server completes an environment", { budget: 6000, why: "texlab" }, async () => {
    await u.press("Control+p");
    await u.type(".tex");
    await p.getByTestId("palette-item").first().waitFor(T);
    await u.press("Enter");
    await expect(p.locator(".cm-content")).toBeVisible(T);
    await p.locator(".cm-content").click();
    await u.press("Control+End");
    await u.write("\n\\begin{equ");
    await expect(p.locator(".cm-tooltip-autocomplete")).toContainText(/equation/, { timeout: 8000 });
    await u.press("Escape");
  });
  await u.step("Open the Claude terminal (Ctrl+Alt+K)", { budget: 2500 }, async () => {
    await u.press("Control+Alt+k");
    await expect(p.locator(".xterm").first()).toBeVisible(T);
  });
  await u.step("Hide it again without closing (Ctrl+J)", {}, async () => {
    await u.press("Control+j");
    await expect(p.locator(".xterm").first()).toBeHidden(T);
  });
  await u.step("Send the selection to Claude (Ctrl+Alt+Enter)", { budget: 4000 }, async () => {
    await u.openFile("common.py");
    await expect(p.locator(".cm-content")).toBeVisible(T);
    await p.locator(".cm-line").nth(2).click();
    await u.press("Escape");
    await u.type("Vj");
    await p.waitForTimeout(400);
    await u.press("Control+Alt+Enter");
    await expect(p.locator(".xterm-rows").first()).toContainText(/@[^ ]*common\.py#L3-4/, { timeout: 15_000 });
  });
  await u.step("See which files changed in the file tree", { budget: 1500 }, async () => {
    await u.press("Control+Shift+e");
    await expect(p.locator(".row .glet, .row .gdot").first()).toBeVisible(T);
  });
});

journey("Simulation runs", "Find a run, read its parameters and table, compare sweeps", async (u) => {
  const p = u.page;
  await p.goto("/");
  await expect(p.getByTestId("capture")).toBeVisible(T);
  await u.step("Open Runs (Ctrl+Alt+R)", { budget: 2500 }, async () => {
    await u.press("Control+Alt+r");
    await expect(p.locator(".row").first()).toBeVisible({ timeout: 10000 });
  });
  await u.step("Open the run's main table", { budget: 2500 }, async () => {
    await u.click(p.locator(".row").first());
    await u.click(p.getByRole("button", { name: /Open table/ }));
    await expect(p.locator(".table-pane tbody tr").nth(1)).toBeVisible(T);
  });
  await u.step("Sort a column and copy cells", { budget: 1000 }, async () => {
    await u.click(p.locator(".table-pane th").nth(1));
    await u.click(p.locator(".table-pane td").nth(1));
    await u.press("Control+c");
  });
  await u.step("Plot a column against another", { budget: 1500, why: "quick plot from a run table (no Python round-trip)" }, async () => {
    await u.click(p.locator(".table-pane").getByRole("button", { name: "Plot" }));
    await expect(p.locator(".table-pane .plot svg path").first()).toBeVisible(T);
  });
});

journey("Make it mine without Claude", "Change how Atlas looks and behaves, and turn a recurring task into a button", async (u) => {
  const p = u.page;
  await p.goto("/");
  await expect(p.getByTestId("capture")).toBeVisible(T);
  await u.step("Open Settings (Ctrl+,)", { budget: 1500 }, async () => {
    await u.press("Control+,");
    await expect(p.getByRole("heading", { name: /Settings/i }).first()).toBeVisible(T);
  });
  await u.step("Find a setting by typing", { budget: 1000 }, async () => {
    await u.type("font");
    await expect(p.getByText(/font/i).first()).toBeVisible(T);
  });
  await u.step("Workspace scripts appear as commands in the palette", { budget: 1000 }, async () => {
    await u.press("Control+k");
    await u.type("refs.bib");
    await expect(p.getByTestId("palette-item").first()).toBeVisible(T);
    await u.press("Escape");
  });
  await u.step("See all commands and who added each script", { budget: 1500 }, async () => {
    await u.press("Control+Shift+k");
    await expect(p.locator(".commands .cmd").first()).toBeVisible(T);
    await expect(p.locator(".commands .origin").first()).toBeVisible(T);
  });
  await u.step("Create a new command from the UI", { budget: 2000 }, async () => {
    await u.click(p.getByRole("button", { name: "New command" }));
    await u.click(p.getByLabel("Title"));
    await u.type("Count my notes");
    await u.click(p.getByLabel("Command line"));
    await u.type("ls notes | wc -l");
    await u.click(p.locator(".commands form.new").getByRole("button", { name: "Create", exact: true }));
    await expect(p.locator(".commands .cmd", { hasText: "Count my notes" })).toBeVisible(T);
  });
  await u.step("Run it and read the output", { budget: 2000 }, async () => {
    const row = p.locator(".commands .cmd", { hasText: "Count my notes" });
    await u.click(row.getByRole("button", { name: "Run" }));
    await expect(row.locator(".out")).toHaveText(/\d+/, T);
  });
  await u.step("Give it a shortcut and use it", { budget: 2000 }, async () => {
    const row = p.locator(".commands .cmd", { hasText: "Count my notes" });
    await u.click(row.locator(".keys"));
    await u.press("Control+Alt+n");
    await expect(row.locator(".keys kbd")).toHaveCount(3, T);
    await u.press("Control+Alt+n");
    await expect(p.locator(".toast", { hasText: "Count my notes" })).toBeVisible(T);
  });
  await u.step("Schedule a command to run by itself (e.g. daily)", { budget: 2000, why: "automation without anyone at the keyboard" }, async () => {
    await u.click(p.getByRole("button", { name: "New command" }));
    await u.click(p.getByLabel("Title"));
    await u.type("Nightly note count");
    await u.click(p.getByLabel("Command line"));
    await u.type("ls notes | wc -l");
    await u.click(p.getByLabel("Schedule"));
    await u.type("daily 03:00");
    await u.click(p.locator(".commands form.new").getByRole("button", { name: "Create", exact: true }));
    await expect(p.locator(".commands .cmd", { hasText: "Nightly note count" }).locator(".sched")).toContainText("daily 03:00", T);
  });
});
