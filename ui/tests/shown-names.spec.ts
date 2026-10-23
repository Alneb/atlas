import { test, expect } from "@playwright/test";
import { keepExt, shownName, shownPath } from "../src/lib/paths";

// Names outside the file explorers: a text note without its extension, any other file with it.

test("a note is named without its extension, every other file with it", () => {
  expect(shownName("notes/hubbard.md")).toBe("hubbard");
  expect(shownName("v1.2 notes.md")).toBe("v1.2 notes");
  expect(shownName("a.txt")).toBe("a");
  expect(shownName("Home.page")).toBe("Home");
  expect(shownName("papers/x/paper.pdf")).toBe("paper.pdf");
  expect(shownName("draw/2026-10-17-032446.excalidraw")).toBe("2026-10-17-032446.excalidraw");
  expect(shownName("draw/x.excalidraw.md")).toBe("x.excalidraw.md");
  expect(shownName("figs/dot.png")).toBe("dot.png");
  expect(shownName("code/run.py")).toBe("run.py");
  expect(shownName(".bashrc")).toBe(".bashrc");
  expect(shownPath("notes/hubbard.md")).toBe("notes/hubbard");
  expect(shownPath("papers/paper.pdf")).toBe("papers/paper.pdf");
});

test("a rename typed without a note's extension keeps it", () => {
  expect(keepExt("notes/hubbard.md", "hubbard2")).toBe("hubbard2.md");
  expect(keepExt("hubbard.md", "x.md")).toBe("x.md");
  expect(keepExt("paper.pdf", "thesis.pdf")).toBe("thesis.pdf"); // the extension was shown: as typed
});
