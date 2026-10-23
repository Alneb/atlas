# The finance journal format (`.fin`)

The format of the finance plugin's journal ([DESIGN-finance](DESIGN-finance.md)). The goal is hledger's shape, stricter, with what hledger lacks: booked lots with computed gains, typed accounts and commodities, import identity, and links into the vault. A reader of hledger journals recognises every line. The one-way export to hledger is defined at the end, rule by rule.

The engine that implements this is `plugins/beta/finance/engine` (crate `atlas-finance`). This document is its specification, and each rule has a test there.

## Where things live

```
finance/
  journal/2026.fin            transactions (one file per year by default; any *.fin under journal/ is read)
  prices/DVF.fin              price directives, one file per commodity or pair, sparse (see "Prices")
  accounts/Revolut.md         one note per real account (type: finance-account)
  assets/Dunas Valor Flexible.md   one note per non-currency commodity (type: finance-commodity)
  categories/Food.md          optional: a category's pinned target, icon, description (type: finance-category)
  rules.md                    classification rules (a ```finance-rules fence)
  ignored.md                  import ids never to import again (a ```finance-ignored fence)
  statements/<bank>/…         the raw statement files, each with a companion note
```

**What gets read:** every `*.fin` under `finance/` (the folder is a setting) is read, sorted by path. Transactions are ordered by date, then by (path, line). That order is the order of assertions and lot booking. Notes carry the metadata, per the vault's rule that metadata lives in markdown. The journal carries only what happened.

## Lexical rules

- **Encoding and comments:** UTF-8. A comment is `;` to the end of the line, anywhere. A line that is only a comment, or blank, separates nothing and means nothing.
- **Dates:** `YYYY-MM-DD` only. No `/`, no partial dates. This is stricter than hledger, so a typo is an error, not another date.
- **Numbers:**
  - `-1234.56`: `.` is the decimal point, and `_` may group digits (`1_234.56`). No other separators: `1,234.56` is an error. (The importers convert a bank's `1.234,56` before writing.)
  - Any precision is allowed. Fund units keep theirs (`191.165888`).
- **Amount:** a number then a commodity, `23.40 EUR`.
  - **Commodity:** `[A-Z][A-Z0-9._]{0,23}`.
  - A three-letter commodity without a note is an ISO currency. Anything else needs a commodity note.
- **Account:** colon-separated, `Root:Part:Part`.
  - **Root:** must be one of `Assets`, `Liabilities`, `Equity`, `Income` or `Expenses`, so an account cannot be invented at the root.
  - **Parts:** may contain single spaces (`Expenses:Food:Eating Out`). Two spaces or a tab end the account name.
- **Indentation:** one or more spaces or a tab marks a line as belonging to the item above.

## Transactions

```
2026-10-21 * Mercadona | weekly shop #food ^unicaja:2026-10-21:8f3a
  receipt: [[2026-10-21 ticket mercadona.jpg]]
  capture: [[2026-10-21#14:02]]
  Expenses:Food:Groceries        23.40 EUR
  Assets:Unicaja:Cuenta         -23.40 EUR = 3904.16 EUR   ; the bank's balance after it
```

**Header:** `DATE STATUS [PAYEE |] NARRATION`.
- **Status:**
  - `*` is accepted.
  - `!` is to review (imported or captured, not yet looked at; the Review queue).
  - The status is required, so the plugin never has to guess.
- **Payee and narration:** `Payee | narration` as in hledger. Without `|`, the whole text is the payee.
- **`#tag`:** anywhere in the narration (`[A-Za-z0-9_/-]+`). Tags are a set.
- **`^id`:** one import id per transaction, anywhere in the header (`[^ ]+`).
  - Importers set it from the bank's own reference, or a hash of (account, date, amount, description) when the bank gives none.
  - It is the identity used for de-duplication, and it survives any edit to the rest of the transaction.
  - Two transactions with the same id are an error.

**Metadata lines:** indented `key: value`, before the first posting.
- **Key:** lowercase `[a-z][a-z0-9_-]*` followed by `: `. Because an account always starts with a capital root, a metadata line can never be read as a posting.
- **Value:** free text. `[[wikilinks]]` in it are links: the receipt, the capture line, the statement, the mail.

**Posting:** indented `ACCOUNT  [AMOUNT [COST] [PRICE]] [= BALANCE]`, with at least two spaces between the account and the amount.

| part | form | meaning |
|---|---|---|
| AMOUNT | `-23.40 EUR` | units in a commodity |
| COST (new lot) | `{13.0777 EUR}` · `{{2500.00 EUR}}` | per-unit / total cost of the lot this posting opens (positive units) |
| COST (reduce) | `{fifo}` · `{avg}` · `{2024-08-14}` · *(none)* | which lots a negative posting takes. Without braces, the account's booking method applies (from its note, else the commodity's, else FIFO) |
| COST (carry) | `{carry}` | a lot whose cost is the cost taken out of other lots in the same transaction (a Spanish fund *traspaso*: the tax basis moves with the money) |
| PRICE | `@ 13.4710 EUR` · `@@ 2575.17 EUR` | the price of this exchange, per unit / total. On a currency posting it converts (EUR→CAD); on a lot reduction it is the sale price, recorded but not used to balance |
| BALANCE | `= 3904.16 EUR` | assertion: this account's balance in that commodity, right after this posting, is exactly this (subaccounts not included, as hledger's `=`) |

**Weight:** each posting has a weight, the amount it contributes to balancing.
- A plain amount weighs itself.
- With `@` or `@@`, it weighs the converted amount.
- A new lot weighs its cost.
- A reduction weighs the booked cost of the units it takes, not the sale price.
- A carried lot weighs the same as the cost it carried, so the pair balances to zero.

