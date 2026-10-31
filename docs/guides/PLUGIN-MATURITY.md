# Plugin maturity: beta and stable

Every plugin in `plugins/` sits in one of two folders: `plugins/beta/` or `plugins/stable/`. The folder is a promise to
whoever installs it. This page says what each promise means, how a plugin moves from one to the other, and where each
plugin stands today.

## What the two words promise

- **Stable**: two things at once. *Features*: it does the whole job it is for, with nothing important missing or
  half-built. *Stability*: it holds up in real, regular use without surprises, and its settings and the files it
  writes change only with a migration (or a note in the changelog).
- **Beta**: one of the two is not there yet: features still missing or being rebuilt, or not enough real use to
  know it holds up. Its settings, files and tools may still change.

**Features and stability decide the folder, not the checklist below.** A plugin is moved (`git mv plugins/beta/x
plugins/stable/x`) when it is complete for its purpose and has been relied on without surprises, and moved back when
a rebuild makes it new code again. The twelve criteria are what a stable plugin should also have; for each plugin the
table says which are missing, as its to-do list. A stable plugin with gaps there (ssh) is still stable; a beta plugin
that ticks every box on paper is not promoted by that alone.

## The checklist (what a stable plugin should also have)

Each criterion can be checked by someone who did not write the plugin.

1. **Tested on fixtures.** Its own logic has unit tests (a `test_*.py` beside a Python helper, `#[test]`s in a Rust
   engine), and its pane, block or command has an end-to-end spec in `ui/tests/` (usually `example-<plugin>.spec.ts`).
   No test needs a real account, a real server or a real vault. A service is faked by a local stub, as
   `example-copyparty.spec.ts` does.
2. **A README.** `plugins/<tier>/<name>/README.md` says what the plugin does, what it needs (a service, a program on
   the PATH, an account), how to set it up step by step, what it writes into the vault, and its known limits.
3. **Every setting in Settings.** Every option is declared in `plugin.toml` (`[[setting]]`), so it shows on the
   plugin's Settings page with a label and a hint. Nothing has to be configured by editing a file by hand. Secrets are
   declared as secrets and never written into the vault (docs/guides/PLUGIN-API.md).
4. **No one's personal setup.** No host names, accounts, folder names, languages or habits of the people who wrote it
   are built in: each one is a setting with a neutral default. `bash scripts/dev/gate.sh scan` finds none, and the
   default settings work on an empty vault.
5. **Errors are shown, not swallowed.** A failed request, a missing program or a refused sign-in reaches the user as a
   notice or an error state in the pane, saying what to do next. Nothing fails silently, and nothing retries forever.
6. **It narrates long work.** Anything that takes more than a second (a sync, an import, a download) shows progress
   and can be stopped.
7. **Local and remote alike.** It works the same on a vault opened on the desktop and on a vault served by
   `atlas serve` or the Docker image (docs/guides/SERVER.md), or it says in its manifest and README that it is
   desktop-only.
8. **Its platforms are declared.** Its manifest's `[platforms]` (PLUGIN-API.md, "Platforms") names each of Linux, macOS,
   Windows, Android and a server as `works` (tried there), `untested` or `no` with the reason, and its README agrees.
   `works` only where it has been tried; `phone = true` (Android) only when it has been tried in the Android app.
9. **The current plugin API.** `api` in `plugin.toml` is the current major version (`API_VERSION` in
   `crates/atlas-core/src/plugins.rs`), or the README says why it stays on an older one. It uses only documented calls.
10. **Nothing built is committed.** A helper program is built by `engine/build.sh` into `bin/` (ignored by git), and
    the README says how to build it. A generated `view.js` is rebuilt by `node scripts/dev/plugin-ui.mjs` and checked
    by the gate.
11. **Writes go through Atlas.** Files in the vault are written through the API (so the index, the mirror and the
    trash stay right), never directly, and a user's own text is never overwritten without asking.
12. **Versioned with care.** A 1.0 or later `version`, and a breaking change bumps the major version and has a
    migration or a changelog note.

## Where each plugin stands

Measured for 0.1.0 from each plugin's code, manifest and tests; READMEs (2) and platforms (8) brought up to date since: every plugin has a README, and those written with the platforms model say what their manifest declares. A cell is **✓** met, **~** partly met or not yet
reviewed by hand, **✗** not met, **–** does not apply. Column numbers are the criteria above. "Tests" is
*unit / e2e*: Python `test_*.py` files or Rust `#[test]`s in the plugin, then specs in `ui/tests/` that load it. "API"
is the manifest’s `api` (the current one is 20; an older number still loads, since each version only adds calls).

