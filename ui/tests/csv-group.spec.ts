import { test, expect } from "@playwright/test";
import { groupFilter, groupRows, measure } from "../src/lib/csv/group";
import { compile } from "../src/lib/csv/filter";

// A table's rows grouped by one column, with sub-totals (lib/csv/group.ts). Pure.
const rows = [
  ["fruit", "3", "1.5"],
  ["veg", "2", "x"],
  ["fruit", "5", "0.5"],
  ["", "1", ""],
  ["Fruit ", "4", "2"],
  ["veg", "", "3"],
];

test("rows grouped by a column's value, each group's count and totals, blanks last", () => {
  const { groups, all } = groupRows(rows, [0, 1, 2, 3, 4, 5], 0, [1, 2], false);
  expect(groups.map((g) => g.key), "case and spaces aside, the first spelling shown").toEqual(["fruit", "veg", ""]);
  const fruit = groups[0];
  expect(fruit.rows).toEqual([0, 2, 4]);
  expect(measure(fruit.totals.get(1), "sum")).toBe(12);
  expect(measure(fruit.totals.get(1), "mean")).toBe(4);
  expect(measure(fruit.totals.get(2), "min")).toBe(0.5);
  expect(measure(fruit.totals.get(2), "max")).toBe(2);
  const veg = groups[1];
  expect(measure(veg.totals.get(1), "sum"), "a blank cell is no number").toBe(2);
  expect(measure(veg.totals.get(2), "sum"), "text is no number").toBe(3);
  expect(measure(groups[2].totals.get(2), "sum"), "no number at all").toBeNull();
  expect(measure(all.get(1), "sum")).toBe(15);
  expect(measure(all.get(2), "mean")).toBeCloseTo(7 / 4);
});

test("only the rows shown, in their order; numeric groups by size, the other way round when asked", () => {
  const nums = [["10"], ["9"], ["10.0"], ["100"]];
  expect(groupRows(nums, [3, 2, 1, 0], 0, [], true).groups.map((g) => [g.key, g.rows])).toEqual([["9", [1]], ["10.0", [2, 0]], ["100", [3]]]);
  expect(groupRows(nums, [0, 1], 0, [], true, -1).groups.map((g) => g.key)).toEqual(["10", "9"]);
});

test("a group's filter keeps exactly its rows", () => {
  const { groups } = groupRows(rows, [0, 1, 2, 3, 4, 5], 0, [], false);
  for (const g of groups) {
    const t = compile(groupFilter(g.key))!;
    expect(rows.map((r, i) => (t(r[0]) ? i : -1)).filter((i) => i >= 0), g.key || "blank").toEqual(g.rows);
  }
});
