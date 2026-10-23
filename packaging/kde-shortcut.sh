#!/usr/bin/env bash
# The global key for Atlas Capture in KDE Plasma 6 (docs/guides/CAPTURE.md, "Setting it up"); install.sh runs it.
# It never replaces a key the user chose: a key already bound to Atlas Capture is kept, and a key any
# other shortcut uses (or has as its default) is not taken.
#   ATLAS_CAPTURE_KEY=Meta+Space   another key (default Meta+Shift+C)
#   ATLAS_CAPTURE_KEY=none         leave the shortcuts alone
#   ATLAS_KDE_DRY=1                say what it would do, change nothing
set -euo pipefail
key=${ATLAS_CAPTURE_KEY:-Meta+Shift+C}
file=kglobalshortcutsrc # in $XDG_CONFIG_HOME (~/.config), where System Settings keeps the shortcuts
entry=atlas-capture.desktop
say() { echo "[install] shortcut: $*"; }

[ "$key" = none ] && { say "left alone (ATLAS_CAPTURE_KEY=none)"; exit 0; }
if ! command -v kwriteconfig6 >/dev/null || ! command -v kreadconfig6 >/dev/null; then
  say "not KDE Plasma 6 — bind a key to 'Atlas Capture' in the desktop's shortcut settings"; exit 0
fi
current=$(kreadconfig6 --file "$file" --group services --group "$entry" --key _launch || true)
if [ -n "$current" ] && [ "$current" != none ]; then
  say "kept: Atlas Capture is on $current"; exit 0
fi
# every key named anywhere in the file (a value is "keys,default keys,name"; several keys are separated
# by a tab, which the file spells \t)
path="${XDG_CONFIG_HOME:-$HOME/.config}/$file"
if [ -f "$path" ] && grep -E '^[^[#][^=]*=' "$path" | cut -d= -f2- | sed 's/\\t/,/g' | tr ',\t' '\n\n' | grep -qixF -- "$key"; then
  say "$key is used by another shortcut, so none was set — pick a free one: ATLAS_CAPTURE_KEY=<key> bash packaging/kde-shortcut.sh"
  exit 0
fi
if [ -n "${ATLAS_KDE_DRY:-}" ]; then say "would put Atlas Capture on $key (dry run)"; exit 0; fi
kwriteconfig6 --file "$file" --group services --group "$entry" --key _k_friendly_name "Atlas Capture"
kwriteconfig6 --file "$file" --group services --group "$entry" --key _launch "$key"
say "Atlas Capture on $key — from the next login, or at once with: systemctl --user restart plasma-kglobalaccel.service"
