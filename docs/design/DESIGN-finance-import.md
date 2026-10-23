# Finance — statement import (presets, duplicates, transfers, archives)

How the finance plugin turns any bank's export into journal transactions ([DESIGN-finance](DESIGN-finance.md), Phase 3; the journal format is [DESIGN-finance-format](DESIGN-finance-format.md)). The code is `plugins/beta/finance/engine/src/statement/`; the presets are `plugins/beta/finance/importers/*.toml`.

## What the user asked (2026-10-21)

- *"the importer should not be hardcoded … it should be a template and the importer follows it … or a spec"*; *"the bank format does not need to be necessarily a markdown … its an importer you can do better than markdown"*; *"do a powerful preset system so that you can import anything"*.
- *"this system should detect duplicates automatically … and in a flexible way … sometimes the documents the dates will overlap … and you need to correlate between accounts as well when i move money from an account to another"*.
- *"the ingested files i want you to save in a tar.gz with the originals in the vault … the archiving should be automatic and incremental … they should be organized and renamed based on account bank and dates"*.
- *"you need to reconstruct the whole thing from all these documents and the two previous ledgers from paisa and actual"*; *"you need to import the files in .paisa as well they have some older transactions"*.
- *"what if poppler is not installed"*, *"can you use some rust package for what poppler does?"* (see "PDF text" below).

## The shape

```
file bytes ──detect──► preset ──extract──► fields (bank's text) ──map──► Statement { rows: Row… }
                                                                              │
ledger + notes + ignored.md ──────────────────────────────────────────► plan ─┴─► new `!` transactions
                                                                              │    + statement notes
                                                                              └──► + archives (.tar.gz)
```

- **`preset.rs`** — a preset is a TOML file describing one export. The engine only knows *formats*; a preset says where each field is in that format.
- **`extract.rs`** — one reader per format, producing the bank's text per field: `csv` (columns by header text), `sheet` (xls/xlsx via calamine: statement fields as the cell after a label, rows under the header row), `fixed` (fixed-width records by code: Norma 43), `pdf` / `text` (lines; statement fields by regex over the text, rows by a regex with named groups, optional **sections** for a file holding several accounts).
- **`map.rs`** — what fields mean, the same for every preset: dates (the preset's `strftime` shapes, then the usual bank shapes, a spreadsheet's day number), numbers (`1.234,56`, `1,234.56`, implied decimals, `x_sign` fields), templates (`{field}`, `{field:0:10}`), `skip` and `rules` (`when = { field = value }`, `!value`, `*`, `""`), fund operations, balances (given per row, computed from the opening, or the amount computed from the balance).
- **`plan.rs`** — duplicates, categories from history, transfers, assertions (below).
- **`batch.rs`** — one import: inbox files → journal appends, statement notes, archives, a report. Pure (returns the files to write), so the helper and the command line apply the same plan and a dry run is the same call.

## Presets

Built in (compiled into the binary from `importers/`, so the helper needs nothing beside it):

