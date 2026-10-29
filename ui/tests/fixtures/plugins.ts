import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { WS } from "../../playwright.config";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

/** Rust's `ARCH-OS`, the folder a plugin's helper is looked up in (`plugins::target()` in the core). */
const TARGET = `${({ x64: "x86_64", arm64: "aarch64" } as Record<string, string>)[process.arch] ?? process.arch}-${process.platform}`;

/** The Email plugin as shipped, into the test vault, with the engine built from this checkout as its helper:
 *  `bin/` is never committed (engine/build.sh makes the release ones), so a fresh clone has none to copy. */
export function installEmailPlugin(): string {
  const built = spawnSync("cargo", ["build", "-q", "-p", "atlas-email", "--bin", "email"], { cwd: REPO, stdio: "inherit" });
  if (built.status !== 0) throw new Error("cannot build the email engine");
  const plugin = join(REPO, "plugins/stable/email"), dir = join(WS, ".atlas/plugins/email");
  rmSync(dir, { recursive: true, force: true });
  for (const f of ["plugin.toml", "view.js", "main.js", "ui-lib"]) cpSync(join(plugin, f), join(dir, f), { recursive: true });
  mkdirSync(join(dir, "bin", TARGET), { recursive: true });
  copyFileSync(join(REPO, "target/debug/email"), join(dir, "bin", TARGET, "email"));
  return dir;
}
