// Subsequence fuzzy matcher with the usual bonuses (word starts, consecutive runs, basename).
export interface Match { score: number; indices: number[] }

const isBoundary = (s: string, i: number) => i === 0 || /[\s/_.\-:]/.test(s[i - 1]) || (s[i] >= "A" && s[i] <= "Z" && s[i - 1] >= "a" && s[i - 1] <= "z");

export function fuzzy(query: string, text: string): Match | null {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // fast path: contiguous substring scores highest, earlier and at boundaries better
  const at = t.indexOf(q);
  if (at >= 0) {
    const indices = Array.from({ length: q.length }, (_, k) => at + k);
    return { score: 1000 - at + (isBoundary(text, at) ? 200 : 0) - (t.length - q.length) * 0.5, indices };
  }
  const indices: number[] = [];
  let score = 0, ti = 0, run = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === " ") continue;
    let found = -1;
    for (let k = ti; k < t.length; k++) if (t[k] === ch) { found = k; break; }
    if (found < 0) return null;
    run = indices.length && found === indices[indices.length - 1] + 1 ? run + 1 : 0;
    score += 10 + run * 15 + (isBoundary(text, found) ? 30 : 0) - Math.min(found - ti, 10);
    indices.push(found);
    ti = found + 1;
  }
  return { score: score - t.length * 0.2, indices };
}

/** Wrap matched characters in <mark> for display (input is escaped). */
export function highlightMatch(text: string, indices: number[]): string {
  const set = new Set(indices);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i].replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[x]!);
    out += set.has(i) ? `<mark>${c}</mark>` : c;
  }
  return out.replace(/<\/mark><mark>/g, "");
}
