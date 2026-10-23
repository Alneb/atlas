# openink-pen, vendored

Of `boox_5c_re` (a Boox reverse-engineering project; MIT): `impl/crates/openink-pen` (src) at commit
`fdc291e246ed8cfb23e73fe082940f096dd27f02`, copied by `scripts/dev/sync-openink.sh` on 2026-10-20.
Do not edit it here: change it upstream and sync.
Only `Cargo.toml` is Atlas's: the upstream one inherits its workspace's version, edition and license.

Note (2026-10-20): Atlas's clippy gate flags upstream's `len % 4 != 0` (`manual_is_multiple_of`); upstream keeps it for older compilers, so `Cargo.toml` allows that lint instead of the source being edited.
