#!/usr/bin/env bash
# The working tree stays clean of stray output (AGENTS.md, "Keep the tree clean"): a file that git neither tracks nor
# ignores at the repo root is almost always a probe's screenshot, a build output or an agent's note left behind.
# Scratch output belongs in target/ (ignored) or the system's temp folder. Exit 1 when the root has such a file.
set -u
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root" || exit 2
# only the root: new files inside the tree are ordinary work in progress
stray="$(git ls-files --others --exclude-standard --directory -- . | grep -E '^[^/]+/?$')"
if [ -n "$stray" ]; then
  echo "[tidy] untracked files at the repo root (move them to target/, delete them, or commit them where they belong):"
  printf '%s\n' "$stray" | sed 's/^/    /'
  echo "[tidy] findings: $(printf '%s\n' "$stray" | wc -l)"
  exit 1
fi
echo "[tidy] findings: 0"
# and no generated type outlives its Rust type (ts-rs never removes one)
node scripts/dev/check-gen.mjs || exit 1
# and no literal colour in a component's style (UI-STYLE.md §1)
node scripts/dev/check-styles.mjs || exit 1
