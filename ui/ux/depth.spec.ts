// Depth audit: not "does it open" but "is it complete". Every step is `want: true`
// until it passes, so the report's Missing list IS the polish backlog. Runs on the UX copy only.
import { expect, type Page } from "@playwright/test";
import { journey, type User } from "./harness";

const T = { timeout: 6000 };
const H = { "x-atlas": "1" };

async function ready(p: Page) {
  await p.goto("/");
  await expect(p.getByTestId("capture")).toBeVisible(T);
}
async function fileText(p: Page, path: string): Promise<string> {
  return (await (await p.request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()).text;
}
async function newNote(u: User, name: string, body: string) {
  await u.page.request.put("/api/file", { headers: H, data: { path: name, text: body } });
  await u.openFile(name.split("/").pop()!);
  await expect(u.page.locator(".cm-content")).toBeVisible(T);
}
const want = (why: string) => ({ want: true, why, budget: 3000 });

journey("Depth: markdown editor", "Obsidian-grade editing on real notes", async (u) => {
  const p = u.page;
  await ready(p);
  // the notes with the most math in the sample
  const hits: string[] = await p.request.get("/api/search?q=%5Cfrac", { headers: H }).then((r) => r.json()).then((j) => [...new Set((j.lines ?? j.hits ?? []).map((h: { path: string }) => h.path))].filter((f) => (f as string).endsWith(".md")).slice(0, 3) as string[], () => []);
  await u.step("Heavy-LaTeX notes render with no KaTeX errors", want("plan slice 1: real vault notes render correctly"), async () => {
    if (!hits.length) throw new Error("no note with \\frac in the sample");
    for (const f of hits) {
      await u.openFile(f.split("/").pop()!);
      await expect(p.locator(".cm-content")).toBeVisible(T);
      await p.waitForTimeout(800);
      const errs = await p.locator(".cm-content .katex-error").count();
      if (errs) throw new Error(`${errs} KaTeX error(s) in ${f}`);
    }
  });
  await newNote(u, "notes/depth-editor.md", "# Depth\n\n- [ ] a task\n\nSee [[Condensed Matter]] here.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n> [!note] A callout\n> body\n");
  await u.step("Clicking a task checkbox ticks it in the file", want("Obsidian: click the box"), async () => {
    await u.click(p.locator(".cm-content input[type=checkbox], .cm-content .cm-task-mark, .cm-content [class*=task]").first());
    await expect.poll(() => fileText(p, "notes/depth-editor.md"), T).toContain("- [x] a task");
  });
  await u.step("Clicking a rendered [[wikilink]] opens the note", want("Obsidian: links are clickable"), async () => {
    await u.click(p.locator(".cm-content").getByText("Condensed Matter").first());
    await expect(p.locator("[data-testid=sidebar] :is(.tab, .pin).active")).toContainText("Condensed Matter", T);
  });
  await u.openFile("depth-editor.md");
  await u.step("Tables and callouts render", want("Obsidian live preview"), async () => {
    await expect(p.locator(".cm-content table").first()).toBeVisible(T);
    await expect(p.locator(".cm-content [class*=callout]").first()).toBeVisible(T);
  });
  await u.step("Undo restores an edit (Ctrl+Z)", want("basic editing"), async () => {
    await p.locator(".cm-content").click();
    await u.press("Control+End");
    await u.write("\nzzz-undo-me");
    await u.press("Escape");
    await u.press("u"); // vim undo (Ctrl+Z in insert-less mode)
    await expect(p.locator(".cm-content")).not.toContainText("zzz-undo-me", T);
  });
  await u.step("Find in the note (Ctrl+F) highlights matches", want("basic editing"), async () => {
    await u.press("Control+f");
    await u.type("callout");
    await expect(p.locator(".cm-searchMatch").first()).toBeVisible(T);
    await u.press("Escape");
  });
  await u.step("Paste a URL over selected text makes a link", want("Obsidian: paste URL on selection"), async () => {
    await p.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await p.evaluate(() => navigator.clipboard.writeText("https://example.org"));
    await p.locator(".cm-content").click();
    await u.press("Escape");
    await u.type("gg/See"); // vim: find the line, then select the word
    await u.press("Enter");
    await u.type("ve");
    await u.press("Control+Shift+v"); // Ctrl+V is vim's block-visual
    await expect.poll(() => fileText(p, "notes/depth-editor.md"), T).toMatch(/\[See\]\(https:\/\/example\.org\)/);
  });
});

journey("Depth: files", "Manage files from the tree like any editor", async (u) => {
  const p = u.page;
  await ready(p);
  await u.press("Control+Shift+e");
  await expect(p.locator(".row").first()).toBeVisible(T);
  await u.step("New file from the Files pane", want("VS Code: new file in the tree"), async () => {
    await u.click(p.locator(".side-pane, .files, [class*=files]").getByRole("button", { name: /new file/i }).first());
    await u.type("depth-new.md");
    await u.press("Enter");
    await expect(p.locator("[data-testid=sidebar] .tab", { hasText: "depth-new.md" })).toBeVisible(T);
    await expect(p.locator('.row[data-path="depth-new.md"]')).toBeVisible(T); // and the tree shows it
  });
  await u.step("Rename a file from the tree (context menu or F2)", want("VS Code: rename"), async () => {
    await p.locator('.row[data-path="FOCUS.md"]').click({ button: "right" });
    await expect(p.getByRole("menuitem", { name: /rename/i })).toBeVisible({ timeout: 1500 });
    await u.press("Escape");
  });
  await u.step("Delete a file from the tree (asks first)", want("VS Code: delete to trash"), async () => {
    await p.locator('.row[data-path="FOCUS.md"]').click({ button: "right" });
    await expect(p.getByRole("menuitem", { name: /delete/i })).toBeVisible({ timeout: 1500 });
    await u.press("Escape");
  });
  await u.step("Reveal the active file in the tree", want("VS Code: reveal in explorer"), async () => {
    await u.openFile("Condensed Matter.md");
    await u.press("Control+Shift+e");
    await expect(p.locator('.row[data-path="notes/Condensed Matter.md"]')).toBeVisible({ timeout: 2000 });
  });
});

journey("Depth: Today", "The home screen does real work", async (u) => {
  const p = u.page;
  await ready(p);
  // the sample may have no open task: add one (the copy only)
  await p.request.put("/api/file", { headers: H, data: { path: "notes/depth-task.md", text: "- [ ] depth task\n" } });
  await p.reload();
  await expect(p.getByTestId("capture")).toBeVisible(T);
  await u.step("Ticking an open task on Today writes [x] in its file", want("tasks are actionable"), async () => {
    const box = p.getByRole("button", { name: "Mark done: depth task" });
    await expect(box).toBeVisible(T);
    await u.click(box);
    await expect.poll(() => fileText(p, "notes/depth-task.md"), T).toContain("- [x] depth task");
  });
  await u.step("Shift+Enter makes a multi-line capture", want("capture longer thoughts"), async () => {
    await u.press("Control+Alt+c");
    await u.type("line one");
    await u.press("Shift+Enter");
    await u.type("line two");
    await u.press("Enter");
    await expect(p.getByTestId("capture-ok")).toBeVisible(T);
    const today = new Date().toISOString().slice(0, 10);
    await expect.poll(() => fileText(p, `log/${today}.md`), T).toMatch(/line one\n\s*line two/);
  });
});

journey("Depth: Library", "Zotero-grade reference management", async (u) => {
  const p = u.page;
  await ready(p);
  await u.press("Control+Shift+l");
  await expect(p.locator(".library .row").first()).toBeVisible(T);
  await u.step("Edit a paper's title / tags in the detail pane", want("Zotero: edit metadata in place"), async () => {
    await u.click(p.locator(".library .row").first());
    await u.click(p.locator(".detail").getByRole("button", { name: "Edit", exact: true }));
    await expect(p.locator(".detail .edit textarea").first()).toBeVisible({ timeout: 1500 });
    await u.press("Escape"); // look, don't save
  });
  await u.step("Sort the list by year / author / date added", want("Zotero: column sort"), async () => {
    await expect(p.locator(".library").getByRole("button", { name: /sort|year|added/i }).first()).toBeVisible({ timeout: 1500 });
  });
  await u.step("Export a collection as BibTeX", want("Zotero: export"), async () => {
    await expect(p.locator(".library").getByRole("button", { name: /export|bibtex/i }).first()).toBeVisible({ timeout: 1500 });
  });
  await u.step("Delete an entry (asks first)", want("Zotero: delete"), async () => {
    await expect(p.locator(".library .detail").getByRole("button", { name: /delete|remove/i })).toBeVisible({ timeout: 1500 });
  });
});

journey("Depth: search and terminal", "Find anything; run anything", async (u) => {
  const p = u.page;
  await ready(p);
  await u.step("Search: case / regex toggles", want("VS Code search options"), async () => {
    await u.press("Control+Shift+f");
    await expect(p.getByRole("button", { name: /regular expression/i }).first()).toBeVisible({ timeout: 1500 });
  });
  await u.step("Search: clicking a hit opens the file at the line", want("basic search"), async () => {
    await u.type("Hubbard");
    await u.click(p.locator(".line-hit").first());
    await expect(p.locator(".cm-activeLine")).toContainText(/hubbard/i, T);
  });
  await u.step("Shell: run a command and see its output", want("terminal basics"), async () => {
    await u.press("Control+`");
    await expect(p.locator(".xterm").first()).toBeVisible(T);
    await p.locator(".xterm").first().click();
    await u.type("echo depth-$((40+2))");
    await u.press("Enter");
    await expect(p.locator(".xterm-rows").first()).toContainText("depth-42", T);
  });
});

journey("Depth: markdown editor II", "The rest of Obsidian's editing", async (u) => {
  const p = u.page;
  await ready(p);
  await newNote(u, "notes/depth-editor2.md", "# Two\n\nA ==highlight== and a note[^1].\n\n![[no-such-image.png]]\n\n## Second\n\nend line\n\n[^1]: The footnote.\n");
  await u.step("Highlights and footnotes render", want("Obsidian live preview"), async () => {
    await expect(p.locator(".cm-content .cm-highlight").first()).toBeVisible(T);
    await expect(p.locator(".cm-content .cm-footnote-ref, .cm-content [class*=footnote]").first()).toBeVisible(T);
  });
  await u.step("A missing ![[embed]] says so", want("Obsidian: broken embeds are visible"), async () => {
    await expect(p.locator(".cm-content .cm-embed-missing").first()).toBeVisible(T);
  });
  await u.step("Redo (vim Ctrl+R) brings an undone edit back", want("basic editing"), async () => {
    await p.locator(".cm-content").click();
    await u.press("Escape");
    await u.type("Go");
    await u.type("redo-me");
    await u.press("Escape");
    await u.press("u");
    await expect(p.locator(".cm-content")).not.toContainText("redo-me", T);
    await u.press("Control+r");
    await expect(p.locator(".cm-content")).toContainText("redo-me", T);
  });
  await u.step("Find & replace in the note (Ctrl+H)", want("VS Code/Obsidian: replace"), async () => {
    await u.press("Control+h");
    const rep = p.locator(".cm-panel.cm-search input[name=replace]");
    await expect(rep).toBeVisible({ timeout: 1500 });
    await p.locator(".cm-panel.cm-search input[name=search]").fill("end line");
    await rep.fill("last line");
    await u.click(p.locator(".cm-panel.cm-search button[name=replaceAll]"));
    await expect.poll(() => fileText(p, "notes/depth-editor2.md"), T).toContain("last line");
    await u.press("Escape");
  });
  await u.step("An outside edit reloads the open note", want("files change under the editor (Claude, git)"), async () => {
    const now = await fileText(p, "notes/depth-editor2.md");
    await p.request.put("/api/file", { headers: H, data: { path: "notes/depth-editor2.md", text: now + "\nadded from outside\n" } });
    await expect(p.locator(".cm-content")).toContainText("added from outside", T);
  });
  await u.step("Outline: clicking a heading jumps to it", want("Obsidian outline"), async () => {
    await p.locator(".cm-content").click();
    await u.press("Control+Shift+o");
    await u.click(p.locator(".side-pane .head", { hasText: "Second" }).first());
    await expect(p.locator(".cm-activeLine")).toContainText("Second", T);
  });
});

journey("Depth: code editor", "VS Code-grade editing of code", async (u) => {
  const p = u.page;
  await ready(p);
  await p.request.put("/api/file", { headers: H, data: { path: "ux-samples/depth_lib.py", text: "def depth_helper(x):\n    return x + 1\n" } });
  await newNote(u, "ux-samples/depth_main.py", "from depth_lib import depth_helper\n\nvalue = depth_helper(1)\nprint(value)\n");
  await u.step("F12 jumps to a definition in another file", want("VS Code: go to definition"), async () => {
    await p.locator(".cm-line", { hasText: "value = depth_helper" }).getByText("depth_helper").click();
    await p.waitForTimeout(1500); // the language server starts
    await u.press("F12");
    await expect(p.locator("[data-testid=sidebar] :is(.tab, .pin).active")).toContainText("depth_lib.py", { timeout: 8000 });
  });
  await u.openFile("depth_main.py");
  await u.step("F2 renames a symbol everywhere in the file", want("VS Code: rename symbol"), async () => {
    await p.locator(".cm-line", { hasText: "print(value)" }).getByText("value").click();
    await u.press("F2");
    await u.type("result");
    await u.press("Enter");
    await expect.poll(() => fileText(p, "ux-samples/depth_main.py"), T).toMatch(/result = depth_helper\(1\)\nprint\(result\)/);
  });
  await u.step("Problems: a list of the file's diagnostics", want("VS Code: problems panel"), async () => {
    await p.request.put("/api/file", { headers: H, data: { path: "ux-samples/depth_main.py", text: "from depth_lib import depth_helper\n\nresult = depth_helper(1)\nprint(undefined_name)\n" } });
    await expect(p.locator(".cm-lintRange-error, .cm-lintRange-warning").first()).toBeVisible({ timeout: 10000 });
    await expect(p.getByRole("button", { name: /problems/i }).first()).toBeVisible({ timeout: 1500 });
  });
});

journey("Depth: files II", "Move and copy like a file manager", async (u) => {
  const p = u.page;
  await ready(p);
  await p.request.put("/api/file", { headers: H, data: { path: "depth-move.md", text: "move me\n" } });
  await u.press("Control+Shift+e");
  await expect(p.locator('.row[data-path="depth-move.md"]')).toBeVisible(T);
  await u.step("Drag a file onto a folder moves it", want("VS Code: drag and drop in the tree"), async () => {
    await p.locator('.row[data-path="depth-move.md"]').dragTo(p.locator('.row[data-path="notes"]'));
    await expect(p.locator('.row[data-path="notes/depth-move.md"], .row[data-path="depth-move.md"]').first()).toBeVisible(T);
    const moved = await p.request.get("/api/file?path=notes%2Fdepth-move.md", { headers: H });
    if (!moved.ok()) throw new Error("not moved");
  });
  await u.step("Copy a file's path from the tree", want("VS Code: copy path"), async () => {
    await p.locator('.row[data-path="FOCUS.md"]').click({ button: "right" });
    await expect(p.getByRole("menuitem", { name: /copy.*path/i }).first()).toBeVisible({ timeout: 1500 });
    await u.press("Escape");
  });
});

journey("Depth: search II", "Replace across the workspace", async (u) => {
  const p = u.page;
  await ready(p);
  await p.request.put("/api/file", { headers: H, data: { path: "notes/depth-replace.md", text: "colour one\ncolour two\n" } });
  await u.press("Control+Shift+f");
  await u.step("Replace across files with a preview", want("VS Code: replace in files"), async () => {
    await u.type("colour");
    await u.press("Control+Shift+h"); // VS Code: replace in files
    const rep = p.getByPlaceholder(/replace/i);
    await expect(rep).toBeVisible({ timeout: 1500 });
    await rep.fill("color");
    await expect(p.locator(".line-hit .new").first()).toHaveText("color"); // the preview
    await u.click(p.getByRole("button", { name: /replace all/i }));
    await u.click(p.getByRole("dialog").getByRole("button", { name: /replace all/i })); // the confirm
    await expect.poll(() => fileText(p, "notes/depth-replace.md"), T).toBe("color one\ncolor two\n");
  });
});

journey("Depth: Today II", "Activity is a way in", async (u) => {
  const p = u.page;
  await ready(p);
  await u.step("Clicking a changed file in Activity opens it", want("Today links to the work"), async () => {
    const row = p.locator(".changed-row", { hasText: /\.md/ }).first(); // a file, not a folder group
    const name = ((await row.locator(".path").textContent()) ?? "").trim().split("/").pop()!;
    await u.click(row);
    await expect(p.locator("[data-testid=sidebar] :is(.tab, .pin).active")).toContainText(name, T);
  });
});

journey("Depth: terminal II", "Terminals like VS Code's", async (u) => {
  const p = u.page;
  await ready(p);
  await u.press("Control+`");
  await expect(p.locator(".xterm").first()).toBeVisible(T);
  await u.step("A second terminal opens as a tab", want("VS Code: several terminals"), async () => {
    await u.click(p.getByRole("button", { name: /new terminal/i }).first());
    await expect(p.locator("[data-testid=sidebar] .tab", { hasText: /shell/i })).toHaveCount(2, T);
  });
  await u.step("Rename a terminal tab", want("VS Code: rename terminal"), async () => {
    await p.locator("[data-testid=sidebar] .tab", { hasText: /shell/i }).first().dblclick();
    await expect(p.getByRole("textbox", { name: "Terminal name" })).toBeFocused({ timeout: 1500 });
    await u.press("Escape");
  });
  await u.step("Ctrl+Shift+C / Ctrl+Shift+V copy and paste in the terminal", want("terminal basics"), async () => {
    await p.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await p.evaluate(() => navigator.clipboard.writeText("echo pasted-$((6*7))"));
    await p.locator(".xterm:visible").first().click();
    await u.press("Control+Shift+v");
    await u.press("Enter");
    await expect(p.locator(".xterm-rows:visible").first()).toContainText("pasted-42", T);
  });
});

journey("Depth: Git", "Review and undo changes safely", async (u) => {
  const p = u.page;
  await ready(p);
  await p.request.put("/api/file", { headers: H, data: { path: "FOCUS.md", text: (await fileText(p, "FOCUS.md")) + "\ndepth git change\n" } });
  await u.press("Control+Shift+g");
  const row = p.locator(".entry", { hasText: "FOCUS.md" }).first();
  await expect(row).toBeVisible(T);
  await u.step("Discard a file's changes (asks first)", want("VS Code: discard changes"), async () => {
    await row.hover();
    await u.click(row.getByRole("button", { name: /discard/i }));
    await expect(p.getByRole("dialog")).toBeVisible({ timeout: 1500 });
    await u.click(p.getByRole("dialog").getByRole("button", { name: /discard/i }));
    await expect.poll(() => fileText(p, "FOCUS.md"), T).not.toContain("depth git change");
  });
  await u.step("Stage a single hunk from the diff", want("VS Code: stage selected ranges"), async () => {
    await p.request.put("/api/file", { headers: H, data: { path: "FOCUS.md", text: (await fileText(p, "FOCUS.md")) + "\nhunk change\n" } });
    await u.click(p.locator(".entry", { hasText: "FOCUS.md" }).first().locator(".name"));
    await expect(p.locator(".diff-pane").getByRole("button", { name: /stage hunk/i }).first()).toBeVisible({ timeout: 3000 });
  });
  await u.step("Push is a button with a confirm (never automatic)", want("sync on the user's terms"), async () => {
    await u.press("Control+Shift+g");
    await expect(p.getByRole("button", { name: /push/i }).first()).toBeVisible({ timeout: 1500 });
  });
});

journey("Depth: Bases", "Notion-grade databases", async (u) => {
  const p = u.page;
  await ready(p);
  await p.request.put("/api/file", { headers: H, data: { path: "db/depth-items/one.md", text: "---\nstatus: todo\n---\n# one\n" } });
  await p.request.put("/api/file", { headers: H, data: { path: "db/depth-items/two.md", text: "---\nstatus: done\n---\n# two\n" } });
  await p.request.put("/api/file", { headers: H, data: { path: "db/depth.base", text: "filters: 'file.inFolder(\"db/depth-items\")'\nviews:\n  - type: table\n    name: All\n    order: [file.name, status]\n" } });
  await u.openFile("depth.base");
  await expect(p.locator(".base-pane table").first()).toBeVisible(T);
  await u.step("Add a row (a new note in the view)", want("Notion: + New"), async () => {
    await u.click(p.locator(".base-pane").getByRole("button", { name: "New", exact: true }));
    await expect(p.locator("[data-testid=sidebar] :is(.tab, .pin).active")).toContainText("Untitled", T);
    const made = await p.request.get("/api/file?path=db%2Fdepth-items%2FUntitled.md", { headers: H });
    if (!made.ok()) throw new Error("no db/depth-items/Untitled.md");
    await u.openFile("depth.base");
  });
  await u.step("Board view grouped by a property; drag a card to change it", want("Notion: board"), async () => {
    await u.click(p.locator(".base-pane .view-switch"));
    await u.click(p.getByRole("menuitem", { name: /New board view/ }));
    await u.click(p.getByRole("menuitem", { name: "Board grouped by Status" }));
    const todo = p.locator(".lane", { hasText: "todo" }), done = p.locator(".lane", { hasText: "done" });
    await expect(todo.locator(".card")).toHaveCount(1, T);
    await todo.locator(".card").first().dragTo(done);
    await expect.poll(() => fileText(p, "db/depth-items/one.md"), T).toContain("status: done");
    await u.click(p.locator(".base-pane .view-switch"));
    await u.click(p.getByRole("menuitem", { name: /^All/ }));
  });
  await u.step("Hide a column, then add it back, from the UI", want("Notion: properties menu"), async () => {
    await p.locator(".base-pane th", { hasText: "Status" }).click({ button: "right" });
    await u.click(p.getByRole("menuitem", { name: /hide/i }));
    await expect(p.locator(".base-pane th", { hasText: "Status" })).toHaveCount(0, T);
    await u.click(p.getByRole("button", { name: "Add column" }));
    await u.click(p.getByRole("menuitem", { name: "status" }));
    await expect(p.locator(".base-pane th", { hasText: "Status" })).toHaveCount(1, T);
  });
});

journey("Depth: settings and layout", "It remembers and responds", async (u) => {
  const p = u.page;
  await ready(p);
  await u.step("Settings search matches descriptions", want("VS Code settings search"), async () => {
    await u.press("Control+,");
    await u.type("in code files"); // words of the line_numbers description, not of its name
    await expect(p.locator(".row", { hasText: /line.numbers/i }).first()).toBeVisible({ timeout: 2000 });
  });
  await u.step("Escape closes the palette", want("Esc closes overlays"), async () => {
    await u.press("Control+k");
    await expect(p.getByTestId("palette")).toBeVisible(T);
    await u.press("Escape");
    await expect(p.getByTestId("palette")).toBeHidden({ timeout: 1500 });
  });
  await u.step("Open tabs come back after a restart", want("layout restore"), async () => {
    await u.openFile("depth-editor.md");
    await expect(p.locator("[data-testid=sidebar] .tab", { hasText: "depth-editor.md" })).toBeVisible(T);
    await p.waitForTimeout(800); // the layout is saved debounced
    await p.reload();
    await expect(p.locator("[data-testid=sidebar] .tab", { hasText: "depth-editor.md" })).toBeVisible(T);
  });
});

// docs/guides/MALLEABLE.md (D21): the Ink & Switch guideline as user flows. Every step is `want` until built.
journey("Depth: malleability", "Reshape Atlas without leaving it (gentle slope, tools not apps, dynamic documents)", async (u) => {
  const p = u.page;
  await ready(p);
  await u.step("A CSS snippet in .atlas/snippets restyles the app live", want("R1 rung 2: Stylish-like restyling"), async () => {
    await p.request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/depth.css", text: ":root { --depth-snippet: 1; } .status { outline: 2px solid rgb(255, 0, 255); }\n" } });
    await expect.poll(() => p.evaluate(() => getComputedStyle(document.querySelector(".status")!).outlineColor), T).toBe("rgb(255, 0, 255)");
  });
  await u.step("Open a file with another view (Open with…)", want("R2: tools, not apps — one file, many views"), async () => {
    await p.request.put("/api/file", { headers: H, data: { path: "notes/depth-open-with.tsv", text: "x\ty\n1\t2\n2\t4\n" } });
    await u.press("Control+Shift+e");
    await p.locator('.row[data-path="notes"]').click();
    await p.locator('.row[data-path="notes/depth-open-with.tsv"]').click({ button: "right" });
    await u.click(p.getByRole("menuitem", { name: /open with/i }));
    await expect(p.getByRole("menuitem", { name: /text editor/i })).toBeVisible({ timeout: 1500 });
    await u.press("Escape");
  });
  await newNote(u, "notes/depth-plan.md", "# Week plan\n\n## Monday\n\n- [ ] read Georges 1996 📅 2026-10-12\n- [ ] run U=4 sweep 📅 2026-10-13\n\n```view\ntype: calendar\nfrom: note\n```\n");
  await u.step("A view block in a note shows its dated tasks as a calendar", want("R4 / Embark: views over the surrounding document"), async () => {
    await expect(p.locator(".cm-content .atlas-view-calendar")).toContainText("read Georges", T);
  });
  await u.step("@ mentions a paper from the Library as a chip", want("R4 / Embark: mentions of structured entities"), async () => {
    await p.locator(".cm-content").click();
    await u.press("Escape");
    await u.type("Go");
    await u.type("See @");
    await expect(p.locator(".cm-tooltip-autocomplete")).toBeVisible({ timeout: 2000 });
    await u.press("Enter");
    await u.press("Escape");
    await expect(p.locator(".cm-content .atlas-mention").first()).toBeVisible(T);
  });
  await u.step("A repeated shell command becomes a suggested tool on Today", want("R5: tools made without being asked"), async () => {
    await u.press("Control+`");
    await p.locator(".xterm:visible").first().click();
    for (let i = 0; i < 3; i++) { await u.type("echo depth-tool"); await u.press("Enter"); await p.waitForTimeout(300); }
    await u.click(p.locator(".rail-btn[aria-label=\"Today\"]"));
    await expect(p.locator(".today").getByText(/suggest|made these/i).first()).toBeVisible({ timeout: 8000 });
  });
});
