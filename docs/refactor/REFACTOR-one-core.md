# One core for every local vault of the desktop (2026-10-19)

## Why
Changing vaults must be much quicker, with no new windows — important for performance (2026-10-19). The choice among the options of
docs/design/DESIGN-desktop-remote.md "Step 4": *"Core serves all (Recommended)"*.

## Before
Each local vault was its own process: `POST /api/vaults/open` ran `vaults::open_window`, which started `atlas-app <folder>`
— a new window, a new core, a new port, a new lock key. A server vault already opened in the same window (the bridge).

## After
- `atlas-app` starts its core as `Vaults::Desktop { first, list }` (crates/atlas-app `desktop_core`).
- `crates/atlas-core/src/server_desktop.rs` (a child module of server.rs) keeps a registry: an address name per folder
  of the vault list (the folder name, anything but letters, digits, `-`, `_` turned to `-`; a second one gets `-2`),
  and each vault's router once started. A request to `/v/<name>/…` starts that vault the first time (`start_vault` with
  the prefix `/v/<name>`, in a blocking task, under a lock so two requests never start it twice) and is handed to its
  router with the prefix taken off and `OriginalUri` set, as axum's `nest` does. `/` goes to the window's own vault
  (the one-time `?k=` code kept); anything outside `/v/` (the bridge `/r/…`, `/remote/…`, `capture.html`) goes to the
  window's own vault as before.
- The window's own vault is started with the core, so its `server.json` is there for the CLI, the capture box and agents;
  a vault started later writes its own (`path: "/v/<name>"`), so they find it at its place.
- A vault another Atlas process already serves (its `server.json`, a live pid that is not ours: `vaults::served_elsewhere`)
  is not started: two cores on one vault would run its schedules twice. The page says so (409).
- `GET /api/vaults` gives every local vault its `url` (`/v/<name>/`); `POST /api/vaults/open` answers `{ url }` and the
  page goes there (`location.replace`, no history entry) instead of a new window. `VaultList.manage` says whether vaults
  can be opened, made and taken off the list here (the desktop) or not (a server).
- Each vault keeps its own `.atlas/`: a switch reloads the page, so no plugin of one vault lives on in the other.
- The registry is reached from a vault's state through a weak link (`AppState.desktop`), so the routes do not keep it
  alive; `ServerHandle` stops the schedules and removes `server.json` of the vaults started on demand too.
- The phone (one vault), `atlas serve` and the server's `--vaults-in` modes are unchanged.

## Watch out
- Every vault visited in a session stays warm (watcher, index, helpers) until the window closes. Fine for a handful.
- A window of an older run on another vault keeps that vault: switching to it from here says it is open elsewhere.
- The mirror (a local vault and its server copy, live edit across them, no Syncthing
  conflicts) builds on this: the registry is where a vault learns its mirror.

Test: `crates/atlas-core/tests/server_mode.rs` `the_desktop_core_serves_every_vault_of_its_list_each_started_when_first_opened`.
