#!/usr/bin/env bash
# Builds and installs the Flatpak on this machine (CI does the same from its own Ubuntu binaries: packages.yml).
# The binaries are compiled inside the GNOME SDK, not on the host: a newer host glibc than the runtime's would make
# them unable to start in the sandbox. Needs org.gnome.Sdk//50 and org.freedesktop.Sdk.Extension.rust-stable//25.08
# (`flatpak --user install flathub <ref>`), and the UI built (`npm --prefix ui run build`).
#
#   bash packaging/flatpak/build-local.sh        → installs io.github.alneb.Atlas for this user
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
[ -f ui/dist/index.html ] || { echo "[flatpak] ui/dist is missing: npm --prefix ui run build" >&2; exit 1; }

echo "[flatpak] compiling atlas and atlas-app inside the GNOME 50 SDK (target/flatpak-sdk)"
flatpak run --devel --share=network --filesystem="$root" --filesystem="$HOME/.cargo" --command=bash org.gnome.Sdk//50 -c "
  export PATH=/usr/lib/sdk/rust-stable/bin:\$PATH CARGO_HOME=$HOME/.cargo CARGO_TARGET_DIR=$root/target/flatpak-sdk
  cd '$root' && nice -n 10 cargo build --release --locked -j \${ATLAS_JOBS:-4} -p atlas -p atlas-app --features tauri/custom-protocol"

echo "[flatpak] copying the stripped binaries to dist/, where the manifest takes them"
mkdir -p dist
cp target/flatpak-sdk/release/atlas target/flatpak-sdk/release/atlas-app dist/
strip dist/atlas dist/atlas-app

echo "[flatpak] building and installing io.github.alneb.Atlas"
flatpak-builder --user --install --force-clean --state-dir=target/flatpak-state target/flatpak-build \
  packaging/flatpak/io.github.alneb.Atlas.yml
echo "[flatpak] done: flatpak run io.github.alneb.Atlas"
