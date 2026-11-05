# Spelling

A wavy line under a word of a note's prose that neither the language's dictionary nor the vault knows.

- **Dictionaries:** the machine's Hunspell ones (`/usr/share/hunspell`, `/usr/share/myspell`, or the folder set in
  Settings), the most common variant installed for each language (`en_US`, `es_ES`…) unless Settings → Spelling →
  Dictionaries names others (`en=en_GB, es=es_MX`). A language's dictionary loads the first time a note in it is
  shown. Without any (the phone), nothing is marked.
- **The vault teaches it:** a word the dictionary lacks counts as right once the vault uses it often enough
  (3 times, in at least 2 notes, by default), counted when Atlas starts. Words you add yourself are kept in
  `.atlas/spelling/words.md`, one per line in its `words` block, free to edit.
- **Only prose:** math, code, links, wikilinks, tags, HTML and the front matter are never checked. Acronyms and words
  with a capital inside (`McDonald`, `GitHub`) are left alone, as is the word being typed.
- **A note's language:** its `lang:` property (`en`, `es`…), else guessed from its common words, else the main
  language in Settings.
- **Right-click a marked word:** suggestions (two swapped letters first, then the dictionary's, those the vault uses
  most first) and "Add to this vault's words".

How: the helper (QuickJS, in the core) lists and reads the dictionaries with `ls` and `cat` and counts the vault's
words a chunk of notes per call; the page checks with `nspell` (MIT). Prose ranges, words and the language guess are
the app's `ui/src/lib/editor/prose.ts`, shared with the Predictor. Design: the decisions and their reasons are in the
maintainer's notes.
