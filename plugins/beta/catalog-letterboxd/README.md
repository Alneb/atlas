# Catalog · Letterboxd

Films for the catalog from Letterboxd and IMDb links, and every film you watched on Letterboxd as a film note, with no
key. A Letterboxd film link, an IMDb link or a bare IMDb id (`tt0816692`) is recognised as a film; its Letterboxd page
gives the title, original title and language, year, director, cast, genres, runtime, poster, synopsis and the TMDB and
IMDb ids (Letterboxd answers any IMDb or TMDB id with the film's page, which IMDb itself does not do for programs).

This plugin is kept out of the public repository for now (`publish/overlay.txt`).

## What it adds

- `[contributes.catalog]`: three patterns (Letterboxd film pages, IMDb title links, a bare `tt…` id) and a source for
  `movie` (the `lookup` tool, priority 60).
- **`sync`** (runs by itself every hour on the served vault): files the films you watched — your rating, the day from
  your diary, your like (`liked: true`), your review — from the diary feed, reviews and films list, a slice each run,
  remembering where it got to. Pages Letterboxd refuses to programs are named in its summary.
- **Your export, for what the pages refuse**: put Letterboxd's data export (Settings → Data → Export your data; the
  zip or its unpacked folder) in the vault and run **Letterboxd: import your export…**. The command lists the exports
  it finds, reads the one you pick (`import_export`), and runs one sync at once; the following syncs file the rest,
  each film with its current rating, newest watched date, like and newest review.
- Tools: `lookup`, `sync`, `import_export`, and `exports` (the exports found in the vault).

## Settings

- **Your Letterboxd username**: whose watched films are filed; the profile must be public. Empty: no sync.
- **Shelf for watched films** (`[[watched]]`): the status a watched film gets, written as your vault writes it.

## How it fits

`requires = ["catalog"]`. Films it files are the catalog's `movie` notes, so TMDB and Wikipedia fill the same notes.

## Platforms

Linux works; the others are untested; not in the phone app. The helper is JavaScript run inside Atlas's core.

## Status

Beta. Unit tests on cut-down Letterboxd pages in `fixtures/` and an export built in the test
(`node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-letterboxd`).
