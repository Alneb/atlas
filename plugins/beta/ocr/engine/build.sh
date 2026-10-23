#!/usr/bin/env bash
# Builds the OCR helper into ../bin/<arch>-<os>/ocr (what plugin.toml runs). Tesseract and Leptonica are C++ compiled
# into it (kreuzberg-tesseract), so a musl build is out; instead it is built in a Debian bookworm container — the server
# image's base, with the oldest glibc of the machines it runs on — so the same file runs on the desktop (newer glibc) and
# in the server's container. libstdc++ stays a shared library (the crate links it so); every Debian and Fedora has it (apt
# itself needs it). Without podman: a build for this machine only.
#   bash plugins/beta/ocr/engine/build.sh [--local]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"
arch="$(uname -m)"; os="linux"
out="$here/../bin/$arch-$os"; mkdir -p "$out"

if [ "${1:-}" != "--local" ] && command -v podman >/dev/null; then
  echo "ocr: building in rust:1-bookworm (glibc of the server; Tesseract compiled once, then cached in target/ocr-bookworm)"
  podman run --rm -v "$repo:/src:Z" -w /src -e CARGO_TARGET_DIR=/src/target/ocr-bookworm \
    -v atlas-ocr-cargo:/usr/local/cargo/registry docker.io/library/rust:1-bookworm sh -c '
      set -e
      command -v cmake >/dev/null || (apt-get update -qq && apt-get install -y -qq cmake >/dev/null)
      cargo build --release --locked -p atlas-ocr'
  bin="$repo/target/ocr-bookworm/release/ocr"
else
  echo "ocr: building for this machine only (it may not run on an older system, such as the server)"
  cargo build --release --locked -p atlas-ocr --manifest-path "$here/Cargo.toml"
  bin="$(cargo metadata --format-version 1 --manifest-path "$here/Cargo.toml" | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')/release/ocr"
fi
install -m 755 "$bin" "$out/ocr"
echo "ocr: $out/ocr ($(du -h "$out/ocr" | cut -f1)); needs glibc $(objdump -T "$out/ocr" | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1)"
