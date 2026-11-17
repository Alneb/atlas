// What the repository's plugins are and which of their files a copy of them carries: one rule for the release
// archives (plugin-pack.mjs) and the plugins the phone app carries (bundle-plugins.mjs).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Every published plugin: plugins/stable/<id> and plugins/beta/<id> (examples are not released). */
export function plugins() {
  return ["stable", "beta"].flatMap((tier) =>
    readdirSync(join(root, "plugins", tier))
      .filter((id) => existsSync(join(root, "plugins", tier, id, "plugin.toml")))
      .map((id) => ({ id, tier, dir: join(root, "plugins", tier, id) })),
  );
}

/** Build inputs, never needed where the plugin runs: its engine's crate, its pane's and helper's TypeScript. */
const SOURCES = /^(engine|ui|helper)\//;

/** The files plugin `p` ships: tracked by git, without its sources and without what `also` matches. */
export function shippedFiles(p, also = null) {
  const rel = relative(root, p.dir);
  return execFileSync("git", ["-C", root, "ls-files", "-z", "--", rel], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((f) => relative(rel, f))
    .filter((f) => !SOURCES.test(f) && !(also && also.test(f)));
}
