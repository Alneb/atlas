# Decision — what Atlas lifts from obsidian-web

Date 2026-10-05 · slice 1 step 1 of the plan.

How good `obsidian-web` is was unknown, so
reuse was gated on a check instead of trust.

## Evidence
- `cargo test --release` in obsidian-web: **80 passed, 0 failed** (+1 ignored doctest), 40 s build.
- Coupling of the editor JS (`web/src/engine/cm/`, 2891 lines):
  - `live-preview.js` (1363) imports only `obsidian-syntax.js`; math goes through an injected
    `renderMath(host, source, block)` callback → **KaTeX drops in without touching it**.
  - `obsidian-syntax.js` (399), `highlight-code.js` (143): pure CM6/lezer.
  - `editor.js` (548) / `textarea-adapter.js` (438): glue to obsidian-web's textarea-era app.
  - `vim.js`, `latexsuite.js`, `slashmenu.js`: import `../lib/shared.js` app globals and MathJax.

## Verdict
| part | verdict | why |
|---|---|---|
| `cm/live-preview.js`, `cm/obsidian-syntax.js`, `cm/highlight-code.js` | **lift as-is** (vendored under `ui/src/vendor/obsidian-web/`, provenance header) | self-contained, renderer injected |
| `cm/editor.js` | **reference only** — Atlas writes its own small `createEditor` | the rest is textarea-adapter glue Atlas doesn't need |
| `vim.js` | **no** — use `@replit/codemirror-vim` | custom textarea vim; the CM6 one is maintained upstream |
| `latexsuite.js`, `slashmenu.js` | **port later** (slice 1 polish) | coupled to app globals + MathJax |
| Rust `frontmatter.rs`, `vault.rs` Index, Bases group | **lift in slices 4** | tested, but not needed for slice 1 |
| search (`api.rs`) | **no** | linear scan; Atlas uses FTS5 + ripgrep |