| Plugin | Tier | 1 Tests | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 API | 10 | 11 | 12 Version | What it still needs for stable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| email | stable | ✓ 73 / 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 12 | ✓ | ✓ | ✓ 1.2.1 | nothing on the checklist |
| dav (Calendar) | stable | ✓ 54 / 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 12 | ✓ | ✓ | ✓ 1.2.2 | nothing on the checklist |
| ssh | stable | ✓ 8 / 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✗ | 4 | ✓ | ~ | 0.8.0 | declare Linux-only (8); the remote-file index through the API (11); 1.0 (12) |
| print | beta | ✓ 4 / 1 | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | 20 | ✓ | – | 0.5.0 | real use of the new dialog; 1.0 (12) |
| run-tools | beta | ~ 0 / 2 | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | 17 | ✓ | ✓ | 0.3.0 | real use; unit tests (1); 1.0 (12) |
| copyparty | beta | ~ 0 / 2 | ✓ | ✓ | ✓ | ~ | – | ✓ | ✗ | 4 | ✓ | ✓ | 0.3.5 | real use; unit tests (1); platforms in the README (8); 1.0 (12) |
| finance | beta | ~ 70 / 0 | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✗ | 9 | ✓ | ✓ | 0.1.2 | an end-to-end spec (1); neutral default currencies (4); platforms (8); 1.0 (12) |
| export | beta | ✓ 5 / 1 | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ~ | 20 | ✓ | ✓ | 1.0.0 | real use of the rebuild (Typst, the dialog); an export cannot be stopped (6); tried only on Linux (8) |
| catalog | beta | ✓ 40 / 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 16 | ✓ | ✓ | 0.5.6 | 1.0 (12) |
| catalog-papers | beta | ~ 28 / 0 | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | 16 | ✓ | ✓ | 0.4.4 | an end-to-end spec (1); errors surfaced in the pane (5) |
| books | beta | ~ 0 / 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | 15 | ✓ | ✓ | 0.10.2 | unit tests (1); platforms in the README (8); 1.0 (12) |
| notepad | beta | ✗ 0 / 0 | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ~ | 4 | ✓ | ✓ | 0.4.0 | tests (1); its Boox-only parts declared (8) |
| rnote | beta | ~ 0 / 2 | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | 7 | ✓ | ✓ | 0.3.0 | unit tests (1); 1.0 (12) — it converts in the page, with no `rnote-cli` |
| ocr | beta | ~ 6 / 0 | ✓ | ✓ | ✓ | ~ | ~ | ✓ | ✓ | 15 | ✓ | ✓ | 0.2.1 | an end-to-end spec (1); progress for long pages (6) |
| claude | beta | ✗ 0 / 0 | ✓ | ✓ | ✓ | ✓ | – | ~ | ✗ | 4 | ✓ | ✓ | 0.5.0 | tests (1); says it reads the account on the core's machine (7, 8) |
| today | beta | ~ 0 / 2 | ✓ | ✓ | ✓ | ~ | – | ✓ | ✓ | 19 | ✓ | ✓ | 0.3.0 | unit tests (1) |
| weather | beta | ~ 1 / 0 | ✓ | ✓ | ✓ | ~ | – | ✓ | ✓ | 15 | ✓ | ✓ | 0.3.3 | an end-to-end spec (1) |
| notifications | beta | ~ 3 / 0 | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | 19 | ✓ | ✓ | 0.4.0 | an end-to-end spec (1); the Apprise hook into Atlas (DESIGN-notifications.md step 1) |
| syncthing, downloader | beta | ~ 1 / 0 | ✓ | ✓ | ✓ | ~ | ~ | ✓ | ✓ | 4 | ✓ | ✓ | 0.1.x | end-to-end specs against a stub (1); progress for long transfers (6) |
| catalog-open, catalog-tmdb, audiobookshelf | beta | ~ 1 / 0 each | ✓ | ✓ | ✓ | ~ | – | ✓ | ✓ | 15 | ✓ | ✓ | 0.1–0.2 | one shared end-to-end spec for the catalog's sources (1) |
| catalog-linkwarden | beta | ~ 0 / 1 | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | 15 | ✓ | ✓ | 0.2.1 | unit tests (1) |
| kiwix | beta | ~ 0 / 1 | ✓ | ✓ | ✓ | ✓ | – | ✓ | ~ | 4 | ✓ | ✓ | 0.1.0 | unit tests (1); tried on the phone (8); 1.0 (12) |
| freshrss, immich, jellyfin, paperless, ttrpg | example | ~ 0 / 1 each | ✓ | ✓ | ✓ | ~ | – | ✓ | ✓ | 4 | ✓ | ✓ | 0.1.0 | unit tests (1) |

What the columns rest on:
- **4:** finance defaults its currencies to `EUR, CAD, USD, XAU, BTC` with EUR as the base; a neutral default
  (or one taken from the locale) is the fix.
- **5:** **~** means the code has few or no visible error paths (`atlas.notice`, an error state) and was not reviewed by
  hand yet.
- **7:** a helper runs where the core runs, so a served vault works the same, except for plugins that read the core
  machine's own programs or devices (CUPS, a Boox over USB, the Claude account) without saying so.
- **8:** every bundled manifest declares `[platforms]` (each platform `works`, `untested` or `no` with its reason;
  a platform not named is `untested`; Android only with `phone = true`), and Settings shows them on the plugin's row.
  Most say `linux = "works"` and leave the rest untested until tried there (print: Windows `no`, no CUPS). A plugin
  meets 8 when its README agrees with its manifest.
  **A server, headless** (`node scripts/dev/helpers-headless.mjs`): every bundled helper (30) is started by `atlas serve` in an empty environment — no
  `DISPLAY`, Wayland, D-Bus or desktop session, `PATH=/usr/bin:/bin` — and asked for a method it does not have; each
  started and listed its methods. The only desktop program any helper calls is the email engine's `xdg-open` for an
  Outlook sign-in, which falls back to showing the address and code. That is the server's precondition, not its
  verdict: `server` stays `untested` until a plugin's own work is done on one (and print, ocr's screen capture and
  claude act on the core machine's printers, screen and accounts — criterion 7).
- **11:** the Rust engines of email, finance and catalog-papers write vault files with `atlas_plugin::write_file` /
  `move_path` (through Atlas when it started them; a call carries a file's bytes as base64). What is still direct, on
  purpose: finance's command-line subcommands (`finance <command> <folder>`, run with no Atlas), catalog-papers' empty
  entry folder made to reserve a citekey, its old `entry.json` removed once moved into the note, and the snapshot it
  copies into `.atlas/trash/` before a fold. ssh keeps its working copies' index on disk. Everything else writes
  through Atlas's API.

A plugin that serves one person's setup more than anyone's is kept out of the repository until it is made general.
