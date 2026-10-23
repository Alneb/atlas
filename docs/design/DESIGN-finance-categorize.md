# Finance: categorisation, budget, prices and wealth

How the finance plugin files a payment under a category by itself, how the budget and the investments are computed, and where prices and FX come from ([DESIGN-finance](DESIGN-finance.md), Phases 6 and 7; the import is [DESIGN-finance-import](DESIGN-finance-import.md)). The code is in `plugins/beta/finance/engine/src/`: `classify.rs`, `rules.rs`, `budget.rs`, `prices.rs`, `pricefeed.rs`, `invest.rs`, `report.rs` (`wealth`, `currencies`). The data the engine reads, never hardcoded in Rust, is in `plugins/beta/finance/data/`.

## Why

A rebuild of a real ledger left 891 transactions in `Expenses:Unknown`, old ones included. They had to be categorised, asking only about what cannot be known, and the automatic categorisation had to be smart and flexible, not rigid. Rules alone (Actual's way, "payee is X → Y") are rigid: every spelling of a payee needs its own rule, and a payee never seen gets nothing. So rules are only the first of three layers.

## The three layers (`classify.rs`)

The first layer that answers wins; every guess carries a **confidence** and a **reason** (shown in Review, the doubtful ones are asked, never filed).

1. **The user's rules** (`rules.rs`). A ```finance-rules fence in any finance note, conventionally `finance/rules.md`. One rule a line: `[in:|out:] pattern → Account`. The pattern is a case-insensitive regex over the payee, the narration and the bank's text (`bank:`); `in:` / `out:` limit it to money coming in or going out (`in: universite paris.saclay → Income:Scholarship`, `out: … → Expenses:Education`). The first rule that matches wins. A rule may file into an account (`cash withdrawal → Assets:Cash`): moving money between one's own accounts. A rule into `Expenses:Unknown` itself means "leave these to me" (the Paisa migration's gap rows). A rule with `out:` in the middle of a line is an error at its line (it would be read as text: the trap fell once on 2026-10-21).
2. **The history:** nearest neighbours by TF-IDF cosine.
   - Every categorised transaction is an example. Its label is its largest posting that is not a money account, a fee or `Income:Gains`. Examples are grouped by their payee's words, direction (in / out) and label, with the count and the median size.
   - Features: the payee's **words** (lowercase, accents removed by Unicode decomposition, digits dropped) and the **letter trigrams** of each word (weight 0.35). So "Café CAUS" meets "CAFE CAUS", and a cut-off name ("UNIVERSITE PARIS SACLA") meets the whole one.
   - **Only the payee is compared, not the bank's text.** Each bank writes boilerplate into every row ("PUR PURCHASE", "COM TPV FISICO", "COMPRA EUR"), which made every row of one bank look like its one McDonald's on the first try.
   - **IDF from every payee of the ledger, filed or not.** "mp" ends half of one bank's card payments, so it weighs nothing even while few of them are filed. A word the history never saw gets the highest weight: it counts against a match, never for one ("Maison du Cinéma" no longer matches a pharmacy on "du").
   - **Direction is a hard gate** (money from a university is a salary, money to it a fee); **size is soft**: up to twice or half is the same, 60 times apart halves the similarity (3 € at Crous is the cafeteria, 236 € the rent).
   - The 7 nearest above 0.3 vote by similarity² × (1 + ln count). Confidence = the winner's share × its nearest similarity; **sure at 0.55**.
3. **The vocabulary** (`data/vocabulary.toml`): kinds of shop and service (supermarket, vending machine, bakery or café, restaurant, pharmacy or doctor, cinema, outing, coach, train, metro, ride, airline, place to stay, clothes, media, shop, subscription, software, phone, laundry, gym, bank fee, government office, interest). Each kind has word beginnings ("supermar" matches SUPERMARCHE; a word of four letters or fewer must match whole, so "bell" is not BELLEVILLE; several words are a phrase) and a category matched against the ledger's own by its last parts ("Food:Groceries" files into whatever account of the ledger ends that way, made under Expenses only when none does). A guess from here has confidence 0.55 and the reason "a supermarket". A vault's `finance/vocabulary.toml` comes before the plugin's; a kind of the same name replaces it.

