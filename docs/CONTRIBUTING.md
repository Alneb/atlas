# Contributing to Atlas

Atlas is one person's workspace first, so the rules below are the ones that keep it maintainable by
someone who did not write it. The fuller guide is [DEVELOPING.md](guides/DEVELOPING.md).

## Before writing anything: where does the change go?

- **About one vault's work** (a dashboard, a workflow, a lecture course): that vault's `.atlas/` — a
  page, a command, a plugin. Not this repository. See [EXTENDING.md](guides/EXTENDING.md).
- **Useful to every vault** (a block type, a setting, an API for plugins, rendering): here.
- **For some vaults only** (papers, a server's service, a language's run tools): a plugin
  ([PLUGIN-API.md](guides/PLUGIN-API.md)); start from one in `plugins/`.

## Working with an AI agent

Agents follow [AGENTS.md](../AGENTS.md): scratch output in `target/`, nothing new at the root, no personal data or
agent notes in the repository, only their own paths committed.

## Setting up

```sh
bash scripts/dev/dev.sh /path/to/a/vault   # the core and the UI with hot reload → http://localhost:5173
```

Rust (stable), Node 20+, and on Linux the WebKitGTK development packages Tauri needs.

## The gate

`bash scripts/dev/gate.sh` runs every check and prints a table: a scan for secrets and personal
paths, the Rust tests, clippy with warnings as errors, the Svelte / TypeScript types, the production
build, and the end-to-end tests on a throwaway vault. The verdict is that table — not an exit code
that went through a pipe. After a change to the editor or to markdown, also `gate.sh audit` (Obsidian
fidelity on a copy of real notes) and compare with [MD-RENDERING.md](guides/MD-RENDERING.md).

The gate takes about six minutes. Do not wait for it: start it and work on the next thing, touching
no sources until its log reaches the end-to-end stage.

## How changes are made

- **One implementation per idea.** No second way to do what a module already does; extract the
  shared part instead. Single-purpose modules, logic out of components, one-line wiring.
- **Types over conventions**: an enum, not a string that must be spelt right; a field that cannot be
  forgotten.
- **A visible change is judged from a screenshot**, in the dark and the light theme.
- **Every new behaviour has a test** — a Rust test in the module, or a spec in `ui/tests/`. A spec
  must leave the shared test vault as it found it (no open to-dos, plugins or settings left behind).
- **A new setting is put on its Settings page** (`ui/src/lib/settings-pages.ts`), or nobody finds it.
- **Docs in the same change**: `docs/` holds everything (only `README.md` and `AGENTS.md` at the
  root), indexed in [INDEX.md](INDEX.md); a large change gets its own `REFACTOR-<topic>.md`.
- **Files are the truth**: no state that lives only in the app; caches can always be deleted.
- **Nothing written into a user's notes** without their say, and a user's file is never overwritten.

## Commits

Name the files you add (`git add -- <paths>`, not `-A`). The first line follows
[Conventional Commits](https://www.conventionalcommits.org/) (`fix(editor): tables keep their column widths`) and says
what changed for the person using Atlas; the body gives the why. Run `bash scripts/dev/gate.sh` before opening a pull
request, and add a line to [CHANGELOG.md](CHANGELOG.md) under "Unreleased" for a change people will notice.
