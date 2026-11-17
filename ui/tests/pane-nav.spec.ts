import { test, expect } from "@playwright/test";
import { Steps } from "../src/lib/pane-nav";

// A pane's own Back / Forward (lib/pane-nav.ts): the places left, stepped through in turn; what a step applies is not
// recorded again. Pure.

/** A pane whose place is a string, moved by `goTo` the way a pane records it (here before, `left` after). */
function pane(start = "inbox") {
  let at = start;
  const steps = new Steps<string>(() => at, (p) => { goTo(p); });
  const goTo = (p: string) => { const was = at; at = p; steps.left(was); };
  return { steps, goTo, at: () => at };
}

test("back and forward walk the places left, a new place drops the forward part", () => {
  const p = pane();
  p.goTo("sent"); p.goTo("thread 7");
  expect(p.steps.can(-1)).toBe(true);
  expect(p.steps.can(1)).toBe(false);
  expect(p.steps.step(-1)).toBe(true);
  expect(p.at()).toBe("sent");
  expect(p.steps.step(-1)).toBe(true);
  expect(p.at()).toBe("inbox");
  expect(p.steps.step(-1)).toBe(false); // nothing left: the app's own Back takes over
  expect(p.steps.step(1)).toBe(true);
  expect(p.at()).toBe("sent");
  p.goTo("drafts");
  expect(p.steps.can(1)).toBe(false);
  p.steps.step(-1);
  expect(p.at()).toBe("sent");
});

test("staying in place records nothing; an unrecorded move is not a step", () => {
  const p = pane();
  p.goTo("inbox");
  expect(p.steps.can(-1)).toBe(false);
  p.steps.unrecorded(() => p.goTo("next thread"));
  expect(p.steps.can(-1)).toBe(false);
});

test("the list is capped", () => {
  let at = 0;
  const steps = new Steps<number>(() => at, (p) => { at = p; }, undefined, 3);
  for (let i = 1; i <= 10; i++) { const was = at; at = i; steps.left(was); }
  expect(steps.back).toEqual([7, 8, 9]);
});
