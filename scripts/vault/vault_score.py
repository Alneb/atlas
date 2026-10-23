#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""Score Obsidian notes for migration into an Atlas workspace; writes a checklist the user ticks.

Signals (shape-based, so unseen notes degrade gracefully):
  topic graph — notes whose `topics` reach the root topic (default "Physics") through other notes'
                topics (a lecture → its course → Physics); strongest signal
  LaTeX       — `$…$` / `$$…$$` density
  vocabulary  — domain words (overridable with --vocab FILE, one word per line)
  negatives   — `type` values that mark non-research notes (movie, artist, journal, …)
Usage: vault_score.py VAULT OUT.md [--root Physics] [--threshold 3]
The vault is only read, never written.
"""
from __future__ import annotations
import argparse, re, sys
from pathlib import Path
import yaml

FM = re.compile(r"\A---\n(.*?)\n---\n?", re.S)
WIKI = re.compile(r"\[\[([^\]|#]+)")
MATH = re.compile(r"\$\$.+?\$\$|\$[^$\n]+\$", re.S)
SKIP_DIRS = {".obsidian", ".trash", ".git", ".stversions", "templates", "snippets", "scripts"}
NEG_TYPES = {"movie", "artist", "song", "album", "journal", "bookmark", "status", "list", "yt video",
             "cliptemplate", "clippertemplate", "recipe", "dream"}
VOCAB = """hamiltonian hubbard fermion fermions boson bosons lattice green self-energy dmft cdmft dca
quantum operator operators eigenvalue eigenstate spin momentum hilbert wavefunction perturbation
phonon electron electrons band bands brillouin fourier propagator matsubara spectral mott insulator
superconductivity magnetization entropy partition thermodynamic commutator annihilation creation
tight-binding graphene bloch polarization scattering cross-section lagrangian symmetry topological
density correlation impurity anderson kondo hartree fock bath cluster""".split()

def parse(p: Path):
    text = p.read_text(encoding="utf-8", errors="replace")
    m = FM.match(text)
    meta = {}
    if m:
        try:
            meta = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            meta = {}
    body = text[m.end():] if m else text
    return (meta if isinstance(meta, dict) else {}), body

def links(v) -> list[str]:
    vals = v if isinstance(v, list) else [v]
    return [x.strip() for s in vals if isinstance(s, str) for x in WIKI.findall(s)]

def norm_type(t) -> str:
    s = links(t)[0] if links(t) else (t if isinstance(t, str) else "")
    return s.split("|")[-1].strip().lower()

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("vault", type=Path); ap.add_argument("out", type=Path)
    ap.add_argument("--root", default="Physics"); ap.add_argument("--threshold", type=float, default=3.0)
    ap.add_argument("--vocab", type=Path)
    a = ap.parse_args()
    vocab = set(a.vocab.read_text().split()) if a.vocab else set(VOCAB)

    notes = {}
    for p in sorted(a.vault.rglob("*.md")):
        rel = p.relative_to(a.vault)
        if SKIP_DIRS & set(rel.parts) or p.name.endswith(".excalidraw.md"):
            continue
        meta, body = parse(p)
        notes[p.stem] = (rel, meta, body)
    print(f"[score] {len(notes)} candidate notes in {a.vault}", file=sys.stderr)

    # Topic closure: a note is "in" if any topic link is the root or a note already in.
    inside = {a.root}
    changed = True
    while changed:
        changed = False
        for stem, (_, meta, _) in notes.items():
            if stem not in inside and set(links(meta.get("topics"))) & inside:
                inside.add(stem); changed = True

    rows = []
    for stem, (rel, meta, body) in notes.items():
        words = re.findall(r"[a-zA-Z-]+", body.lower())
        n_math = len(MATH.findall(body))
        n_vocab = sum(w in vocab for w in words)
        why, score = [], 0.0
        if stem in inside and stem != a.root:
            score += 4; why.append("topic→" + a.root)
        if n_math:
            score += min(3, n_math / 3); why.append(f"{n_math} math")
        if n_vocab:
            score += min(3, n_vocab / 4); why.append(f"{n_vocab} vocab")
        t = norm_type(meta.get("type"))
        if t in NEG_TYPES:
            score -= 5; why.append(f"type {t}")
        if len(body.strip()) < 40 and not n_math:
            score -= 1; why.append("near-empty")
        rows.append((score, rel, ", ".join(why) or "no signal"))
    rows.sort(key=lambda r: (-r[0], str(r[1])))

    keep = [r for r in rows if r[0] >= a.threshold]
    maybe = [r for r in rows if 1 <= r[0] < a.threshold]
    out = [f"# Vault migration review — {a.vault}", "", "<!-- atlas:no-tasks -->", "",
           f"Tick what should move into this workspace, then run `vault_migrate.py`. Pre-ticked = score ≥ {a.threshold}.",
           f"{len(keep)} likely · {len(maybe)} unsure · {len(rows) - len(keep) - len(maybe)} left out (not listed). The vault is never modified.", "",
           "## Likely", ""]
    out += [f"- [x] `{r[1]}` — {r[0]:.1f} ({r[2]})" for r in keep]
    out += ["", "## Unsure", ""]
    out += [f"- [ ] `{r[1]}` — {r[0]:.1f} ({r[2]})" for r in maybe]
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"[score] wrote {a.out}: {len(keep)} likely, {len(maybe)} unsure", file=sys.stderr)
    return 0

if __name__ == "__main__":
    sys.exit(main())
