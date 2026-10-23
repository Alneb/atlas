#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["lzstring>=1.0.4"]
# ///
"""Convert Obsidian-Excalidraw `.excalidraw.md` files into plain `.excalidraw` JSON (what excalidraw.com
and Atlas's Excalidraw pane open). Handles both `compressed-json` (LZString base64) and `json` blocks.
Source files are only read; existing outputs are not overwritten.
Usage: excalidraw_convert.py SRC(.excalidraw.md|dir) OUT_DIR
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
import lzstring

BLOCK = re.compile(r"```(compressed-json|json)\n(.*?)\n```", re.S)

def convert(md: Path) -> dict:
    m = BLOCK.search(md.read_text(encoding="utf-8"))
    if not m:
        raise ValueError("no drawing block")
    raw = m.group(2)
    if m.group(1) == "compressed-json":
        raw = lzstring.LZString().decompressFromBase64(re.sub(r"\s", "", raw))
        if not raw:
            raise ValueError("LZString decompression failed")
    scene = json.loads(raw)
    scene.setdefault("type", "excalidraw")
    return scene

def main() -> int:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    files = [src] if src.is_file() else sorted(src.rglob("*.excalidraw.md"))
    out.mkdir(parents=True, exist_ok=True)
    ok = bad = skipped = 0
    for f in files:
        dst = out / (f.name.removesuffix(".excalidraw.md") + ".excalidraw")
        if dst.exists():
            skipped += 1; continue
        try:
            scene = convert(f)
            dst.write_text(json.dumps(scene, ensure_ascii=False), encoding="utf-8"); ok += 1
            print(f"[excalidraw] {f.name} → {dst.name} ({len(scene.get('elements', []))} elements)", file=sys.stderr)
        except Exception as e:  # report and continue: one bad drawing must not stop the batch
            bad += 1; print(f"[excalidraw] !! {f.name}: {e}", file=sys.stderr)
    print(f"[excalidraw] {ok} converted · {skipped} existed · {bad} failed", file=sys.stderr)
    return 1 if bad else 0

if __name__ == "__main__":
    sys.exit(main())
