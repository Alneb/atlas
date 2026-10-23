#!/usr/bin/env bash
# Builds the catalog helper into ../bin/<arch>-<os>/catalog (what plugin.toml runs). Static on Linux (musl) when that
# target is installed, so the same file runs on the desktop and in the server's container; else a normal build.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
arch="$(uname -m)"; os="linux"
out="$here/../bin/$arch-$os"; mkdir -p "$out"
target="$arch-unknown-linux-musl"
if rustup target list --installed 2>/dev/null | grep -qx "$target"; then
  echo "catalog: building static ($target)"
  cargo build --release -p atlas-catalog --target "$target" --manifest-path "$here/Cargo.toml"
  bin="$(cargo metadata --format-version 1 --manifest-path "$here/Cargo.toml" | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')/$target/release/catalog"
else
  echo "catalog: $target not installed (rustup target add $target); building for this machine only"
  cargo build --release -p atlas-catalog --manifest-path "$here/Cargo.toml"
  bin="$(cargo metadata --format-version 1 --manifest-path "$here/Cargo.toml" | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')/release/catalog"
fi
install -m 755 "$bin" "$out/catalog"
echo "catalog: $out/catalog ($(du -h "$out/catalog" | cut -f1))"
