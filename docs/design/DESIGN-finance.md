# Finance — a ledger plugin for Atlas

The Finance plugin (`plugins/beta/finance`) keeps a person's money the way plain-text accounting does (hledger, Paisa), with the conveniences of a budgeting app (Actual Budget): bank feeds, statement import, quick capture of an expense, a budget and investments. Its data is files in the vault, like everything in Atlas: transactions in text journals; accounts, funds, payees and rules as Markdown notes.

## Goals
- **One format, as powerful as needed:** hledger-shaped double entry, stricter and richer (typed directives, lots, links), with a one-way exporter to hledger under well-defined rules.
- **Layout:** transactions in text journal files; accounts, banks, funds, payees, rules and budgets as Markdown notes.
- **A budget without envelopes:** targets come from the averages of previous months.
- **Capture in natural language,** with a live helper like the Tasks one.
- **Automation:** Enable Banking, the bank's own statement files, and a downloaded statement moved into the inbox by itself.
- **Migration** from an existing Paisa ledger and an Actual Budget database, into new files only.
- Several banks and currencies, funds now and a portfolio later. Built like the rest of Atlas: a Rust engine, a Svelte + TS UI.

The detailed specs: [DESIGN-finance-format](DESIGN-finance-format.md) (the journal format), [DESIGN-finance-import](DESIGN-finance-import.md) (importer presets), [DESIGN-finance-categorize](DESIGN-finance-categorize.md) (categorisation, budget, investments), [STUDY-bank-access](STUDY-bank-access.md) (why a person cannot connect to a bank directly).

## Why a person cannot simply connect to their own bank (study → `docs/design/STUDY-bank-access.md`)

1. **The PSD2 API is closed to individuals.**
   - Every EU bank's PSD2 API (XS2A, mostly Berlin Group NextGenPSD2; Spanish banks through Redsys) accepts only callers that present an **eIDAS QWAC/QSealC certificate carrying a PSD2 role**.
   - Trust providers issue those only to entities holding a national authorisation number. In Spain that means registering as an AISP with the Banco de España: liability insurance, security policy, audits, thousands of €/year.
   - A person can't hold one for themselves.
2. **Your own online banking is legal, but automating it is fragile.**
   - Logging into your own online banking is fine. Automating that login is a ToS grey area, and every login meets SCA (2FA).
   - Banks may skip SCA for read-only access for 90 days. The EBA extended this to 180 days through TPPs in 2023.
   - The sites also run bot detection.
3. **The banks' mobile app APIs are worse.** They use device binding, certificate pinning and Play Integrity attestation, so they break on every app update. Worth studying, not building on.
4. **No personal API at the banks studied.**
   - Revolut has an API only for Business.
   - Unicaja, Openbank and Desjardins have none.
5. **Canada:**
   - **Status:** consumer-driven banking is legislated (Bill C-15, Royal Assent 2026-03-26; regulations pre-published 2026-06-26) but has **no live date**.
   - **Screen-scraping:** the framework explicitly bans it once the framework is live.
   - **Until then:** Desjardins is reachable only through commercial aggregators (Flinks, Plaid) or by exporting files.
6. **What Enable Banking is:**
   - It is a licensed AISP that lends you its licence in **free "restricted" mode for accounts you link yourself**. That is the closest thing to "direct" that is legal.
   - **Mechanics:**
     - Your app's RSA key signs an RS256 JWT for each request.
     - `POST /auth` returns the bank's SCA page.
     - The redirect comes back with a `code`, and `POST /sessions` turns it into a `session_id` plus the accounts.
     - Data comes from `GET /accounts/{uid}/balances` and `/transactions?date_from=…&continuation_key=…`.
   - **Limits:** consent lasts up to 90–180 days depending on the bank. PSD2 RTS art. 36(5) allows **4 unattended pulls per day per account**.
   - **Checks before relying on it:** the banks are listed by `GET /aspsps`, and the application's accepted redirect URLs.

The conclusion and the design follow from this:
- **Enable Banking** for the EU banks.
- **Statement files** for everything, as the always-works path.
- **A browser fetch** for Desjardins, which nothing else covers today.

