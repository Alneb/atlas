# Finance

Your money as a plain-text ledger in the vault: transactions in `finance/journal/*.fin`, an hledger-shaped format that
is stricter and richer, and accounts, funds and categories as notes you can link. A Rust engine reads it, books
investment lots, checks it against the bank's own balances, and draws a pane with your accounts, budget,
investments and net worth. Statements and bank feeds come in without duplicates; money typed into a capture becomes a
transaction to review.

## The format, in short

- **Lots are booked**: fund and stock lots FIFO or at average cost (`{fifo}`, `{avg}`, `{date}`, `{carry}` for a
  transfer between funds that keeps the cost), and the engine computes the gains.
- **Assertions**: the bank's running balance is checked on every row that carries it.
- **Import ids**: each imported movement carries one, so the same one is never imported twice.
- **Notes for accounts, funds and categories**: their properties (a fund's ticker, a category's target, a price
  source) are read by the engine.
- Prices live in `finance/prices/*.fin`, written sparse.

## What it adds

- **The Finance pane** (a left-bar tile, the command "Finance"): Overview, Accounts, Review (transactions marked `!`
  waiting to be accepted), Budget (this month per category against its usual month or a pinned target, the savings
  rate, recurring payments with their next date), Investments (holdings in lots with cost, value and gain, realised
  gains per year, the money-weighted return, currency effects), net worth over time in any unit, and Sources (banks and
  statement imports).
- **Blocks**: `finance.balance`, `finance.spending`, `finance.register`.
- **Commands**: "Finance", "Finance: review".
- **A capture hook**: a capture that reads as money ("12,40 café con Ana revolut ayer", "+1500 salary") becomes a
  transaction to review in this year's journal; anything else is left alone. Spanish, English and French words.
- **Statement imports**: presets in `importers/` (CSV, OFX-like, PDF and Norma 43 shapes); "Fetch from the bank's site"
  moves recognised files from your downloads folder into the statements inbox; duplicates, transfers between your own
  accounts and balances are handled as for any statement.
- **Bank feeds through Enable Banking**: connect a bank (its consent page), then `bank_sync` reads new transactions on
  the server at most four times a day; other devices get them through the vault's mirror.
- **Prices**: FX from the ECB and fund and asset prices (Yahoo, FT, or a note's own `price_source`).
- **Tools** (agents and the pane): `summary`, `register`, `review`, `check`, `budget`, `invest`, `wealth`, `prices`,
  `set_target`, `parse`, `add`, `capture`, `bank_list`, `bank_connect`, `bank_finish`, `bank_sync`, `downloads`,
  `export_hledger`, `migrate_paisa`.
- **Command line**: `finance check|balances <vault>`, `finance export-hledger <vault> <out>`,
  `finance migrate-paisa <main.ledger> <vault> [--write]` (a dry run without `--write`; it never overwrites a file
  except its own report).

## Settings

- **Folder** (`finance`): where the journal, the notes and the statements live.
- **Display currency** (EUR, CAD or USD): totals and net worth in this currency, others converted at the day's price.
- **Money from captures** (on).
- **Capture account** (`Assets:Cash`): where a captured payment comes from when its words name no account.
- **Enable Banking application**: the application id from Enable Banking's control panel (its private key is entered
  in the pane's Sources, kept as a secret).
- **Bank redirect address**: the redirect URL registered with that application (the server's https address).
- **Downloads folder** (`~/Downloads`): where your browser saves files.
- **Measure wealth in** (`EUR, CAD, USD, XAU, BTC`): the units net worth can be shown in — ECB currencies, or assets
  such as XAU, XAG, BTC, ETH, SPX, or any commodity whose note has a ticker.
- **Baseline** (6): how many months before this one a category's usual month is taken from (the median when it is
  spent most months, the mean when only in some).

## How it fits

No requirements. It reads captures (`on = "capture"`), and its bank sync is meant to run where the vault is served.

## Needs

The helper is built by `bash engine/build.sh` into `bin/<arch>-<os>/finance` (static); the pane by
`node scripts/dev/plugin-ui.mjs plugins/beta/finance`. hledger is needed only to run the export's comparison test.

## Platforms

Linux works; the others are untested.

## Status

Beta. `cargo test -p atlas-finance` covers the engine (parsing, booking, checks, imports, the hledger export compared
balance by balance when hledger is installed). Missing for stable: an end-to-end spec, journal and archive writes
through Atlas's API (they are written to disk directly), currency defaults that do not assume a country, and a 1.0
version.
