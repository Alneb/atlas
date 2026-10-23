# SSH plugin

The hosts of your ssh config (and any you add in the plugin's settings), one shared connection per host, and everything that rides on it: terminals, Claude's sessions (`ssh_*` tools through `atlas mcp`), and the hosts' files in Atlas's explorer. Copy the folder into a vault's `.atlas/plugins/`, with `bin/` built (`bash engine/build.sh`).

| file | what it is |
|---|---|
| `plugin.toml` | the manifest: settings, the helper, the tools for Claude |
| `engine/` | the helper, `atlas-ssh` (Rust, since 0.7.0; `engine/build.sh` builds it into `bin/<arch>-<os>/`): the one ssh command line every use shares (ControlMaster, the config's ControlPath when it has one), the ssh config's hosts (Include lines followed, wildcard hosts left out), long-lived shells for agents, the login tab, the watcher that says which hosts are connected, and the explorer's calls (`files_*`: listings over an SFTP channel kept open per host, `wire.rs`; the rest one `sftp -b -` per call over the shared connection) |
| `main.js` | the hosts as a file source of Atlas's explorer (`atlas.files.source`), commands, the side tool (hosts, connected ones first: Files / Shell / Connect / Disconnect), the terminal's "+" menu, the status cell |

## The shared connection and the login tab

Every ssh, scp and sftp the plugin starts uses the same `ControlMaster=auto` socket per host, kept up (`ControlPersist`, the "Keep connections" setting). Nobody types into the helper's processes, so they run with `BatchMode=yes`: when a host asks for a key's passphrase or 2FA, the helper asks the page for a **login tab** (a `login` event); the user answers there, the connection comes up, and whatever was waiting carries on over it. iq asks for 2FA, so the first use of a day opens that tab.

## Files: in Atlas's explorer (0.5.0)

Since 0.5.0 the hosts are a **file source** of Atlas's own explorer (`docs/refactor/REFACTOR-explorer.md`) — one explorer for the
vault, SSH hosts and copyparty servers, shared with the local files and the copyparty plugin's files, more integrated: files can be edited,
sent and downloaded, in the same editor as local files. `view.js` and the rail button are gone; **SSH: browse
files on…** and a host's **Files** button open the explorer at that host. Everything below still holds (the same helper
calls), with these changes: any file opens from its copy — a PDF in the PDF viewer, a picture in the image viewer (up to
512 MB; the read-only reader and its 2 MB limit went); sizes and dates come as numbers (`mtime`, read from sftp's listing);
the keys are the explorer's (F5 refresh, Ctrl+H hidden, letters jump to a name); the save-back of an edited copy is done
by the core (`save` of the source), the size-and-date check by `sftp.py` as before; files can be dropped on the list or
chosen from this computer. An Atlas without the explorer gets a notice to update.

## The Files pane (0.3.0–0.4.0, before the shared explorer)

There was no SFTP UI (2026-10-14).

Open it with **SSH: browse files on… (SFTP)** (a host chooser), a host's **Files** button in the SSH side tool, or the rail button (which lists the hosts). Each host is a tab of its own (`atlas.openView('{"host":"iq"}')`), kept in the layout.

- **Browse**: the folder's entries, folders first; double-click or Enter opens a folder, Backspace or the ↑ button goes to the folder above; the path at the top is clickable part by part, and a click on its empty space (or Ctrl+L) lets you type a path (`~` works). **Hidden** (or `.`) shows dot-files. A link is opened as a folder when it points to one, as a file otherwise.
- **Read**: a text file opens **read-only** in a tab of its own (line numbers, size, date; up to 2 MB; a binary file is refused with a word to download it instead).
- **Download…**: into a folder of the vault, chosen in the palette (the last one used, else the folder of the note you are in, then every folder; type a new one to create it). Never over an existing file: a second copy gets a number. A folder downloads with everything in it.
- **Upload…**: a file of the vault (the active one first) into the folder shown. When the name is taken there, it asks before replacing.
- **New folder**, **Rename** (F2) — typed in place; a rename never replaces another file (sftp's own rename would, silently). **Delete** (the key too) asks first; a folder is deleted only when empty — nothing is ever deleted recursively from here.
- **Not connected yet**: the pane says it is waiting for the login, the login tab opens, and the list appears by itself once the connection is up.
- **Slow links** (0.3.3). Measured with `ui/tests/example-sftp.spec.ts` "slow link" (`ATLAS_SSH_SLOW=1 ATLAS_FAKE_SSH_DELAY=<s>`: the stand-in ssh answers that late): with a 5 s link the rest of the app does not wait — the palette and another note open in 0.37 s (Chromium) / 0.46 s (WebKit), frames stay ~17 ms — because the core relays helper calls asynchronously and the helper answers each call on its own thread. What waited was each folder: every click a fresh sftp conversation. Now a folder seen before (this run of Atlas, any Files pane) shows at once from its last listing — **17 ms instead of 4 s** — with "updating…" in the status line while it is asked again; a refresh failure keeps the listing and says so. An answer that arrives after a newer click is dropped (`seq`; before, a slow older listing could replace the folder you had moved to). After a change (new folder, rename, delete, upload) the remembered listing is dropped, never shown.
- **Edit** (0.4.0): a text file opens in Atlas's own editor (the same as any note or code file — highlighting, vim keys, search), from a working copy at `.atlas/remote/ssh/<host>/<path>`; **every save goes back to the host** (`main.js` on `file:save` → `files_save` → `sftp.py` `save_edit`). The copy remembers the file's size and date as last seen on the host (`.atlas/remote/ssh/index.json`); when the file there changed meanwhile, the save is **not** sent — a notice says so, and a click on it saves over it. sftp's listing has minutes, so a change in the same minute with the same size goes unnoticed. A binary or > 2 MB file opens read-only and says why (download it instead). The folder is not under `.atlas/cache` (saves there tell plugins nothing, by design: plugin-events.ts `QUIET`), keeps itself out of the vault's git with its own `.gitignore` (`*`), and out of search and `[[` (the vault walk keeps only `.atlas/pages` of `.atlas`).
- **Not done**: one explorer for local files, SFTP and copyparty; ANSI colours in the viewer; the kept SFTP channel for the other calls too (edit, save, upload… still one `sftp -b -` each); drag and drop, several files at once, permissions.

How: `session.py`'s `files_*` methods first make sure the shared connection is up (`bring_up`: `ssh -O check`, else a quiet `ssh true` with BatchMode, which starts a master when keys suffice; else the login tab and `{waiting_for_login}`), then `sftp.py` runs `sftp -b -` with the commands. sftp asks ssh for `ControlMaster=no`, so it never opens a connection of its own; our `ControlPath` reaches the master. sftp expands globs and reads its own quoting in every path, so names are escaped (`esc`): spaces, quotes and `* ? [ ]` are safe. `vault_folders` / `vault_files` list where a download can go and what can be uploaded (no dot-folders, no `node_modules` / `target`).

Tests, with no network and no real host: `scripts/vault/tests/test_ssh_plugin.py` (`FilesTest`: a stand-in ssh that is "not connected" until the test plays the user answering the login tab, and that answers sftp's subsystem request with this machine's `sftp-server` on a temporary folder — a real sftp conversation) and `ui/tests/example-sftp.spec.ts` (the pane in the app, against `ui/tests/fixtures/fake_ssh.sh`, which does the same in `$ATLAS_FAKE_SFTP_ROOT`). `ATLAS_SFTP_BIN` replaces the sftp program, `ATLAS_SSH_BIN` the ssh one.


## The helper in Rust (0.7.0)

Native Rust or not (2026-10-19): **a Rust helper, OpenSSH kept**. OpenSSH still does all the connecting — ssh, sftp, ControlMaster, the user's config, agent, keys and 2FA — and `atlas-ssh` replaces the Python around it (session.py, sftp.py, hosts.py):

- **No Python on the machine needed**: one static binary (musl), as the catalog's helpers, so it runs on the desktop and in the server's container alike.
- **A thread per call** (`atlas_plugin::serve_threads`, added for it): a long `ssh_run` holds up no other call, and `ssh_terminal` waits for the page's `tab_opened` while other calls go on.
- The same methods, answers and events as before (`hosts`, the `ssh_*` tools, `files_*`, `login` / `tab` / `connections`), so main.js changed only where it read the hosts through a data script (now the helper's `hosts`).
- `engine/src/`: `hosts.rs` (the config), `ssh.rs` (the shared command line, logging in), `sessions.rs` (the shells: a marker line after each command carries its exit status), `sftp.rs` (the explorer), `proc.rs` (a program run with a time limit), `shell.rs` (quoting).
- Tests: `cargo test -p atlas-ssh`, and `scripts/vault/tests/test_ssh_plugin.py` against the binary (terminal tabs, the login tab, the explorer over a real sftp client and server, and a session's shell kept between calls, a long command read later, a dropped shell reopened); `ui/tests/example-ssh.spec.ts` and `example-sftp.spec.ts` run the debug build.


## A kept SFTP channel, and the side panel (0.8.0)
The SFTP interface loaded slowly, beyond what bandwidth explains (2026-10-20). Measured on a remote cluster with the shared connection up: a folder took **2.1–2.6 s**, of which ~1.4 s was the host starting a new sftp session for every call (`ssh -s sftp` alone, closed at once, 1.35 s; the shared connection itself answers `-O check` in 6 ms) and ~0.7 s the listing's round trips one after another. Now `engine/src/wire.rs` speaks SFTP (protocol 3) itself over one `ssh -o ControlMaster=no -o BatchMode=yes … -s host sftp` per host, kept open between calls and opened ahead when the watcher sees a host connect: opendir and realpath go out together, then two readdir pages at a time, close without waiting — **0.28 s** a folder on the same host (0.24 s for `runs` in the app, WebKit). A channel that broke is opened again once; one that cannot be had falls back to `sftp -b -` (`Failure::Channel`), while the host's own refusals (no such folder) are errors (`Failure::Host`). Test: `wire::tests` against this machine's `sftp-server` (250 entries: several pages).

The side panel: the buttons had taken the row and pushed the host names out (iq's name was not shown at all in a 280 px panel). Now one card per host: the name and address on top, never squeezed; the connection's age and how long it stays under it; the actions on their own wrapping line — Shell (connected) or Connect (which says "Connecting…" while it works), Files, and "⋯" (run a command, browse, mount, watch a session, disconnect / connect, settings, in the palette). A click on the card is its main action. "+ Add a host…" at the end opens the settings.
