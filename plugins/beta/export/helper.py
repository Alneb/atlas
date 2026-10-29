#!/usr/bin/env python3
"""The Export plugin's helper: a note (Markdown, Obsidian/Atlas syntax) → a LaTeX file and its PDF.

pandoc writes the .tex from the note translated to plain pandoc Markdown; latexmk compiles that same .tex (biber for the
bibliography), so the LaTeX you get and the PDF are one document. Both go under the exports folder, mirroring the
note's path (`notes/a/x.md` → `exports/notes/a/x.tex`, `.pdf`); LaTeX's own files stay in the plugin's cache. The
note is only read. Protocol: one JSON object per line (docs/guides/PLUGIN-API.md, "The helper's protocol").
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(os.environ.get("ATLAS_ROOT") or ".").resolve()
CACHE = Path(os.environ.get("ATLAS_PLUGIN_CACHE") or ROOT / ".atlas/cache/plugins/export")
IMAGE = re.compile(r"\.(png|jpe?g|gif|svg|webp|pdf|eps)$", re.I)
# fenced blocks Atlas or Obsidian draw from a query: nothing to print
QUERY_FENCES = {"view", "base", "tasks", "dataview", "dataviewjs", "query"}
ENGINES = {"lualatex": "-lualatex", "xelatex": "-xelatex", "pdflatex": "-pdf"}


def event(stage: str, text: str) -> None:
    print(json.dumps({"event": "progress", "data": {"stage": stage, "text": text}}), flush=True)


# --- the vault: names to files, the bibliography --------------------------------------------------------------------

class Vault:
    """Finds what a note names the way Obsidian does: beside the note, from the vault's top, else any file of that name."""

    def __init__(self, root: Path):
        self.root = root
        self._by_name: dict[str, list[Path]] | None = None

    def by_name(self) -> dict[str, list[Path]]:
        if self._by_name is None:
            self._by_name = {}
            for folder, dirs, names in os.walk(self.root):
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                for n in names:
                    self._by_name.setdefault(n.lower(), []).append(Path(folder) / n)
        return self._by_name

    def find(self, name: str, near: Path, ext: str = "") -> Path | None:
        name = name.strip()
        candidates = [name] + ([name + ext] if ext and not name.lower().endswith(ext) else [])
        for c in candidates:
            for base in (near, self.root):
                p = (base / c).resolve()
                if p.is_file() and p.is_relative_to(self.root):
                    return p
        for c in candidates:
            hits = self.by_name().get(Path(c).name.lower(), [])
            if hits:  # the shortest path wins, as in Obsidian
                return min(hits, key=lambda p: len(p.parts))
        return None


def find_bib(root: Path, setting: str) -> Path | None:
    """The setting's .bib, else refs/refs.bib, else the one .bib at the top or in refs/."""
    if setting.strip():
        p = (root / setting.strip()).resolve()
        return p if p.is_file() else None
    for p in [root / "refs" / "refs.bib", *sorted(root.glob("*.bib")), *sorted((root / "refs").glob("*.bib"))]:
        if p.is_file():
            return p
    return None


def bib_keys(bib: Path | None) -> set[str]:
    if not bib:
        return set()
    return set(re.findall(r"@\w+\s*\{\s*([^,\s]+)\s*,", bib.read_text(encoding="utf-8", errors="replace")))


# --- the note: its frontmatter and its parts outside code ------------------------------------------------------------

def split_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """The frontmatter's single-line `key: value` pairs (quotes off) and the body."""
    m = re.match(r"\A---\r?\n(.*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|\Z)", text, re.S)
    if not m:
        return {}, text
    props = {}
    for line in m[1].splitlines():
        kv = re.match(r"^([A-Za-z_][\w-]*):\s*(.+?)\s*$", line)
        if kv:
            props[kv[1].lower()] = kv[2].strip("'\"")
    return props, text[m.end():]


