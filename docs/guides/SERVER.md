# Server mode — serving a vault to other machines and the phone

A server mode (2026-10-15): Atlas served from a server with authentication, a sign-in page of its own, and apps — the Android client above all — able to connect to it. Both ways of signing in (its own password and Authelia in front) work, chosen by configuration, and the server's settings are in Settings.

## Start it

```sh
atlas server password                 # once: the owner's password (asked twice, never echoed)
atlas serve ~/Notes --listen 0.0.0.0:7700
```

or set everything from the desktop first: **Settings → Server** writes the same files. Without `--listen` nothing changes: the desktop app and `atlas serve` listen on 127.0.0.1 only, with no sign-in.

## Several vaults

The container serves several vaults — one server, several vaults, one sign-in:

```sh
atlas serve --listen 0.0.0.0:7700 --vaults-in /srv/vaults          # every folder in it is a vault
atlas serve --listen 0.0.0.0:7700 --vault notes=~/Notes --vault work=~/Work
```

Each vault is at `/v/<name>/` (`/` goes to the first). The app's vault picker (Ctrl+Alt+V) lists the server's vaults and switching is going to that address; a server opens no other folders and forgets none. How it works: each vault has its own state, watcher and schedules (`start_vault`), nested under its prefix; the page learns its API's place from `window.__ATLAS_API__` (injected into the vault's `index.html`, the same variable the desktop window sets), so every call and WebSocket of the UI follows. `.atlas/cache/server.json` records the prefix (`path`) for this machine's `atlas` CLI. A single folder (`atlas serve <dir> --listen …`) is served at `/` as before.

