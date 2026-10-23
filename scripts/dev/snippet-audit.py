#!/usr/bin/env python3
"""Audit a LaTeX Suite snippet file (the `snippets.coffee` of Obsidian's plugin, which Atlas reads too).

    python3 scripts/dev/snippet-audit.py ~/Notes/.atlas/snippets/snippets.coffee

Read-only. It prints: how many snippets are live (commented-out lines are left out), the ones that
need a selection (`${VISUAL}`), triggers defined twice for the same mode, and every automatic math
trigger that is the beginning of a longer one (`kV` / `kVA`): Atlas waits for the longer one, the
Obsidian plugin expands the short one first, so there the long one can never be typed.
"""
import collections
import re
import sys

ENTRY = re.compile(
    r'\{\s*trigger:\s*(?P<t>"(?:[^"\\]|\\.)*"|/(?:[^/\\\n]|\\.)+/[a-z]*)\s*,\s*replacement:\s*'
    r'(?P<r>"(?:[^"\\]|\\.)*"|[^,]+?(?=,\s*options))\s*,\s*options:\s*"(?P<o>[^"]*)"', re.S)


def main(path):
    lines = open(path, encoding="utf-8").read().split("\n")
    live = "\n".join(l for l in lines if not l.strip().startswith("//"))
    entries = [(m["t"], m["r"].strip(), m["o"]) for m in ENTRY.finditer(live)]
    off = sum(1 for l in lines if l.strip().startswith("//") and "trigger:" in l)
    print(f"{path}\n  live snippets: {len(entries)}   commented out: {off}")
    print("  by options:", dict(collections.Counter("".join(sorted(o)) for _, _, o in entries).most_common()))
    plain = [(t[1:-1], r, o) for t, r, o in entries if t.startswith('"')]
    print(f"  plain triggers: {len(plain)}   regular expressions: {len(entries) - len(plain)}")
    visual = [t for t, r, _ in plain if "VISUAL" in r]
    print(f"  need a selection ({len(visual)}):", " ".join(visual))
    rest = [(t, r, o) for t, r, o in plain if "VISUAL" not in r]

    # the same trigger twice for the same place (M = display only, n = inline only: those pairs are meant)
    seen = collections.defaultdict(list)
    for t, r, o in rest:
        place = "display" if "M" in o else "inline" if "n" in o else "math" if "m" in o else "text"
        seen[(t, place)].append(r)
    twice = {k: v for k, v in seen.items() if len(v) > 1}
    print(f"\n  defined twice for the same place: {len(twice)}")
    for (t, place), rs in twice.items():
        print(f"    {t!r} ({place}): " + "  |  ".join(r[:50] for r in rs))

    auto = sorted({t for t, _, o in rest if "A" in o and "m" in o and "r" not in o})
    pairs = [(a, b) for a in auto for b in auto if a != b and b.startswith(a)]
    print(f"\n  an automatic trigger that begins a longer one: {len(pairs)}")
    for a, b in pairs:
        print(f"    {a!r} is the start of {b!r}")
    text = [t for t, _, o in rest if "A" in o and "t" in o]
    print(f"\n  automatic in running text ({len(text)}):", "  ".join(repr(t) for t in text))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
