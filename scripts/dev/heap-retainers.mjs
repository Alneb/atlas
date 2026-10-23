// What keeps an object alive: the shortest path from the GC roots to each node whose name matches, in a V8 heap
// snapshot (.heapsnapshot, as Chrome's DevTools or CDP `HeapProfiler.takeHeapSnapshot` write it). Weak edges and the
// DevTools console's own handles are not followed (they keep nothing alive in the app).
//
//   node scripts/dev/heap-retainers.mjs snapshot.heapsnapshot '<name regex>' [--max 5] [--detached]
//
// --detached: only DOM nodes out of the document (Chrome's `detachedness` = 2) — a pane's leftovers.
// Build the UI unminified for readable names: `npx vite build --minify false --outDir <dir>` and probe with --dist.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i >= 0 ? (args.splice(i, 1), true) : false; };
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const max = Number(opt("--max", "5")), detachedOnly = flag("--detached");
const [file, pattern] = args;
const want = new RegExp(pattern);
const snap = JSON.parse(readFileSync(file, "utf8"));
const { node_fields: nf, edge_fields: ef, node_types: [ntypes], edge_types: [etypes] } = snap.snapshot.meta;
const N = nf.length, E = ef.length, nodes = snap.nodes, edges = snap.edges, strs = snap.strings;
const nName = nf.indexOf("name"), nEdges = nf.indexOf("edge_count"), nDet = nf.indexOf("detachedness"), nType = nf.indexOf("type");
const eType = ef.indexOf("type"), eName = ef.indexOf("name_or_index"), eTo = ef.indexOf("to_node");
const count = nodes.length / N;
const name = (k) => strs[nodes[k * N + nName]];
const first = new Uint32Array(count + 1);
for (let k = 0, e = 0; k < count; k++) { first[k] = e; e += nodes[k * N + nEdges] * E; first[count] = e; }
const edgeLabel = (e) => { const t = etypes[edges[e + eType]]; return t === "element" || t === "hidden" ? `[${edges[e + eName]}]` : `.${strs[edges[e + eName]]}`; };

// breadth-first from the synthetic root (node 0): the first path found to a node is a shortest one
const parent = new Int32Array(count).fill(-1), via = new Int32Array(count).fill(-1);
parent[0] = 0;
const queue = [0];
for (let qi = 0; qi < queue.length; qi++) {
  const k = queue[qi];
  if (/DevTools console/.test(name(k))) continue;
  for (let e = first[k]; e < first[k + 1]; e += E) {
    if (etypes[edges[e + eType]] === "weak") continue;
    const to = edges[e + eTo] / N;
    if (parent[to] !== -1) continue;
    parent[to] = k; via[to] = e; queue.push(to);
  }
}
let shown = 0, matched = 0, unreachable = 0;
for (let k = 0; k < count && shown < max; k++) {
  if (!want.test(name(k))) continue;
  if (detachedOnly && !(nDet >= 0 && nodes[k * N + nDet] === 2)) continue;
  matched++;
  if (parent[k] === -1) { unreachable++; continue; }
  const path = [];
  for (let c = k; c !== 0; c = parent[c]) path.push(`${name(c).slice(0, 70)} (${ntypes[nodes[c * N + nType]]})${via[c] >= 0 ? " ←" + edgeLabel(via[c]) : ""}`);
  console.log(`\n#${++shown} ${name(k).slice(0, 90)}\n  ` + path.slice(1).join("\n  "));
}
console.log(`\n${matched} matched; ${unreachable} only reachable through weak edges or DevTools (not leaks)`);
