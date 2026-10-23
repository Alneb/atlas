// Who calls a hot function, from a .cpuprofile written by profile-ui.mjs (docs/decisions/PERFORMANCE.md): for each name prefix
// ("sanitize", "Y@latex-suite"), the call chains (9 frames up) that spend the most time in it, with that time.
//
//   node scripts/dev/profile-callers.mjs /tmp/atlas-profile/typing.cpuprofile <name-prefix>…
import { readFileSync } from "node:fs";
const p = JSON.parse(readFileSync(process.argv[2], "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n])), parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + (p.timeDeltas[i] ?? 0));
const name = (n) => `${n.callFrame.functionName || "(anon)"}@${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}:${n.callFrame.columnNumber + 1}`;
for (const want of process.argv.slice(3)) {
  const chains = new Map();
  for (const n of p.nodes) {
    if (!name(n).startsWith(want)) continue;
    // inclusive time of this node
    const incl = (id) => (self.get(id) ?? 0) + (byId.get(id).children ?? []).reduce((a, c) => a + incl(c), 0);
    let chain = [], id = n.id;
    for (let k = 0; k < 9 && parent.has(id); k++) { id = parent.get(id); chain.push(name(byId.get(id))); }
    const key = chain.join(" < ");
    chains.set(key, (chains.get(key) ?? 0) + incl(n.id));
  }
  console.log(`\n### ${want}`);
  for (const [k, v] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log(`${(v / 1000).toFixed(0)} ms  ${k}`);
}