def segments(md: str):
    """The text as (is_code, chunk): fenced blocks are code; a query fence (```view …) is dropped."""
    out, buf, fence, lang = [], [], None, ""
    for line in md.splitlines(keepends=True):
        m = re.match(r"^\s*(`{3,}|~{3,})\s*([\w-]*)", line)
        if fence is None and m:
            out.append((False, "".join(buf)))
            buf, fence, lang = [line], m[1], m[2].lower()
        elif fence is not None and line.strip().startswith(fence) and line.strip().strip(fence[0]) == "":
            buf.append(line)
            if lang not in QUERY_FENCES:
                out.append((True, "".join(buf)))
            buf, fence = [], None
        else:
            buf.append(line)
    out.append((fence is not None, "".join(buf)))
    return out


def outside_inline_code(text: str, fn) -> str:
    """`fn` applied to the text between inline code spans."""
    parts = re.split(r"(`+[^`\n]*?`+)", text)
    return "".join(p if i % 2 else fn(p) for i, p in enumerate(parts))


# --- the translation ------------------------------------------------------------------------------------------------

class Translator:
    def __init__(self, vault: Vault, out_dir: Path, keys: set[str]):
        self.vault, self.out_dir, self.keys = vault, out_dir, keys
        self.cited: list[str] = []
        self.warnings: list[str] = []

    def rel(self, p: Path) -> str:
        """A path as the .tex in the exports folder names it."""
        return os.path.relpath(p, self.out_dir).replace(os.sep, "/")

    def figure(self, target: str, opts: str, caption: str, near: Path) -> str:
        img = self.vault.find(target, near)
        if not img:
            self.warnings.append(f"picture not found: {target}")
            return f"*({target})*"
        vector = img.with_suffix(".pdf")  # a plot's vector twin beside its .png prints sharper
        src = vector if img.suffix.lower() != ".pdf" and vector.is_file() else img
        px = next((int(m[1]) for o in opts.split("|") if (m := re.fullmatch(r"\s*(\d+)(?:x\d+)?\s*", o))), None)
        width = f"{{width={min(100, round(px / 7))}%}}" if px else ""  # Obsidian's pixels on a ~700 px page
        caption = re.sub(r"^(\*\*)?(Figure|Fig\.)\s*\d+[.:]?(\*\*)?\s*", "", caption.strip())  # LaTeX numbers them
        return f"![{caption}](<{self.rel(src)}>){width}"

    def transclude(self, target: str, near: Path, depth: int) -> str:
        name, _, section = target.partition("#")
        note = self.vault.find(name, near, ".md")
        if not note or note.suffix.lower() != ".md":
            self.warnings.append(f"embed left out: {target}")
            return f"*({target})*"
        if depth >= 3:
            return f"*({name})*"
        _, body = split_frontmatter(note.read_text(encoding="utf-8", errors="replace"))
        if section and not section.startswith("^"):
            lines, take, level = body.splitlines(), [], 0
            for line in lines:
                h = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
                if h and level and len(h[1]) <= level:
                    break
                if h and not level and h[2].strip().lower() == section.strip().lower():
                    level = len(h[1])
                    continue
                if level:
                    take.append(line)
            body = "\n".join(take)
        return self.body(body, note.parent, depth + 1)

    def link(self, target: str, alias: str | None) -> str:
        name = target.split("#")[0].strip()
        key = Path(name).name.removesuffix(".md")
        if key in self.keys:  # citing is linking: a link to a paper is its citation
            if key not in self.cited:
                self.cited.append(key)
            return f"\\cite{{{key}}}"
        if alias:
            return alias
        heading = target.partition("#")[2].lstrip("^")
        return heading if not name else Path(name).name.removesuffix(".md")

    def prose(self, text: str, near: Path, depth: int) -> str:
        text = re.sub(r"%%.*?%%", "", text, flags=re.S)  # Obsidian comments
        # an embed followed by its italic caption paragraph → one captioned figure
        text = re.sub(r"!\[\[([^\]|#]+)((?:\\?\|[^\]]*)?)\]\]\n\n\*([^*\n][^\n]*?)\*\n",
                      lambda m: self.figure(m[1], m[2].lstrip("\\|"), m[3], near) + "\n", text)

        def embed(m: re.Match) -> str:
            target, opts = m[1].strip(), (m[2] or "").lstrip("\\").lstrip("|")
            if IMAGE.search(target.split("#")[0]):
                return self.figure(target.split("#")[0], opts, "", near)
            return "\n\n" + self.transclude(target, near, depth) + "\n\n"

        def inline(t: str) -> str:
            t = re.sub(r"!\[\[([^\]|]+)((?:\\?\|[^\]]*)?)\]\]", embed, t)
            t = re.sub(r"\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]", lambda m: self.link(m[1].rstrip("\\"), m[2]), t)
            t = re.sub(r"==([^=\n]+)==", r"\\hl{\1}", t)
            t = re.sub(r"[ \t]\^[A-Za-z0-9-]+[ \t]*$", "", t, flags=re.M)  # block ids
            return t

        text = outside_inline_code(text, inline)
        # a callout's first line → a titled quote
        text = re.sub(r"^((?:>\s*)+)\[!(\w+)\][+-]?[ \t]*(.*)$",
                      lambda m: f"{m[1]}**{m[3].strip() or m[2].capitalize()}**\n{m[1].rstrip()}", text, flags=re.M)
        # pandoc needs a blank line between a paragraph and the list under it
        return re.sub(r"^([^\n\s>|-][^\n]*)\n(\s*(?:[-*+]|\d+[.)]) )", r"\1\n\n\2", text, flags=re.M)

    def body(self, md: str, near: Path, depth: int = 0) -> str:
        return "".join(chunk if code else self.prose(chunk, near, depth) for code, chunk in segments(md))


