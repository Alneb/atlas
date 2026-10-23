#!/usr/bin/env bash
# heavy.sh — runs a heavy command (cargo, the gate, an install) niced, in its own memory-capped systemd scope.
# Why: a full cargo build pushed the terminal's cgroup past systemd-oomd's pressure limit, and oomd killed the whole
# terminal tab — the Claude session inside it with it (2026-10-22, 4.7 GB). In a scope of its own, only the build
# can be killed. No MemoryHigh: it throttles a build to a crawl instead of failing it (tried). docs/guides/DEVELOPING.md, "Heavy jobs".
#   bash scripts/dev/heavy.sh cargo test --workspace
#   HEAVY_MAX=6G HEAVY_SWAP=3G   the caps (over them a rustc is killed: the build fails loudly);  CARGO_BUILD_JOBS (6) the parallel rustc's
set -uo pipefail
[ $# -gt 0 ] || { echo "usage: heavy.sh <command> [args…]" >&2; exit 2; }
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-6}"
# already inside a heavy scope (a gate calling an install), or no user systemd (a container): just nice it
if [ -n "${ATLAS_HEAVY:-}" ] || ! systemd-run --user --scope --quiet true 2>/dev/null; then
  exec nice -n 19 ionice -c3 "$@"
fi
export ATLAS_HEAVY=1
echo "[heavy] own scope: MemoryMax ${HEAVY_MAX:-6G} + swap ${HEAVY_SWAP:-3G}, ${CARGO_BUILD_JOBS} jobs — $1" >&2
exec systemd-run --user --scope --quiet --collect \
  -p MemoryMax="${HEAVY_MAX:-6G}" -p MemorySwapMax="${HEAVY_SWAP:-3G}" \
  nice -n 19 ionice -c3 "$@"
