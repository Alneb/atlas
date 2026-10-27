"""Books: a DjVu book made once into a PDF in the plugin's cache, which the app's PDF viewer then opens — as the Manga
plugin makes a .cbr into a .cbz. Converted by djvulibre's `ddjvu` where this machine has it; none: said so. The vault's
file is never touched.
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_plugin as atlas  # noqa: E402  (Atlas puts it on PYTHONPATH)

ROOT = os.environ.get("ATLAS_ROOT", ".")
CACHE = os.environ.get("ATLAS_PLUGIN_CACHE", ".")
DDJVU = "ddjvu"


@atlas.method
def as_pdf(params):
    """{path} (vault-relative .djvu) → {path}: its PDF in the cache (vault-relative), made on first ask."""
    rel = params["path"]
    src = os.path.join(ROOT, rel)
    st = os.stat(src)
    key = hashlib.sha1(f"{rel}\0{st.st_size}\0{st.st_mtime_ns}".encode()).hexdigest()[:20]
    out = os.path.join(CACHE, f"{key}.pdf")
    if not os.path.exists(out):
        exe = shutil.which(DDJVU)
        if not exe:
            raise ValueError("a DjVu book needs djvulibre's ddjvu on this machine (package djvulibre)")
        with tempfile.TemporaryDirectory(dir=CACHE) as tmp:
            part = os.path.join(tmp, "out.pdf")
            r = subprocess.run([exe, "-format=pdf", "-quality=85", src, part], capture_output=True, timeout=1800)
            if r.returncode != 0 or not os.path.exists(part):
                raise ValueError(f"ddjvu could not convert it: {r.stderr.decode(errors='replace').strip()[:200] or f'exit {r.returncode}'}")
            os.replace(part, out)
    return {"path": os.path.relpath(out, ROOT)}


if __name__ == "__main__":
    atlas.serve()
