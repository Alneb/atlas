#!/usr/bin/env bash
# PDFium for the core (PDF covers) and the phone's PDF reader (docs/design/DESIGN-pdfium-android.md): pdfium-binaries' prebuilt libpdfium.so for
# the APK (android-arm64; android-x64 for the emulator's x86_64 APK) and the same build for the host tests
# (linux-x64), into local/pdfium/ (never committed).
# Pinned release and checksums; a download that does not match is refused. Re-runnable: a folder already there stays.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
release=8086
declare -A sums=(
  [android-arm64]=f6ea29495d64795b9af61e41768030795b45f82a21415498ee4ab2c61e135756
  [android-x64]=772870e7ed846097d779aa0163f8abfd08a13257e16edf0e1cd1a364f11c8c3c
  [linux-x64]=588577cf52dabc1a444988bac841920df54cc2f141801424de97ab04f4fbb935
)
# the ABIs asked (all by default): `fetch-pdfium.sh linux-x64` for the desktop install alone
for abi in ${@:-android-arm64 android-x64 linux-x64}; do
  dir="$root/local/pdfium/$release-$abi"
  if [ -f "$dir/lib/libpdfium.so" ]; then echo "[pdfium] $abi: already in local/pdfium"; continue; fi
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  echo "[pdfium] $abi: downloading chromium/$release"
  curl -fsSL -o "$tmp/p.tgz" "https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/$release/pdfium-$abi.tgz"
  got=$(sha256sum "$tmp/p.tgz" | cut -d' ' -f1)
  if [ "$got" != "${sums[$abi]}" ]; then echo "[pdfium] $abi: checksum $got is not the pinned one — refused" >&2; exit 1; fi
  mkdir -p "$dir" && tar -xzf "$tmp/p.tgz" -C "$dir"
  echo "[pdfium] $abi: $(du -h "$dir/lib/libpdfium.so" | cut -f1) in local/pdfium/$release-$abi"
done
