#!/usr/bin/env bash
# Install Atlas for the current user: CLI + app binaries, desktop entries, icon, quick-capture script.
# Re-runnable; touches only ~/.cargo/bin, ~/.local/bin and ~/.local/share/{applications,icons} — and, in
# KDE Plasma, gives Atlas Capture a global key when it has none (kde-shortcut.sh: never replaces one).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); root=$(dirname "$here")
# release builds in a memory-capped scope of their own: systemd-oomd kills a build, never the terminal (heavy.sh)
[ -z "${ATLAS_HEAVY:-}" ] && exec bash "$root/scripts/dev/heavy.sh" bash "$here/install.sh" "$@"
echo "[install] building UI";            npm --prefix "$root/ui" run build >/dev/null
# The UI also as files (~/.local/share/atlas/ui): the desktop app serves it from there, and an open
# window reloads into a new one on its own — no restart for interface changes (ui_files.rs).
echo "[install] installing the UI";      ui_dest="${XDG_DATA_HOME:-$HOME/.local/share}/atlas/ui"
mkdir -p "$ui_dest.new" && cp -r "$root/ui/dist/." "$ui_dest.new/" && rm -rf "$ui_dest" && mv "$ui_dest.new" "$ui_dest"
bin="${CARGO_HOME:-$HOME/.cargo}/bin" # where cargo install puts the binaries
echo "[install] installing atlas CLI";   cargo install --quiet --locked --path "$root/crates/atlas"
echo "[install] installing atlas-app";   cargo install --quiet --locked --path "$root/crates/atlas-app"
echo "[install] installing atlas-capture"; cargo install --quiet --locked --path "$root/crates/atlas-capture"
install -Dm755 "$here/atlas-quick-capture" "$HOME/.local/bin/atlas-quick-capture"
# The desktop entry starts the installed binary by its full path (a launcher's PATH may lack
# ~/.cargo/bin). An entry that already starts Atlas on a chosen folder keeps its command: that line
# is the user's.
desk="$HOME/.local/share/applications/atlas.desktop"
exec_line="Exec=$bin/atlas-app"
if [ -f "$desk" ]; then
  old=$(grep -m1 '^Exec=' "$desk" || true)
  case "$old" in *atlas-app\ ?*) exec_line="$old"; echo "[install] keeping the desktop entry's command: ${old#Exec=}";; esac
fi
tmp=$(mktemp); sed "s|^Exec=.*|$exec_line|" "$here/atlas.desktop" > "$tmp"
install -Dm644 "$tmp" "$desk"; rm -f "$tmp"
# Same for the capture entry: ~/.local/bin is not on a KDE session's PATH, so a bare name never starts.
tmp=$(mktemp); sed "s|^Exec=.*|Exec=$HOME/.local/bin/atlas-quick-capture|" "$here/atlas-capture.desktop" > "$tmp"
install -Dm644 "$tmp" "$HOME/.local/share/applications/atlas-capture.desktop"; rm -f "$tmp"
# KWin lets a program take window pictures (ScreenShot2) when a desktop file with that program's path in Exec= says so:
# the capture box's picture of the window you were on (docs/guides/CAPTURE.md). Hidden from the menu.
tmp=$(mktemp); sed "s|^Exec=.*|Exec=$bin/atlas-capture|" "$here/atlas-capture-box.desktop" > "$tmp"
install -Dm644 "$tmp" "$HOME/.local/share/applications/atlas-capture-box.desktop"; rm -f "$tmp"
# the icon at every size KDE asks for (launcher, task bar, Alt+Tab), plus the master for any other scale
icons="$HOME/.local/share/icons/hicolor"
for s in 32x32 64x64 128x128; do install -Dm644 "$root/crates/atlas-app/icons/$s.png" "$icons/$s/apps/atlas.png"; done
install -Dm644 "$root/crates/atlas-app/icons/128x128@2x.png" "$icons/256x256/apps/atlas.png"
install -Dm644 "$root/crates/atlas-app/icons/icon.png" "$icons/512x512/apps/atlas.png"
install -Dm644 "$root/packaging/icon/atlas.svg" "$icons/scalable/apps/atlas.svg"
gtk-update-icon-cache -q -t "$icons" 2>/dev/null || true
# "Atlas (dev)": the UI from this repository's Vite dev server — edits to the UI show at once, no rebuild.
# ATLAS_REPO: auto-install.sh builds from a temporary copy and names the real repository here.
repo="${ATLAS_REPO:-$root}"
sed -e "s|^Exec=.*|Exec=env ATLAS_DEV=1 ATLAS_REPO=$repo $bin/atlas-app|" -e "s|^Name=.*|Name=Atlas (dev)|" \
  -e "s|^Comment=.*|Comment=Atlas with the UI live from $repo/ui (hot reload)|" "$here/atlas.desktop" > "$HOME/.local/share/applications/atlas-dev.desktop"
# hidden from the menu: Plasma shows one of two entries starting the same program, and it showed the dev one
#; start it with `gtk-launch atlas-dev`
# and without the window class: the taskbar named the normal window after whichever entry claimed it
sed -i '/^StartupWMClass=/d' "$HOME/.local/share/applications/atlas-dev.desktop"
echo "NoDisplay=true" >> "$HOME/.local/share/applications/atlas-dev.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" || true
# the global key for the capture box (KDE): a key already chosen is kept; ATLAS_CAPTURE_KEY=none skips it
bash "$here/kde-shortcut.sh" || echo "[install] shortcut: not set (bind a key to 'Atlas Capture' in System Settings → Shortcuts)"
echo "[install] done"
