# Zstandard

Opens Zstandard-compressed files (`*.zst`) as the file they hold: a click on `results.tsv.zst` shows the table of
`results.tsv`, a `log.txt.zst` opens in the text editor, each in the view Atlas (or the vault's `[files] open_with`)
gives the inner name. For data kept compressed on disk (simulation outputs compress ten times or more).

## What it adds

- **A claim on `*.zst`** (`claims` in `plugin.toml`): a click in the file tree, a link or the palette opens the plugin's
  pane, which asks the helper to decompress the file and opens the copy in its place. "Open with…" still offers the
  others.
- A helper in JavaScript (run inside Atlas's core) that runs the machine's `zstd -d` through `atlas.exec`
  (`[permissions] exec = ["zstd"]`), writing `x/y.tsv` for `x/y.tsv.zst` under `.atlas/cache/plugins/zstd/`, the
  folders kept so the tab, the view and the name match the original.
- Two settings: how long an unopened copy is kept (`cache_hours`, 24) and how large the cache may grow (`cache_mb`, 500).

## How it fits

- **Read-only in effect**: the `.zst` is never written. The copy can be edited, but an edit stays in the cache and is
  replaced the next time the `.zst` is opened.
- The copy is made afresh on every open (zstd decompresses about a gigabyte a second), so it never shows stale data.
- **The cache prunes itself.** After each open the helper deletes, from `.atlas/cache/plugins/zstd/` only, the copies
  not opened for 24 hours, then, while the folder still holds more than 500 MB, the copies opened longest ago; the
  copy just opened is never deleted, and folders left empty go too. A copy's modification time is its last open (the
  helper `touch`es it, since zstd gives it the `.zst`'s own time). Both limits are settings ("Keep copies (hours)",
  "Cache size (MB)"). A pruning failure is written to the plugin's log and the file opens all the same. The folder
  can still be deleted by hand at any time.
- Pruning runs `find` (GNU, for `-printf`), `rm` and `touch` through `atlas.exec`, with no shell (`[permissions] exec`):
  the helper's file API can neither read a file's time and size nor delete outside the trash, and a cache does not
  belong in the trash.
- Needs `zstd` on the PATH of the machine running Atlas (`dnf install zstd`, `apt install zstd`, `brew install zstd`).
  Without it the pane says so.

## Files

- `plugin.toml` — the manifest: the claim, the settings, the permissions, the helper.
- `view.js` — the pane: decompress, open the copy, close itself.
- `helper/helper.ts` — the helper's source; `helper.js` is built from it by `node scripts/dev/plugin-ui.mjs plugins/beta/zstd`.
- `helper/helper.test.ts` — its tests, run by `node scripts/dev/plugin-ui.mjs --check plugins/beta/zstd`.
