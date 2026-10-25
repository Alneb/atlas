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
