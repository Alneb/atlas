// A sorted list of words kept as one string, one word per line: a dictionary of a few megabytes costs no parsing and few
// objects, also on a phone. Asked only when a trigger has matched.
export class SortedWords {
  constructor(private text: string) {}

  get size(): number {
    if (!this.text) return 0;
    let n = 1;
    for (let i = this.text.indexOf("\n"); i >= 0; i = this.text.indexOf("\n", i + 1)) n++;
    return n;
  }

  /** The first word not before `w`, or "". */
  private atOrAfter(w: string): string {
    let lo = 0, hi = this.text.length; // lo and hi are starts of lines, or the end
    while (lo < hi) {
      const mid = this.text.lastIndexOf("\n", (lo + hi) >> 1) + 1;
      const start = mid < lo ? lo : mid;
      const end = this.text.indexOf("\n", start), next = end < 0 ? this.text.length : end + 1;
      if (this.text.slice(start, end < 0 ? undefined : end) < w) lo = next; else hi = start;
    }
    const end = this.text.indexOf("\n", lo);
    return this.text.slice(lo, end < 0 ? undefined : end);
  }

  has(w: string): boolean { return this.atOrAfter(w) === w; }
  /** A word that starts with `w` and goes on. */
  grows(w: string): boolean { return this.atOrAfter(w + "a").startsWith(w); }
}
