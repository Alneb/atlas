// node --test plugins/beta/paperless/pl.test.mjs — the plugin's logic on cut-down copies of Paperless-ngx's answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateOf, downloadPath, fileName, forAgent, listPath, namesOf, rowOf, sendable, subOf, thingOf, uploadRequest } from "./pl.js";

const NAMES = {
  tags: namesOf({ results: [{ id: 1, name: "tax" }, { id: 2, name: "2026" }] }),
  correspondents: namesOf({ results: [{ id: 7, name: "City Power" }] }),
  types: namesOf({ results: [{ id: 3, name: "Invoice" }] }),
};
const DOC = { id: 12, title: "Electricity March", created: "2026-03-02", correspondent: 7, document_type: 3, tags: [1, 2, 9],
  archive_serial_number: 41, page_count: 2, original_file_name: "scan_0012.pdf", archived_file_name: "2026-03-02 Electricity March.pdf",
  content: "Amount due 42.10", added: "2026-03-03T09:00:00Z" };

test("a document becomes a row: its numbers named, an unknown tag left out", () => {
  const r = rowOf(DOC, NAMES);
  assert.deepEqual([r.title, r.date, r.correspondent, r.type, r.tags], ["Electricity March", "2026-03-02", "City Power", "Invoice", ["tax", "2026"]]);
  assert.equal(subOf(r), "City Power · Invoice · 2026-03-02");
  assert.equal(r.archived, true);
});

test("the date reads either version's field", () => {
  assert.equal(dateOf({ created: "2025-01-05T00:00:00+01:00" }), "2025-01-05");
  assert.equal(dateOf({ created_date: "2024-06-30" }), "2024-06-30");
  assert.equal(dateOf({}), "");
});

test("the list asks the newest first, its content cut, Paperless's search when there are words", () => {
  assert.equal(listPath(2), "/api/documents/?page=2&page_size=100&ordering=-created&truncate_content=true");
  assert.equal(listPath(1, " power bill "), "/api/documents/?page=1&page_size=100&ordering=-created&truncate_content=true&query=power%20bill");
});

test("the kept file: the archived PDF under its title, else the original's name, never a path", () => {
  const r = rowOf(DOC, NAMES);
  assert.equal(fileName(r), "Electricity March.pdf");
  assert.equal(downloadPath(r), "/api/documents/12/download/");
  const raw = rowOf({ ...DOC, title: "../../etc", archived_file_name: null, original_file_name: "a/b:c.docx" }, NAMES);
  assert.equal(fileName(raw), "a_b_c.docx");
  assert.equal(downloadPath(raw), "/api/documents/12/download/?original=true");
  assert.equal(fileName(rowOf({ id: 5, title: "", archived_file_name: "x.pdf" })), "document 5.pdf");
});

test("its note is asked of the catalog by its Paperless id, what Paperless says as the fields", () => {
  const t = thingOf(rowOf(DOC, NAMES), "https://docs.example.org");
  assert.deepEqual(t, {
    kind: "paperwork", ids: { paperless: "12" }, why: "asked",
    fields: { title: "Electricity March", date: "2026-03-02", correspondent: "City Power", document_type: "Invoice", tags: ["tax", "2026"], paperless: "https://docs.example.org/documents/12/details" },
  });
});

test("an agent gets the fields, and the text only when it asked for one document", () => {
  const r = rowOf(DOC, NAMES);
  assert.equal(forAgent(r, "https://docs.example.org").text, undefined);
  assert.equal(forAgent(r, "https://docs.example.org", true).text, "Amount due 42.10");
  assert.equal(forAgent(r, "").url, null);
});

test("a file is sent as Paperless's upload form, titled by its name", () => {
  assert.deepEqual(uploadRequest("inbox/Power bill.March.pdf"), {
    path: "/api/documents/post_document/",
    init: { method: "POST", multipart: { file: "inbox/Power bill.March.pdf", field: "document", fields: { title: "Power bill.March" } } },
  });
  assert.equal(sendable("a/scan.PDF"), true);
  assert.equal(sendable("notes/idea.md"), false);
  assert.equal(sendable("folder/"), false);
});
