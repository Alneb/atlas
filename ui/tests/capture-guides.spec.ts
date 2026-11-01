import { test, expect } from "@playwright/test";
import { afterSaved } from "../src/lib/capture-guides";

// What a capture box keeps once its capture was saved (lib/capture-guides.ts). Pure.
test("the box keeps only what was typed on while the capture was saved", () => {
  expect(afterSaved("buy milk", "buy milk")).toBe("");
  expect(afterSaved("  buy milk  ", "buy milk")).toBe("");
  expect(afterSaved("buy milk\ncall Ada", "buy milk")).toBe("call Ada");
  expect(afterSaved("buy oat milk", "buy milk")).toBe("buy oat milk"); // edited in place: left as it is
});
