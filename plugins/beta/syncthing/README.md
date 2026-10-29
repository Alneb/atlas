# Syncthing

Asks Syncthing to sync a file the moment it changes, instead of after its own watcher delay (10 seconds by default).
It has no pane: it works by itself once switched on.

- Every batch of files the vault's watcher sees change is handed to Syncthing's REST API
  (`POST /rest/db/scan?folder=<id>&sub=<path>`), so a save reaches the other devices in about a second.
- The fewer seconds two copies differ, the rarer conflict copies are.
- The Syncthing folder holding the vault is found by its path (the deepest one), and the API key is read from
  Syncthing's own config when none is set.

## Settings

- **Syncthing's address** (`http://127.0.0.1:8384`): its web interface.
- **API key** (a secret): Syncthing → Actions → Settings → API Key; empty reads it from this computer's Syncthing
  config (`~/.config/syncthing` or `~/.local/state/syncthing`).
- **Folder ID**: empty finds the folder that holds the vault.

## Needs

Syncthing running on the same machine as Atlas's server, syncing the vault's folder. Nothing else: the helper is a
small static Rust program (`engine/`, built into `bin/<target>/syncthing` by `bash engine/build.sh`) that reaches
Syncthing through Atlas's own fetch (`[permissions] net`: 127.0.0.1, localhost).

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`cargo test -p atlas-syncthing` (offline: the folder found by path, the key read from the config, one scan per path,
a machine without Syncthing skipped quietly, a wrong key a failure).
