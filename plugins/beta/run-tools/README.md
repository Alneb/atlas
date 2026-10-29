# Run tools

Buttons in the bar above a code file that run it, test it or build it in the shell terminal. Each button types its
command into the terminal, so nothing is hidden: the command is there to read, its output scrolls by, and the shell's
history runs it again. Commands are written for the shell the terminal runs (POSIX shells, PowerShell or cmd).

## What it adds

| File | Buttons | What runs |
|---|---|---|
| `.py` | Run, Test | the interpreter (see the setting) on the file; `-m pytest` on the file or one test |
| `.rs` | Run, Test, Clippy | `cargo run` / `test` / `clippy` with the nearest `Cargo.toml` above the file |
| `.go` | Run, Test | `go -C <folder> run .`; `go test`, one test with `-run '^TestX$'` |
| `.js` `.mjs` `.cjs` `.ts` | Run, Test | `node` on the file; `node --test`, one test by its name |
| `.jl` | Run | `julia` on the file |
| `.sh` `.bash` | Run | `bash` on the file |
| `.c` `.cpp` `.h` … | Build | `cmake --build build` beside the nearest `CMakeLists.txt`, else `make` at the nearest `Makefile` |
| `.tex` | Build, Watch, Clean, PDF | the LaTeX setting on the whole document (its `% !TEX root`, else the nearest `main.tex` above) |
| any file in a project | Task | a script of the nearest `package.json`, a target of the nearest `Makefile`, a recipe of the nearest `justfile` |

- **Test** offers the file's own tests to pick from (pytest's `test_x` and `TestX::test_y`, Rust's `#[test]`, Go's
  `TestX`, JavaScript's `test("…")` / `it("…")`), "All tests in this file" first.
- It is also the reference example of `atlas.editor.toolbar` and `atlas.terminal` (docs/guides/PLUGIN-API.md).

## Settings

- **Python**: the interpreter for `.py` files, typed as it is (`conda run -n myenv python`). Empty: the vault's Python
  environment ("Python: choose the environment"), else `uv run python` when a `uv.lock` is above the file, else the
  nearest `.venv`, else `python3` (`python` on Windows).
- **Node**, **Julia**: the program for those files; empty: `node`, `julia`.
- **LaTeX**: the command that builds a `.tex` document; `-cd` and the file are added, `-pvc` for Watch, `-c` for
  Clean. Default `latexmk -lualatex -interaction=nonstopmode -file-line-error -synctex=1`.

## How it fits

No requirements, no helper: everything runs in the terminal the user sees.

## Needs

The tools themselves on the machine where the terminal runs (Python and pytest, Cargo, Go, Node, Julia, bash, CMake or
make, just, npm, a TeX distribution with `latexmk`). A missing one is reported by the shell.

## Platforms

Linux works; macOS and Windows untested; Android no (the phone app has no shell terminal); a server untested (the
terminal then runs on the server, which needs the tools).

## Status

Stable tier. End-to-end spec `ui/tests/example-run-tools.spec.ts` (the words each shell reads back, the project files
found, Run and Test in the terminal).