**Balancing:** the weights of a transaction sum to zero in every commodity.
- **Tolerance:** half a unit of the finest precision written for that commodity in the transaction. So `-2.95 EUR` balances against `2.95 EUR` but not `2.949 EUR`.
- **One empty posting:** at most one posting may have no amount, and it takes whatever balances. That is how a fund sale's gain is written:

```
2025-04-09 * Unicaja | Reembolso Dunas Valor Flexible
  Assets:Funds:Dunas Flexible     -191.165888 DVF {fifo} @ 13.4710 EUR
  Assets:Unicaja:Cuenta            2575.17 EUR
  Income:Gains:Funds                              ; computed: -75.17 EUR
```

**Lots:** every account holding a non-currency commodity keeps lots: (date, units, cost per unit in its cost commodity).
- **Booking a reduction:**
  - `fifo` takes the oldest first.
  - `avg` (Canada's ACB) merges every lot of the commodity in the account at the average cost and takes from that.
  - A date takes that lot.
- **Errors:** reducing more units than are held is an error.
- **Holdings without lots:** a non-currency posting without cost, either a gift or the opening of a holding whose cost is unknown, opens a lot at cost zero and is reported as a warning, so the missing basis is visible.

## Directives

| directive | form | where |
|---|---|---|
| price | `2026-10-21 price DVF 13.4710 EUR` | `prices/*.fin` |

**Prices:** a price of A in B also gives B in A by inversion.
- **Lookup:** for date D, the latest price on or before D, either direct or inverted. A conversion through EUR is tried when no direct pair exists.
- **Where they're written:** the price feature writes only month-end quotes, the latest quote and quotes on transaction dates, so a year of daily NAVs never lands in the vault. Daily quotes stay in `.atlas/cache/finance/`.

**No `open`, `close`, `commodity` or `account` directives in the journal.** Those are notes:

**Account note** (`type: finance-account`):
```yaml
type: finance-account
account: Assets:Unicaja:Cuenta
institution: "[[Unicaja]]"
currency: EUR                # the only commodity it may hold (omit for a multi-commodity account)
opened: 2024-01-08
closed:                      # a posting after this date is an error
aliases: [unicaja, cuenta, tarjeta]
booking: fifo                # for lot accounts: fifo | avg
iban: ES00 …
import: unicaja-xls          # the statement profile
sync: enable-banking         # or files, browser
```

**What is checked against the notes:**
- A posting to an `Assets` or `Liabilities` account with no note is an **error**. That catches typos like `Assets:Revolutt`.
- `Expenses`, `Income` and `Equity` accounts need no note.
- An account used for the first time is listed, so a new category is visible, not silent.

**Commodity note** (`type: finance-commodity`): `symbol`, `name`, `kind` (`currency | fund | stock | etf | crypto | other`), `isin`, `booking`, `price_source`, `precision`.

**Category note** (`type: finance-category`): `account: Expenses:Food`, `target: 300 EUR` (the pinned monthly target, which overrides the baseline), `icon`.

## Checks (in order, all reported with path:line, all non-fatal to the others)

1. **Syntax:** dates, numbers, account roots, commodity names, metadata keys.
2. **Identity:** duplicate `^id`.
3. **Notes:** an unknown asset or liability account, a currency other than the note's, a posting outside `opened`…`closed`.
4. **Balancing:** per commodity, within the tolerance.
5. **Lots:** reducing more than is held, or an unknown lot date.
6. **Assertions:** each `=` against the running balance, reporting expected and actual.

## Writing

The plugin never rewrites a whole file.
- **New transactions:** appended to the year's file in the canonical layout. Two spaces of indent; the account padded so that amounts align at column 52, the column the user's Paisa used; numbers written as typed.
- **Accepting, recategorising or merging a capture with its bank line:** replaces exactly that transaction's lines, found by its `^id` (or its span, when it has no id), and checks the file still reads the same around it first.
- **Hand edits:** kept as typed.
- **Deletion:** a transaction deleted by hand that carried an import id is not imported again only once its id is in `ignored.md`. Review offers that as "never import this again". The engine never infers a deletion. That is the "missing is not lost" rule.

## Export to hledger (one-way)

`export hledger` writes one journal that `hledger check` accepts and whose `hledger bal` equals the engine's balances to the cent. The test suite runs this against hledger itself. The rules:

| ours | hledger |
|---|---|
| `2026-10-21 * Payee \| note #food ^id` | `2026-10-21 * Payee \| note  ; food:, import:id` (tags become hledger tags) |
| `!` | `!` |
| metadata `key: value` | `    ; key: value` comment line (hledger reads it as a tag) |
| new lot `5 DVF {12 EUR}` / `{{60 EUR}}` | `5 DVF @ 12 EUR` / `@@ 60 EUR` (cost, so it balances the same) |
| reduction `-5 DVF {fifo} @ 13 EUR` | `-5 DVF @@ <booked cost> EUR` and `P <date> DVF 13 EUR` (hledger does not book lots; the cost the engine booked is written out) |
| `{carry}` | `@@ <carried cost>` |
| empty posting | the computed amount written explicitly |
| `= 3904.16 EUR` | `= 3904.16 EUR` |
| `price DVF 13.47 EUR` | `P 2026-10-21 DVF 13.47 EUR` |
| account notes | `account Assets:Unicaja:Cuenta  ; type:A, institution:Unicaja` (A/L/E/R/X from the root) |
| commodity notes | `commodity 1.000000 DVF` (its precision) |

The export loses nothing that hledger can hold, and the loss is listed when it writes: the lot structure (it becomes costs), links (they become tag values), and the review queue's meaning (`!`).
