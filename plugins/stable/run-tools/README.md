# Run tools

Buttons in the bar above a code file that run it, test it or build it in the shell terminal. Each button types its
command into the terminal, so nothing is hidden: the command is there to read, its output scrolls by, and ↑ runs it
again or changes it. Each command is written for the shell the terminal runs (POSIX shells, PowerShell, cmd), so the
same buttons work on Linux, macOS and Windows.

| File | Buttons | What runs |
|---|---|---|
| `.py` | Run, Test | the interpreter (below) on the file; `-m pytest` on the file or one test |
| `.rs` | Run, Test, Clippy | `cargo run` / `test` / `clippy` with the nearest `Cargo.toml` above the file |
| `.go` | Run, Test | `go -C <folder> run .`; `go test`, one test with `-run '^TestX$'` |
| `.js` `.mjs` `.cjs` `.ts` | Run, Test | `node` on the file; `node --test`, one test by its name |
| `.jl` | Run | `julia` on the file |
| `.sh` `.bash` | Run | `bash` on the file |
| `.c` `.cpp` `.h` … | Build | `cmake --build build` beside the nearest `CMakeLists.txt`, else `make` at the nearest `Makefile` |
| `.tex` | Build, PDF | the LaTeX setting with `-cd`; the PDF opened beside |
| any file in a project | Task | a script of the nearest `package.json`, a target of the nearest `Makefile`, a recipe of the nearest `justfile` |

- **Test** offers the file's own tests to choose from (pytest's `test_x` and `TestX::test_y`, Rust's `#[test] fn x`,
  Go's `func TestX(t *testing.T)`, `test("…")` / `it("…")` in JavaScript), "All tests in this file" first; a file that
  names none runs them all.
- **Python's interpreter**: the setting, else the vault's Python environment ("Python: choose the environment", the one
  its language server and new terminals use), else `uv run python` when a `uv.lock` is above the file, else the
  nearest `.venv` (`bin/python`, on Windows `Scripts\python.exe`), else `python3` (`python` on Windows).
- **Task** appears once a project file is found above the file; the nearest project's runner is listed first.
- Also an example of `atlas.editor.toolbar` and `atlas.terminal` (`docs/guides/PLUGIN-API.md`).

## Settings

- **Python**: the interpreter for `.py` files, typed as it is (for conda: `conda run -n myenv python`); empty picks
  one as above.
- **Node**, **Julia**: the program for those files; empty: `node`, `julia`.
- **LaTeX** (`latexmk -pdf -interaction=nonstopmode`): the command that builds a `.tex` file.

## Needs

Each button calls its tool on the machine where the terminal runs: Python (and pytest), Cargo, Go, Node, Julia, bash,
CMake or make, just, npm, a LaTeX distribution with `latexmk`. A missing one is said by the shell, in the terminal.

## Platforms

Linux works; macOS, Windows and a server are untested; not in the phone app (it has no shell terminal).

## Tests

`ui/tests/example-run-tools.spec.ts`: the words each shell reads back, the project files read, Run and Test in the
terminal.
