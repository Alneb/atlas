# The reading note: `notes.md` → `<citekey>.md`, with the paper on top

What a paper's note is now, for users: [ZOTERO.md](../guides/ZOTERO.md), section 4. This page is the change itself: what moved, why, and what to watch.

## Why
On 2026-10-14, clicking `[@maier2005quantum]` opened `refs/papers/maier2005quantum/notes.md`, a blank file. A paper's note should show a view from the plugin with the PDF embedded and the rest of the information, along with a place to write notes. And every paper's note being `notes.md` was bad for wikilinks: 54 papers, one name. Chosen: name the note after the citekey, so `[[maier2005quantum]]` is unique and is the same word as the citation.

## Before → after
| | before | after |
|---|---|---|
| the file | `<paper folder>/notes.md` | `<paper folder>/<citekey>.md` |
| who decides the path | five places built `${dir}/notes.md` (chip, Library ×2, "notes beside", connector ×2) and two scripts | the core, `reading_note.rs` (`POST /api/refs/note`); the UI only opens what it returns (`lib/papers.ts`: `openReadingNote`, `ensureNoteOf`); the scripts use `scripts/vault/reading_note.py` |
| a new note | an empty file the editor created on first save | frontmatter (`type: literature`, `citekey`, `title`, `authors`, `year`, `source`, `created`, or the vault's `literature` template filled in), `# title`, the `library.paper` block, `## Notes` (or the template's sections) |
| what the note shows of the paper | nothing | the `library.paper` block: metadata, links, tags, abstract, the PDF embedded (the PDF block itself) |
| `Paper.has_notes` | `notes.md` exists | either name exists |
| annotation export into a paper | appended to `notes.md` | the UI makes the note first, then the script appends its marked block to `<citekey>.md` |

## Migration
On first use, not in bulk: whatever asks for a paper's note (the route, `append`, the scripts) renames a legacy `notes.md` that has no `<citekey>.md` beside it. Text that already has a frontmatter is renamed byte for byte; text without one gets the head above it and stays as it was below; an empty file counts as no note. Nothing is ever replaced: the new file is created with `create_new`, and an existing `<citekey>.md` wins over a legacy file (which is then left alone). A real vault (14 legacy notes: 13 Zotero imports and one empty file) was migrated on 2026-10-14 with this same function from a one-off program, so the result is what Atlas itself would write.

## What to watch
- **Two implementations of the head**: Rust (`reading_note.rs`, template-aware) and Python (`scripts/vault/reading_note.py`, built-in head only, because the scripts run without Atlas). Change one, change the other; both have tests.
- **A citekey change** (editing `citekey:` in `info.yaml`) leaves the note under the old name; the next ask makes a new one. Not handled: rename the note by hand. (Folder names and citekeys agree in the real vault; `paper_of` prefers `citekey` over the folder name.)
- **`library.paper` is a dotted name** like a plugin's block: with the Library switched off it still mounts and says that the Library is off, instead of waiting for a plugin.
- **The PDF inside the block** is a nested `mountBlock`: it has its own "open as tab" button and its own height (`pdf_height`, 760); keys inside it stay in it, as in any block.
