#!/usr/bin/env bash
# windows.sh — Atlas for Windows, built and run from Linux (docs/design/DESIGN-desktop-ports.md).
# Builds with cargo-xwin (the x86_64-pc-windows-msvc target, Microsoft's CRT and SDK fetched into local/xwin) and runs
# the programs under Wine in a prefix of the repo's own (local/wine), never ~/.wine. Every build goes through heavy.sh.
#   bash scripts/dev/windows.sh build [-p crate …]    default: the core, the CLI and the desktop app
#   bash scripts/dev/windows.sh test  [-p crate …]    the tests, run under Wine (default: the core)
#   bash scripts/dev/windows.sh run <program> [args…]  target/x86_64-pc-windows-msvc/debug/<program>.exe under Wine
#   bash scripts/dev/windows.sh wine <args…>            Wine itself, in the private prefix (installers, winecfg)
# Needs: cargo install cargo-xwin; wine. Using xwin means accepting Microsoft's CRT/SDK license (XWIN_ACCEPT_LICENSE).
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
target=x86_64-pc-windows-msvc
export XWIN_CACHE_DIR="$root/local/xwin" XWIN_ACCEPT_LICENSE=1
export WINEPREFIX="$root/local/wine" WINEDEBUG="${WINEDEBUG:--all}" WINEARCH=win64
# cargo test runs each test binary through Wine
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUNNER=wine
mkdir -p "$XWIN_CACHE_DIR"
unset ATLAS_UI_DIR # an Atlas terminal points it at the installed (Linux) UI

prefix() {
  [ -d "$WINEPREFIX/drive_c" ] && return
  echo "[windows] making the Wine prefix in local/wine (once)" >&2
  wineboot --init >/dev/null 2>&1 || { echo "[windows] wineboot failed" >&2; exit 1; }
}

cmd="${1:-}"; shift || true
case "$cmd" in
  build)
    [ $# -gt 0 ] || set -- -p atlas-core -p atlas -p atlas-app
    echo "[windows] cargo xwin build --target $target $*" >&2
    exec bash "$root/scripts/dev/heavy.sh" cargo xwin build --locked --target "$target" "$@"
    ;;
  test)
    prefix
    [ $# -gt 0 ] || set -- -p atlas-core
    echo "[windows] cargo xwin test --target $target $* (under Wine)" >&2
    exec bash "$root/scripts/dev/heavy.sh" cargo xwin test --locked --target "$target" "$@"
    ;;
  run)
    prefix
    [ $# -gt 0 ] || { echo "usage: windows.sh run <program> [args…]" >&2; exit 2; }
    exe="$root/target/$target/debug/$1.exe"; shift
    [ -f "$exe" ] || { echo "[windows] $exe is not built: windows.sh build first" >&2; exit 1; }
    echo "[windows] wine $exe $*" >&2
    exec wine "$exe" "$@"
    ;;
  wine)
    prefix
    exec wine "$@"
    ;;
  *)
    sed -n '2,9p' "$0" >&2
    exit 2
    ;;
esac
