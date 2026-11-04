// Whether a display formula (`$$`, `\[`) is closed: its closer must come before the next heading line or the end
// of the note. A formula never holds a Markdown heading, while blank lines inside one are real (an `align` with a
// gap), so the heading is the bound. An opener with no closer is plain text instead of turning the rest of the note
// into math. The reading view (markdown.ts) and the editor's parser (obsidian-syntax.js) both ask this, so they pair
// delimiters the same way.

const HEADING = /\n[ \t]{0,3}#{1,6}(?=[ \t\r\n]|$)/;
const CHUNK = 8192;

/** `read(from, to)` gives the note's text in that range; `from` is just past the opener. */
export function displayClosed(read: (from: number, to: number) => string, length: number, from: number, closer: string): boolean {
  let at = from, carry = "";
  while (at < length) {
    const to = Math.min(length, at + CHUNK);
    const text = carry + read(at, to);
    at = to;
    const last = at >= length;
    // only whole lines are judged; the partial last one (with its `\n`) is carried into the next chunk
    const cut = last ? text.length : text.lastIndexOf("\n");
    const whole = cut < 0 ? "" : text.slice(0, cut);
    const closeAt = whole.indexOf(closer), headAt = whole.search(HEADING);
    if (closeAt >= 0 && (headAt < 0 || closeAt < headAt)) return true;
    if (headAt >= 0) return false;
    carry = cut < 0 ? text : text.slice(cut);
  }
  return false;
}
