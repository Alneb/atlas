import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSample } from "./sample";

// Markdown render audit: every note of a COPY of a real vault (`ATLAS_AUDIT_SOURCE`, else `ATLAS_VAULT`), opened in the real app and
// scrolled end to end; problems found on screen are written to REPORT.md. `npm run audit:md`.
export const SOURCE = process.env.ATLAS_AUDIT_SOURCE ?? process.env.ATLAS_VAULT ?? "";
if (!SOURCE) throw new Error("the render audit needs a vault to copy: set ATLAS_AUDIT_SOURCE or ATLAS_VAULT");
export const WS = process.env.ATLAS_AUDIT_WS ?? join(process.env.TMPDIR ?? tmpdir(), "atlas-render-audit-ws");
export const OUT = process.env.ATLAS_AUDIT_OUT ?? join(process.cwd(), "audit-report");
const PORT = Number(process.env.ATLAS_AUDIT_PORT ?? 7750);
if (!process.env.TEST_WORKER_INDEX) buildSample(SOURCE, WS);

export default defineConfig({
  testDir: ".",
  testMatch: "render.spec.ts",
  workers: 1,
  timeout: 1_800_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1400, height: 1000 },
    launchOptions: process.env.ATLAS_PW_CHROME ? { executablePath: process.env.ATLAS_PW_CHROME } : {},
  },
  webServer: {
    command: `cargo run -q -p atlas -- serve ${WS} --port ${PORT}`,
    cwd: "../..",
    url: `http://127.0.0.1:${PORT}/`,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
