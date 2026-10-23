#!/usr/bin/env bash
# A scratch vault with every catalog plugin, served on :7799 by the dev build.
set -e
A="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)" # the repository
V=$PWD/vault
rm -rf "$V"; mkdir -p "$V/.atlas/plugins" "$V/notes"
for id in catalog catalog-web catalog-papers catalog-youtube catalog-tmdb catalog-letterboxd catalog-music catalog-books catalog-anime catalog-wikipedia; do
  [ -d "$A/plugins/beta/$id" ] || { echo "skip $id: not in this checkout"; continue; }
  mkdir -p "$V/.atlas/plugins/$id"
  cp -r "$A/plugins/beta/$id/"* "$V/.atlas/plugins/$id/"
  rm -rf "$V/.atlas/plugins/$id/__pycache__" "$V/.atlas/plugins/$id/engine"
done
sed -i "s|^run = .*|run = \"$A/target/debug/catalog\"|" "$V/.atlas/plugins/catalog/plugin.toml"
echo ok
