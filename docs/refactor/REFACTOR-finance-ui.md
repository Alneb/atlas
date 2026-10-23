# REFACTOR — the Finance pane, rebuilt (2026-10-22)

## Why
The user, after using the first pane: *"the UI is terrible, the most fundamental features of this system are missing like editing transactions or seeing who the money is going to, and more things"*; on the dashboard: *"it also needs a lot of work, a complete overhaul — what is measuring things in negative months instead of dates"*. Asked what the app must answer in two seconds: *"where does it go, and measure into what I spend my money"*. On payees: *"money is always double-ledged right? from one account to another, that's what I want to know"* — so "who the money goes to" is the transaction's **from → to** (the accounts and categories on each side), not a new payee database.

## Before → after
| Before | After |
|---|---|
| Tabs: Overview, Budget, Accounts, Review, Investments, Sources | **Overview, Transactions, Spending**, Accounts, Budget, Review, Investments, Sources (keys 1–8) |
| No way to edit a transaction except Review's recategorise/split of one posting | **Editor** (`Editor.svelte`): date, mark, payee, note, tags, every posting (add/remove, one may be empty), live balance check, bank metadata, Save (Ctrl+Enter), Delete with Undo, Open in the journal; **New…** for a full transaction |
| No list of transactions; a register per account | **Transactions** (`Transactions.svelte`): every transaction newest first by month, each row `payee · from → to · amount`, search (`words`, `#tag`, `>100`, `<20`, `2025-03`, `!`), kind filter (spending/income/transfers), j/k/Enter/n// keys |
| Net worth plotted with x = "months before X" (`NetWorth.svelte`, through `atlas.plot`'s numeric axis) | `WealthChart.svelte`: a date axis (Jan 2025…), hover crosshair + tooltip, a table |
| Overview: the same card around every section (UI-STYLE "generated look") | Overview (`Overview.svelte`): a hero line (net worth, change in a month / a year; the period's spent, came in, saved), one "needs you" strip (review, `#guess`, errors, bank errors), **where the money came from and went** (`FlowChart.svelte`, income → spending bands), net worth and accounts side by side, capture and import last |
| Spending only as this month's bars in the Budget | **Spending** (`Spend.svelte`): spending by month (`MonthBars.svelte`, real months, click one to look at it), the period's categories ranked against their usual month, each opening who was paid (payees) and its transactions |

## How it is built
- **One list, derived in the pane.** The engine's new `transactions` method returns every transaction with its booked legs and each leg's value in the display currency at its day's price (`v`). `ui/src/model.ts` derives everything from it — `sides` (from/to), `kind`, `net`, `matcher` (search), `totals`/`byMonth`/`payees`/`flow`, periods — so the views agree and answer without another call. The summary still comes from `summary` (net worth series, budget, sources).
- **Writing.** Engine `entry.rs`: `Draft` (parsed and checked: payee, ≥ 2 postings, ≤ 1 empty), `render` (keeps the id, metadata and an unchanged posting's assertion/lot/comment), `remove`, `lines_of`, `file_for`, `new_errors`. Methods `txn_save` (add or replace), `txn_delete`, `txn_restore` (Undo). Every write goes through `guarded_write`: the books are read again with the new text (`load::Overlay`) and the write is refused when it adds an error — an unbalanced edit, or deleting a bank-imported payment that a later balance assertion still counts ("Assets:Revolut is 771.94 EUR here, the line says 749.55 EUR"). The editor refuses an unbalanced draft before sending it.
- **Colour.** Categories take the dataviz reference palette's eight slots (validated on Atlas's `--bg-elev`, light and dark: `scripts/validate_palette.js`), assigned by all-time spending so a category keeps its colour in every view; the rest grey. Light mode's three low-contrast slots are why every bar and band is labelled with its name and amount.
- **Kept:** Budget, Review, Investments, Sources, Capture, Import, Balances, Register; the note blocks (`finance.balance/spending/register`, `Block.svelte` with `Spending.svelte`). `NetWorth.svelte` is no longer used by the pane.

## Checked
`plugin-ui.mjs --check` (svelte-check, 0 problems); engine tests (68: `entry.rs` edit/refuse/remove/new-error cases). In WebKit on a copy of the vault (`target/probe-fin`, served on :7791), both themes, every tab screenshotted; on the copy an edit of a payee was saved and read back from the journal, an unbalanced draft was refused in the editor, a transaction made with New… was deleted and restored through the toast's Undo, a bank-imported one's deletion refused by the guard; `finance check` 0 errors after.

## Watch out
- Undo appends the restored transaction at the end of its file (booking orders by date, so the books are the same; the file's order is not).
- `transactions` sends the whole journal (~1800 transactions, a few hundred KB): fine now; a vault ten times bigger would want paging.
- The flow chart folds categories past eight into "Everything else" and adds "Saved" / "From savings" so both sides are equal.
