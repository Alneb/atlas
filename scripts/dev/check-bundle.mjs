// Every chunk of the built UI parses as a module (the gate's build stage). Vite builds a bundle the browser refuses
// without a word — e.g. `import(await x)` becomes `m(() => import(await x))`, an await outside an async function
// (every page blank, only e2e noticed). Usage: node scripts/dev/check-bundle.mjs [ui/dist]
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const dist = process.argv[2] ?? new URL("../../ui/dist", import.meta.url).pathname;
const { parse } = createRequire(join(dist, "../package.json"))("acorn");
const dir = join(dist, "assets");
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
let bad = 0;
for (const f of files) {
  const src = readFileSync(join(dir, f), "utf8");
  try { parse(src, { ecmaVersion: "latest", sourceType: "module" }); }
  catch (e) { bad++; console.log(`[bundle] ${f}: ${e.message}\n  …${src.slice(Math.max(0, e.pos - 160), e.pos + 40)}`); }
}
console.log(`[bundle] ${files.length} chunks, ${bad} that do not parse`);
process.exit(bad ? 1 : 0);
