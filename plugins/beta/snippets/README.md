# Snippets

What you type becoming what you meant, in math, in text and in code. Snippet files are JavaScript, so a list can be
generated, a body computed, and any place tested with code.

## A file

Every module in `.atlas/snippets/` with an `export default` is read, in name order, and read again when it changes.

```js
export default ({ math, text, code, visual, anywhere, commands, words, vars, std }) => [
  math("//", "\\frac{$1}{$2}$0"),                                  // $1, $2… then $0, the last place
  math(["brk", "<|>"], "\\braket{ ${1:\\psi} | ${2:\\psi} } $0", { name: "Bra-ket" }), // two triggers, a placeholder
  math(/(\d)(\d)mat/, (m) => std.matrix(+m[1], +m[2]), { name: "A matrix by size" }),  // computed
  math("-d", "\\downarrow", { when: (at) => !/[A-Za-z0-9})]$/.test(at.before) }),      // decided by code
  visual("A", (_m, at) => std.align(at.selection)),                // on a selection
  text("cf", "compare", { auto: true, word: true }),
  code(["py", "python"], "ifmain", 'if __name__ == "__main__":\n    $0'),                // a file's extension or a fence's word
  commands(std.greek, { digit: "subscript" }),                     // backslash, and a space after, by name
  words(["bandgap"]),                                              // ordinary words the triggers must leave alone
];
```

| | |
|---|---|
| Options | `auto` (fires as typed; default in math), `word`, `regex` (a string as a regular expression), `priority`, `name`, `note`, `when(at)`, `file` (globs), `form` (`inline`, `display`), `inTextArg`, `test` (`{ typed: result }`, checked in Settings) |
| `at` | `before`, `after`, `path`, `selection` |
| A body | text with stops, `[[0]]` for a regex's groups, or a function `(match, at)` returning text or a promise of it |
| `std` | `greek`, `operators`, `symbols`, `matrix(r, c, kind)`, `align(selection)`, `sequence(x, sep)` |

A file that fails costs that file, and an entry that fails costs that entry: both are shown in Settings. Snippet files
run in the page, with what a plugin may do.

## What holds a trigger back

- **Text inside math.** Nothing fires inside `\text{}`, `\mathrm{}`, `\label{}`, `\begin{}` and the like, unless the
  snippet says `inTextArg`.
- **A command being typed.** `\langle` is not `\l` + `ang`, `hbar` not `h` + `bar`.
- **A longer trigger.** `kV` waits for the next key in case it is `kVA`.
- **An ordinary word.** `spin` holds `pi`, but while the letters typed still start a known word nothing fires, and a word
  that completes stays as typed. Any other key releases what was held: `kpi` is `k\pi`, `spi+` is `s\pi+`.

Backspace right after an expansion gives back what you typed.

## An old LaTeX Suite file

The file named by `[latex] snippets_file` keeps working until you convert it, from Settings → Snippets or the palette
(*Snippets: convert the old snippet file*). That writes `.atlas/snippets/converted.js` and leaves the old file as it was.
The conversion mends rules known to misfire, as one batch, and lists each change at the top of the new file.

## Packs

Ready sets, switched on in Settings and never copied into your files: automatic spacing, matrices by size, sequences, smart
min and max, derivatives by their letters, aligning a selection, colouring a selection, electrical units, small helpers in text.

## Tab in math

Tab goes to the next place to type, one bracket at a time: into the next `(`, `[`, `{`, `\left(`, `\langle`; out of the one that closes next, and straight into a bracket right after it (`\frac{a}{b}`, `(a)(b)`, `x^{a}_{b}`); out of the formula at its end. Shift+Tab goes back the same way. A snippet's own stops come first, and a whole `\command` no longer stops at the completion list.

## The word list

`words.txt` holds about 660,000 English and Spanish words with their inflections, made from the Hunspell dictionaries by `scripts/dev/snippets-words.mjs`: en_US from SCOWL (permissive), es_ES from the RLA-ES project (used under MPL 1.1). Words under four letters stay out, as they are usually products in math (`dpi` is `d\pi`); `ui/src/words.ts` has the short ones and the field's terms. A vault adds its own with `words([...])`.