def translate(note: Path, vault: Vault, out_dir: Path, keys: set[str]) -> tuple[dict, str, Translator]:
    """The note as pandoc Markdown, its metadata (title, author, date) and what was cited."""
    props, body = split_frontmatter(note.read_text(encoding="utf-8", errors="replace"))
    meta = {k: props[k] for k in ("title", "author", "date", "subtitle") if props.get(k)}
    h1 = re.search(r"^# (.+?)\s*#*\s*$", body, re.M)
    if "title" not in meta:
        meta["title"] = h1[1] if h1 else note.stem
        if h1:
            body = body[: h1.start()] + body[h1.end():]
    t = Translator(vault, out_dir, keys)
    return meta, t.body(body, note.parent), t


# --- writing and compiling ------------------------------------------------------------------------------------------

def header_metadata(lines: list[str]) -> str:
    """The preamble as a pandoc metadata file (`header-includes`, one raw LaTeX block) rather than `-H`: pandoc drops
    the metadata's `header-includes` when `-H` is given, and tikz.lua adds its packages there."""
    body = "\n".join("    " + l for l in "\n".join(lines).splitlines())
    return f"header-includes:\n  - |\n    ```{{=latex}}\n{body}\n    ```\n"


def run(cmd: list[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess:
    if not shutil.which(cmd[0]):
        raise RuntimeError(f"{cmd[0]} is not installed on the machine running Atlas")
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def latex_errors(log: str) -> str:
    """The lines LaTeX marks as errors, with the two after each: what a person needs to fix it."""
    lines = log.splitlines()
    picked = [i for i, l in enumerate(lines) if l.startswith("!") or re.match(r"^\S+\.tex:\d+:", l)]
    keep = sorted({j for i in picked for j in range(i, min(i + 3, len(lines)))})
    return "\n".join(lines[j] for j in keep)[-3000:] or "\n".join(lines[-30:])


def export(params: dict) -> dict:
    rel = str(params.get("path") or "").strip().lstrip("/")
    to = params.get("to", "pdf")
    s = params.get("settings") or {}
    if to not in ("pdf", "tex"):
        raise ValueError(f"export to {to!r}: only pdf or tex")
    note = (ROOT / rel).resolve()
    if not rel.lower().endswith(".md") or not note.is_file() or not note.is_relative_to(ROOT):
        raise ValueError(f"not a note of this vault: {rel}")
    folder = str(s.get("folder") or "exports").strip().strip("/") or "exports"
    out_dir = ROOT / folder / Path(rel).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    tex = out_dir / (note.stem + ".tex")

    event("translate", f"reading {rel}")
    bib = find_bib(ROOT, str(s.get("bibliography") or ""))
    meta, md, t = translate(note, Vault(ROOT), out_dir, bib_keys(bib))
    header = ["\\usepackage{soul}"]
    if t.cited and bib:
        header += ["\\usepackage[backend=biber,style=" + (str(s.get("style") or "").strip() or "numeric-comp") + "]{biblatex}",
                   f"\\addbibresource{{{os.path.relpath(bib, out_dir).replace(os.sep, '/')}}}"]
    extra = str(s.get("preamble") or "").strip()
    if extra:
        p = (ROOT / extra).resolve()
        if p.is_file():
            header.append(f"\\input{{{os.path.relpath(p, out_dir).replace(os.sep, '/')}}}")
        else:
            t.warnings.append(f"preamble not found: {extra}")

    CACHE.mkdir(parents=True, exist_ok=True)
    src, head, tail = CACHE / "note.md", CACHE / "header.yaml", CACHE / "after.tex"
    src.write_text(md, encoding="utf-8")
    head.write_text(header_metadata(header), encoding="utf-8")
    tail.write_text("\\printbibliography\n" if t.cited and bib else "", encoding="utf-8")
    shift = ["--shift-heading-level-by=-1"] if not re.search(r"^# ", md, re.M) and re.search(r"^## ", md, re.M) else []
    cmd = ["pandoc", str(src), "-f", "markdown", "-t", "latex", "-s", "-o", str(tex), "--metadata-file", str(head),
           "-A", str(tail), "--lua-filter", str(Path(__file__).with_name("tikz.lua")),
           "-V", "geometry:margin=2.4cm", "-V", f"fontsize={s.get('fontsize') or '11pt'}", "-V", "colorlinks=true",
           "-V", f"lang={s.get('lang') or 'en'}", *shift]
    for k, v in meta.items():
        cmd += ["-M", f"{k}={v}"]
    event("pandoc", f"writing {tex.relative_to(ROOT)}")
    r = run(cmd, out_dir, 120)
    if r.returncode:
        raise RuntimeError(f"pandoc failed: {r.stderr.strip()[-2000:]}")
    written = [str(tex.relative_to(ROOT))]
    if t.cited and not bib:
        t.warnings.append("papers are cited but no .bib was found (setting: Bibliography)")

    if to == "pdf":
        engine = str(s.get("engine") or "lualatex")
        build = CACHE / "build" / re.sub(r"[^\w.-]+", "_", rel)
        build.mkdir(parents=True, exist_ok=True)
        event("latex", f"compiling with {engine} (latexmk; biber for the references)")
        r = run(["latexmk", ENGINES.get(engine, "-lualatex"), "-interaction=nonstopmode", "-halt-on-error",
                 "-file-line-error", f"-outdir={build}", tex.name], out_dir, 600)
        built = build / (tex.stem + ".pdf")
        if r.returncode or not built.is_file():
            log = build / (tex.stem + ".log")
            why = latex_errors(log.read_text(encoding="utf-8", errors="replace")) if log.is_file() else r.stdout[-2000:]
            raise RuntimeError(f"LaTeX failed on {tex.relative_to(ROOT)}:\n{why}")
        pdf = out_dir / built.name
        shutil.copyfile(built, pdf)
        written.append(str(pdf.relative_to(ROOT)))
    event("done", ", ".join(written))
    return {"written": written, "cited": t.cited, "warnings": t.warnings}


METHODS = {"export": export}


if __name__ == "__main__":
    import atlas_plugin  # Atlas puts it on PYTHONPATH; imported here so the tests load the file without it

    atlas_plugin.serve(METHODS)
