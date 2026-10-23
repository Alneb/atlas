// UX audit (`npm run ux`): journeys in ux/ over a copy of the real workspace (ATLAS_UX_SOURCE,
// else ATLAS_VAULT). Report: ux-report/REPORT.md (+ shots/). Separate from the test suite: it judges
// experience (time, effort, layout, gaps) rather than asserting behaviour, and never fails the build.
import { defineConfig } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWorkspace } from "./ux/workspace";
import { OUT } from "./ux/harness";

const SRC = process.env.ATLAS_UX_SOURCE ?? process.env.ATLAS_VAULT ?? "";
if (!SRC) throw new Error("the UX audit needs a vault to copy: set ATLAS_UX_SOURCE or ATLAS_VAULT");
const WS = process.env.ATLAS_UX_WS ?? join(process.env.TMPDIR ?? tmpdir(), "atlas-ux-ws");
const PORT = Number(process.env.ATLAS_UX_PORT ?? 7740);

if (!process.env.TEST_WORKER_INDEX) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const notes = buildWorkspace(SRC, WS);
  writeFileSync(join(OUT, "workspace.json"), JSON.stringify({ source: SRC, copy: WS, notes }));
}

export default defineConfig({
  testDir: "ux",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalTeardown: "./ux/teardown.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    actionTimeout: 5000, // a missing control must fail its step, not hang the journey
    launchOptions: process.env.ATLAS_PW_CHROME ? { executablePath: process.env.ATLAS_PW_CHROME } : {},
  },
  webServer: {
    // the release-like server binary; build first (`npm run build && cargo build -p atlas`)
    command: `cargo run -q -p atlas -- serve ${WS} --port ${PORT}`,
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/`,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