The import uses the same layers for a new row (after the history naming one of the user's own accounts, which stays first: transfers): rules, then a **sure** guess, then the file's own category, then the history's counter.

## Categorising a real ledger (2026-10-21)

The layers were run on a real ledger with 891 uncategorised transactions, and the remaining cases were settled as conventions:

- **Family:** what family gives (gifts, paying for the dentist or clothes) is `Income:Family`. Money a family member sends to one account and then takes out of another is one movement through them: `Assets:Transfers:Family` (a new account note), which should net out.
- **Friends:** "guess the purpose": the small transfers with friends are filed one by one by what else happened that day (a restaurant day → Food:Restaurants; a museum → Going; cinema tickets → Cinema; the large ones to a landlord → Rent, the small ones → Bills).
- **Deposits:** `Assets:Deposits` (a new account note): a deposit comes back. Rent deposits that bounced (each returned minutes later by a transfer of the same amount) put both sides in `Assets:Transfers`, where they cancel. A payment that is deposit + rent in one is filed as a **split** (Review's split, `edit.rs`).
- **Salary:** an employer's payments are `Income:Salary`.
- **Result:** 891 uncategorised → 865 filed (781 by the rules + history + vocabulary, 82 one-off decisions, 2 after a rule fix); left: 15 to ask the owner about, 11 gaps in the old history, the cash count. Cash withdrawals now go into `Assets:Cash`, so the cash count was redone (`finance count` replaces a same-day count still in Review): the cash spent and never written down shows in Review as `Expenses:Unknown`. The transactions stay `!`: accepting is the owner's (Review: Enter, or `a` for all of one payee).
- One-off decisions are applied with `finance file <vault> <path:line> <Category | A=900.00 EUR,B>` — Review's own edit from the command line.

## The budget (`budget.rs`)

- **This month per category** (top two levels) against its **budget**: a target pinned on the category's note (`target: 250 EUR`, written by the pane's "pin" through `set_target`, which edits only that property or makes the note), else the **usual month**: the median of the N months before (Settings → Baseline, default 6) when the category is spent in at least half of them, the mean otherwise (a yearly bill).
- **Pace:** how far into the month today is; the pane marks where the budget's pace puts each bar.
- **Order:** the most over its budget first, then the biggest budgets.
- **Unknown is apart:** `Expenses:Unknown` mixes spending with income and transfers, so it is left out of the categories and totals and reported per month as `unknown_out` / `unknown_in`. The savings rate is `(income − spent) / income` over the categorised; `rate_all` counts the uncategorised as what they most likely are (in = income, out = spending), shown with an asterisk when it is the only one.
- **Recurring:** payments (and income) with the same payee (words without digits: "Spotify P2A4B" = "SPOTIFY"), at least three days apart, the gaps mostly within a quarter of the usual gap (weekly 6–8 days, monthly 26–35, quarterly 84–98, yearly 350–380) and the amounts mostly within a fifth of the usual one. Listed only while still running (the last one less than one and a half periods old), with its next date and its cost per month.
- Every amount in the display currency, converted at the price of its day; a commodity without a price is named (`unpriced`), never silently dropped.

## Prices and FX (`prices.rs`, `pricefeed.rs`, `data/prices.toml`)

- **The table:** the `price` directives of `finance/prices/*.fin` plus what each transaction implies (its `@` price, else its lot's cost). A lookup takes the latest price on or before the date, of the pair direct or inverted (whichever is more recent), else along the **shortest chain of pairs** (CAD → EUR → USD → XAU: a breadth-first search; one hop was not enough for gold, which is quoted in USD).
- **The sources** (`data/prices.toml`, a vault's `finance/prices.toml` over it: tables replace by name, pages by name, measures by symbol):
  - FX: the ECB's data API, daily, base EUR (`[fx]`).
  - History by ticker: Yahoo's chart API (`[history]`): gold `GC=F`, silver `SI=F`, `BTC-EUR`, `ETH-EUR`, the S&P 500 `^GSPC`, or any ticker a commodity note gives (`ticker: VWCE.DE`).
  - Pages read with regexes (`[pages.<name>]`): the FT's fund tearsheet by ISIN (`ft`, the default for a fund or ETF with an ISIN: the Dunas funds). A commodity note may name its own page: `price_source: https://…` with `price_find` (group `price`), `price_date_find`, `price_date_format`; or `price_source: none`.
  - Stooq was tried first and refused (it serves a JavaScript proof-of-work page); Yahoo and the FT answer plain requests.
- **Written sparse** into `finance/prices/<BASE>-<QUOTE>.fin`, by the price feature only: the last quote of each month, the quote in force on each day a transaction needs one, and the latest. What a file had is kept (merged, then thinned the same way). Daily quotes are never kept.
- **When:** the `prices` tool runs daily at 17:30 (`schedule`, after the ECB's 16:00 CET fixing), the pane's "Update prices", or `finance prices <vault> --write`.

## Wealth in any unit (`report::wealth`)

Total wealth needs every commodity converted, kept as a historical series, and measured in any currency or asset, not only euros. Net worth at each month's end, every commodity converted at that month's price, measured in **any unit**: a currency (EUR, CAD, USD…) or an asset (XAU gold, BTC, a fund). The pane's net-worth card has a unit switch (Settings → "Measure wealth in", default `EUR, CAD, USD, XAU, BTC`, plus every currency held) and shows each commodity's share.

## Investments and currencies (`invest.rs`, `report::currencies`)

- **Holdings:** every lotted commodity still held, with its lots, cost (each lot's cost at its day), value (today's price and its date, "N days old" past a week) and gain.
- **Realised:** the booked `Income:Gains` postings per year (2025: +163.14 EUR, the Dunas funds sold).
- **XIRR:** the money-weighted yearly return of every flow into and out of the lots (the money accounts' side of each transaction that moves lots; a traspaso between funds is no flow), the holdings valued today; bisection, so it always converges when the flows change sign. 3.4 % on a real history.
- **Currencies:** money held in other currencies, what it is worth now, and the **FX gain**: its value now against each inflow and outflow at its own day's rate (+56.09 EUR on 4,976.73 CAD on 2026-10-21), with the rate's month-end history drawn.

## The pane

Tabs Overview, Budget, Accounts, Review, Investments (keys 1–5). Overview: net worth with the unit switch, to review, the month's savings rate, what came in, the statements inbox, this month's top categories, accounts. Budget: the bars with pace and pins, saved per month (income and spending bars, the uncategorised hatched), recurring. Review: an Unknown's guess preselected (italic when not sure; the reason under the selected row); Enter accepts with it, `a` accepts every one of the same payee filed the same way. Investments: tiles, holdings with their lots, currencies with the rate's history, prices and "Update prices". Checked in WebKit on a copy of a real vault in both themes, no page errors.


## Friends' transfers

The ~110 person-to-person payments (Revolut "Payment from …", "Transfer to …", Bizum) that Paisa had under `Expenses:Transfers`, migrated to `Assets:Transfers`: each one's purpose is guessed. Since exact matches are rare: **guess, and a person confirms**.

- **The guess** (`classify::shared`):
  - **When it applies:** the texts name a person (`person_words` in `data/vocabulary.toml`), and the other side waits in a holding account.
  - **The bill:** the nearest card payment of the week before, larger than the transfer but at most 9× it, gives the category. A 12 € part is not a share of a 775 € rent.
  - **An exact share:** a bill that splits into 2–8 equal parts of the transfer, to 2 cents. These are preferred, and they are the only "sure" guesses.
  - **The reason:** "a share of ARDECORE 17.50 EUR on 2025-02-12" or "after MERCADONA 90.06 EUR on 2025-02-22".
- **Measured on the real ledger:**
  - Exact shares are rare: 17 of 102. Friends pay back what they had, not an equal part.
  - The first loose test (any multiple to 1 %, 10 days, no size cap) produced coincidences such as "50 € = the October bills / 10".
- **Filing:** `finance categorize <vault> --shared [--write]`, or the plugin's `categorize` with `shared: true`. It moves the holding posting to the guessed category and sets the mark to `!`, **accepted ones too** (`edit::Edit.mark: Option<Status>`, which replaced `accept: bool`), so every guess is confirmed in Review.
- **2026-10-22, on a real ledger:** 102 filed, 0 errors. The 9 payments of 2025-06-27 found no plausible bill: the 775 € rent is too large under the cap, so they went to a Bolt ride as a weak guess. Review is where they get corrected.
