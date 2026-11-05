// Vim's word motions (w, b, e, ge and dw, cw… built on them) with TeX words: in a .tex file and inside a note's
// formula `\alpha` is one word, as a command is one thing to delete or step over; `\\` and `\,` stay punctuation.
// The library's own word test takes a character alone and is private, so the motion is redefined here, its word
// search ported over tokens (same results as the library outside TeX: tests/vim-words.spec.ts).
import { syntaxTree, language } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { Vim } from "@replit/codemirror-vim";

type Kind = "word" | "punct" | "space";
interface Token { from: number; to: number; kind: Kind }
/** A word on one line, as the library's findWord returns it (`to` exclusive forward, the last index backward). */
interface Found { line: number; from: number; to: number }
interface Pos { line: number; ch: number }
/** The parts of the library's CodeMirror adapter used here. */
interface CM { getLine(n: number): string; lastLine(): number; cm6?: EditorView }

const WORD = /[\w\p{Alphabetic}\p{Number}_]/u;

/** Is the character at this column TeX (a .tex file, a formula)? */
export type TexAt = (ch: number) => boolean;
const NO_TEX: TexAt = () => false;

/** A line cut into words, punctuation runs and spaces; where `tex` says so, a backslash and its letters are one
 *  word of their own (`a\beta` is two words). */
export function tokens(line: string, tex: TexAt = NO_TEX): Token[] {
  const command = (i: number) => line[i] === "\\" && /[A-Za-z]/.test(line[i + 1] ?? "") && tex(i);
  const out: Token[] = [];
  const kindAt = (i: number): Kind => (/\s/.test(line[i]) ? "space" : WORD.test(line[i]) ? "word" : "punct");
  for (let i = 0; i < line.length; ) {
    const isCommand = command(i);
    let j = i + 1;
    if (isCommand) while (/[A-Za-z]/.test(line[j] ?? "")) j++;
    else {
      const k = kindAt(i);
      while (j < line.length && kindAt(j) === k && !command(j)) j++;
    }
    out.push({ from: i, to: j, kind: isCommand ? "word" : kindAt(i) });
    i = j;
  }
  return out;
}

/** The library's findWord over tokens: the next (or previous) word from `cur`, skipping a one-letter word the
 *  search starts at the edge of, and an empty line counting as a word when asked. */
export function findWord(lineOf: (n: number) => string | undefined, texOf: (n: number) => TexAt, cur: Pos, forward: boolean, bigWord: boolean, emptyIsWord: boolean): Found | null {
  let n = cur.line, line = lineOf(n), pos = cur.ch;
  if (line === undefined) return null;
  const dir = forward ? 1 : -1;
  if (emptyIsWord && line === "") {
    n += dir; line = lineOf(n);
    if (line === undefined) return null;
    pos = forward ? 0 : line.length;
  }
  for (;;) {
    if (emptyIsWord && line === "") return { line: n, from: 0, to: 0 };
    const toks = bigWord ? bigTokens(line) : tokens(line, texOf(n));
    const order = forward ? toks : [...toks].reverse();
    for (const t of order) {
      if (t.kind === "space") continue;
      if (forward ? t.to <= pos : t.from > pos) continue;
      const start = forward ? Math.max(t.from, pos) : Math.min(t.to - 1, pos);
      const end = forward ? t.to : t.from - 1;
      if (n === cur.line && start === cur.ch && end === start + dir) continue; // at the end of a word: the next
      return forward ? { line: n, from: start, to: end } : { line: n, from: end + 1, to: start };
    }
    n += dir; line = lineOf(n);
    if (line === undefined) return null;
    pos = forward ? 0 : line.length;
  }
}

const bigTokens = (line: string): Token[] =>
  [...line.matchAll(/\S+|\s+/g)].map((m) => ({ from: m.index, to: m.index + m[0].length, kind: /\S/.test(m[0]) ? "word" : "space" }));

/** The library's moveToWord, unchanged but for the word search. */
export function moveToWord(lineOf: (n: number) => string | undefined, texOf: (n: number) => TexAt, last: number, cur: Pos, repeat: number, forward: boolean, wordEnd: boolean, bigWord: boolean): Pos | undefined {
  const start = { ...cur };
  const words: Found[] = [];
  if ((forward && !wordEnd) || (!forward && wordEnd)) repeat++;
  const emptyIsWord = !(forward && wordEnd); // for 'e', empty lines are not words, as in Vim
  for (let i = 0; i < repeat; i++) {
    const word = findWord(lineOf, texOf, cur, forward, bigWord, emptyIsWord);
    if (!word) {
      const eod = lineOf(last)?.length ?? 0;
      words.push(forward ? { line: last, from: eod, to: eod } : { line: 0, from: 0, to: 0 });
      break;
    }
    words.push(word);
    cur = { line: word.line, ch: forward ? word.to - 1 : word.from };
  }
  const short = words.length !== repeat;
  const first = words[0];
  let lastWord = words.pop();
  if (forward && !wordEnd) {
    if (!short && (first.from !== start.ch || first.line !== start.line)) lastWord = words.pop();
    return lastWord && { line: lastWord.line, ch: lastWord.from };
  }
  if (forward && wordEnd) return lastWord && { line: lastWord.line, ch: lastWord.to - 1 };
  if (!forward && wordEnd) {
    if (!short && (first.to !== start.ch || first.line !== start.line)) lastWord = words.pop();
    return lastWord && { line: lastWord.line, ch: lastWord.to };
  }
  return lastWord && { line: lastWord.line, ch: lastWord.from };
}

/** Is TeX spoken at this place: a TeX file, or a note's formula. */
function texAt(view: EditorView, pos: number): boolean {
  const lang = view.state.facet(language)?.name ?? "";
  if (/tex/i.test(lang)) return true;
  for (let n: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1); n; n = n.parent)
    if (n.name === "InlineMath" || n.name === "BlockMath") return true;
  return false;
}

let defined = false;
/** Puts the TeX-aware word motions in place of the library's (once: Vim's motion table is process-wide). */
export function defineWordMotions(): void {
  if (defined) return;
  defined = true;
  Vim.defineMotion("moveByWords", (cm: CM, head: Pos, args: { repeat: number; forward?: boolean; wordEnd?: boolean; bigWord?: boolean }) => {
    const view = cm.cm6;
    const lineOf = (n: number) => (n >= 0 && n <= cm.lastLine() ? cm.getLine(n) : undefined);
    const texOf = (n: number): TexAt => (view ? (ch) => texAt(view, view.state.doc.line(n + 1).from + ch) : NO_TEX);
    return moveToWord(lineOf, texOf, cm.lastLine(), head, args.repeat, !!args.forward, !!args.wordEnd, !!args.bigWord);
  });
}
