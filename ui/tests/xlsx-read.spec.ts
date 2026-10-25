import { test, expect } from "@playwright/test";
import { readXlsx } from "../src/lib/csv/xlsx";
import { zip } from "./xlsx-fixture";

// An Excel workbook read without a library (lib/csv/xlsx.ts): its sheets in order, shared and inline strings,
// numbers, booleans, gaps, and each formula kept beside the value Excel computed. The workbook is made here: a zip
// with one part stored and the others deflated, as Excel writes them.
test("an Excel workbook's sheets, values and formulas", async () => {
  const book = await zip({
    "xl/workbook.xml": '<workbook><sheets><sheet name="Prices &amp; sums" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    "xl/sharedStrings.xml": '<sst><si><t>item</t></si><si><t>qty</t></si><si><r><t>app</t></r><r><t xml:space="preserve">les</t></r></si></sst>',
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>3</v></c><c r="D2" t="b"><v>1</v></c></row>'
      + '<row r="3"><c r="A3" t="inlineStr"><is><t>total &lt;all&gt;</t></is></c><c r="B3"><f>SUM(B2:B2)*2</f><v>6</v></c><c r="C3"/></row>'
      + "</sheetData></worksheet>",
    "xl/worksheets/sheet2.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="str"><f>"a"&amp;"b"</f><v>ab</v></c></row></sheetData></worksheet>',
  }, ["xl/workbook.xml"]);
  const sheets = await readXlsx(book);
  expect(sheets.map((s) => s.name)).toEqual(["Prices & sums", "Notes"]);
  expect(sheets[0].rows).toEqual([["item", "qty", "", ""], ["apples", "3", "", "TRUE"], ["total <all>", "6", "", ""]]);
  expect(sheets[0].formulas.get("2,1")).toBe("SUM(B2:B2)*2");
  expect(sheets[1].rows).toEqual([["ab"]]);
  expect(sheets[1].formulas.get("0,0")).toBe('"a"&"b"');
  await expect(readXlsx(new TextEncoder().encode("not a zip"))).rejects.toThrow(/not an Excel file/);
});

// A table written as a new workbook (lib/csv/xlsx-write.ts) reads back as it was: the header as row 1, numbers,
// text with XML's specials, and formulas with their references moved down a row and Atlas's value beside them.
test("a table written as a workbook reads back, its formulas moved under the header", async () => {
  const { writeXlsx, crc32, sheetName } = await import("../src/lib/csv/xlsx-write");
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  expect(sheetName("prices: [2026]/final")).toBe("prices 2026 final");
  const bytes = await writeXlsx("prices", ["item", "qty", "price", "total"], [
    ["apples <red>", "3", "1.5", "=B1*C1"],
    ["pears & co", "2", "2", "=B2*C2"],
    ["", "=SUM(B1:B2)", "", '=IF(D1>4,"big","small")'],
  ]);
  const [s] = await readXlsx(bytes);
  expect(s.name).toBe("prices");
  expect(s.rows).toEqual([["item", "qty", "price", "total"], ["apples <red>", "3", "1.5", "4.5"], ["pears & co", "2", "2", "4"], ["", "5", "", "big"]]);
  expect(s.formulas.get("1,3")).toBe("B2*C2");
  expect(s.formulas.get("3,1")).toBe("SUM(B2:B3)");
  expect(s.formulas.get("3,3")).toBe('IF(D2>4,"big","small")');
});
