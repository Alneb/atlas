# Plugin maturity: beta and stable

Every plugin in `plugins/` sits in one of two folders: `plugins/beta/` or `plugins/stable/`. The folder is a promise to
whoever installs it. This page says what each promise means, how a plugin moves from one to the other, and where each
plugin stands today.

## What the two words promise

- **Beta**: it works for the people who wrote it, on their setup. Its settings, files and tools may still change
  between versions without a migration, and it may assume things about the vault or the machine.
- **Stable**: it works for anyone who follows its README. Its settings and the files it writes change only with a
  migration (or a note in the changelog), it is tested, and its failures tell the user what went wrong.

A plugin is promoted with a pull request that moves its folder (`git mv plugins/beta/x plugins/stable/x`), ticks every
criterion below in the description, and updates the table at the end of this page.

## The criteria for stable

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
8. **Its platforms are declared.** It runs on Linux, and either on Windows and macOS too, or its README says it doesn't.
   `phone = true` only when it has been tried in the Android app.
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

Measured for 0.1.0 from each plugin's code, manifest and tests. A cell is **✓** met, **~** partly met or not yet
reviewed by hand, **✗** not met, **–** does not apply. Column numbers are the criteria above. "Tests" is
*unit / e2e*: Python `test_*.py` files or Rust `#[test]`s in the plugin, then specs in `ui/tests/` that load it. "API"
is the manifest's `api` (the current one is 12; an older number still loads, since each version only adds calls).

