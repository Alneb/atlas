import { test, expect } from "@playwright/test";
import { read } from "../src/lib/base-filter";

// A Base's filter expression read back as a condition (lib/base-filter.ts). Pure.
test("quoted values and property names are read, an unknown escape kept as written", () => {
  expect(read('status == "done"')).toEqual({ prop: "status", op: "is", values: ["done"] });
  expect(read('note["due date"].isEmpty()')).toEqual({ prop: "due date", op: "empty", values: [] });
  expect(read('file.hasTag("a", "b\\"c")')).toEqual({ prop: "file.tags", op: "hasTag", values: ["a", 'b"c'] });
  // JSON knows no `\x`: the text stays as typed rather than the whole read throwing
  expect(read('path == "C:\\x"')).toEqual({ prop: "path", op: "is", values: ["C:\\x"] });
  expect(read('note["a\\x"] != "y"')).toEqual({ prop: "a\\x", op: "isNot", values: ["y"] });
});
