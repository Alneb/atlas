#!/usr/bin/env bash
# trim-target.sh — keeps target/ from growing without end. cargo never deletes a build it no longer uses: every feature set
# (`cargo test -p X` and `--workspace` unify features differently), profile, target triple, toolchain and Cargo.lock
# change makes a new copy (atlas-core: ~170 MB a copy, ~25 of them in a week; target/ reached 76 GB).
#
# Per crate and per profile folder: the newest build is always kept, up to KEEP-1 more while younger than DAYS; the
# rest go — their files in deps/, their .fingerprint/ and build/ folders, and old incremental caches. A deleted build
# that is wanted again is simply rebuilt. Nothing is touched while cargo or rustc runs (another session's build).
#   bash scripts/dev/trim-target.sh [--dry]      KEEP=4 DAYS=2 by default
# docs/guides/DEVELOPING.md, "target/ size".
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
dry=0; [ "${1:-}" = "--dry" ] && dry=1
if pgrep -u "$(id -u)" -x cargo >/dev/null || pgrep -u "$(id -u)" -x rustc >/dev/null; then
  echo "[trim] a cargo / rustc is running: target/ left as it is"; exit 0
fi
before=$(du -sb "$root/target" 2>/dev/null | cut -f1)
DRY=$dry KEEP="${KEEP:-4}" DAYS="${DAYS:-2}" python3 -I - "$root/target" <<'EOF'
import os, re, shutil, sys, time
target, dry = sys.argv[1], os.environ["DRY"] == "1"
keep, young = int(os.environ["KEEP"]), time.time() - float(os.environ["DAYS"]) * 86400
ART = re.compile(r"^(.+)-([0-9a-f]{16})(\..+)?$")

def mtime(p):
    try: return os.lstat(p).st_mtime
    except OSError: return 0

def remove(p):
    if dry: return
    if os.path.isdir(p) and not os.path.islink(p): shutil.rmtree(p, ignore_errors=True)
    else:
        try: os.remove(p)
        except OSError: pass

def stale(groups):
    """{name: {hash: newest mtime}} → the hashes to drop: all but the newest, and the young ones up to `keep`."""
    out = set()
    for hashes in groups.values():
        ranked = sorted(hashes, key=hashes.get, reverse=True)
        out |= {h for i, h in enumerate(ranked) if i > 0 and (i >= keep or hashes[h] < young)}
    return out

dropped = 0
for dirpath, dirnames, _ in os.walk(target):
    if "deps" not in dirnames or not os.path.isdir(os.path.join(dirpath, ".fingerprint")):
        continue  # a profile folder: target/debug, target/release, target/<triple>/<profile>
    dirnames[:] = [d for d in dirnames if d not in ("deps", "build", ".fingerprint", "incremental")]
    deps = os.path.join(dirpath, "deps")
    groups = {}
    for f in os.listdir(deps):
        m = ART.match(f)
        if m: groups.setdefault(m[1], {}).setdefault(m[2], 0); groups[m[1]][m[2]] = max(groups[m[1]][m[2]], mtime(os.path.join(deps, f)))
    gone = stale(groups)
    for sub in ("deps", ".fingerprint", "build"):
        d = os.path.join(dirpath, sub)
        for f in os.listdir(d) if os.path.isdir(d) else []:
            m = ART.match(f)
            if m and m[2] in gone: remove(os.path.join(d, f)); dropped += 1
    # incremental/<crate>-<its own hash>: the same rule over its folders
    inc = os.path.join(dirpath, "incremental")
    if os.path.isdir(inc):
        igroups = {}
        for f in os.listdir(inc):
            m = re.match(r"^(.+)-([0-9a-z]+)$", f)
            if m: igroups.setdefault(m[1], {})[m[2]] = mtime(os.path.join(inc, f))
        for name, hashes in igroups.items():
            for h in stale({name: hashes}): remove(os.path.join(inc, f"{name}-{h}")); dropped += 1
print(f"[trim] {'would drop' if dry else 'dropped'} {dropped} old build files and folders")
EOF
after=$(du -sb "$root/target" 2>/dev/null | cut -f1)
awk -v b="$before" -v a="$after" 'BEGIN { printf "[trim] target/: %.1f GB → %.1f GB\n", b / 1e9, a / 1e9 }'
