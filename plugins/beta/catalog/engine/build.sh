#!/usr/bin/env bash
# Builds this plugin's engine into ../bin/<arch>-<os>/ (what plugin.toml runs) for this machine; every plugin's, for
# every platform, comes from the same script (docs/guides/PLUGIN-API.md, "Compiled helpers and release archives").
#   bash engine/build.sh [--target <arch>-<os>]
exec node "$(dirname "$0")/../../../../scripts/dev/plugin-pack.mjs" engines --only catalog "$@"
