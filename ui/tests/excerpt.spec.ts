import { test, expect } from "@playwright/test";
import { excerptOf } from "../src/lib/excerpt";

// A tile's text: the note's body, never its properties, never half a line.
test("a note's properties are left out", () => {
  expect(excerptOf("---\ntags: [a]\n---\n\n# Title\nbody\n", true)).toBe("# Title\nbody");
});

test("a head cut mid-line loses that line, unless it is all there is", () => {
  expect(excerptOf("one\ntwo\nthr", false)).toBe("one\ntwo");
  expect(excerptOf("a single long lin", false)).toBe("a single long lin");
  expect(excerptOf("one\ntwo", true)).toBe("one\ntwo");
});

test("properties longer than the head give nothing, not half of them", () => {
  expect(excerptOf("---\ntitle: x\nauthors: [a, b, c", false)).toBe("");
});

test("Windows line ends and a byte-order mark", () => {
  expect(excerptOf("﻿---\r\na: 1\r\n---\r\ntext\r\nmore\r\n", true)).toBe("text\nmore");
});
