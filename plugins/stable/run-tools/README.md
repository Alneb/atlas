# Run tools

Run and Test buttons in the bar above a Python, Rust or LaTeX file. Each button types its command into the shell
terminal, so nothing is hidden: the command is there to read, its output scrolls by, and ↑ runs it again or changes
it.

- **Python** (`.py`): Run, and Test (pytest). The interpreter is the setting, else the vault's Python environment
  (chosen with "Python: choose the environment"), else a `.venv` beside the file or above it, else `python3`.
- **Rust** (`.rs`): Run (`cargo run`), Test (`cargo test`) and Clippy, with the nearest `Cargo.toml` above the file.
- **LaTeX** (`.tex`): Build (the command of the settings) and PDF (opens the PDF beside it).
- **Test** offers the file's own tests to choose from (pytest's `test_x` and `TestX::test_y`, Rust's `#[test] fn x`),
  "All tests in this file" first, and runs the one chosen; a file that names none runs them all.
- Also an example of `atlas.editor.toolbar` and `atlas.terminal.run` (`docs/guides/PLUGIN-API.md`).

## Settings

- **Python**: the interpreter for `.py` files (for conda: `conda run -n myenv python`); empty picks one as above.
- **LaTeX** (`latexmk -pdf -interaction=nonstopmode`): the command that builds a `.tex` file.

## Needs

What each button calls, on the machine where the terminal runs: Python (and pytest for Test), Cargo, a LaTeX
distribution with `latexmk`.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`ui/tests/example-run-tools.spec.ts`.
