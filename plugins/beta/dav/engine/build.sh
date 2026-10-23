#!/usr/bin/env bash
# Builds the Calendar (DAV) helper into ../bin/<arch>-<os>/dav (what plugin.toml runs). Static on Linux (musl) when that target is
# installed, so the same file runs on the desktop and in the server's container; else a normal build. Its own
# workspace (Cargo.toml): the build and lock file stay out of Atlas's.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
arch="$(uname -m)"; os="linux"
out="$here/../bin/$arch-$os"; mkdir -p "$out"
target="$arch-unknown-linux-musl"
jobs="${CARGO_BUILD_JOBS:-4}"   # keeps a desktop responsive while it builds
if rustup target list --installed 2>/dev/null | grep -qx "$target"; then
  echo "dav: building static ($target)"
  # SQLite (the cache) and ring (rustls' crypto) are C: a musl C compiler builds them (Fedora: dnf install musl-gcc);
  # without one the host's gcc does ring, but SQLite then needs musl's headers and fails loudly
  cc_var="CC_${target//-/_}"
  if [ -z "${!cc_var:-}" ]; then
    for c in "$arch-linux-musl-gcc" musl-gcc gcc; do command -v "$c" >/dev/null && { export "$cc_var"="$c"; break; }; done
  fi
  echo "dav: C compiler for $target: ${!cc_var}"
  nice -n 10 cargo build --release -j "$jobs" --target "$target" --manifest-path "$here/Cargo.toml"
  bin="$here/target/$target/release/dav"
else
  echo "dav: $target not installed (rustup target add $target); building for this machine only"
  nice -n 10 cargo build --release -j "$jobs" --manifest-path "$here/Cargo.toml"
  bin="$here/target/release/dav"
fi
install -m 755 "$bin" "$out/dav"
echo "dav: $out/dav ($(du -h "$out/dav" | cut -f1))"
