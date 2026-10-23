import { defineConfig } from "@playwright/test";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Look audit: the same catalogue note in obsidian-web (whose CSS was tuned against Obsidian) and in Atlas,
// construct by construct. `npm run audit:look`; needs an obsidian-web binary (ATLAS_LOOK_OW, default
// ~/Projects/obsidian-web/target/release/obsidian-web).
export const VAULT = process.env.ATLAS_LOOK_WS ?? join(process.env.TMPDIR ?? tmpdir(), "atlas-look-ws");
export const OUT = process.env.ATLAS_LOOK_OUT ?? join(process.cwd(), "look-report");
const OW = process.env.ATLAS_LOOK_OW ?? join(process.env.HOME ?? "", "Projects/obsidian-web/target/release/obsidian-web");
export const OW_URL = "http://127.0.0.1:7762";
export const ATLAS_URL = "http://127.0.0.1:7761";
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(VAULT, { recursive: true, force: true });
  mkdirSync(VAULT, { recursive: true });
  cpSync(join(import.meta.dirname, "catalogue.md"), join(VAULT, "catalogue.md"));
  cpSync(join(import.meta.dirname, "catalogue.md"), join(VAULT, "Some Note.md"));
}
export default defineConfig({
  testDir: ".",
  testMatch: "look.spec.ts",
  workers: 1,
  timeout: 300_000,
  reporter: [["list"]],
  use: { viewport: { width: 1400, height: 1000 }, launchOptions: process.env.ATLAS_PW_CHROME ? { executablePath: process.env.ATLAS_PW_CHROME } : {} },
  webServer: [
    { command: `cargo run -q -p atlas -- serve ${VAULT} --port 7761`, cwd: "../..", url: `${ATLAS_URL}/`, timeout: 300_000, reuseExistingServer: false },
    { command: `${OW} ${VAULT} --serve --addr 127.0.0.1:7762`, url: `${OW_URL}/`, timeout: 60_000, reuseExistingServer: false },
  ],
});
