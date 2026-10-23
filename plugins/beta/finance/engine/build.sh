#!/usr/bin/env bash
# Builds the finance helper into ../bin/<arch>-<os>/finance (what plugin.toml runs). Static on Linux (musl) when that
# target is installed, so the same file runs on the desktop and in the server's container (where Enable Banking syncs).
#   bash plugins/beta/finance/engine/build.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
arch="$(uname -m)"; os="linux"
out="$here/../bin/$arch-$os"; mkdir -p "$out"
target="$arch-unknown-linux-musl"
target_dir="$(cargo metadata --format-version 1 --no-deps --manifest-path "$here/Cargo.toml" | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')"
if rustup target list --installed 2>/dev/null | grep -qx "$target"; then
  echo "finance: building static ($target)"
  cargo build --release -p atlas-finance --target "$target" --manifest-path "$here/Cargo.toml"
  bin="$target_dir/$target/release/finance"
else
  echo "finance: $target not installed (rustup target add $target); building for this machine only"
  cargo build --release -p atlas-finance --manifest-path "$here/Cargo.toml"
  bin="$target_dir/release/finance"
fi
install -m 755 "$bin" "$out/finance"
echo "finance: $out/finance ($(du -h "$out/finance" | cut -f1))"