## Design

### Format (`docs/design/DESIGN-finance-format.md`) — hledger-shaped, stricter, richer
- **Journal files:** `finance/journal/2026.fin`, plain text, one posting per line. Familiar hledger syntax (date, status `*`/`!`, payee, `"narration"`, postings, `;` comments, `#tags`), plus the additions below.
- **Typed directives:**
  - `open` / `close` for accounts.
  - `commodity` with a `kind` (`currency | fund | stock | etf | crypto`), ISIN and price source.
  - `price` for prices.
  - `= balance` assertions (hledger's single-commodity `=`), written inline after a posting, as the bank's running balance. The format spec (DESIGN-finance-format.md) is authoritative.
- **Lots and cost basis:**
  - A purchase is written `191.165888 DVF {13.0777 EUR}`. A sale is written `{FIFO}` / `{AVG}`, with `@ price`.
  - The engine books the lots and **computes realised gains**; you never type them.
  - The booking method lives on the account or commodity note. Spain uses FIFO; Canada uses ACB (average cost), which matters when you sell there.
  - A Spanish fund **traspaso** keeps the original cost basis (`{carry}`).
  - Withholding (retención) goes to its own account.
- **Identity and links:**
  - An `^id` import id makes de-duplication exact and survives edits.
  - `[[wikilinks]]` in metadata point to the receipt photo, the capture line, the statement file or the mail.
  - `!` means "to review" (imported or captured, not yet accepted).
- **Markdown notes (all `type:` properties, so they work in Bases, links and search):**
  - **Accounts** (`finance/accounts/Revolut.md`) carry the ledger name, institution `[[Unicaja]]`, IBAN, currency, `aliases` (used by capture: "revo", "tarjeta"), sync source, import profile and booking method.
  - **Funds / commodities** (`finance/assets/Dunas Valor Flexible.md`).
  - **Rules** (`finance/rules.md`, a fenced block: `payee /MERCADONA/ → Expenses:Food:Groceries`).
  - **Ignored import ids**, so a transaction you delete is **never re-imported**. This applies the "missing is not lost" rule.
- **Writers:**
  - The plugin writes the journal only through its own canonical writer, which appends or edits single transactions and preserves your formatting.
  - You may edit by hand.
  - The engine reports parse errors with file:line.
- **hledger exporter** (`finance export hledger`), one-way. Its rules:
  - Lots become hledger cost syntax plus explicit gain postings.
  - Assertions become `=`.
  - Account notes become `account` directives with tags.
  - Links and ids become comments.
  - Prices become `P`.
  - Every rule is listed in the spec and tested against `hledger`, which is installed.

### Budget = "a normal month", no envelopes
- **Baseline:** each category's baseline is the median of the last N months (default 6, set in Settings), with one-off outliers flagged.
- **Month view:** this month runs against that baseline as a progress bar per category. Over-baseline categories rise to the top.
- **Targets:** you can **pin** a target on any category, in its note, when the average isn't what you want.
- **Recurring items:** detected automatically (same payee, similar amount, regular period) and listed as subscriptions with their next date.
- **Savings rate per month:** shown on the overview.
- **Envelopes:** none.

### Capture: natural language with a live helper
- **What you type:** for example "12,40 café con Ana revolut ayer", "30 cad groceries desjardins" or "+1500 salary unicaja".
- **How it is parsed:**
  - Amount: comma or dot, with symbol or code.
  - Date words in es, en and fr, reusing capture's date vocabulary.
  - Account by alias.
  - Category from rules plus a classifier trained on your history.
  - Payee from the rest.
- **The helper, like Tasks:**
  - While you type, the box shows `→ expense 12.40 € · Food:Cafe · Revolut · 20 Oct`, with completions for accounts, categories and payees.
  - Only text that looks like money (an amount plus a currency or a known account) is offered.
  - In notes it uses `editor.registerCompletion`.
- **Core extension** (generic, documented in `docs/guides/DEVELOPING.md` + `docs/guides/PLUGIN-API.md`):
  - A plugin can declare a capture **recognizer** tool, `[[tool]] on = "recognize"`, which takes text and returns a hint and completions.
  - The desktop box (`crates/atlas-capture` complete/status) and the phone call it, debounced, replacing the catalog-only `catalog_hint` path.
- **On save:** the existing `on = "capture"` hook writes a `!` transaction, links the capture line and attaches the receipt photo.
- **Bank match:** when the bank feed later brings the same payment (amount ± fees, date ± 3 days), it **merges into the captured one** rather than adding a duplicate. Your category and note win, and the bank's balance assertion is added.

### Import pipeline (one path for every source)
- **Shape:** every source (statement file, Enable Banking or browser fetch) produces the same `BankTxn {account, booked, value_date, amount, currency, description, counterparty, bank_ref, balance_after}`.
- **Steps:** each batch is de-duplicated (by `^id`), matched to captures, classified by rules then history, and written as `!`, with assertions taken from `balance_after`.
- **File parsers:**
  - CSV through a profile.
  - XLS/XLSX with `calamine`.
  - OFX/QFX for Desjardins.
  - PDF through `pdftotext -layout` plus a column-detection heuristic, with a per-bank profile only as a hint, so an unseen layout degrades gracefully.
  - Profiles for Revolut, Unicaja, Unicaja prepago and the Unicaja funds PDF are built from real statement files (never committed; the fixtures are synthetic).
- **Statement files:** dropped in `finance/statements/inbox/`, then moved to `finance/statements/<bank>/`. Each gets a **companion note** (period, account, opening and closing balance, links to its transactions), per the philosophy.
- **Enable Banking:**
  - The private key is in Atlas secrets.
  - The sync is a scheduled `[[tool]]`, 4 pulls a day at most.
  - The consent expiry shows in the pane and on Home, with a "renew" button.
  - The redirect URL is the local core's, or a server's Atlas (the mirror).
- **Browser fetch** (the first plan; replaced by "From the bank's site", see Status):
  - A Playwright script per bank, kept in the vault (`.atlas/finance/fetch/desjardins.mjs`; JavaScript is the scripting language).
  - Credentials come from secrets, with a persistent profile so SCA is rarer. It waits for the approval on the phone and downloads the export into the statements inbox.
  - Desjardins first.

### UI (Svelte 5 + TS)
- **Build mechanism (new):** the plugin carries `ui/` (Svelte + TS, Vite library build) that compiles to `view.js` / `main.js`, committed like `bin/`. This is documented as a generic recipe in `docs/guides/PLUGIN-API.md` and reuses Atlas's tokens and styles from `docs/guides/UI-STYLE.md`.
- **Finance pane**, keyboard-first:
  - **Overview:** net worth over time in a chosen display currency, cash per account, this month against the baseline, savings rate, and the number waiting for review.
  - **Review:** the `!` queue. j/k to move, the suggested category preselected, Enter to accept, `s` to split, linking to captures and receipts.
  - **Accounts:** a register per account with the running balance, assertions ✓/✗ and reconciliation.
  - **Budget:** baseline bars, pinned targets, recurring items.
  - **Investments:** holdings, lots, realised and unrealised gains, XIRR, allocation.
  - **Sources:** drop zone, the state of each source (last sync, consent expiry, errors in plain words).
- **Blocks for notes, Home and the daily note:** `finance.balance`, `finance.spending`, `finance.register`.
- **MCP tools** (`finance.query`, `finance.add`), so an agent can answer questions about the ledger.
- **Settings:** journal folder, display currency, baseline months, default booking method, sources and schedules, Enable Banking app id and key.
- Every visible change is judged by screenshot in both themes, and charts follow the dataviz skill.

### Prices and FX
- **FX:** ECB eurofxref daily rates (they include CAD) and the Bank of Canada Valet API.
- **Fund NAV:** from a per-commodity source given on its note.
- **Storage:** prices are written as `price` directives in `finance/prices/2026.fin`, by the plugin only.

### History harmonisation (writes new files only, after a yes)
- **Paisa:** `finance migrate paisa` maps accounts through an editable mapping note:
  - fixes the case duplicates and the transfers;
  - turns the running-balance comments into assertions;
  - turns DVE, DVF and DVP into fund commodities with lots;
  - recomputes the gains and **compares them with the recorded ones**.
- **Actual:** the database is copied read-only (e.g. over ssh from the server running Actual). Its SQLite tables (accounts, categories, payees, transactions) are mapped the same way, and the periods that overlap Paisa's are de-duplicated by date, amount and account.
- **Reports:** both produce a written report of what was mapped, merged and left uncertain. The original files are never touched.

## Code layout
- `plugins/beta/finance/`: `plugin.toml`, `ui/` (Svelte + TS sources), the built `view.js` / `main.js`, `bin/x86_64-linux/finance`, `README.md`.
- `plugins/beta/finance/engine/` (crate `atlas-finance`, workspace member in `Cargo.toml`, static musl `build.sh` like `plugins/beta/ocr/engine/build.sh`):
  - **Syntax:** `syntax/` (lexer, parser with spans).
  - **Model:** `model.rs` (newtypes `Amount` on `rust_decimal`, `Commodity`, `AccountName`, `ImportId`; enum `Status`, `Booking`).
  - **Ledger logic:** `book.rs` (balancing, lots, gains), `check.rs`, `report.rs` (balances, register, series, baseline, recurring), `prices.rs`.
  - **Import:** `import/{csv,xls,ofx,pdf,enable_banking}.rs`, `classify.rs`, `capture_nl.rs`.
  - **Writing and conversion:** `write.rs` (canonical writer), `export/hledger.rs`, `migrate/{paisa,actual}.rs`.
  - **Entry point:** `main.rs` (methods via `atlas_plugin::Methods`).
- **Core:** the capture recognizer hook in `crates/atlas-core/src/capture_hooks.rs`, `crates/atlas-capture` (box hint and completions), and Android `CaptureActivity`.
- **Docs:** `docs/design/DESIGN-finance.md`, `DESIGN-finance-format.md`, `DESIGN-finance-import.md`, `DESIGN-finance-categorize.md`, `STUDY-bank-access.md`.
- **Vault data:** in the vault that holds the person's own affairs, under `finance/`.

## Status
- **Built:** the engine (parser, booking, lots, checks, reports, the canonical writer, the hledger exporter, the Paisa migration); the pane (Overview, Accounts, Review, Budget, Investments, Sources); file imports through presets; capture in natural language; Enable Banking (connect, consent renewal, a sync every 6 h written as a CSV into the statements inbox and imported, so duplicates, transfers and balances are the import's); prices and FX.
- **Baseline:** the **median** for a category spent in at least half of the months (one odd month does not move it), the **mean** for one spent in fewer (a yearly bill: its median is 0, so it would show as over budget every time it comes; the mean is its real cost per month). Settings → Finance → Baseline sets the number of months (default 6).
- **Statements from the bank's site, built differently from the first plan:** no browser script that logs in (it would hold a password and selectors nobody can test, and break on the first redesign). Finance → Sources opens the bank's page (`data/banks.toml`; a vault's `finance/banks.toml` replaces the list), the person downloads the statement as usual, with their own login and SCA, and for ten minutes the `downloads` tool moves every file in the downloads folder that an importer preset recognises into the statements inbox; anything else stays.
- **What the first real Enable Banking connections taught:**
  - a sign-in's end (`?code&state`) is answered by the server's return page (`crates/atlas-core/src/signin_return.rs`), which also keeps the address for 30 minutes, so a closed or reloaded tab still finishes (`signInReturned` in the plugin API);
  - the bank's code is single-use: the note (the session's id and its accounts) is written the moment the code becomes a session, the pane never offers a code twice, and a spent code is said in plain words (`bank::code_spent`);
  - an account note's `iban:` (and `ccc:`, `card:`) takes a list and `bank-uid:` lists Enable Banking ids, so one bank's pockets in two currencies are two ledger accounts, told apart by the statement's currency (`statement::account_named`); without a currency they are never guessed between;
  - a row with a fee also matches a posting of its gross amount (an exchange booked as gross + a fee posting).
- **Not built yet:** the Actual half of the migration (`migrate/actual.rs`); the core's recognizer hook that would show the capture hint inside the desktop and phone capture boxes.
