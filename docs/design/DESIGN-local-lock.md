# The local server, closed to other programs (design)

The requirement (2026-10-16): the local web server, on the desktop or on Android, is protected so that other apps cannot reach it — only the capture, the plugins and the MCP clients that are allowed.

## Where it stands

A local core (the desktop app's, `atlas serve` without `--listen`, the phone app's `Core.serve`) listens on `127.0.0.1:<port>` and lets through any request that:

- names `127.0.0.1` / `localhost` as its Host (against DNS rebinding: a web page cannot point a name of its own at the port),
- sends `x-atlas: 1` (a web page cannot send a custom header to another origin without a CORS preflight, which the core never answers),
- or, for a WebSocket, comes from a page of the same origin.

That stops **web pages**. It does not stop **programs**. Any process on the machine can send those two headers: on the desktop, any program of any user; on Android, **any installed app**, because the loopback interface is shared by every app on the phone. The phone case is the serious one: an app with no permissions at all could read and write the whole vault.

Server mode already has what is needed: sessions, device tokens with scopes, and a per-run **local key** for this machine's user (`auth.rs`, `local_key_file`, owner-only in the runtime folder).

## The design: every request carries a credential, in every mode

| who | what it presents | how it gets it |
|---|---|---|
| the desktop window (Tauri) | a cookie `atlas_local` (HttpOnly, SameSite=Strict) | the app opens `/?k=<one-time code>`; the core swaps the code for the cookie and redirects to `/` |
| a browser tab on the desktop | the same cookie | the "Open in browser" command hands it a fresh one-time link; a typed `http://127.0.0.1:<port>/` gets a page saying where to open it from |
| the `atlas` CLI, the desktop capture box | the local key (`Authorization: Bearer atl_…`) | the key file, owner-only (the same file server mode uses) |
| plugins' helpers | nothing: they call over their own pipe (helper_api.rs) | — |
| MCP agents | a device token of their own, named, with a scope (see the question below) | made in Settings → Agents ("Allow Claude Code"), written into the agent's MCP config |
| the phone's full app (WebView, native places) | a per-start key held in the app's memory | WebView: `CookieManager` before the first load; `Api.java`: the header |
| the phone's capture app (another APK, so another Linux user) | a capture-scoped device token | the full app hands it over through a component protected by a **signature permission** (only apps signed with the same key can call it) |
| any other app or program | nothing | **401** |

So the same `guard` serves both modes: local mode becomes "server mode with the owner pre-signed-in through the key", and the code paths for tokens and scopes are the ones already tested.

## What it does not promise

On the desktop, a program running as the **same user** can read the key file and the cookie store; that is the boundary every desktop app has (such a program could also read the vault's files directly). What changes is that other users, sandboxed apps (Flatpak, Snap without home access), containers and web pages are kept out. On Android the boundary is real: apps are separate users and cannot read another app's private files.

## The user's answers (2026-10-16)

- MCP agents: **a token per agent**, made in Settings → Agents and revocable one by one.
- A browser tab on the desktop core: **only through a one-time link** ("Open in browser").

## Steps

1. Core: a local key for every run in local mode (not only server mode); `guard` requires a credential (cookie, key, token) unless the request is a helper's in-process call; the one-time-code → cookie swap; tests for each client kind and for a bare `x-atlas: 1` request (refused).
2. Desktop: Tauri opens the one-time link; the capture box and the CLI read the key file (the CLI already does in server mode).
3. MCP: agent tokens and the Settings page to allow an agent.
4. Android: the key into WebView and `Api.java`; the capture APK's token over a signature-permission component.
5. Docs: SERVER.md, ANDROID.md, PLUGIN-API.md; DEVELOPING.md's guard description.

## Built (2026-10-16) — steps 1, 2 (most), 4

- **Core** (`crates/atlas-core/src/local_lock.rs`, server.rs `locked`): `Listen::Local(port, Lock::Open | Lock::Locked { fixed })`. Locked: a random `atl_…` key per run, written owner-only to `$XDG_RUNTIME_DIR/atlas/server-<port>.key` (the file server mode already used, so the `atlas` CLI and `atlas mcp` get in unchanged); `guard` admits the key as `Authorization: Bearer`, `x-atlas-token` or the `atlas_local` cookie (HttpOnly, SameSite=Strict); a page opened with `?k=<code>` (a one-time code, 2 minutes, `ServerHandle::open_url()`, `POST /api/local/link`) gets the cookie and is redirected to the same address without the code; anything else gets 401 (the API) or a page saying where Atlas is opened from (`login_page::locked_page`). The old Host and `x-atlas: 1` checks stay behind it. Helpers' in-process calls pass first. Constant-time comparison.
- **Phone** (`crates/atlas-android/src/serve.rs`, AtlasActivity): the in-app core is **always locked**; `Core.serve` answers `{port, open}` and the WebView loads `open` (a fresh one-time address each time), so the cookie lives in the app's own WebView store, which no other app can read. Tested in `serve.rs` (another app refused; the app's link → cookie → API and page).
- **Desktop** (crates/atlas-app): the window opens `server.open_url()`; the raw POSTs (update notice, sign-in hand-off) send the key from the key file; the dev UI's Vite proxy signs with `ATLAS_API_KEY`. **Off by default for now** (`ATLAS_LOCAL_LOCK=1` turns it on): to flip it, the capture window on a running core (`--capture`, a core of another process: needs `POST /api/local/link` with the key file) and the browsing/sign-in windows must be checked in the installed app first.
- **"Open Atlas in the browser"** (command `ui.open-in-browser`): a locked core's one-time link, an open core's address; in the app, the core's own address goes to the desktop's browser (`on_new_window`), not a browsing window.
- **Tests run locked**: `ui/playwright.config.ts` starts the core with `ATLAS_LOCAL_LOCK=1` and a fixed key, given to the browsers as the cookie and to the request fixture as a header. `ui/tests/local-lock.spec.ts`: a stranger gets 401 and the locked page; a fresh browser with only the link gets the app; the link works once.
- Not yet: the capture APK's token over a signature permission (the capture app writes through JNI, not HTTP, so it needs none today), the desktop default.


