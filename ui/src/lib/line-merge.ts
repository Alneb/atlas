// Two versions of a text side by side, by lines: the runs they share and the runs where they differ, and a text put
// back together from a choice per differing run (the sync-copy compare dialog, SyncCompare.svelte).

export type Run = { same: string[] } | { mine: string[]; theirs: string[] };
export type Side = "mine" | "theirs" | "both";

/** Above this many cells the middle is not aligned line by line: it is one differing run (still correct, coarser). */
const MOST_CELLS = 4_000_000;

/** `mine` and `theirs` as alternating shared / differing runs (the common prefix and suffix first, an LCS between). */
export function runs(mine: string, theirs: string): Run[] {
  const a = mine.split("\n"), b = theirs.split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf), bm = b.slice(pre, b.length - suf);
  const out: Run[] = [];
  const push = (r: Run) => {
    const last = out[out.length - 1];
    if ("same" in r) {
      if (!r.same.length) return;
      if (last && "same" in last) last.same.push(...r.same);
      else out.push({ same: [...r.same] });
    } else {
      if (!r.mine.length && !r.theirs.length) return;
      if (last && "mine" in last) { last.mine.push(...r.mine); last.theirs.push(...r.theirs); }
      else out.push({ mine: [...r.mine], theirs: [...r.theirs] });
    }
  };
  push({ same: a.slice(0, pre) });
  if (am.length * bm.length > MOST_CELLS) push({ mine: am, theirs: bm });
  else for (const r of lcsRuns(am, bm)) push(r);
  push({ same: a.slice(a.length - suf) });
  return out;
}

/** The LCS table walked forwards: each line is shared, only mine, or only theirs. */
function lcsRuns(a: string[], b: string[]): Run[] {
  const n = a.length, m = b.length, w = m + 1;
  const t = new Uint32Array((n + 1) * w); // t[i*w+j] = LCS of a[i..], b[j..]
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  const out: Run[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push({ same: [a[i]] }); i++; j++; }
    else if (j < m && (i === n || t[i * w + j + 1] >= t[(i + 1) * w + j])) { out.push({ mine: [], theirs: [b[j]] }); j++; }
    else { out.push({ mine: [a[i]], theirs: [] }); i++; }
  }
  return out;
}

/** The text with, for each differing run (in order), the side chosen: "both" keeps mine then theirs. */
export function compose(rs: Run[], choice: Side[]): string {
  const lines: string[] = [];
  let k = 0;
  for (const r of rs) {
    if ("same" in r) { lines.push(...r.same); continue; }
    const c = choice[k++] ?? "mine";
    if (c !== "theirs") lines.push(...r.mine);
    if (c !== "mine") lines.push(...r.theirs);
  }
  return lines.join("\n");
}
