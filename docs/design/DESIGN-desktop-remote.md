# A vault on a server, from the desktop

The goal (2026-10-18): the desktop app's vault selector does what Android's does, including connecting to a remote
server. No local relay at first: the desktop's own JavaScript talks to the server's API directly, and Authelia is
handled as in the Android app — through the browser, or as for the plugins.

## What it is

- **The picker** (Ctrl+Alt+V, ui/src/lib/vaults.ts): "Connect to a server…" asks for an address — a vault's
  (`https://atlas.example.org/v/notes/`) or the server's own (its first vault). `POST /api/vaults/open` with an address
  instead of a folder (vaults.rs `server_address`) keeps it on the vault list (`remember_server`: named
  `host · vault`, `url` = the address) and starts `atlas-app <address>`. Server vaults are listed beside the folders
  ("on a server, opens in its own window", a server icon) and can be taken off the list like a folder.
- **The window** (crates/atlas-app `remote_window`): no core on this machine; one window on the server's own page. The
  JavaScript is the desktop's — the server serves the same UI build (after the server is updated, the same version).
- **The sign-in**: what the plugins' doors already do — the gate in front (Authelia: password, a security key) shows
  its page in the window, WebKit keeps its session for the next start, as a browser would. The window follows the gate
  to its own host and back; a link the page opens goes to the desktop's handler.

## Why not the local page calling the server's API

A page of `127.0.0.1` calling `https://atlas.example.org` is a cross-site request: the browser never sends Authelia's
session cookie (SameSite=Lax) with it, and no script may set a `Cookie` header. Android can (`Server.headers` puts the
gate's cookies on each request itself, from Java), a page cannot. With the page on the server, the page and its API are
one site and the session goes with every call; that is the same JS pointed at the server's API.

## Not done yet

- A sign-in through the system browser (Android's `/auth/app` with the gate's session handed back) for a WebKit that
  cannot reach a security key: the in-window gate works with the user's key on the desktop (the doors rely on it).
- Offline: a server vault needs the server; a local copy (Syncthing) is its own folder vault.


## Revised (2026-10-19): the desktop's own JS on the server's API, in the same window

After trying the window on the server's page: it was not well integrated — the vault selection became only the
server's, while the desktop's own JS and assets should be used (with the server's API, and only plugins from the
server); and changing vaults should be much quicker, with no new windows. Given that a page of 127.0.0.1 cannot carry Authelia's cookie to
the server (cross-site, SameSite=Lax; a page may not set `Cookie`): **an in-app bridge**, as Android does in Java.

The plan:
1. **The bridge** (core, desktop only — a locked local core): `/remote/<host>/<rest>` forwards any method, body and
   query to `https://<host>/<rest>`, adding the gate's session the core keeps for that host (service_signin's door
   cookies — the same sign-in window the plugins use, a security key works there) and Atlas's device token if one is
   kept; the answer streams back (hop-by-hop headers dropped, Set-Cookie kept in the store). A WebSocket upgrade is
   piped both ways (events, live rooms, terminals). Only hosts on the vault list are forwarded.
2. **The window**: the desktop's own UI; a server vault sets `window.__ATLAS_API__` to `/remote/<host>/v/<vault>` on
   the local core, so every call and socket of the UI goes through the bridge. The plugins' own files come from the
   server (they are the server vault's), the app's from the desktop.
3. **The picker**: local folders and server vaults (and a server's vaults, listed through the bridge) in one list;
   choosing one switches the window (no new window); a sign-in is asked for when the gate answers with its portal.
4. Afterwards: local vaults switched in the same window too (one core serving several vaults, as `atlas serve` does
   with `/v/<name>/`), so a switch is a navigation, not a new process.

The in-app bridge was chosen on 2026-10-19.

Steps 1–3 built (2026-10-19): `crates/atlas-core/src/remote_bridge.rs` (`base()` from the vault list,
`forward()` — no redirects followed, a gate's redirect answered `401 {signin}` — and `pipe()` for sockets; its test
runs a local server), the `/remote/{host}/{*rest}` route (refused unless the core is a locked desktop core), pages at
`/r/<host>/<vault path>/` (index.html with `__ATLAS_API__` = `/remote/<host>/<vault path>`), the picker (ui
lib/vaults.ts) listing the desktop's vaults with the server's and navigating this window, and the API client opening
the door window on a `signin` answer, then reloading once the bridge lets it through. Not yet tried against a real server from
the desktop window.

## Step 4, designed (2026-10-19 night): local vaults in the same window

**Today.** Each local vault is its own process: `POST /api/vaults/open` runs `vaults::open_window`, which starts
`atlas-app <folder>`. That means a new window, a new core and a new port, and every page is locked to its own core's
cookie. A server vault, by contrast, now opens in the same window (`/r/<host>/<vault>/` through the bridge). Both should
switch quickly, with no new windows.

**Options.**
1. **(Recommended) The desktop core serves every remembered local vault, the way the server does.** The served mode
   already exists for a server (`st.served`: several vaults, each at `/<vault>/`, the page's `__ATLAS_API__` pointing at
   it). The desktop core would use it over `vaults.toml`'s folders, still locked to its own window's cookie. Switching
   becomes a navigation, the same as a server vault: one window, one process, *local and remote the same*. Costs:
   - each open vault keeps its watcher and index warm in one process;
   - `with_ws` becomes per request vault instead of one `st.ws`;
   - the terminals and the MCP server need their vault named.
2. A hidden core per vault, the window navigating to its port. It is cheaper to build, but every switch starts a core
   (slow, against "way quicker"), and the lock cookie has to be handed between cores.
3. Keep the windows and only make them start faster. That ignores "no new windows".

**What to watch.**
- The `.atlas/` of each vault stays its own: plugins, settings, workspace. A switch reloads the page so that no
  plugin of the first vault survives into the second.
- The desktop's `served` mode must never listen beyond 127.0.0.1.
- Old windows still open on another vault keep working until they are closed.

Not started: it is an architecture change (a `REFACTOR-` doc when it lands), left for later.
