# TeX packages for the in-page TeX

TikZJax (`@drgrice1/tikzjax`) ships a fixed set of TeX files. The files here add packages it lacks; the build serves
each one gzipped at `/tikzjax/tex_files/<name>.gz`, beside TikZJax's own (`texExtra` in `ui/vite.config.ts`).

| File | Package | Licence |
|---|---|---|
| `tikz-feynman.sty`, `tikzlibraryfeynman.code.tex`, `tikzfeynman.keys.code.tex` | tikz-feynman (Feynman diagrams) | LPPL 1.3 |
| `pgfopts.sty` | pgfopts (tikz-feynman's options) | LPPL 1.3c |
| `iftex.sty`, `ifluatex.sty` | iftex (tikz-feynman asks whether it runs under LuaTeX) | LPPL 1.3c |

All are copied unmodified from TeX Live. tikz-feynman's automatic layout needs LuaTeX, which the page's TeX is not:
place the vertices by hand (`\vertex [right=of a] (b);`) and draw the edges with `\diagram*`.

To add a package: copy its files (and what they load that TikZJax lacks) here unmodified, add a row above, and a case
to `ui/tests/tikz.spec.ts`.