| Plugin | Tier | 1 Tests | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 API | 10 | 11 | 12 Version | What it still needs for stable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh | stable | ✓ 8 / 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✗ | 4 | ✓ | ~ | 0.8.0 | declare Linux-only (8); the remote-file index through the API (11); 1.0 (12) |
| copyparty | stable | ~ 0 / 1 | ✓ | ✓ | ✓ | ~ | – | ✓ | ✗ | 4 | ✓ | ✓ | 0.3.4 | unit tests (1); platforms in the README (8); 1.0 (12) |
| print | stable | ✓ 4 / 1 | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ 9 | ✓ | – | 0.2.0 | a note waits silently while Export makes its PDF beyond the first notice (6); 1.0 (12) |
| run-tools | stable | ~ 0 / 1 | ✗ | ✓ | ✓ | ✓ | ~ | ✓ | ✗ | 4 | ✓ | ✓ | 0.1.0 | a README (2, 8); 1.0 (12) |
| email | beta | ✓ 73 / 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ 12 | ✓ | ✗ | ✓ 1.1.0 | saved notes, rules and attachments written through the API, not `std::fs::write` (11) — then the strongest candidate |
| dav (Calendar) | beta | ✓ 50 / 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ 12 | ✓ | ✓ | ✓ 1.1.0 | a review by someone who did not write it; it meets every criterion on paper |
| finance | beta | ~ 70 / 0 | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✗ | 9 | ✓ | ✗ | 0.1.0 | an end-to-end spec (1); neutral default currencies (4); journal and archive writes through the API (11); platforms (8); 1.0 (12) |
| export | beta | ✓ 5 / 0 | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ~ | ✓ 9 | ✓ | ~ | 0.1.0 | an end-to-end spec (1); progress shown but an export cannot be stopped (6); tried only on Linux (8); the `.tex` / `.pdf` written to disk, not through the API, which has no binary write (11); 1.0 (12) |
| catalog | beta | ✓ 40 / 2 | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | 4 | ✓ | ✓ | 0.5.3 | a README (2, 8); 1.0 (12) |
| catalog-papers | beta | ~ 28 / 0 | ✗ | ✓ | ✓ | ~ | ✓ | ✓ | ✗ | 4 | ✓ | ✗ | 0.4.0 | a README (2); an end-to-end spec (1); notes and PDFs written through the API (11); errors surfaced in the pane (5) |
| books | beta | ~ 0 / 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | 4 | ✓ | ✓ | 0.9.0 | unit tests (1); platforms in the README (8); 1.0 (12) |
| notepad | beta | ✗ 0 / 0 | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ~ | 4 | ✓ | ✓ | 0.4.0 | tests (1); its Boox-only parts declared (8) |
| boox-notes | beta | ~ 1 / 0 | ✓ | ✓ | ✓ | ✓ | ~ | ~ | ✗ | 4 | ✓ | ✓ | 0.1.0 | an end-to-end spec (1); Boox-only declared in the manifest (7, 8) |
| rnote | beta | ~ 0 / 2 | ✗ | ✓ | ✓ | ✓ | – | ~ | ✗ | 7 | ✓ | ✓ | 0.3.0 | a README saying it needs `rnote-cli` on the core's machine (2, 7, 8) |
| ocr | beta | ~ 6 / 0 | ✗ | ✓ | ✓ | ~ | ~ | ✓ | ✗ | 4 | ✓ | ✓ | 0.2.0 | a README (2); an end-to-end spec (1); progress for long pages (6) |
| claude | beta | ✗ 0 / 0 | ✓ | ✓ | ✓ | ✓ | – | ~ | ✗ | 4 | ✓ | ✓ | 0.5.0 | tests (1); says it reads the account on the core's machine (7, 8) |
| home | beta | ~ 0 / 1 | ✗ | ✓ | ✓ | ~ | – | ✓ | ~ | 4 | ✓ | ✓ | 0.2.0 | a README (2); unit tests (1) |
| daily | beta | ~ 0 / 1 | ✗ | ✓ | ✓ | ~ | – | ✓ | ~ | 4 | ✓ | ✓ | 0.1.3 | a README (2); unit tests (1) |
| weather | beta | ~ 1 / 0 | ✗ | ✓ | ✓ | ~ | – | ✓ | ~ | 4 | ✓ | ✓ | 0.3.2 | a README (2); an end-to-end spec (1) |
| ntfy | beta | ✓ 1 / 1 | ✗ | ✓ | ✓ | ✓ | – | ✓ | ~ | 4 | ✓ | ✓ | 0.2.0 | a README (2) |
| syncthing, downloader, tubearchivist | beta | ~ 1 / 0 | ✗ | ✓ | ✓ | ~ | ~ | ✓ | ✗ | 4 | ✓ | ✓ | 0.1.x | a README each (2); end-to-end specs against a stub (1); progress for long transfers (6) |
| catalog-anime, -books, -music, -tmdb, -wikipedia, -youtube, -audiobookshelf | beta | ~ 1 / 0 each | ✗ | ✓ | ✓ | ~ | – | ✓ | ✗ | 4 | ✓ | ✓ | 0.1–0.2 | a README each (2); one shared end-to-end spec for the catalog's sources (1) |
| catalog-web | beta | ✗ 0 / 0 | ✗ | ✓ | ✓ | ~ | – | ✓ | ✗ | 4 | ✓ | ✓ | 0.1.0 | tests (1), a README (2) |
| catalog-linkwarden | beta | ~ 0 / 1 | ✗ | ✓ | ✓ | ✓ | – | ✓ | ✗ | 4 | ✓ | ✓ | 0.2.0 | unit tests (1), a README (2) |
| freshrss, immich, jellyfin, memos, paperless | beta | ~ 0 / 1 each | ✗ | ✓ | ✓ | ~ | – | ✓ | ~ | 4 | ✓ | ✓ | 0.1.0 | unit tests (1), a README each (2) |
| zip | beta | ✗ 0 / 0 | ✗ | ✓ | ✓ | ~ | ~ | ✓ | ~ | 4 | ✓ | ✓ | 0.1.0 | tests (1), a README (2) |

What the columns rest on:
- **4:** finance defaults its currencies to `EUR, CAD, USD, XAU, BTC` with EUR as the base; a neutral default
  (or one taken from the locale) is the fix.
- **5:** **~** means the code has few or no visible error paths (`atlas.notice`, an error state) and was not reviewed by
  hand yet.
- **7:** a helper runs where the core runs, so a served vault works the same, except for plugins that read the core
  machine's own programs or devices (CUPS, `rnote-cli`, a Boox over USB, the Claude account) without saying so.
- **8:** Atlas is Linux-only for now; a plugin meets 8 when its README
  says what it runs on.
- **11:** the Rust engines of email, finance and catalog-papers write vault files with `std::fs::write`; ssh keeps its
  working copies' index with it. Everything else writes through Atlas's API.

A plugin that serves one person's setup more than anyone's is kept out of the repository until it is made general.
