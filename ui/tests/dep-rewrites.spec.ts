import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEP_REWRITES, rewriteDeps } from "../scripts/dep-rewrites";

// Each build-time rewrite (scripts/dep-rewrites.ts) finds its spot in the installed package: a dependency update that
// moved the code fails here, as the build does.
const nm = fileURLToPath(new URL("../node_modules", import.meta.url));

function hits(file: string): string[] {
  return rewriteDeps(readFileSync(file, "utf8"), file)?.hit ?? [];
}

test("xterm's dim text gets the full minimum contrast, in the DOM and the WebGL renderer", () => {
  const dom = join(nm, "@xterm/xterm/lib/xterm.mjs"), webgl = join(nm, "@xterm/addon-webgl/lib/addon-webgl.mjs");
  expect(hits(dom)).toEqual(["xterm-dim"]);
  expect(hits(webgl)).toEqual(["xterm-webgl-dim"]);
  expect(rewriteDeps(readFileSync(dom, "utf8"), dom)!.code).not.toMatch(/minimumContrastRatio\/\(/);
  expect(rewriteDeps(readFileSync(webgl, "utf8"), webgl)!.code).not.toMatch(/minimumContrastRatio\/\(/);
});

test("Excalidraw's freehand stroke asks the pen's outline first", () => {
  const dir = join(nm, "@excalidraw/excalidraw/dist/prod");
  const found = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith(".js")).flatMap((f) => hits(join(dir, f)));
  expect(found).toContain("excalidraw-ink");
});

test("a module no rewrite is meant for is left alone", () => {
  expect(rewriteDeps("minimumContrastRatio/(a.isDim()?2:1)", "/x/node_modules/other/index.js")).toBeNull();
  expect(DEP_REWRITES.map((r) => r.name)).toEqual(["excalidraw-ink", "xterm-dim", "xterm-webgl-dim"]);
});
