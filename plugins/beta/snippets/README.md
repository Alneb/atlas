# Snippets

What you type becoming what you meant, in math, in text and in code. Snippet files are JavaScript, so a list can be
generated, a body computed, and any place tested with code.

## A file

Every module in `.atlas/snippets/` with an `export default` is read, in name order, and read again when it changes.

```js
export default ({ math, text, code, visual, anywhere, commands, words, vars, std, option, options }) => [
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
- **A misspelt command that is a word.** A command is also typed misspelt: two neighbouring letters swapped (`alpah`)
  or, in a name of five letters or more, one inside dropped (`lamda`), when nothing else is so spelled. Such a
  misspelling never fires where it is a word of the dictionaries: `range` stays `range`, not `\rangle`.

In math, a trigger typed from its first letter is meant: `ket`, `frac`, `ee`, `cdot` fire on their last letter, with no
Space. It waits only when the snippets themselves make something longer from it (`the` while `theta` may follow). A
bare command name under three letters (`mu`, `to`) and a trigger inside longer letters (`pi` of `spin`) still wait for
the word. Words in math belong in `\text{}`.

Backspace right after an expansion gives back what you typed; Undo takes back the expansion and leaves the trigger as
typed. A Space right after an expansion that left the caret inside its bracket or after its own space types nothing
(the habit of ending a trigger with Space). `^` and `_` take away the spaces before them in math (`\ket{\psi} ^2` →
`\ket{\psi}^2`).

## An old LaTeX Suite file

The file named by `[latex] snippets_file` keeps working until you convert it, from Settings → Snippets or the palette
(*Snippets: convert the old snippet file*). That writes `.atlas/snippets/converted.js` and leaves the old file as it was.
The conversion mends rules known to misfire, as one batch, and lists each change at the top of the new file.

## The plugin's set, and your own files

Snippets come only from the files in `.atlas/snippets/`. The LaTeX set is the plugin's: `starter.js` beside the
plugin, kept in the vault as `.atlas/snippets/latex.js` and **kept current by the plugin** — written when missing,
replaced when a new version of the plugin brings a different set (the copy it replaces goes to `.atlas/trash/`). Turn
any snippet or option of it on or off in Settings → Snippets (the switches are kept in the plugin's settings, so an
update keeps them). Snippets of your own go in another `.js` file in that folder, read beside the set. While a vault
still has an old LaTeX Suite file that is not converted, the set waits, so the two never both fire.

## Options

An option is a set of snippets switched on or off as one, declared in the file:

```js
options.spacing(),                 // automatic spacing: bare names get their backslash, \sin x, \times 10
options.units({ on: false }),      // starts off; Settings switches it on
option("Quantum", "Bras, kets and their products.", [math("ket", "\\ket{$1}$0"), math("bra", "\\bra{$1}$0")]),
```

Ready ones: `spacing`, `autoAlign` (`malign` writes a `$$align` block, drawn aligned at each line's relation; `menv` stays plain), `matrices` (33pmat), `sequences` (xsum), `minmax`, `derivatives` (dydt), `align` (a selection + A),
`colors` (a selection + R), `units` (mV, kΩ…), `textHelpers` (ie, eg, ##). `option(title, description, entries, { on })`
makes one of your own.

## Tab in math

Tab goes to the next place to type, one bracket at a time: into the next `(`, `[`, `{`, `\left(`, `\langle`; out of the one that closes next, and straight into a bracket right after it (`\frac{a}{b}`, `(a)(b)`, `x^{a}_{b}`); out of the formula at its end. Shift+Tab goes back the same way. A snippet's own stops come first, and a whole `\command` no longer stops at the completion list.

## Settings

Settings → Snippets shows the options, every problem found (a trigger an earlier one takes, a failing `test`, a trigger
firing inside an ordinary word), and every snippet, searchable: a switch, the trigger, what it gives drawn as a formula,
where it fires and which file or option it comes from. A switch turns a snippet or an option the other way from what the
file says, kept in the plugin's settings (`switched`), without touching the file; a snippet of an option that is off is
shown struck through. **Try** types what you enter into a hidden editor, in inline or
display math, text or code, and shows what comes out; Tab in that box is typed as a tab, to walk a snippet's stops.

## The list while typing

Short starts and typo spellings of a trigger (`mfr`, `iitn`) fire but are not offered. In math, from two letters, a list offers the snippets whose trigger begins with what was typed; from three, also those
whose name holds it, or holds its letters in order from a word's start (`lrar` finds "left right arrow"), in that order.

## The word list

`words.txt` holds about 660,000 English and Spanish words with their inflections, made from the Hunspell dictionaries by `scripts/dev/snippets-words.mjs`: en_US from SCOWL (permissive), es_ES from the RLA-ES project (used under MPL 1.1). Words under four letters stay out, as they are usually products in math (`dpi` is `d\pi`); `ui/src/words.ts` has the short ones and the field's terms. A vault adds its own with `words([...])`.

