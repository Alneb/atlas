# Finance

Your money as a plain-text ledger in the vault. hledger-shaped, but stricter and richer:
- **Lots are booked:** fund and stock lots are booked FIFO or at average cost, and the engine computes the gains.
- **Assertions:** the bank's running balance is checked as an assertion on every row.
- **Import ids:** each movement carries an import id, so the same one is never imported twice.
- **Notes for accounts and funds:** accounts and funds are notes you can link.

Design: [DESIGN-finance](../../../docs/design/DESIGN-finance.md). The format: [DESIGN-finance-format](../../../docs/design/DESIGN-finance-format.md).

## What it does today (0.1.0)
- **Engine** (`engine/`, Rust, static):
  - parses `finance/journal/*.fin` and `finance/prices/*.fin`, and reads the account, fund and category notes;
  - books lots (`{fifo}`, `{avg}`, `{date}`, `{carry}` for a *traspaso*) and checks everything, with file:line for each finding.
- **Tools** (agents and the pane): `summary`, `register`, `review`, `check`, `export_hledger`, `migrate_paisa`.
- **Command line:** `finance check|balances <vault>`, `finance export-hledger <vault> <out>`, `finance migrate-paisa <main.ledger> <vault> [--write]`.
  - Without `--write` it is a dry run.
  - It never overwrites a file, except the migration report.

## The Paisa migration, measured on the user's ledger (2026-10-21)
- **Read:** 1131 Paisa transactions. **Written:** 1153, of which 419 are to review (`!`):
  - 403 were `Unknown` in Paisa;
  - the rest are gaps.
- **Assertions:** 1077, every one holding.
- **Gaps:** 22, where the bank's balance and Paisa's rows disagree. Each becomes a `!` transaction with the difference, listed in `finance/migration/paisa-report.md`.
- **Fund gains:** the FIFO gains for DVE, DVF and DVP equal Paisa's recorded gains (-39.72, -75.17, -48.25 EUR).
- **hledger agreement:** the hledger export passes `hledger check`, and its 33 balances equal the engine's to the cent (test `tests/hledger_oracle.rs`, which runs on this machine's real ledger when present).

## Build and test
```
bash plugins/beta/finance/engine/build.sh        # → bin/x86_64-linux/finance (static musl)
cargo test -p atlas-finance                       # unit tests + the hledger oracle (skipped without hledger)
```
