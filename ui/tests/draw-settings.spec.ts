import { test, expect } from "@playwright/test";
import { startColor, startWidth, webPen } from "../src/lib/draw-notepad";

// The web notepad starts from the vault's [draw] as the Boox's does (NotepadView.java toolbarDefaults, Stroke.java
// webPen): the same pen family, width steps and colours.
test("Settings' pen, width and colour map as the Boox's notepad maps them", () => {
  expect(webPen("ballpoint")).toBe("ballpoint");
  expect(webPen("marker")).toBe("highlighter");
  for (const p of ["fountain", "brush", "square", "pencil", "charcoal"] as const) expect(webPen(p)).toBe("fountain");
  expect([startWidth("thin"), startWidth("normal"), startWidth("thick"), startWidth("very thick"), startWidth(undefined)]).toEqual([0.64, 1, 1.56, 2.44, 1]);
  expect(startColor("blue")).toBe("#1971c2");
  expect(startColor(undefined)).toBe("#000000");
});
