// The helper through the SDK's harness, CUPS faked (`harness.exec`): no job ever reaches a real printer.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import "./helper";

const ok = (stdout: string) => ({ status: 0, stdout, stderr: "" });

beforeEach(() => {
  harness.reset();
  harness.exec = (program, args) => {
    if (program === "lpstat") return ok(args[0] === "-p" ? "printer Office is idle.  enabled since x\nprinter Lab is idle.\n" : "system default destination: Lab\n");
    return ok("request id is Lab-42 (1 file(s))\n");
  };
});

test("the printers, the default first, read in English", async () => {
  assert.deepEqual(await harness.call("printers"), [{ value: "Lab", label: "Lab (default)" }, { value: "Office", label: "Office" }]);
  assert.ok(harness.ran.every((r) => r.locale === "C"));
});

test("a file prints as it is, with the settings", async () => {
  const r = await harness.call("print", { path: "papers/a.pdf", settings: { printer: "Office", copies: 2, sides: "two-sided (long edge)", media: "A4", options: "-o fit-to-page" } });
  assert.deepEqual(r, { job: "Lab-42", printed: "papers/a.pdf", printer: "Office" });
  assert.deepEqual(harness.ran.at(-1)?.args, ["-d", "Office", "-n", "2", "-o", "sides=two-sided-long-edge", "-o", "media=A4", "-o", "fit-to-page", "./papers/a.pdf"]);
});

test("a note prints as its exported PDF", async () => {
  let asked: any;
  harness.api = (verb, path, body) => {
    if (verb === "GET" && path === "/api/plugins") return [{ id: "export", settings: { engine: "xelatex" } }];
    asked = { path, body };
    return { written: ["exports/n.tex", "exports/n.pdf"] };
  };
  const r = await harness.call("print", { path: "notes/n.md", settings: {} });
  assert.equal(asked.path, "/api/plugins/export/helper");
  assert.deepEqual(asked.body.params, { path: "notes/n.md", to: "pdf", settings: { engine: "xelatex" } });
  assert.equal(r.printed, "exports/n.pdf");
  assert.deepEqual(harness.ran.at(-1)?.args, ["./exports/n.pdf"]);
});

test("a note without the Export plugin, and a machine without CUPS, say so", async () => {
  harness.api = () => [];
  await assert.rejects(harness.call("print", { path: "notes/n.md", settings: {} }), /Export plugin/);
  harness.exec = () => { throw new Error('exec: "lp" is not installed on this machine (not on the PATH)'); };
  await assert.rejects(harness.call("print", { path: "a.pdf", settings: {} }), /lp is not installed on the machine running Atlas \(CUPS\)/);
});

test("lp's refusal is the answer", async () => {
  harness.exec = () => ({ status: 1, stdout: "", stderr: "lp: The printer or class does not exist.\n" });
  await assert.rejects(harness.call("print", { path: "a.pdf", settings: { printer: "Gone" } }), /does not exist/);
});
