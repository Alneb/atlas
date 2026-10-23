#!/usr/bin/env bash
# Rebuilds and reinstalls the desktop app in the background after a commit, so the installed Atlas
# is never older than master. Wired as .git/hooks/post-commit by `auto-install.sh enable`
# (`disable` removes it). One build at a time; a commit made meanwhile queues one more.
# Log: /tmp/atlas-gate/auto-install.log. A running Atlas window keeps its old build until restarted.
set -u
# started by a git hook, this inherits GIT_DIR / GIT_INDEX_FILE of the commit in progress: they would
# point the worktree commands below at the wrong index
unset $(git rev-parse --local-env-vars 2>/dev/null)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$ROOT/.git/hooks/post-commit"
LOG=/tmp/atlas-gate/auto-install.log
LOCK=/tmp/atlas-gate/auto-install.lock
AGAIN=/tmp/atlas-gate/auto-install.again
mkdir -p /tmp/atlas-gate

# Builds what was committed, from a copy of its own (a git worktree in /tmp): building in the working
# tree replaced ui/dist under running browser tests ("Failed to fetch dynamically imported module")
# and would install uncommitted edits. The copy shares node_modules and cargo's target directory.
SRC=/tmp/atlas-gate/auto-install-src
build_committed() {
  git -C "$ROOT" worktree remove --force "$SRC" 2>/dev/null; rm -rf "$SRC"; git -C "$ROOT" worktree prune
  git -C "$ROOT" worktree add --detach --force "$SRC" HEAD >/dev/null || return 1
  ln -s "$ROOT/ui/node_modules" "$SRC/ui/node_modules" || return 1
  ATLAS_REPO="$ROOT" CARGO_TARGET_DIR="$ROOT/target" bash "$SRC/packaging/install.sh" || return 1
  bash "$ROOT/scripts/dev/trim-target.sh" || true # this checkout's builds are a copy of their own in target/
}

case "${1:-run}" in
  enable)
    printf '#!/usr/bin/env bash\n# written by docs/scripts/auto-install.sh enable\nnohup bash "%s/docs/scripts/auto-install.sh" run >/dev/null 2>&1 &\n' "$ROOT" > "$HOOK"
    chmod +x "$HOOK"; echo "[auto-install] on: every commit reinstalls the desktop app (log: $LOG)";;
  disable)
    rm -f "$HOOK"; echo "[auto-install] off";;
  run)
    if ! mkdir "$LOCK" 2>/dev/null; then touch "$AGAIN"; exit 0; fi   # a build is running: ask it for one more
    trap 'rmdir "$LOCK" 2>/dev/null' EXIT
    while :; do
      rm -f "$AGAIN"
      echo "[auto-install] $(date '+%F %T') building $(git -C "$ROOT" rev-parse --short HEAD)" >> "$LOG"
      if build_committed >> "$LOG" 2>&1; then echo "[auto-install] $(date '+%F %T') installed" >> "$LOG"
      else echo "[auto-install] $(date '+%F %T') FAILED (see above)" >> "$LOG"; fi
      [ -e "$AGAIN" ] || break
    done;;
  *) echo "usage: auto-install.sh [enable|disable|run]"; exit 2;;
esac
