# scripts/vault/ — standalone Python tooling (the "Claude becomes unnecessary" layer)

Each tool is a single file runnable with `uv run --script scripts/vault/<x>.py` (PEP 723 inline deps, no
venv to manage). Each one reads plain files, writes plain files, narrates on stderr, and is safe to
re-run. They are exposed in a workspace as Atlas script commands (`.atlas/commands/*.toml`), so
they appear in the palette without recompiling Atlas.

| tool | what | safety |
|---|---|---|
| `vault_score.py VAULT OUT.md [--root Physics]` | scores Obsidian notes for migration: topic-graph closure from a root topic (lecture → course → Physics), `$…$` density, domain vocabulary, negative `type`s (movie, artist, journal…); writes a checklist, pre-ticking score ≥ 3 | vault read-only |
| `vault_migrate.py VAULT REVIEW.md WS [--apply]` | copies ticked notes: Lecture/Course → `notes/lectures/<course-slug>/`, others → `notes/`; keeps filenames so wikilinks resolve; drops empty frontmatter fields + `cssclasses`/`icon`; copies `![[embeds]]` to `notes/attachments/`; manifest `notes/.vault-migration.tsv` | dry run by default; never overwrites a differing file (exit 1 on conflict) |
| `zotero_sync.py ZOTERO_DIR DEST [--apply]` | Zotero → `DEST/<citekey>/info.yaml` with **every** field (no fixed schema), creators by role, tags, collections, `zotero_key`; PDFs hard-linked; Zotero notes → the reading note `<citekey>.md` via pandoc (`reading_note.py`; ZOTERO.md section 4); standalone PDFs become entries | sqlite opened `mode=ro&immutable=1`; idempotent by `zotero_key` |
| `excalidraw_convert.py SRC OUT_DIR` | Obsidian `.excalidraw.md` (LZString `compressed-json` or `json` block) → plain `.excalidraw` scene JSON | source read-only; never overwrites; per-file failures reported, batch continues |
| `runs_index.py RUNS OUT.json [--md OUT.md]` | any directory holding `.tsv` tables is a run; per run: name tokens, tables (rows/cols; `x.clean.tsv` preferred over `x.tsv`), **parameters = columns constant across rows**, **sweeps = varying numeric columns (min→max)**, figures, reports | read-only on the runs tree; tables sampled to 20k rows |
| `pdf_annotations.py PDF` | highlights (with the text under them), text notes, ink → the paper's reading note `<citekey>.md` (`refs/papers/<key>/`, made with its head if missing) or `<name>.notes.md`, inside `<!-- atlas:annotations -->` markers | replaces only its own block |
| `refs_bib.py REFS OUT.bib` | BibTeX from `info.yaml` (type + field maps) | derived file, header says do-not-edit |

## Measured on real data
- Vault `~/.obsidian`: 246 candidate notes → **80 likely, 2 unsure**, 164 left out. Spot checks:
  a group-meeting note (ALL-CAPS + LaTeX, all-null frontmatter) 3.6 ✓ in; `fermi_hubbard_summary` 10 ✓;
  movies / recipes / music out ✓. Trial migration into a scratch workspace: 80 notes + 61 attachments,
  0 conflicts; lectures grouped as quantum-matter (14), supcondfatc (8), i2ndq (7), topmat (6), nlem (6), ionp (3).
  The vault's `git status` was unchanged (27 entries before and after).
- Zotero `<vault>/refs/zotero`: 42 regular items (26 articles, 10 books, 3 theses, 2 preprints,
  1 conference paper) + 12 standalone PDFs = **54 entries, 53 PDFs hard-linked** (link count 2 verified);
  a second run creates 0. `refs.bib`: 54 entries.

- Runs `<vault>/runs` (12 GB): **61 run directories** indexed in 32 s; e.g. one simulation run → sweep U 3→7, 22 figures,
  12 constant parameters incl. `commit_id`, `dist_function`, `model`.

## Known gaps
- `runs_index.py` picks the largest table as the run's main one (often the per-iteration table); `dos_data/` subfolders
  show up as 0-row runs (their TSVs don't parse as tab tables) — harmless, filter in the view.
- Standalone PDFs get weak citekeys (`anon03` from "03 Functional Fields"); rename the folder freely —
  `zotero_key` keeps re-imports idempotent.
- `vault_migrate.py` copies `.excalidraw.md` embeds as-is; run `excalidraw_convert.py` on `notes/attachments/` to get
  plain `.excalidraw` files (measured: 21/21 of the vault's drawings convert, 17–47 elements each). Wiring the two together is slice 3.
- Rnote: `flatpak run --command=rnote-cli com.github.flxzt.rnote export …` works on this machine (0.14.2) — the slice-3 SVG export path.
- `date` from Zotero can carry its internal double form (`1996-01-01 1996-1-1`); the bib generator
  extracts the year, so harmless.


> `refs_bib.py` is superseded by Atlas's library (`refs.rs` writes the same BibTeX after every add; verified identical on the 54 real entries). Kept for scripting without the app.


`runs_index.py` was removed: the indexer now lives with the research workspace as the Runs plugin's `<vault>/.atlas/plugins/runs/index.py` (same rules, series sampling, cache; `--md` for the table) — see [PLUGINS.md](PLUGINS.md). The rows above document its rules.



## zotero_sync.py (replaces zotero_import.py)
One-way **sync**, Zotero → `refs/papers` (Zotero is only read; a locked database is read from a checked copy).
Finds the library by Zotero's own `extensions.zotero.dataDir` (desktop and flatpak profiles; the real one can live in a custom folder, not the stale copy in
`<vault>/refs/zotero` the importer used). Per field, a
three-way rule against the state of the last sync (`.atlas/cache/zotero-sync.json`): changed only in Zotero →
updated; only in Atlas → kept; in both → Atlas's kept and listed in `refs/ZOTERO-SYNC.md`. Zotero notes live in
the reading note `<citekey>.md` (a legacy `notes.md` is renamed first) between `<!-- zotero:note KEY -->` markers (text around them is the vault owner's); items in Zotero's trash
are reported, never deleted; a run with an unchanged database exits at once. Workspace command
`refs.sync-zotero` (schedule `every 10m`, then `refs_bib.py`). Tests: `scripts/vault/tests/test_zotero_sync.py`, `scripts/vault/tests/test_pdf_annotations.py` (`cd tools && uv run --with pyyaml --with pymupdf python -m unittest discover -s tests`)
(`uv run --with pyyaml python -m unittest`). First real run: 54 entries, 0 changes, 0 conflicts.
