import { test, expect } from "@playwright/test";
import { isLinkedFile, missingPages } from "../src/lib/linked-pages";

// A drawing over a PDF links to its pages (memory project_paper_core.md): only the pages with no file yet are drawn,
// each once, and their files are never kept.
test("linked PDF pages: the ones to draw, once each; their files never saved", () => {
  const page = (id: string, n: number, extra: object = {}) => ({ type: "image", fileId: id, customData: { atlasPage: { file: "papers/x.pdf", page: n } }, ...extra });
  const els = [page("atlas-page-1a-1", 1), page("atlas-page-1a-1", 1), page("atlas-page-1a-2", 2), page("atlas-page-1a-3", 3, { isDeleted: true }),
    { type: "image", fileId: "abc123" }, { type: "freedraw" }];
  expect(missingPages(els, { "atlas-page-1a-2": {} })).toEqual([{ id: "atlas-page-1a-1", file: "papers/x.pdf", page: 1 }]);
  expect(isLinkedFile("atlas-page-1a-1")).toBe(true);
  expect(isLinkedFile("abc123")).toBe(false);
});
