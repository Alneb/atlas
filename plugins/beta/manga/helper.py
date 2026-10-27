"""Manga: a comic archive the page cannot read (.cbr is RAR; .cb7, .cbt) made once into a .cbz in the plugin's cache,
which the reader then opens like any .cbz. A tar is unpacked by Python itself (every platform); the rest by whatever
this machine has — bsdtar (libarchive), unrar, unar — tried in that order; none, or none that reads it: said so. The
vault's file is never touched.
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_plugin as atlas  # noqa: E402  (Atlas puts it on PYTHONPATH)

ROOT = os.environ.get("ATLAS_ROOT", ".")
CACHE = os.environ.get("ATLAS_PLUGIN_CACHE", ".")
PICTURE = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".jxl", ".bmp")
# each: the program, then how it unpacks archive {a} into folder {d}
TOOLS = [("bsdtar", ["-xf", "{a}", "-C", "{d}"]), ("unrar", ["x", "-inul", "-y", "{a}", "{d}/"]),
         ("unar", ["-q", "-f", "-o", "{d}", "{a}"])]


def _unpack(archive, into):
    """Unpacks with the first tool that is here and succeeds; → its name. Raises with what was tried."""
    if hasattr(tarfile, "data_filter") and tarfile.is_tarfile(archive):  # no program needed; "data" keeps paths inside
        with tarfile.open(archive) as t:
            t.extractall(into, filter="data")
        return "tarfile"
    tried = []
    for tool, args in TOOLS:
        exe = shutil.which(tool)
        if not exe:
            continue
        r = subprocess.run([exe, *(a.format(a=archive, d=into) for a in args)], capture_output=True, timeout=600)
        if r.returncode == 0:
            return tool
        tried.append(f"{tool}: {(r.stderr or r.stdout).decode(errors='replace').strip()[:160] or f'exit {r.returncode}'}")
    if not tried:
        raise ValueError("no program here unpacks this archive: install bsdtar (libarchive), unrar or unar")
    raise ValueError("could not unpack it — " + "; ".join(tried))


@atlas.method
def as_cbz(params):
    """{path} (vault-relative .cbr/.cb7/.cbt) → {path}: its .cbz in the cache (vault-relative), made on first ask."""
    rel = params["path"]
    src = os.path.join(ROOT, rel)
    st = os.stat(src)
    key = hashlib.sha1(f"{rel}\0{st.st_size}\0{st.st_mtime_ns}".encode()).hexdigest()[:20]
    out = os.path.join(CACHE, f"{key}.cbz")
    if not os.path.exists(out):
        with tempfile.TemporaryDirectory(dir=CACHE) as tmp:
            pics = os.path.join(tmp, "pages")
            os.mkdir(pics)
            _unpack(src, pics)
            names = sorted(os.path.relpath(os.path.join(d, f), pics) for d, _, fs in os.walk(pics) for f in fs
                           if f.lower().endswith(PICTURE) and "__MACOSX" not in d)
            if not names:
                raise ValueError("no pictures in this archive")
            part = os.path.join(tmp, "out.cbz")
            with zipfile.ZipFile(part, "w", zipfile.ZIP_STORED) as z:  # pictures are compressed already
                for n in names:
                    z.write(os.path.join(pics, n), n)
            os.replace(part, out)
    return {"path": os.path.relpath(out, ROOT)}


if __name__ == "__main__":
    atlas.serve()
