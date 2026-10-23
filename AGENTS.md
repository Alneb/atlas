# Instructions for AI coding agents

These rules are for any agent (Claude Code, Codex, Copilot, Cursor, Aider…) working in this repository. They come on
top of [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) and [docs/guides/DEVELOPING.md](docs/guides/DEVELOPING.md), which
say how the app is changed. Read [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) before designing anything.

## Keep the tree clean

Several agents and people may work in one checkout at once. Leave it as you found it, plus your change.

- **Scratch output goes in `target/`** (git-ignored) or the system's temp folder, never anywhere else: screenshots,
  probe results, logs, downloaded files, throwaway scripts, a build's binaries. `scripts/dev/webkit-probe.mjs` already
  writes to `target/`; give other tools an output path there.
- **Nothing new at the repository root.** The root holds only `README.md`, `AGENTS.md`, `LICENSE`, the build manifests
  and the tool configs that already sit there. `bash scripts/dev/gate.sh tidy` fails on any untracked file at the root.
- **No agent memory, notes, plans or session logs in the repository.** Keep them in your own tool's folder, outside
  the checkout. A design worth keeping goes in `docs/` as a real document (`docs/INDEX.md` lists them).
- **Generated files are produced by their generator**, never edited by hand: `ui/src/lib/gen/*.ts` (from the Rust
  types), plugins' `view.js` (from their `ui/`), icons (`scripts/dev/icons.mjs`).
- **Never commit binaries or build outputs**: plugin helpers in `plugins/*/*/bin/`, `ui/dist/`, APKs, archives.
- **Downloaded toolchains and runtimes stay in `local/`** (git-ignored): the Android SDK/NDK and emulator images, a JDK,
  Python for Android, signing keys. `node publish/scan.mjs` rejects such paths and package files, whatever their size.
- **Tests and probes never write into the repository or a real vault.** They work on a throwaway copy in the temp
  folder. A cache a test leaves behind (`.atlas/cache/`) is ignored, but the test should still clean up.
- **Delete what you created and no longer need**, before you finish: temporary files, test folders, stopped servers.

## Write for the public

The repository is published. Everything you write here can be read by anyone.

- **No personal data**: no real names, e-mail addresses, home paths (`/home/<name>`), host names, account names, bank
  details or vault contents. Tests use fixtures (`example.org`, `alice`, `/home/u`, `notes.example.org`).
- **Tests that need real data read it from the environment** (`ATLAS_TEST_VAULT`, `ATLAS_TEST_PAPERS`,
  `ATLAS_VAULT`…) and skip, saying why, when it is unset. A machine's own values live in `scripts/dev/local.env`,
  which is never committed.
- **Comments and docs give the reason, neutrally.** Don't quote the person who asked, and don't mention dates of
  requests, chat sessions, ticket numbers from a private tracker, or which agent wrote the code. Say what the code does
  and why, in one or two lines.
- **No secrets**, not even in tests: use obviously fake values. `bash scripts/dev/gate.sh scan` checks this.

## Branches

- **The public repository has one branch, `main`.** Contributions are pull requests against it.
- **A checkout that has a `publish/` folder is the maintainer's private development branch**, published by a tool. In
  it: work and commit only on that branch, never on `public` (a hook refuses it); every file not listed in
  `publish/overlay.txt` is published, so `node publish/scan.mjs --worktree` must find nothing; and `node publish/sync.mjs`
  (the gate's first stage there) must not report the two as diverged. `publish/README.md` has the workflow.

## Work alongside others

- **Check `git status` before you start and before you commit.** Files you did not change may be someone else's work in
  progress: don't edit, revert, format, stage or stash them.
- **Commit only your own paths**, named explicitly (`git add -- <paths>`, never `git add -A` or `git commit -a`).
- **Don't run destructive git commands** (`reset --hard`, `checkout -- .`, `clean`, `stash`, force pushes, history
  rewrites) and never push unless the maintainer asks.
- **One heavy job at a time.** The gate, the Rust build and the end-to-end tests are heavy: if one is already running,
  wait for it instead of starting a second.
- **Never kill processes by pattern** (`pkill -f atlas` can hit the app the maintainer is using, or your own shell).
  Stop what you started by its PID.

## Before you call it done

- `bash scripts/dev/gate.sh` passes. Its verdict is the printed table, not an exit code that went through a pipe.
- A visible change has been looked at in a screenshot, in the light and the dark theme
  ([docs/guides/UI-STYLE.md](docs/guides/UI-STYLE.md)).
- A new setting is on its Settings page, and a new mechanism is described in `docs/guides/DEVELOPING.md`.
- `git status` shows only what you meant to change.
