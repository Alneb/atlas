#!/usr/bin/env bash
# sync-openink.sh — openink's crates vendored from the Boox reverse-engineering repo into crates/vendor/ (# docs/memory/FROM-BOOX.md): openink-stroke (knote2's pens, libneo_pen's width formulas) and openink-shape (the shape
# recogniser: classifier + segmenter + fits, its trained weights in weights/). Copied as they are — src/ and, where
# there is one, weights/; only Cargo.toml is Atlas's (the upstream one inherits its workspace) — with the upstream
# commit kept in each VENDORED.md, so a copy never drifts unseen.
#
#   bash scripts/dev/sync-openink.sh           # copy from upstream, record its commit
#   bash scripts/dev/sync-openink.sh --check   # say whether each copy is upstream's (exit 1 when one differs)
#
# OPENINK_REPO: the upstream checkout (default: boox_5c_re beside this repo).
set -euo pipefail
root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
up="${OPENINK_REPO:-$root/../boox_5c_re}"
crates=(openink-stroke openink-nn openink-shape openink-pen) # openink-pen: the stylus read from evdev (DESIGN-boox-pen-openink.md) # openink-nn: the shape recogniser's inference (.oisw, dense, GRU)
status=0

for c in "${crates[@]}"; do
  from="$up/impl/crates/$c" dst="$root/crates/vendor/$c"
  [ -d "$from/src" ] || { echo "[openink] no upstream at $from (set OPENINK_REPO)"; exit 2; }
  parts=(src); [ -d "$from/weights" ] && parts+=(weights)
  commit="$(git -C "$up" log -1 --format=%H -- "impl/crates/$c")"
  dirty="$(git -C "$up" status --short -- "impl/crates/$c")"

  if [ "${1:-}" = "--check" ]; then
    same=1
    for p in "${parts[@]}"; do diff -r -q "$from/$p" "$dst/$p" >/dev/null 2>&1 || same=0; done
    if [ $same = 1 ]; then echo "[openink] $c: the vendored copy is upstream's ($commit)"
    else echo "[openink] $c: the vendored copy differs from upstream's (upstream at $commit):"
      for p in "${parts[@]}"; do diff -r -q "$from/$p" "$dst/$p" || true; done; status=1; fi
    continue
  fi

  [ -z "$dirty" ] || echo "[openink] note: upstream has uncommitted changes in $c; copying them as they are"
  mkdir -p "$dst"
  for p in "${parts[@]}"; do rm -rf "${dst:?}/$p"; cp -r "$from/$p" "$dst/$p"; done
  cat > "$dst/VENDORED.md" <<EOF
# $c, vendored

Of \`boox_5c_re\` (the openink Boox reverse-engineering repo; MIT): \`impl/crates/$c\` (${parts[*]}) at commit
\`$commit\`${dirty:+ (with uncommitted changes)}, copied by \`scripts/dev/sync-openink.sh\` on $(date +%F).
Do not edit it here: change it upstream (or ask its sessions, docs/memory/FROM-ATLAS.md in that repo) and sync.
Only \`Cargo.toml\` is Atlas's: the upstream one inherits its workspace's version, edition and license.
EOF
  echo "[openink] $c: copied ${parts[*]} ($(find "$dst/src" -name '*.rs' | wc -l) .rs files) at $commit"
done
exit $status
