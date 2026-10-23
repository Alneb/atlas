import { test, expect } from "@playwright/test";
import { extent, heldAtEnd, wireToSkeleton } from "../src/lib/pen-shapes";

// The web drawing snaps a held stroke as Notepad does: the hold, the size, and the recogniser's wire as elements.
test("a held stroke: the hold at its end, its size, the wire as Excalidraw elements", () => {
  const line = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 0, t: i * 16 }));
  expect(heldAtEnd(line)).toBe(false); // lifted at once
  const held = [...line, ...Array.from({ length: 10 }, (_, i) => ({ x: 190 + (i % 2), y: 1, t: 320 + (i + 1) * 70 }))];
  expect(heldAtEnd(held)).toBe(true); // still for 700 ms, a pixel of tremor
  expect(heldAtEnd(held, 4)).toBe(false); // zoomed 4×: that tremor is a real move on screen
  expect(extent(line)).toBe(190);
  expect(wireToSkeleton([0])).toBeNull();
  expect(wireToSkeleton([2, 50, 40, 100, 80, 0.1])).toMatchObject({ type: "rectangle", x: 0, y: 0, width: 100, height: 80, angle: 0.1 });
  expect(wireToSkeleton([3, 10, 10, 20, 20, 0])).toMatchObject({ type: "ellipse", x: 0, y: 0 });
  expect(wireToSkeleton([1, 0, 0, 30, 40])).toMatchObject({ type: "line", points: [[0, 0], [30, 40]], width: 30, height: 40 });
  expect(wireToSkeleton([4, 50, 0, 100, 80, 0, 80])).toMatchObject({ type: "line", points: [[0, 0], [50, 80], [-50, 80], [0, 0]] });
  expect(wireToSkeleton([5, 0, 0, 1, 2, 0, 0, 100, 0])).toMatchObject({ type: "arrow", endArrowhead: "arrow", startArrowhead: null, points: [[0, 0], [100, 0]] });
  expect(wireToSkeleton([5, 1, 0, 0, 3, 0, 0, 10, 0, 5, 9])).toMatchObject({ type: "line", points: [[0, 0], [10, 0], [5, 9], [0, 0]] });
});
