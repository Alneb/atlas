# Spelling

A wavy line under a word of a note's prose that neither the language's dictionary nor the vault knows.

- **Dictionaries:** the machine's Hunspell ones (`/usr/share/hunspell`, `/usr/share/myspell`, or the folder set in
  Settings), the most common variant installed for each language (`en_US`, `es_ES`…) unless Settings → Spelling →
  Dictionaries names others (`en=en_GB, es=es_MX`). A language's dictionary loads the first time a note in it is
  shown. Without any (the phone), nothing is marked.
- **The vault teaches it:** a word the dictionary lacks counts as right once the vault uses it often enough
  (3 times, in at least 2 notes, by default — or 8 times in one note: a term it is about), counted when Atlas starts. Words you add yourself are kept in
  `.atlas/spelling/words.md`, one per line in its `words` block, free to edit.
- **Only prose:** math, code, links, wikilinks, tags, HTML and the front matter are never checked. Left alone too:
  words under 3 letters (`et al`, `Eq`), acronyms and inner capitals (`GW`, `McDonald`), a capitalised word (a name;
  a typo at a sentence's start goes unmarked), and the word being typed. A hyphenated word is right when its parts are (`sub-bath`), a
  possessive is its word (`pyqcm's`), and English is checked against the American and the British dictionary.
- **The bottom bar** shows the note's language and how many words are marked on screen. A click opens the Spelling
  panel: the note's language (a button per language sets its `lang:` property), every word marked in the whole note
  with its three likeliest fixes (a click replaces, the word itself selects it in the note, "+ add" keeps it), the
  words you added (× takes one back), and the terms the vault taught that the dictionary lacks, most used first.
- **A note's language:** its `lang:` property (`en`, `es`…), else guessed from its common words, else the main
  language in Settings.
- **Right-click a marked word:** at the top of the menu, suggestions and "Add to this vault's words". Suggestions are
  ranked as a phone keyboard ranks them: the cheapest slip first (a neighbouring key, a missing accent, two swapped
  letters), then the commonest word (the language's word frequencies, and the vault's own words count as common).

How: the helper (QuickJS, in the core) lists and reads the dictionaries with `ls` and `cat` and counts the vault's
words a chunk of notes per call; the page checks with `nspell` (MIT). Prose ranges, words and the language guess are
the app's `ui/src/lib/editor/prose.ts`, shared with the Predictor. Design: the decisions and their reasons are in the
maintainer's notes.
