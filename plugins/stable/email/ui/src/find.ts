// Find in a conversation (Ctrl+F): the messages are sandboxed frames, so the window's own find cannot reach them.
// Every match in the given documents is wrapped in <mark class="atlas-find"> (MailFrame styles it), one is the current
// one; folded quotes holding a match open. Case and accents are ignored ("e" finds "é").

const CLASS = "atlas-find";

/** A text's folded form and, for each folded character, where it came from. */
function folded(text: string): { s: string; at: number[] } {
  let s = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = text[i].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    for (const ch of f) { s += ch; at.push(i); }
  }
  at.push(text.length);
  return { s, at };
}

export class Finder {
  marks: HTMLElement[] = [];
  at = -1;

  /** The marks taken away, the text as it was. */
  clear() {
    const parents = new Set<Node>();
    for (const m of this.marks) {
      const p = m.parentNode;
      if (!p) continue;
      p.replaceChild(m.ownerDocument.createTextNode(m.textContent ?? ""), m);
      parents.add(p);
    }
    for (const p of parents) p.normalize();
    this.marks = [];
    this.at = -1;
  }

  /** Marks every match of `query` in the documents; the number found. */
  run(docs: Document[], query: string): number {
    this.clear();
    const q = folded(query.trim()).s;
    if (!q) return 0;
    for (const doc of docs) {
      if (!doc.body) continue;
      const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement?.closest("style, script, summary") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      const nodes: Text[] = [];
      for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n as Text);
      for (const node of nodes) {
        const { s, at } = folded(node.data);
        const hits: [number, number][] = [];
        for (let i = s.indexOf(q); i >= 0; i = s.indexOf(q, i + q.length)) hits.push([at[i], at[i + q.length]]);
        // from the end, so earlier offsets stay right while the node is split; kept in reading order
        const mine: HTMLElement[] = [];
        for (const [a, b] of hits.reverse()) {
          const r = doc.createRange();
          r.setStart(node, a);
          r.setEnd(node, b);
          const m = doc.createElement("mark");
          m.className = CLASS;
          r.surroundContents(m);
          mine.unshift(m);
        }
        this.marks.push(...mine);
      }
    }
    return this.marks.length;
  }

  /** The next (1) or previous (-1) match made current, with the folded quotes around it opened. */
  step(dir: 1 | -1): HTMLElement | undefined {
    if (!this.marks.length) return undefined;
    this.marks[this.at]?.classList.remove("cur");
    this.at = (this.at + dir + this.marks.length) % this.marks.length;
    const m = this.marks[this.at];
    m.classList.add("cur");
    for (let d = m.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    return m;
  }
}

/** Scrolls `scroller` (the reader) so a mark inside one of its frames stands a third of the way down. */
export function reveal(scroller: HTMLElement, m: HTMLElement) {
  const frame = m.ownerDocument.defaultView?.frameElement as HTMLElement | null;
  if (!frame) return;
  const box = scroller.getBoundingClientRect();
  const y = frame.getBoundingClientRect().top + m.getBoundingClientRect().top - box.top + scroller.scrollTop;
  scroller.scrollTo({ top: Math.max(0, y - scroller.clientHeight / 3), behavior: "smooth" });
}
