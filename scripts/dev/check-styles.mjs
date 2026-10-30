#!/usr/bin/env node
// Colours come from ui/src/styles/tokens.css (docs/guides/UI-STYLE.md §1): a literal colour in a component's <style>
// or in a stylesheet is a colour that does not follow the theme. A line that must keep one (paper is white, a
// highlighter is yellow) says why with a `/* literal: … */` comment. And a `var(--name)` must name a variable that is
// set somewhere (a token, a component's own, one set from script): an unknown one falls back, often to a literal colour
// that ignores the theme. Exit 1 on any finding.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const src = join(root, "ui/src");
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
const files = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === "vendor" || n === "gen" ? [] : files(p)) : [p]; });

const all = files(src);
// every custom property set anywhere: `--x:` in CSS, `style:--x`, setProperty("--x"…), a "--x" key in script
const defined = new Set(all.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/(--[\w-]+)\s*:|style:(--[\w-]+)|["'`](--[\w-]+)/g)].map((m) => m[1] ?? m[2] ?? m[3])));
const outside = (name) => name.startsWith("--dv-") || name.startsWith("--cm-"); // dockview's and CodeMirror's own

const found = [];
for (const f of all) {
  if (!/\.(svelte|css)$/.test(f) || f.endsWith("tokens.css") || f.includes("/themes/")) continue;
  const text = readFileSync(f, "utf8");
  // a .svelte file: only its <style>; a stylesheet: all of it
  const start = f.endsWith(".svelte") ? text.indexOf("<style") : 0;
  if (start < 0) continue;
  const before = text.slice(0, start).split("\n").length - 1;
  text.slice(start).split("\n").forEach((line, i) => {
    const bare = line.replace(/var\([^)]*\)/g, ""); // a fallback inside var() is the token's own
    if (LITERAL.test(bare) && !/literal:/.test(line)) found.push(`${relative(root, f)}:${before + i + 1}: ${line.trim().slice(0, 140)}`);
    for (const m of line.matchAll(/var\((--[\w-]+)/g)) if (!defined.has(m[1]) && !outside(m[1])) found.push(`${relative(root, f)}:${before + i + 1}: ${m[1]} is set nowhere`);
  });
}
for (const l of found) console.log(`[styles] ${l}`);
console.log(`[styles] literal colours outside tokens.css and unknown variables: ${found.length}`);
process.exit(found.length ? 1 : 0);
