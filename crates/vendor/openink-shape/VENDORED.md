# openink-shape, vendored

Of `boox_5c_re` (a Boox reverse-engineering project; MIT): `impl/crates/openink-shape` (src weights) at commit
`9ee1cdc6d63d9ac1feb7eab7a399da0499578e4b`, copied by `scripts/dev/sync-openink.sh` on 2026-10-20.
Do not edit it here: change it upstream and sync.
Only `Cargo.toml` is Atlas's: the upstream one inherits its workspace's version, edition and license.

Note (2026-10-20): `src/geom.rs` is kept at its previous upstream form (`is_none_or`): upstream's later `map_or(true, …)` (for older compilers) fails Atlas's clippy gate (`unnecessary_map_or`).
