#!/usr/bin/env bash
# py-tests.sh — every Python test in the repo: the vault scripts' and plugin helpers' suite (scripts/vault/tests)
# and each plugin's own test_*.py, run from its folder as the plugin runs. The gate's `py` stage.
# Prints "[py] <suite>: Ran N tests … OK|FAILED" per suite and exits with the number of failed suites, so a suite
# that stops loading (a moved file: every test an import error) fails loudly instead of quietly running nothing.
set -uo pipefail
root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
export PYTHONDONTWRITEBYTECODE=1 ATLAS_NO_BROWSER=1
failed=0

suite() { # name, folder, unittest arguments…
  local name="$1" dir="$2"; shift 2
  local out code
  out="$(cd "$dir" && python3 -m unittest "$@" 2>&1)"; code=$?
  echo "$out" | grep -E '^(ERROR|FAIL):' | sed "s|^|[py] $name: |"
  echo "[py] $name: $(echo "$out" | grep -E '^Ran [0-9]+ tests?' | tail -1) $(echo "$out" | tail -1)"
  [ $code -eq 0 ] || failed=$((failed + 1))
}

# the SSH plugin's tests drive its helper binary: build it first (a fresh clone has none yet)
(cd "$root" && cargo build --quiet -p atlas-ssh) || echo "[py] could not build atlas-ssh: the SSH tests will fail"
suite scripts/vault "$root/scripts/vault" discover -s tests
suite sdk/python "$root/crates/atlas-core/sdk/python" test_atlas_plugin
for f in "$root"/plugins/*/*/test_*.py; do
  suite "${f#"$root"/}" "$(dirname "$f")" "$(basename "$f" .py)"
done
echo "[py] failed suites: $failed"
exit $failed