| id | Export | Format | Notes |
|---|---|---|---|
| `norma43` | AEB Norma 43 (any Spanish bank; Unicaja's "AEB Norma 43") | fixed | records 11 / 22 / 2301 / 23 / 33; latin1; implied 2 decimals; sign `1` = debit |
| `unicaja-account-xls` | Unicaja account Excel | sheet | the older Paisa file (from 2024-01-08); newest first, ordered by the bank's movement number |
| `unicaja-card-xls` | Unicaja card (prepaid) Excel | sheet | the top-up's "Nombre comercio" is the user's label → the transaction's note |
| `unicaja-funds-pdf` | Unicaja fund movements PDF | pdf | a wrapped fund name is taken from the line before (`fill_from_previous`) |
| `revolut-csv` | Revolut account statement CSV | csv | booked at completion; pending/reverted skipped; per-row balance |
| `actual-csv` | Actual Budget's transactions, every account in one CSV | csv | `split_by = "account"`; Category/Group/Transfer give the other side; a vault preset extends it with `[accounts]` and `[categories]` |

A vault adds or replaces presets with `finance/importers/*.toml` (same `id` replaces). **`extends = "norma43"`** starts from another preset and changes only what it writes; tables merge key by key (so Sabadell's Norma 43 is `id`, `extends`, `name`, `bank`).

Conditions (`skip`, `rules`): `field = "value"` (case and accents ignored), `"!value"`, `"*"` (filled), `""` (empty), and ordered comparisons `"<=2026-02-06"`, `">100"` (as numbers when both are, else as text: ISO dates order).

Key fields (see the doc comments in `preset.rs` for all): `id`, `name`, `bank` (folder), `order` (lower first in a batch: funds 0, accounts 1, cards 2), `detect` (`contains`, `first_line`), `layout` (`format` + its fields), `dates`, `currency`, `currency_codes`, `decimals`, `negative_sign`, `description` (templates, first filled wins), `bank_text`, `empty_text`, `skip`, `rules`, `funds.ops`, `derive`, `derive_statement`, `amount_from_balance`, `sort`.

Field names with a meaning: `booked`, `value`, `description`, `amount` (or `debit`+`credit`), `fee`, `balance`, `currency`, `note`, `kind`; fund rows `fund`, `isin`, `units`, `total`; statement fields `number`/`account` (the holder), `from`, `to`, `opening`, `closing`. Anything else is free for templates.

**Detection** is by content, never by name (banks rename exports; one calls every statement `document.pdf`): the preset whose `detect` conditions all hold, most conditions first. A PDF is found by `%PDF-` near the start, because one bank wraps its PDF inside a Java-serialised object.

## Which account

A statement names its account by number (IBAN, CCC, card digits) or by a code (a section code such as `PCA`, `SHR`). `account_for` tries, in order: a note whose `iban`/`ccc`/`card` digits end with (or are the end of) the statement's; a note whose alias or last account part is the code; the one note whose `import: [...]` lists the preset. Otherwise the import says which note to add the number or the `import:` line to. The Paisa migration writes `import:` on the accounts Paisa imported for, and the funds' ISINs.

## Duplicates (the same movement from several sources)

A row is already in the ledger when, in passes:
1. its **import id** is (`import::import_id`: account, booked date, amount, normalised description) or it is in `ignored.md`;
2. a posting on its account moves the **same amount on the same day**;
3. … **within ±3 days** (booked vs started dates, weekends, Paisa's value dates);
4. … **within ±10 days, when no more postings fit than rows of that amount wait** (a fund subscription charged a week after its date; two identical €2500 subscriptions charged together) — a recurring small amount is never matched this far.

Each posting is matched once **per statement**, so overlapping statements (two downloads of the same months, Paisa's old file and today's) all match it. A row's own posting made by another statement of the same account matches only **on the same date**: a neighbouring month's same coffee is another coffee (this was a real bug on one bank's files: a June 29 café matched July 2's).

Same bytes again: the statement note keeps the original's `sha256`; the file only leaves the inbox ("already imported").

Dates: a row is compared from its **booked** date and from its **value** date (Unicaja's *Fecha* and *Fecha valor*: Actual dates a card payment by the purchase, the bank by the booking, 2–4 days later). Exact-date matching of another file's rows applies only between statements of the **same preset** (two downloads from one bank); another source keeps the window.

**A bank file dates what it matches**: when a row of a file with balances matches a new transaction another source made in this batch (Actual's row), that transaction takes the bank's booked date (the other date becomes `value-date:`) and, when the row ends its day, the bank's balance.

## Transfers between the user's accounts

- **By history**: a new row's other side is the account the payee's earlier accepted transactions used most (`History`); when that is a real account (Unicaja's "RECARGA PREPAGO" → `Assets:Unicaja:Prepago`), its posting is offered to the later statements, which match it (the card's top-up row is then known, and its label becomes the transfer's note). The `order` of presets makes the feeding statement come first.
- **History outranks a file's category** when it names one of the user's accounts: Actual filed the prepaid card's top-ups under "Transport" (it did not track the card); Paisa's history files "RECARGA PREPAGO" as a transfer to `Assets:Unicaja:Prepago`, which a category cannot be.
- **Completing the ledger's unknown sides** (`Completion`): a row whose other side is one of the user's accounts, matching a ledger transaction still to review (`!`) whose other side is `Expenses:Unknown` (same amount, opposite, within 3 days), completes that transaction (`Expenses:Unknown` → this account, through `edit::apply`: only its lines change) instead of adding a copy. The real case: Actual's wallet "+50 from Unicaja" was the cash side of Paisa's ATM withdrawal. Accepted transactions are never changed.
- **By pairing** (`pair_transfers`): two new rows whose other sides are both unknown, one account losing what another gains (same commodity), within 3 days, are one transfer — on the same day always, days apart only when the text says so (a transfer word in the user's languages, or the other account's name). The outflow's transaction takes the inflow's posting; its balance assertion is kept only when the dates agree. On the real data: 17 pairs (Unicaja → Revolut, and between two sections of one statement).

## Currency exchanges

An exchange inside one account (Revolut's EUR pocket → its CAD pocket) is one transaction: the units that arrived priced at what left, `Assets:Revolut  250.00 CAD @@ 157.69 EUR`. The booker has no implied conversion, so each commodity balances only through that `@@` total price.

- **The account holds several currencies:** its note keeps `currency:` (the main one) and lists the others, `currencies: [CAD]`. Any other commodity is an error, as before.
- **A file with several currencies** (Revolut's CSV with every pocket, the currency on each row) is read as one statement per currency (`map::statements`). The file's opening and closing balances go to the first one.
- **Which rows are an exchange:** the bank's text says so, using `exchange_words` in `data/vocabulary.toml` ("exchanged", "cambio de divisa", "change de devise", …). The other side is waiting in a holding account: `holding_accounts`, plus `Expenses:Unknown` always. Here that is `Assets:Transfers`, where Paisa and the first Revolut import parked these rows.
- **Leg already in the ledger** (`exchange_leg`, a `Completion` whose edit is a split): a ledger transaction still to review on the same account, a day apart at most, moving the other way in another commodity, with its other side in a holding account. Its holding posting is replaced by this row's units priced at what that posting held, which leaves the leg's fee out.
- **Both legs new in one import** (`pair_exchanges`): the outflow's transaction takes the inflow's postings.
- **Fees:** Revolut sometimes charges the fee on the side that arrives (80.24 CAD in, 0.80 CAD fee, the balance up by 79.44). The units are written gross, and the fee is two postings of its own: `Assets:Revolut -0.80 CAD` and `Expenses:Bank:Fees 0.80 CAD`. It is never folded into the rate.
- **Edits applied bottom up in each file:** an edit that adds lines (that fee) would otherwise shift every later transaction's lines, and `edit::apply` would then refuse those as changed.
- **Real data (2026-10-22):** `account-statement_2026-01-01_2026-10-22` (the CAD pocket, 26 rows) gave 20 new transactions, all filed from history. All 6 exchanges joined their EUR leg in the ledger, the closing balance agreed (5.22 CAD), and the check found 1816 transactions, 0 errors.

## Balances

- A new row that is the **last of its day** carries the bank's balance as an assertion (`= 16416.29 EUR`), when the rows up to it add up to it (the chain is checked; a statement without per-row balances gets them from its opening balance, Norma 43).
- Within a day, a transaction asserting an account's balance is written after every other new one that day posting to that account (`day_order`), so the balance holds after all of that day's movements.
- Each statement's **note** records the bank's opening and closing balance; `statement::check_notes` compares them with the ledger on every load (an error names the gap). Together these are what proved the reconstruction: after the full import the ledger has **0 errors** against every bank balance.

## What is written

- `journal/<year>.fin`: new transactions appended (`!`, `bank:`, `value-date:`, `statement: [[note]]`, `^id`).
- `statements/<bank>/<Account> <from> to <to>.md` (`type: finance-statement`): account, preset, source, sha256, archive, from/to, opening/closing, counts, the balance table, what was not imported and why.
- `statements/<bank>/<Account>.tar.gz`: the account's originals, **renamed** `<Account> <from> to <to>.<ext>`, **incremental** (the archive is read, the new members added, nothing replaced).
- Inbox files read go to `.atlas/trash/` (they are in the archive).
- An account note's `opened:` moves back when a statement shows the account moving earlier (Actual's wallet from 2024-02-29), said in the report.

## Actual Budget

Actual keeps its budget in `db.sqlite` (inside the export's `user-files/file-*.blob` zip). Read it read-only (`sqlite3 -readonly "file:…/db.sqlite?mode=ro&immutable=1"`; never the server's `account.sqlite`, its sign-ins) into the `actual-csv` shape:

```sql
select a.name as Account,
  substr(t.date,1,4)||'-'||substr(t.date,5,2)||'-'||substr(t.date,7,2) as Date,
  coalesce(case when p.transfer_acct is null then p.name end, t.imported_description, '') as Payee,
  coalesce(t.notes,'') as Notes,
  case when t.starting_balance_flag = 1 then 'Equity:Opening' else coalesce(c.name,'') end as Category,
  coalesce(g.name,'') as "Group", coalesce(ta.name,'') as Transfer,
  printf('%.2f', t.amount/100.0) as Amount, coalesce(t.financial_id,'') as "Imported ID"
from transactions t join accounts a on a.id=t.acct
  left join payees p on p.id=t.description left join accounts ta on ta.id=p.transfer_acct
  left join categories c on c.id=t.category left join category_groups g on g.id=c.cat_group
where t.tombstone=0 and t.isParent=0 and a.tombstone=0 and a.offbudget=0
order by a.name, t.date, t.sort_order desc;
```

The user's vault preset (`finance/importers/actual.toml`, `extends = "actual-csv"`) maps Actual's accounts (Unicaja, Revolut, Wallet → `Assets:Cash`) and categories (Food → `Expenses:Food:Groceries`, …) and skips the bank accounts' rows up to Paisa's last day (`booked = "<=2026-02-06"`): there Paisa and the bank's files are the record, Actual's feed being 1326 EUR short.

## The reconstruction (2026-10-21, on a scratch vault)

Paisa's migration, then in one batch: Actual's CSV, Paisa's `ins/` (Unicaja account Excel from 2024-01-08, the prepaid card Excel, Revolut CSV, the funds PDF), today's Unicaja Norma 43 (2024-09-23 → 2026-10-21) and card Excel, Revolut CSV (2024-09 → 2026-10-20), the funds PDF, five PDF statements of a third bank (May–September 2026). Result: **1795 transactions, 0 errors** — every balance the banks print holds; 643 new (`!`, to review), 19 transfers paired, 1 unknown side completed, the Cash and Transfers notes' `opened` moved back. Then `finance count <vault> Assets:Cash 20`: `! Counted | 20.00 EUR by hand, the ledger had 53.86 EUR`, −33.86 to `Expenses:Unknown`, asserted.

## PDF text (pure Rust, no poppler)

Two questions: what if poppler is not installed, and can a Rust crate do what poppler does?. The presets' regexes rely on the layout `pdftotext -layout` gives (columns as runs of spaces), so the replacement had to keep it:

- **`pdf-extract` 0.9** (on lopdf): rejected. It panicked on one bank's PDF (`assertion left == right, 268 vs 255`, a font's widths table) and joins columns with single spaces.
- **`pdf_oxide` 0.3.78**: adopted. It gives each text span with its box; `statement/pdf.rs` rebuilds the layout: spans grouped by baseline (within half their height), sorted by x, the gap before each turned into spaces at the page's median character width (≥ 2 spaces past 1.5 characters, a column; none when touching at the span's own letter width; a span ending in a space keeps its word gap). Characters whose `rotation_degrees` is not ~0 (Unicaja's legal line up the margin) are dropped, with the spans containing them.
- **Checked on the real files**: the full reconstruction gives the same result as with poppler (565 new transactions, 1717 in the ledger, 0 errors); the funds PDFs' wrapped names and the per-account sections read the same. Two preset regexes now allow leading spaces (`^\s*`), the only difference in shape.
- `finance pdf-text <file>` prints that text: what a pdf preset's regexes are written against.
- The backlog has replacing Atlas's own poppler use (search text, `pdf_text.rs`) with it.

## In the pane

Overview → **Statements** (`ui/src/Import.svelte`) runs the helper's `import` as a dry run on opening: a top line (files, statements, new transactions, how many of the banks' balances agree), a table with one row per statement (rows, new, already known, transfer sides, skipped, balances ✓ / n off), the full report on request. **Import N transactions** writes: text through the core (journals, statement notes, account notes), the binary archives on the vault's own disk (`ATLAS_ROOT`: the helper runs beside the vault), the inbox files to the trash. Checked in WebKit on a copy (`pv-import`: the Paisa migration + the user's 14 files in the inbox), both themes: 21 statements, 643 new, all 21 balances agree; after Import the inbox is empty and the ledger has 1795 transactions, 0 errors.

## Running it

```
finance import <vault> [file…] [--write]     # the files, or <vault>/finance/statements/inbox/; a dry run without --write
finance pdf-text <file.pdf>                  # the text a pdf preset's regexes are written against
finance count <vault> <account> <amount> [date]   # a balance counted by hand (cash): a `!` transaction for the difference
```
