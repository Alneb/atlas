# Syncthing

Asks Syncthing to sync a file the moment it changes, instead of after Syncthing's own watcher delay (10 seconds by
default). The fewer seconds two copies of a vault differ, the rarer the conflict copies a mirrored vault has to merge.
It has no pane: once switched on it works by itself.

## What it adds

- **A changed-files hook** (`on = "fs"`): each batch of paths the vault's watcher sees change — Atlas's own writes and
  any other program's — is handed to Syncthing's REST API (`POST /rest/db/scan?folder=<id>&sub=<path>`). Batches that
  arrive while one call runs are joined into the next.
- **The tool `scan`** `{ paths }`.
- The Syncthing folder holding the vault is found by its path (the deepest one), and the API key is read from this
  computer's Syncthing configuration when none is set.

## Settings

- **Syncthing's address** (`http://127.0.0.1:8384`): its web interface.
- **API key** (a secret): Syncthing → Actions → Settings → API Key; empty: read from the local Syncthing configuration.
- **Folder ID**: empty: the Syncthing folder that holds this vault.

## How it fits

No requirements. Useful with mirrored vaults (docs/guides/SERVER.md); the core's mirror merges what still conflicts.

## Needs

Syncthing running on the machine where Atlas's core runs (the network permission is only `127.0.0.1` and
`localhost`). The helper is built by `bash engine/build.sh` (Rust; not committed).

## Platforms

Linux works; the others are untested.

## Status

Beta. Unit tests in the engine (`cargo test`); no end-to-end spec against a stand-in Syncthing yet.
