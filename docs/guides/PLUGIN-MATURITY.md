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
   are built in: each one is a setting with a neutral default. `node publish/scan.mjs`-style checks find none, and the
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

Measured 2026-10-23. "Unit" counts test files and Rust test modules in the plugin; "e2e" counts specs in `ui/tests/`.

| Plugin | Tier | Unit | e2e | README | What it still needs for stable |
|---|---|---|---|---|---|
| ssh | stable | 6 | 2 | yes | (stable) — declare Windows/macOS support (8) |
| copyparty | stable | 0 | 1 | yes | unit tests of its own (1) |
| print | stable | 0 | 1 | no | a README (2); says it needs CUPS (8) |
| run-tools | stable | 0 | 1 | no | a README (2) |
| email | beta | 17 | 2 | yes | review against 4 and 7 (server-side use); the strongest candidate |
| dav (Calendar) | beta | 19 | 1 | yes | review against 4; the strongest candidate with email |
| finance | beta | 26 | 0 | yes | an end-to-end spec (1); version 1.0 (12) |
| catalog | beta | 11 | 2 | no | a README (2) |
| catalog-papers | beta | 6 | 0 | no | an end-to-end spec (1), a README (2) |
| books | beta | 0 | 2 | yes | unit tests (1) |
| manga | beta | 0 | 1 | yes | unit tests (1); made generic (4) |
| notepad | beta | 0 | 0 | yes | tests (1); its Boox-only parts declared (8) |
| ocr | beta | 1 | 0 | no | an end-to-end spec (1), a README (2) |
| claude | beta | 0 | 0 | yes | tests (1) |
| rnote | beta | 0 | 2 | no | a README (2); API 12 (9) |
| boox-notes | beta | 1 | 0 | yes | an end-to-end spec (1); the Boox-only nature declared (8) |
| weather, ntfy, syncthing, downloader, tubearchivist | beta | 1 each | 0–1 | no | a README each (2), end-to-end specs (1) |
| catalog-anime, catalog-books, catalog-music, catalog-tmdb, catalog-wikipedia, catalog-youtube, catalog-audiobookshelf | beta | 1 each | 0 | no | a README each (2); one shared end-to-end spec for the catalog's sources (1) |
| catalog-web, catalog-linkwarden | beta | 0 | 0–1 | no | tests (1), a README (2) |
| home, daily, freshrss, immich, jellyfin, memos, paperless, zip | beta | 0 | 0–1 | no | unit tests (1), a README each (2) |

A plugin that serves one person's setup more than anyone's is kept out of the repository until it is made general. The
roadmap lists those as "plugins to make generic".