An address under `/v/` that names no vault here (an old bookmark, a renamed vault: `/v/obsidian/` renamed to `/v/vault/`) gets a small **vault picker page** (404, links to each vault's `/v/<name>/`, the asked name shown escaped) instead of the app on a wrong prefix or a proxy redirect. It is `vault_picker` in `server.rs`, behind the same sign-in as everything else; test `one_server_several_vaults_one_sign_in`.


## How people sign in (`auth` in `~/.config/atlas/server.toml`)

| `auth` | who gets in |
|---|---|
| `password` (default) | whoever signs in on Atlas's own page, `/login`, with the owner's password |
| `proxy` | only requests from a **trusted proxy** that names the user in `Remote-User` (Authelia's forward-auth). Security keys (YubiKey) come with Authelia |
| `both` | the proxy's word when the request came through it with a user; the sign-in page otherwise |

**Device tokens** work in every mode: `Authorization: Bearer atl_…` plus the `x-atlas: 1` header. A `capture` token reaches only `/api/capture`, `/api/attach` (a screenshot or a shared file saved beside the capture; never overwriting) and what its completions read (`/api/workspace`, `/api/link-targets`, `/api/tasks/suggest`, `/api/tags`, `/api/auth/me`); a `full` token everything.

```toml
# ~/.config/atlas/server.toml (owner-only; the password's Argon2id hash is in it)
auth = "both"
trusted_proxies = ["10.0.0.2"]      # the reverse proxy in front: only its X-Forwarded-* and Remote-User are believed
remote_user_header = "Remote-User"  # optional; Authelia's default
allow_plain_http = false            # the password only over HTTPS (through the proxy) or from this machine
mcp = false                         # AI agents through `atlas mcp`: off on a server (the desktop is not affected)
```

## What is protected, and how

- **The password**: Argon2id (≈100 ms a check), in `~/.config/atlas/server.toml`, never in the vault (the vault travels by Syncthing). Changing it (Settings → Server, or `atlas server password`) needs the current one, takes effect at once.
- **Guessing**: each wrong password makes that address wait twice as long (1 s, 2 s, 4 s … 5 min). Behind the proxy, the address is the proxy's `X-Forwarded-For`, believed only from a trusted proxy, so one guesser does not lock out everyone.
- **Sessions**: a random 256-bit cookie `atlas_session` — `HttpOnly; SameSite=Strict`, and `Secure` when the request came over HTTPS; only its SHA-256 is kept (`~/.local/state/atlas/server.json`, owner-only). 30 days unused and it is gone. "Sign out everywhere" ends them all.
- **Plain HTTP**: the sign-in page refuses the password over plain HTTP from another machine unless `allow_plain_http` (a LAN or VPN one trusts); a client cannot claim HTTPS — only a trusted proxy's `X-Forwarded-Proto` counts.
- **Other sites**: the sign-in form must come from this server's own page (Origin), the API still needs `x-atlas: 1`, and a WebSocket must come from a page of this server.
- **This machine's `atlas` CLI** (`atlas capture`, `atlas mcp`): a server-mode core writes a key for it to `$XDG_RUNTIME_DIR/atlas/server-<port>.key` (memory, owner-only, new each start); the CLI sends it.
- **What a signed-in browser may do: everything**, terminals and helpers included, the same as local. So the sign-in is the lock on a shell on the server: beyond your own network, put Authelia (with a security key) in front.

## Plugin secrets from the host (`ATLAS_SECRET_FILES`)

A plugin's secrets normally live in Atlas's own store, outside the vault (`~/.config/atlas/secrets/<vault>.json`, or `$ATLAS_SECRETS_DIR`). A server's host can also hand them in as read-only files, the way Docker secrets and systemd credentials do: with `ATLAS_SECRET_FILES=/secrets`, the file `/secrets/<plugin>/<name>` is that plugin's secret `<name>`, for every vault the server serves (`crates/atlas-core/src/secrets.rs`).

- **The host's file wins** over the store. `set` and `delete` of that name are refused ("set by the host"), so Settings cannot shadow or wipe it. The plugin's page still sees only whether the secret exists, never its value.
- **One final newline is dropped**, so `echo token > file` works. A PEM keeps its inner lines.
- Names that are not plain (`..`, a leading dot, a `/`) never reach the disk.
- Example: Enable Banking's key kept on the host as `/persist/secrets/atlas-enable-banking.pem` (0440, readable by the service's group) and mounted into the container at `/secrets/finance/enable_banking_key`.


## AI agents are off on a server

AI agents do not run on the server, so the MCP is off there by default. `atlas mcp` marks its requests (`x-atlas-client: mcp`); a server-mode core refuses them unless `mcp = true` (Settings → Server, "Let AI agents in"), and `atlas mcp` started against such a server stops at once and says why. The desktop (no `--listen`) never checks this. It is a switch, not a wall: a program on the server machine that sends no such header is the owner's own program.

## Settings → Server

The page shows whether this Atlas is serving and how you are signed in; the sign-in options (saved to `server.toml`, used when the server starts again); the password; device tokens (make one — it is shown once, with Copy — and revoke); the number of signed-in browsers and "Sign out everywhere"; "Sign out of this browser". On the desktop the same page prepares the files `atlas serve --listen` starts from.

## The CLI

```
atlas server status                    # mode, password set?, tokens, sessions, the files
atlas server password                  # set / change (reads stdin when piped, for scripts)
atlas server token phone --scope capture   # prints the token once
atlas server revoke phone
atlas server sign-out-all
```

A token made by the CLI reaches a running server when it starts again; one made in Settings → Server of the running server works at once.

## Behind Authelia

In the proxy's site for Atlas, forward-auth to Authelia as for the other services, and pass `Remote-User` through; then `auth = "proxy"` (or `"both"` to keep the password for the LAN) and the proxy's address in `trusted_proxies`. Atlas never sees the user's Authelia password or security key.

## Signing in a phone (or any app), whatever is in front (2026-10-16)

Everything, the Android app included, signs in through Authelia (or a similar gate, autodetected) for both the remote Atlas server and every plugin, with YubiKey / FIDO2 support, and without an API bypass in the gate.

- **`/auth/app?app=capture|atlas&name=<device>`** (a page): reached signed in — through the sign-in in front (Authelia, Authentik, oauth2-proxy… set `Remote-User`), or this server's own password — it asks once ("Let Atlas capture on Pixel 8 capture into it, as alice?"), then mints a device token (`capture` scope for the capture app, `full` for the full app; named for the device and the moment) and answers `303` to the app's own address: `org.atlas.capture://signed-in?token=…` or `org.atlas.app://…`. Only those two schemes: a token never goes to a web address. Not signed in: the sign-in first (`/login?next=…`, or the proxy's portal); a device token cannot let a device in (403); a form from another site is refused (403).
- **Atlas's token in `x-atlas-token`**: so `Authorization` stays free for the sign-in in front. And a `Bearer` that is not Atlas's (`atl_…`) — a proxy's OIDC access token passed through — is passed over instead of refused, so it never hides a session or the token header.
- **Behind a gate, the gate's session goes to the app too**: when `/auth/app` is reached through the gate (`Remote-User` from a trusted proxy), the redirect also carries `&gate=<the request's cookies but Atlas's own session>` — Authelia's `authelia_session`, Authentik's, oauth2-proxy's, whatever their names. The security key is used where WebAuthn works, the browser (Chrome reaches the key through Android's FIDO2 service, where the user's key app plugs in); the browser's cookies are sealed off from other apps, so Atlas — which that same request reaches — is the only one able to hand the session over. The app then sends it with every request and puts it in its WebView, and passes the gate as the browser does; when the gate's session ends, "sign in again" is one more key tap. No OIDC.
- **The phone finds out what is in front by itself** (crates/atlas-android `SignIn.probe`): `/api/auth/me` with no credentials → JSON 200 (open), JSON 401 (this server's own sign-in), a redirect to another host or a page instead of JSON (a gate). It then offers: **in the browser** (`/auth/app` in Chrome: the gate with the security key, then Atlas's question → the token and the gate's session); **in the app** (`/auth/app` in a WebView: the gate's page with a password and a one-time code, the cookies kept by the WebView); **by hand** (a token, an optional header `Name: value` any gate may let through — generic, never the default).
- **Mind**: an app's own address (`org.atlas.capture://`) can be claimed by another app installed on the phone; the token and the gate's session go there. Verified app links (an `https` address the phone checks against the server) would close that; not done.
- Tested: `crates/atlas-core/tests/server_mode.rs` (the page, the refusals, the redirect to the app's scheme, the token in `x-atlas-token` beside a foreign Bearer, the session not hidden by one; behind a gate, its cookies handed over and never Atlas's own).

## Code

`crates/atlas-core/src/auth.rs` (settings, password, sessions, tokens, the rules — unit tests), `login_page.rs` (the page), `server.rs` (`Listen::Server`, `guard_server`, `/login`, `/api/auth/*`, `/api/server/*`), `crates/atlas/src/main.rs` (`--listen`, `atlas server`), `ui/src/components/settings/ServerPanel.svelte`, `ui/src/lib/api.ts` (a 401 sends the page to `/login`). End-to-end test: `crates/atlas-core/tests/server_mode.rs`.
