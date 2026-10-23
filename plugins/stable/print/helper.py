#!/usr/bin/env python3
"""The Print plugin's helper: CUPS (`lp`, `lpstat`) on the machine running Atlas.

A note is printed as the document the Export plugin makes of it (its PDF, with the Export settings), never as its
Markdown text; any other file as it is. The answer is the job id `lp` gives, or why not — the page shows it.
"""
import os
import re
import shutil
import subprocess

import atlas_plugin as atlas

ROOT = os.environ.get("ATLAS_ROOT") or "."
# CUPS answers in the machine's language ("la impresora … está inactiva"); its English is what is read here
C = {**os.environ, "LC_ALL": "C", "LANG": "C"}
SIDES = {"one-sided": "one-sided", "two-sided (long edge)": "two-sided-long-edge", "two-sided (short edge)": "two-sided-short-edge"}


def need(program):
    if not shutil.which(program):
        raise RuntimeError(f"{program} is not installed on the machine running Atlas (CUPS)")


@atlas.method
def printers(_params=None):
    """The printers CUPS knows, the default first: [{value, label}] for the settings' suggestions."""
    need("lpstat")
    names = re.findall(r"^printer (\S+)", subprocess.run(["lpstat", "-p"], capture_output=True, text=True, env=C).stdout, re.M)
    default = re.search(r":\s*(\S+)\s*$", subprocess.run(["lpstat", "-d"], capture_output=True, text=True, env=C).stdout.strip())
    first = default[1] if default and default[1] in names else None
    ordered = ([first] if first else []) + [n for n in names if n != first]
    return [{"value": n, "label": f"{n} (default)" if n == first else n} for n in ordered]


def as_pdf(path):
    """A note's PDF, made by the Export plugin as its "Export to PDF" makes it; the path of the PDF."""
    plugins = atlas.get("/api/plugins")
    export = next((p for p in plugins if p.get("id") == "export"), None)
    if not export:
        raise RuntimeError("a note is printed as its PDF, made by the Export plugin: install it (Settings → Plugins)")
    r = atlas.post("/api/plugins/export/helper", {"method": "export", "params": {"path": path, "to": "pdf", "settings": export.get("settings") or {}}, "timeout_secs": 600})
    return r["written"][-1]


@atlas.method(name="print")
def print_file(params):
    path = str(params.get("path") or "").strip().lstrip("/")
    s = params.get("settings") or {}
    if not path:
        raise ValueError("nothing to print")
    need("lp")
    note = path.lower().endswith(".md")
    target = as_pdf(path) if note else path
    cmd = ["lp"]
    printer = str(s.get("printer") or "").strip()
    if printer:
        cmd += ["-d", printer]
    copies = int(s.get("copies") or 1)
    if copies > 1:
        cmd += ["-n", str(copies)]
    if s.get("sides") in SIDES:
        cmd += ["-o", f"sides={SIDES[s['sides']]}"]
    if str(s.get("media") or "").strip():
        cmd += ["-o", f"media={s['media']}"]
    cmd += str(s.get("options") or "").split()
    cmd.append(os.path.join(ROOT, target))
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=C)
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout).strip() or f"lp failed ({r.returncode})")
    job = re.search(r"request id is (\S+)", r.stdout)
    return {"job": job[1] if job else r.stdout.strip(), "printed": target, "printer": printer or "the default printer"}


if __name__ == "__main__":
    atlas.serve()
