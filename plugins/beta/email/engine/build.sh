#!/usr/bin/env bash
# Builds the email helper into ../bin/<arch>-<os>/email (what plugin.toml runs).
# Static on Linux (musl) when it can be, so the same file runs on the desktop and in the server's container. Unlike the
# finance engine this one has C inside (SQLite, the TLS library's ring), so musl needs a musl C compiler:
#   - musl-gcc (Fedora: dnf install musl-gcc) or x86_64-linux-musl-gcc on PATH → built here;
#   - else, with ATLAS_EMAIL_CONTAINER=1 and podman: built in an Alpine Rust container (no install on the machine);
#   - else a build for this machine only (glibc; fine for the desktop, not for an older server).
#   bash plugins/beta/email/engine/build.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"
arch="$(uname -m)"; os="linux"
out="$here/../bin/$arch-$os"; mkdir -p "$out"
target="$arch-unknown-linux-musl"
target_dir="$(cargo metadata --format-version 1 --no-deps --manifest-path "$here/Cargo.toml" | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')"
cc=""
for c in "$arch-linux-musl-gcc" musl-gcc; do command -v "$c" >/dev/null && { cc="$c"; break; }; done
if [ -n "$cc" ] && rustup target list --installed 2>/dev/null | grep -qx "$target"; then
  echo "email: building static ($target, CC=$cc)"
  env "CC_${target//-/_}=$cc" cargo build --release -p atlas-email --bin email --target "$target" --manifest-path "$here/Cargo.toml"
  bin="$target_dir/$target/release/email"
elif [ "${ATLAS_EMAIL_CONTAINER:-}" = 1 ] && command -v podman >/dev/null; then
  echo "email: building static in an Alpine Rust container (podman)"
  podman run --rm -v "$repo:/src:Z" -v atlas-email-cargo:/usr/local/cargo/registry -w /src docker.io/library/rust:1-alpine \
    sh -c "apk add --no-cache musl-dev >/dev/null && cargo build --release -p atlas-email --bin email --target-dir /src/target/alpine"
  bin="$repo/target/alpine/release/email"
else
  echo "email: no musl C compiler (musl-gcc) here; building for this machine only (ATLAS_EMAIL_CONTAINER=1 builds a static one with podman)"
  cargo build --release -p atlas-email --bin email --manifest-path "$here/Cargo.toml"
  bin="$target_dir/release/email"
fi
install -m 755 "$bin" "$out/email"
strip "$out/email" 2>/dev/null || true
echo "email: $out/email ($(du -h "$out/email" | cut -f1)) — $(file -b "$out/email" | cut -d, -f1-2)"
