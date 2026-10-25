import { test, expect } from "@playwright/test";
import { colName, formulas, format } from "../src/lib/csv/formula";

// Formulas between a table's cells (lib/csv/formula.ts): references by the grid's labels (A1 = first data row),
// ranges, functions, text, errors and cycles. Pure.
const sheet = [
  ["apples", "3", "1.5", "=B1*C1"],
  ["pears", "2", "2", "=B2*C2"],
  ["", "=SUM(B1:B2)", "", "=SUM(D1:D2)"],
  ["=A1&\" and \"&A2", "=AVERAGE(B1:B2)", "=IF(D3>8,\"big\",\"small\")", "=ROUND(D3/3, 2)"],
  ["=1/0", "=Z99", "=nope(1)", "=A5+1"],
  ["=B6", "=A6", "=10%", "=2^3^2"],
  ["=MAX(B1:C2)-MIN(B1:C2)", "=COUNT(A1:C2)", "=COUNTA(A1:A3)", "=-(1+2)*3"],
];

test("cells compute from other cells, ranges and functions; the grid shows the results", () => {
  const f = formulas(sheet);
  expect(f.shown(0, 3)).toBe("4.5");
  expect(f.shown(1, 3)).toBe("4");
  expect(f.shown(2, 1)).toBe("5");
  expect(f.shown(2, 3)).toBe("8.5");
  expect(f.shown(3, 0)).toBe("apples and pears");
  expect(f.shown(3, 1)).toBe("2.5");
  expect(f.shown(3, 2)).toBe("big");
  expect(f.shown(3, 3)).toBe("2.83");
  expect(f.shown(6, 0)).toBe("1.5");
  expect(f.shown(6, 1), "only numbers are counted").toBe("4");
  expect(f.shown(6, 2), "empty cells are not counted").toBe("2");
  expect(f.shown(6, 3)).toBe("-9");
  expect(f.shown(5, 2)).toBe("0.1");
  expect(f.shown(5, 3), "^ binds to the right").toBe("512");
  expect(f.shown(0, 0), "plain text is shown as it is").toBe("apples");
});

test("errors read as a spreadsheet's, and pass through to the cells that use them", () => {
  const f = formulas(sheet);
  expect(f.shown(4, 0)).toBe("#DIV/0!");
  expect(f.shown(4, 1)).toBe("#REF!");
  expect(f.shown(4, 2)).toBe("#NAME?");
  expect(f.shown(4, 3)).toBe("#DIV/0!");
  expect(f.shown(5, 0)).toBe("#CYCLE!");
  expect(formulas([["=1+"]]).shown(0, 0)).toBe("#ERROR!");
  expect(formulas([["x", "=A1*2"]]).shown(0, 1)).toBe("#VALUE!");
});

test("column letters and number display", () => {
  expect([colName(0), colName(25), colName(26), colName(27), colName(701), colName(702)]).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  expect([format(0.1 + 0.2), format(1 / 3), format(1e20), format(-2)]).toEqual(["0.3", "0.3333333333", "100000000000000000000", "-2"]);
});
