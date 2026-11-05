import { test, expect } from "@playwright/test";
import { expandAlign, firstRelation } from "../src/lib/math-align";

// `$$align` blocks (lib/math-align.ts): lines drawn as an align, each at its first relation outside brackets.

test("a $$align block becomes its environment, each line aligned at its first relation", () => {
  expect(expandAlign("align\na = b + c\nd \\leq e")).toBe("\\begin{align}\na &= b + c \\\\\nd &\\leq e\n\\end{align}");
  expect(expandAlign("align*\nx = 1")).toBe("\\begin{align*}\nx &= 1\n\\end{align*}");
  expect(expandAlign("align\n")).toBe("\\begin{align}\\end{align}"); // empty: nothing, no stray row
  expect(expandAlign("align\n= b\n+ c\nf(x) &= 2 \\\\")).toBe("\\begin{align}\n&= b \\\\\n&\\quad + c \\\\\nf(x) &= 2\n\\end{align}");
  expect(expandAlign("a = b")).toBe("a = b"); // not a block of that form
  expect(expandAlign("aligned\nx = 1")).toBe("aligned\nx = 1");
});

test("the first relation outside every bracket", () => {
  expect(firstRelation("a_{i=1} = b")).toBe(8);
  expect(firstRelation("\\left\\{ x = 1 \\right\\} \\approx y")).toBe(23);
  expect(firstRelation("\\langle a \\rangle \\leq b")).toBe(18);
  expect(firstRelation("x := 2")).toBe(2);
  expect(firstRelation("\\left( x \\right)")).toBe(-1);
});
