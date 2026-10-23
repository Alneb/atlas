# One place where the core writes vault files: `vault_write`

Step 1 of [DESIGN-mirror-v2.md](../design/DESIGN-mirror-v2.md) (§2, "A write needs a lease from the server"): before
the core writes a file of a mirrored vault it must ask the server for the path's lease, sending the hash of its own
copy, and afterwards tell the server the new hash. That check has to sit in **one** place, or a single forgotten
`std::fs::write` (a capture, a tick, a tidy, a plugin's settings) would write without a lease and bring back the
Syncthing conflicts the redesign removes. This refactor builds that place and moves every write of the core into it;
the lease client itself (`lease.rs`, the guard) is built separately on top.

## Before / after

**Before**: 30 modules of `crates/atlas-core/src` changed files directly — 122 raw calls (`std::fs::write`,
`File::create`, `OpenOptions::open` for writing or appending, `rename`, `copy`, `hard_link`, `remove_file`,
`remove_dir_all`, `create_dir_all`). Three of them had their own atomic tmp+rename (files.rs `write_bytes`, capture.rs's
log rewrite, thumbs.rs), two their own owner-only writer (auth.rs `write_private`, secrets.rs), three their own
`create_new` (notes.rs, companion.rs, capture.rs `today_log`).

**After**: `crates/atlas-core/src/vault_write.rs` is the only module that calls those functions. It has three families:

| family | for | asks the guard |
|---|---|---|
| `vault_write::{write, write_with, create, append, rename, copy, link_or_copy, remove_file, remove_dir_all, mkdir, guarded}` | vault content: everything in a vault that Syncthing carries — notes, pages, `.atlas/config.toml`, `.atlas/plugins/**`, `.atlas/plugin-settings/**`, `.atlas/trash/**`, `.atlas/originals/**`, `.atlas/pending/**`, `.atlas/remote/**`, commands, keys | yes |
| `vault_write::cache::{write, append, rename, copy, remove_file, remove_dir_all, mkdir, file}` | per-device state under a vault's `.atlas/cache/` (never vault content); `debug_assert!`s the path is there | no |
| `vault_write::outside::{write, write_private, append, remove_file, remove_dir_all, mkdir}` | files outside every vault: `~/.config/atlas` (vaults.toml, server settings), `$XDG_STATE_HOME/atlas` (agents), `$XDG_RUNTIME_DIR/atlas` (the local key), the secrets store; `debug_assert!`s no guarded vault holds the path | no |

All three share one private `raw` module for the IO itself, so there is one atomic writer (moved from files.rs
`write_bytes`: a temporary `.<name>.atlas-tmp-<pid>-<nanos>` beside the file, `sync_all`, the old file's permissions
kept, renamed into place; `create` links it into place so a taken name is never replaced) and one owner-only writer.

### The API

```rust
pub struct ContentHash(pub [u8; 32]);              // SHA-256 (sha2, already a dependency); Copy, Eq, Hash
impl ContentHash { fn of(&[u8]) -> Self; fn to_hex(&self) -> String; fn from_hex(&str) -> Option<Self>; }
                                                   // Serialize / Deserialize as the 64-character hex string
pub enum WriteKind { Write, Create, Append, Rename { to: String }, Remove, RemoveDir, Mkdir }
pub trait WriteGuard: Send + Sync {
    fn before(&self, rel: &str, kind: &WriteKind, current: Option<ContentHash>) -> Result<()>;
    fn after(&self, rel: &str, kind: &WriteKind, new: Option<ContentHash>);
}
pub struct NoGuard;                                // the default
impl Workspace { fn set_write_guard(&self, Arc<dyn WriteGuard>); fn clear_write_guard(&self); fn write_guard(&self) -> Arc<dyn WriteGuard>; }
pub fn disk_hash(ws: &Workspace, rel: &str) -> Result<Option<ContentHash>>;   // None: no such file

pub fn write(abs: &Path, bytes: &[u8]) -> Result<()>;                         // atomic, parents made
pub fn write_with(abs: &Path, fill: impl FnOnce(&mut File) -> Result<()>) -> Result<()>; // streamed (a download)
pub enum Created { New, Taken }
pub fn create(abs: &Path, bytes: &[u8]) -> Result<Created>;                   // only if absent, race-free
pub fn append(abs: &Path, bytes: &[u8]) -> Result<()>;
pub fn rename(from: &Path, to: &Path) -> Result<()>;                          // parents of `to` made
pub fn copy(from: &Path, to: &Path) -> Result<()>;
pub fn link_or_copy(from: &Path, to: &Path) -> Result<()>;
pub fn remove_file(abs: &Path) -> Result<()>;
pub fn remove_dir_all(abs: &Path) -> Result<()>;
pub fn mkdir(abs: &Path) -> Result<()>;
pub fn guarded<T>(abs: &Path, kind: WriteKind, op: impl FnOnce() -> Result<T>) -> Result<T>; // an outside program's change
```

Each vault function finds the guard of the vault holding `abs`, computes `rel`, hashes the file on disk now
(`current`), calls `before` (an `Err` stops the change, nothing touched), does the IO, hashes what is on disk after
(`new`: the destination of a rename; `None` after a removal or for a folder) and calls `after`.

`rel` and `Rename { to }` are vault-relative and `/`-separated. A path elsewhere (a rename out of the vault) is passed
as its absolute path.

## Decisions

- **The guard is registered by vault root, process-wide**, not stored in the `Workspace` struct. Many modules take a
  bare `root: &Path` (capture, notes, plugins, plugin_install, companion…) and several handlers open a fresh
  `Workspace::open(root)`; a field on one `Workspace` value would not reach them. `ws.set_write_guard` registers the
  guard for `ws.root()` (canonical); a write finds the guard whose root is the longest prefix of its path, and a path
  not under it as given (a symlink, a non-canonical root) is retried through its deepest existing ancestor's canonical
  path. **When no guard is registered (every vault today) nothing is hashed**: the funnel costs one uncontended read
  lock per write.
- **The hash is SHA-256** (`sha2` was already in atlas-core for the sign-in and OAuth), as a newtype, hex on the wire,
  so the lease table and the client cannot mix it up with another string.
- **`before` gets the hash of the whole file** (read in full). Only when a guard is set; fine for notes and drawings,
  measurable for a 100 MB PDF — the lease client may prefer to cache by mtime.
- **Rename**: `before`/`after` are called once, for `from`, with `Rename { to }`; the guard must lease both paths. For a
  plugin install the `from` is the install's work folder in `.atlas/cache/` (the plugin appears at `to`).
- **Borderline paths, decided as vault content** (the brief: "when unsure whether a path is synced, treat it as vault
  content"): `.atlas/pending/` (captures for the hooks; it is meant to travel between devices), `.atlas/remote/` (the
  local copies of remote files: git-ignored, but in the vault Syncthing carries), `.atlas/originals/`, `.atlas/trash/`
  (the trash snapshots of companion_tidy, drawing_compact, plugin removal), `.atlas/suggestions-dismissed.txt`,
  `.atlas/plugin-settings/`.
- **Cache (no guard)**: `.atlas/cache/` only — `ui.log`, `server.json`, `schedule.json` / `schedule.log`, `usage.jsonl`,
  `thumbs/`, `pdftext/`, `rnote/` (the Rnote previews), `plugins/<id>.log` and helper work folders, `sdk/python/`,
  `lsp-<lang>.log`, `discarded/` (git discard's safety copies), `plugin-install-*` work folders.
- **Outside (no guard)**: vaults.toml; `auth::write_private` (server settings, agents.json, agents.terminals.json, the
  local key) — now a one-line wrapper over `outside::write_private`, shared with the secrets store, which had its own
  copy; the new vault's own folder made by `vaults::resolve(…, create)` (no vault holds it yet).
- **No `#[allow(clippy::disallowed_methods)]` outside vault_write.rs** was needed: every outside-the-vault write found a
  function in `outside`.

## Behaviour changes (all on the safe side)

- Writes that were plain `std::fs::write` are now atomic (tmp + rename) and keep the old file's permissions: a reader
  never sees half a file. Touched: attach, put_bytes, property/link/tick edits in server.rs, bases' new note,
  companion_tidy, drawing_compact, drawing_note, config/keys/commands/plugin settings, home, suggestions, server.json,
  schedule.json.
- capture.rs's rewrite of a log with closing blocks used `<name>.md.atlas-tmp` (which `files::is_write_tmp` did not
  recognise); it now uses the funnel's temporary name, which the tree and the watcher skip.
- A fetch saved by a plugin (`plugin_net`, `save_to`) that turns out larger than the limit used to replace the old file
  and then delete it; now it is streamed into a temporary file, so the old copy stays.
- `today_log`, notes' `write_new`, companion's `write_new` used `OpenOptions::create_new`; they use `create` (written to a
  temporary file, then linked into place): still never two creators, and the file never appears empty.

## The clippy rule

`crates/atlas-core/clippy.toml` (clippy reads it for this crate only):

```toml
disallowed-methods = [ std::fs::write, std::fs::File::create, std::fs::OpenOptions::open, std::fs::rename,
  std::fs::copy, std::fs::hard_link, std::fs::remove_file, std::fs::remove_dir, std::fs::remove_dir_all,
  std::fs::create_dir, std::fs::create_dir_all ]   # each with a reason pointing to vault_write
```

The gate's `clippy` stage (`cargo clippy --workspace --all-targets -- -D warnings`) turns any use into a failure.
`vault_write.rs` allows it for itself (`#![allow(clippy::disallowed_methods)]`). Tests write their fixtures freely:
`lib.rs` has `#![cfg_attr(test, allow(clippy::disallowed_methods))]` (unit tests), and each file in
`crates/atlas-core/tests/` an `#![allow(clippy::disallowed_methods)]`.

- `OpenOptions::open` is in the list even though it is also how a file is opened for reading with options: no
  non-test code of the core does that (readers use `File::open` / `fs::read`), so the rule costs nothing today.
- Not in the list: `std::fs::set_permissions` (metadata, not content; the secrets folder's 0700),
  `std::os::unix::fs::symlink` (only tests), `tokio::fs` writers (none used; add them here if one appears).

## The call sites, by module (raw calls replaced)

files.rs 18 · plugin_install.rs 15 · capture.rs 9 · server.rs 8 · vaults.rs 5 · plugin_net.rs 5 · companion_tidy.rs 5 ·
suggest.rs 4 · schedule.rs 4 · companion.rs 4 · usage.rs 3 · thumbs.rs 3 · secrets.rs 3 · plugins.rs 3 · pdf_text.rs 3 ·
helper.rs 3 · drawing_compact.rs 3 · auth.rs 3 · notes.rs 2 · keys.rs 2 · home.rs 2 · helper_api.rs 2 · git.rs 2 ·
drawing_note.rs 2 · config.rs 2 · commands.rs 2 · bases/edit.rs 2 · lsp.rs 1 · draw.rs 1 · capture_hooks.rs 1 —
**122 calls in 30 modules** (counted from clippy's first run with the rule on).

Every function of the core that writes a vault file reaches the funnel through one of them; the higher-level writers
(`files::write_text`, `write_raw`, `put_bytes`, `move_path`, `trash`, `mkdir`, `attach`, capture, `notes::create`,
companion notes, the paper notes…) all end there.

## What is NOT covered

- **Outside programs that write vault files themselves**: a plugin's helper process (it writes through the helper API
  where it can, but may write files directly), `git` (checkout, discard, pull), `gio trash` (wrapped in `guarded`, so
  the guard is asked and told, but the IO is gio's), `pdftotext` (into the cache), Rnote's preview export (into the
  cache), `unzip`/`tar`/`git clone` for a plugin install (into the cache work folder, then renamed in through the
  funnel). A lease for those needs `guarded` around the call or the guard watching the files.
- **Other crates** (not in scope; found with grep):
  - `atlas-app/src/main.rs` writes the Welcome vault's `Home.page` at first start (vault content, but before any core
    or guard exists); `atlas-app/src/web_filters.rs` writes `~/.cache` (outside).
  - `atlas-capture/src/context.rs` writes scratch files (screenshots, a KWin script) in a temp folder (outside); the
    capture itself goes to the core.
  - `atlas-android` writes only in tests and the resource generator (`bin/android-res.rs`); the phone's vault writes
    go through atlas-core, so they are funnelled.
  - `crates/atlas` (the CLI) has no raw writes outside tests.
  - The rule is in `crates/atlas-core/clippy.toml` only; moving it to the workspace root would apply it to these too.
