# Spelling

A wavy line under a word of a note's prose that neither the language's dictionary nor the vault knows.

- **Languages:** Settings → Spelling → Languages lists every language whose Hunspell dictionary is installed
  (`/usr/share/hunspell`, `/usr/share/myspell`, the vault's `.atlas/dictionaries`, or the folder set in Settings). Check
  the ones your notes are in (by default English, Spanish, French and German, as installed), pick the main one, and
  each one's dictionary from what is installed (`en_US + en_GB` usually, or `en_GB` alone, `es_MX`…) — never typed.
  A word right in any checked language is not marked (a Spanish word in an English note). A language's dictionary
  loads the first time it is needed. Without any (the phone, before a computer kept them in the vault), nothing is marked.
- **The vault teaches it:** a word the dictionary lacks counts as right once the vault uses it often enough
  (3 times, in at least 2 notes, by default — or 8 times in one note: a term it is about), counted when Atlas starts. Words you add yourself are kept in
  `.atlas/spelling/words.md`, one per line in its `words` block, free to edit.
- **Only prose:** math, code, links, wikilinks, tags, HTML and the front matter are never checked. Left alone too:
  words under 3 letters (`et al`, `Eq`), acronyms and inner capitals (`GW`, `McDonald`), a capitalised word (a name;
  a typo at a sentence's start goes unmarked), and the word being typed. A hyphenated word is right when its parts are (`sub-bath`), a
  possessive is its word (`pyqcm's`), and English is checked against the American and the British dictionary.
- **The bottom bar** shows the language and how many words are marked on screen of the note in front, and its tooltip
  names that note. It follows the focused editor and the active tab at once; it is there only for a Markdown note being
  edited and for the mail being written (also checked), never for a code file, a PDF, a terminal or a web page. A click
  opens the Spelling panel: the note's language (a button per language sets its `lang:` property), every word marked
  in the whole note with its three likeliest fixes (a click replaces, the word itself selects it in the note, "+ add"
  keeps it), the words you added (× takes one back), and the terms the vault taught that the dictionary lacks.
- **A note's language:** its `lang:` property (`en`, `es`…; honoured for any installed language, checked or not),
  else guessed among the checked languages from its common words, else the main language.
- **Right-click a marked word:** at the top of the menu, suggestions and "Add to this vault's words". Suggestions are
  ranked as a phone keyboard ranks them: the cheapest slip first (a neighbouring key, a missing accent, two swapped
  letters), then the commonest word (the language's word frequencies, and the vault's own words count as common).

How: the helper (QuickJS, in the core) lists and reads the dictionaries with `ls` and `cat` and counts the vault's
words a chunk of notes per call; the page checks with `nspell` (MIT). Prose ranges, words and the language guess are
the app's `ui/src/lib/editor/prose.ts`, shared with the Predictor. Design: the decisions and their reasons are in the
maintainer's notes.