## Built (2026-10-17) — step 3, a token per agent

- **Core** (`crates/atlas-core/src/agents.rs`): `Agents` — named tokens (`auth::Token`, hashes only) in `$XDG_STATE_HOME/atlas/agents.json` (`ATLAS_AGENTS_FILE`), per machine, read afresh on every check so a revoke in one core reaches all. `locked()` in server.rs: a request marked `x-atlas-client: mcp` needs an agent's token — this machine's key alone is refused (401, "Settings → Agents → Allow an agent") — and an agent's token never reaches `/api/agents`. `GET/POST /api/agents`, `DELETE /api/agents/{name}`; 400 in server mode (device tokens and the `mcp` switch there). "Last used" is written at most once a minute.
- **`atlas mcp`** (crates/atlas): sends `ATLAS_AGENT_TOKEN` instead of the key file; `Server::reach` tells a refusing core (`Reach::Refused`) from no core, and `atlas mcp` stops with the core's reason instead of quietly working on the files.
- **Settings → AI agents** (`AgentsPanel.svelte`, a page shown off a server, `only: "local"`): the agents with when they were allowed and last used, Revoke, and Allow an agent → the token once with `claude mcp add atlas --scope user -e ATLAS_AGENT_TOKEN=… -- atlas mcp` to copy. On an open core it says the tokens take effect once the core is locked.
- Decided without asking (standing rule): the token is shown with a command to copy rather than written into `~/.claude.json` by Atlas (a program editing another program's config unasked); agents are per machine, not per vault; an agent's scope is the owner's minus managing agents.
- Tests: `agents.rs` (allow, refuse a used name, who, revoke seen by a second store, only hashes on disk), `tests/agents.rs` (over HTTP: key-only mcp refused, its token in, an agent cannot mint, revoke shuts it out), `ui/tests/settings-agents.spec.ts`.


## The desktop locked by default (2026-10-17)

The desktop is configured with the lock now.
- `Lock::desktop()` (local_lock.rs): the desktop app's core is **locked unless `ATLAS_LOCAL_LOCK=0`**; `atlas serve` without `--listen` and the tests keep `Lock::from_env`'s opt-in.
- **The capture box** (`atlas-app --capture`) was the last window that would have been shut out: against the open Atlas it now asks `POST /api/local/link` (with the key file, as the CLI) and opens `capture.html?k=<code>#capture` (`capture_page`); its own core opens its `open_url()`. `post()` in atlas-app now returns the answer's body and fails on a non-2xx status.
- **Agents in Atlas's terminals**: *"Atlas hands it out"*. An agent terminal (today the Claude preset; any `[[agent]]` later) gets `ATLAS_AGENT_TOKEN` in its environment, the token of one shared agent `"Agents in Atlas terminals"` (agents.rs `TERMINAL_AGENT`), made on first use and kept owner-only in `agents.terminals.json`; `atlas mcp`, started by the agent, inherits it. A revoke rotates it (running sessions out, the next tab gets a new one); the switch in Settings → AI agents keeps agent terminals out altogether. A Claude started outside Atlas needs a token of its own (Allow an agent).
- Check in the installed app: the main window, the capture box (Super+… shortcut), a Claude tab's `atlas mcp` tools, "Open Atlas in the browser".
