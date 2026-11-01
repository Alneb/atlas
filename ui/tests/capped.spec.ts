import { test, expect } from "@playwright/test";
import { keepCapped } from "../src/lib/capped";

// The one bounded cache (lib/capped.ts). Pure.
test("the least recently set entries go past the cap, each handed to gone", () => {
  const m = new Map<string, number>(), gone: number[] = [];
  for (const [k, v] of [["a", 1], ["b", 2], ["c", 3]] as const) keepCapped(m, k, v, 2, (x) => gone.push(x));
  expect([...m.keys()]).toEqual(["b", "c"]);
  keepCapped(m, "b", 20, 2, (x) => gone.push(x)); // set again: the newest, nothing dropped
  keepCapped(m, "d", 4, 2, (x) => gone.push(x));
  expect([...m]).toEqual([["b", 20], ["d", 4]]);
  expect(gone).toEqual([1, 3]);
});
