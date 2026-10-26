// Every generated type in ui/src/lib/gen/ still has its Rust type: ts-rs writes these files when `cargo test` runs but
// never removes one whose type was renamed or moved, and an orphan keeps compiling while it drifts. Exit 1 on one.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const rust = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "target" || e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".rs")) { const t = readFileSync(p, "utf8"); if (t.includes("ts(export")) rust.push(t); } // only files that export types
  }
};
walk(join(root, "crates"));
walk(join(root, "plugins"));
// a type by name, a ts-rs `rename = "X"`, or a choice enum made by a macro (`X { #[default] A = "a", … }`)
const shapes = [/\b(?:struct|enum|type)\s+([A-Z]\w*)/g, /\brename\s*=\s*"([A-Z]\w*)"/g, /\b([A-Z]\w*)\s*\{\s*(?:#\[default\]\s*)?[A-Z]\w*\s*=\s*"/g];
const defined = new Set(rust.flatMap((t) => shapes.flatMap((re) => [...t.matchAll(re)].map((m) => m[1]))));
const orphans = readdirSync(join(root, "ui/src/lib/gen")).filter((f) => f.endsWith(".ts") && !defined.has(f.slice(0, -3)));
for (const f of orphans) console.log(`[gen] ui/src/lib/gen/${f}: no Rust type of that name any more (delete it, or export the type again)`);
console.log(`[gen] findings: ${orphans.length}`);
process.exit(orphans.length ? 1 : 0);
