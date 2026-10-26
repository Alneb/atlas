#!/usr/bin/env bash
# gate.sh — every check a change must pass, one stage at a time, each with its own log and verdict.
#
#   bash scripts/dev/gate.sh            # all stages
#   bash scripts/dev/gate.sh rust ui    # only some: sync | scan | tidy | rust | clippy | py | ui | build | e2e
#   bash scripts/dev/gate.sh audit      # Obsidian fidelity: every note of a COPY of $ATLAS_VAULT rendered and
#                                        # checked (minutes; run after editor / markdown / embed changes)
#
# The verdict is the printed PASS/FAIL table (and this script's exit status, which is the
# number of failed stages) — never a status that went through a pipe. Counts are printed so a
# suite that silently ran 3 tests instead of 200 is visible.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# in a memory-capped scope of its own: systemd-oomd then kills a build, never the terminal running it (heavy.sh)
[ -z "${ATLAS_HEAVY:-}" ] && exec bash "$here/heavy.sh" bash "$here/gate.sh" "$@"
root="$(git -C "$here" rev-parse --show-toplevel)"
logs="${TMPDIR:-/tmp}/atlas-gate"
mkdir -p "$logs"
cd "$root"
# machine-local settings: a real vault for the tests and audits that use one (ATLAS_TEST_VAULT, ATLAS_TEST_PAPERS,
# ATLAS_VAULT…; docs/guides/DEVELOPING.md). Without the file those tests use fixtures or skip, and say so.
[ -f "$root/scripts/dev/local.env" ] && { set -a; . "$root/scripts/dev/local.env"; set +a; echo "[gate] local settings: scripts/dev/local.env"; }

stages=("$@")
[ ${#stages[@]} -eq 0 ] && stages=(scan tidy rust clippy py ui build e2e)
# a checkout with the publishing tools (the private one) also checks it is in step with `public`
[ $# -eq 0 ] && [ -f publish/sync.mjs ] && stages=(sync "${stages[@]}")
failed=0
summary=()

# CI shows a failed stage's whole log (ci-annotate.mjs reads it for annotations); a terminal, its tail
show_failed() { if [ -n "${GITHUB_ACTIONS:-}" ]; then cat "$1"; else tail -25 "$1"; fi; }

run() { # name, what it checks, command…
  local name="$1" why="$2"; shift 2
  echo "[gate] $name — $why (log: $logs/$name.log)"
  "$@" > "$logs/$name.log" 2>&1
  local code=$?
  local note=""
  case "$name" in
    rust) note="$(grep -E '^test result:' "$logs/$name.log" | awk '{p+=$4; f+=$6} END {printf "%d passed, %d failed", p, f}')" ;;
    e2e)  note="$(sed -n '/^\[e2e\] [0-9]* s for/,$p' "$logs/$name.log" | grep -E '^\s+[0-9]+ (passed|failed|skipped|flaky)' | tr -s ' \n' ' ')" ;;
    ui)   note="$(grep -E 'COMPLETED' "$logs/$name.log" | sed 's/^[0-9]* //' | tail -1)" ;;
    audit) note="$(grep -m1 -i -E 'finding' ui/audit-report/REPORT.md 2>/dev/null)" ;;
    scan) note="$(grep -E '^\[scan\] findings' "$logs/$name.log" | sed 's/^\[scan\] //')" ;;
    sync) note="$(grep -E '^\[sync\] (DIVERGED|behind|in step)' "$logs/$name.log" | sed 's/^\[sync\] //' | cut -c1-90 | tr '\n' ' ')" ;;
    tidy) note="$(grep -E '^\[tidy\] findings' "$logs/$name.log" | sed 's/^\[tidy\] //')" ;;
    build) note="$(grep -E '^\[bundle\]' "$logs/$name.log" | tail -1 | sed 's/^\[bundle\] //')" ;;
    py)   note="$(grep -E '^\[py\] .*: Ran' "$logs/$name.log" | grep -oE 'Ran [0-9]+' | awk '{n+=$2} END {printf "%d tests", n}'), $(grep -E '^\[py\] failed' "$logs/$name.log" | sed 's/^\[py\] //')" ;;
  esac
  if [ $code -eq 0 ]; then summary+=("PASS  $name  $note"); else summary+=("FAIL  $name  $note  (exit $code)"); failed=$((failed + 1)); show_failed "$logs/$name.log"; fi
}

for s in "${stages[@]}"; do
  case "$s" in
    rust)   run rust   "core and CLI tests"            cargo test --workspace ;;
    clippy) run clippy "lints as errors"               cargo clippy --workspace --all-targets -- -D warnings ;;
    py)     run py     "Python tests: vault scripts and plugin helpers" bash scripts/dev/py-tests.sh ;;
    ui)     run ui     "Svelte + TypeScript types (the app, and each plugin's ui/ with its build current)" sh -c "npm --prefix ui run check && node scripts/dev/plugin-ui.mjs --check" ;;
    build)  run build  "production UI bundle, every chunk parsed" sh -c "npm --prefix ui run build && node scripts/dev/check-bundle.mjs" ;;
    e2e)    run e2e    "Playwright in parallel shards, each on its own throwaway workspace (needs the build stage)" node scripts/dev/e2e-shards.mjs ;;
    audit)  run audit  "markdown render audit on a copy of the real notes (needs the build stage)" npm --prefix ui run audit:md ;;
    scan)   run scan   "secrets and personal paths in the tracked code" bash scripts/dev/scan-personal.sh ;;
    sync)   run sync   "master and public in step (publish/sync.mjs)" node publish/sync.mjs ;;
    tidy)   run tidy   "no stray files at the repo root (AGENTS.md)" bash scripts/dev/check-tidy.sh ;;
    *) echo "[gate] unknown stage: $s"; failed=$((failed + 1)) ;;
  esac
done

echo
echo "[gate] ===== verdict ====="
printf '%s\n' "${summary[@]}"
echo "[gate] failed stages: $failed"
# cargo never deletes old builds (target/ reached 76 GB): the ones no longer used go, after every run
bash "$here/trim-target.sh" || true
exit $failed
