//! The presets on files shaped like the user's real exports (numbers and names changed), and the planning rules:
//! the same movement in two files is one, two of the user's accounts' sides of a transfer are one.
use super::batch::{run, Input};
use super::preset::presets;
use super::*;
use crate::load::{load_texts, Source};

fn no_pdf(_: &[u8]) -> Result<String, String> {
    Err("no PDF here".into())
}

/// A Norma 43 line: the fields at their places, padded to 80.
fn n43(parts: &[&str]) -> String {
    format!("{:<80}", parts.concat())
}

fn norma43() -> String {
    [
        n43(&["11", "2103", "7241", "0010043663", "240923", "261021", "2", "00000000100000", "978", "3", "TEST HOLDER"]),
        n43(&["22", "1557", "7241", "240923", "240923", "04", "590", "1", "00000000002000", "0000000000", "240923426786", "790884   0000584"]),
        n43(&["2301", &format!("{:<38}", "S/O TRANSF. INTERNA"), "RECARGA PREPAGO"]),
        n43(&["22", "0000", "0048", "240924", "240921", "12", "543", "1", "00000000001500", "0000000000", "240924924095", "4352218920000585"]),
        n43(&["2301", &format!("{:<38}", "COM TPV FISICO INTER"), "BAR GIANICOLO"]),
        n43(&["2302", "NO DISPONIBLE"]),
        n43(&["33", "2103", "7241", "0010043663", "00002", "00000000003500", "00000", "00000000000000", "2", "00000000096500", "978"]),
        n43(&["88", "99999999999999999999", "000007"]),
    ].join("\r\n")
}

#[test]
fn norma43_reads_balances_signs_and_texts() {
    let (ps, e) = presets(&[]);
    assert!(e.is_empty(), "{e:?}");
    let sts = read("x.csb", norma43().as_bytes(), &ps, &no_pdf).unwrap();
    let st = &sts[0];
    assert_eq!((st.preset.as_str(), st.holder.as_deref()), ("norma43", Some("0010043663")));
    assert_eq!((st.opening, st.closing), (Some(Decimal::new(100000, 2)), Some(Decimal::new(96500, 2))));
    assert_eq!(st.rows.len(), 2);
    assert_eq!(st.rows[0].kind, Move::Cash { amount: Decimal::new(-2000, 2), fee: Decimal::ZERO });
    assert_eq!(st.rows[0].description, "RECARGA PREPAGO");
    assert_eq!(st.rows[1].value, NaiveDate::from_ymd_opt(2024, 9, 21));
    assert_eq!(st.rows[1].bank, "COM TPV FISICO INTER BAR GIANICOLO", "NO DISPONIBLE is nothing");
    assert_eq!(st.rows[1].balance, Some(Decimal::new(96500, 2)), "running from the opening balance");
}

const REVOLUT: &str = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
Deposit,Current,2026-01-03 10:00:00,2026-01-03 10:00:01,Money added via BIZUM,50.00,0.00,EUR,COMPLETED,50.00
Card Payment,Current,2026-01-04 21:00:00,2026-01-05 09:00:00,\"Bar, the one\",-4.10,0.00,EUR,COMPLETED,45.90
Card Payment,Current,2026-01-06 12:00:00,,Fizz,-8.45,0.00,EUR,PENDING,
";

#[test]
fn revolut_books_completed_rows_by_their_completion() {
    let (ps, _) = presets(&[]);
    let st = &read("r.csv", REVOLUT.as_bytes(), &ps, &no_pdf).unwrap()[0];
    assert_eq!(st.rows.len(), 2);
    assert_eq!(st.skipped.len(), 1);
    assert_eq!(st.rows[1].booked, NaiveDate::from_ymd_opt(2026, 1, 5).unwrap());
    assert_eq!(st.rows[1].value, NaiveDate::from_ymd_opt(2026, 1, 4));
    assert_eq!(st.rows[1].description, "Bar, the one");
    assert_eq!(st.currency.as_str(), "EUR");
}

const DESJARDINS: &str = "                CAISSE DESJARDINS DES
                                                                                             From May 1 to May 31, 2026
                                                    STATEMENT OF ACCOUNT
                                      SJ 000-00000-0
PCA                                                      DESJARDINS YOUTH PROFIT ACCOUNT
 Date     Code                             Description                             Charges        Withdrawal            Deposit              Balance
                 Balance forward                                                                                                                    0.00
MAY 21 OLD       Payroll / Example Employer                                                                               2 000.00           2 000.00
MAY 21 TR        Automatic transfer to SHR account                                                             5.00                             1 995.00
MAY 29 INT       Interest on PCA                                                                                                  0.08          1 995.08
                                                        SAVINGS AND INVESTMENT ACCOUNT
SHR      QUALIFYING SHARE (B)
                 Balance forward                                                                                                                       0.00
MAY 21 TR        Automatic transfer to SHR account                                                                                5.00                 5.00
PCA     DESJARDINS YOUTH PROFIT ACCOUNT / No service charge
";

#[test]
fn desjardins_sections_and_amounts_from_balances() {
    let (ps, _) = presets(&[]);
    // A download that wraps the PDF (Desjardins serves it inside a Java object) is still a PDF.
    let bytes = b"\xac\xed\x00\x05ur..%PDF-1.4 rest".to_vec();
    let sts = read("document.pdf", &bytes, &ps, &|b: &[u8]| { assert!(b.starts_with(b"%PDF-")); Ok(DESJARDINS.to_string()) }).unwrap();
    assert_eq!(sts.len(), 2, "PCA and SHR");
    let pca = &sts[0];
    assert_eq!((pca.holder.as_deref(), pca.currency.as_str()), (Some("PCA"), "CAD"));
    assert_eq!((pca.from, pca.to), (NaiveDate::from_ymd_opt(2026, 5, 1), NaiveDate::from_ymd_opt(2026, 5, 31)));
    let amounts: Vec<_> = pca.rows.iter().map(|r| match r.kind { Move::Cash { amount, .. } => amount, _ => unreachable!() }).collect();
    assert_eq!(amounts, [Decimal::new(200000, 2), Decimal::new(-500, 2), Decimal::new(8, 2)]);
    assert_eq!(pca.rows[2].description, "Interest on PCA");
    assert_eq!(sts[1].rows.len(), 1);
}

fn account(path: &str, account: &str, extra: &str) -> (String, String) {
    (path.to_string(), format!("---\ntype: finance-account\naccount: {account}\ncurrency: EUR\n{extra}---\n"))
}

struct Mem(Vec<(String, String)>);

impl Source for Mem {
    fn files(&self, folder: &str) -> Result<Vec<String>, String> {
        Ok(self.0.iter().map(|f| f.0.clone()).filter(|p| p.starts_with(folder)).collect())
    }
    fn read(&self, path: &str) -> Result<String, String> {
        self.0.iter().find(|f| f.0 == path).map(|f| f.1.clone()).ok_or_else(|| "missing".to_string())
    }
}

#[test]
fn overlapping_files_and_the_ledger_are_one_and_a_transfer_pairs() {
    let mut files = vec![
        account("finance/accounts/U.md", "Assets:Unicaja:Cuenta", "iban: ES27 2103 7241 2500 1004 3663\n"),
        account("finance/accounts/P.md", "Assets:Unicaja:Prepago", "import: [unicaja-card-xls]\n"),
        account("finance/accounts/R.md", "Assets:Revolut", "import: [revolut-csv]\n"),
        // The bar is already in the ledger, two days off and under another name.
        ("finance/journal/2024.fin".to_string(), "2024-09-25 * Bar | before\n  Expenses:Food\n  Assets:Unicaja:Cuenta  -15.00 EUR\n\n2024-09-20 * Opening\n  Assets:Unicaja:Cuenta  1000.00 EUR\n  Equity:Opening\n".to_string()),
    ];
    let loaded = load_texts(&files);
    let revolut_topup = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nTopup,Current,2024-09-23 10:00:00,2024-09-23 10:00:00,Money added from TEST HOLDER,20.00,0.00,EUR,COMPLETED,20.00\n";
    let inputs = vec![
        Input { path: "finance/statements/inbox/a.csb".into(), bytes: norma43().into_bytes() },
        // The same statement downloaded twice: nothing more.
        Input { path: "finance/statements/inbox/b.csb".into(), bytes: norma43().replace("TEST HOLDER", "TEST HOLDEr").into_bytes() },
        Input { path: "finance/statements/inbox/r.csv".into(), bytes: revolut_topup.as_bytes().to_vec() },
    ];
    let mem = Mem(files.clone());
    let out = run(&mem, &|_| None, &loaded, "finance", inputs, &no_pdf, NaiveDate::from_ymd_opt(2026, 10, 21).unwrap());
    assert!(out.errors.is_empty(), "{:?}\n{}", out.errors, out.report);
    // The top-up: Unicaja's −20 and Revolut's +20 are one transaction; the bar was known.
    assert_eq!(out.new, 1, "{}", out.report);
    let journal = &out.texts.iter().find(|t| t.0 == "finance/journal/2024.fin").unwrap().1;
    assert!(journal.contains("Assets:Unicaja:Cuenta") && journal.contains("Assets:Revolut") && !journal.contains("Expenses:Unknown"), "{journal}");
    assert_eq!(out.archives.len(), 2, "one archive per account");
    // Written back, the ledger reads with no error: the bank's balances hold.
    files.retain(|f| !out.texts.iter().any(|t| t.0 == f.0));
    files.extend(out.texts.iter().cloned());
    let after = load_texts(&files);
    assert!(after.ledger.diags.iter().all(|d| d.severity != Severity::Error), "{:?}", after.ledger.diags);
    // The same file again: already imported, nothing new.
    let again = run(&Mem(files.clone()), &|_| None, &after, "finance", vec![Input { path: "inbox/a.csb".into(), bytes: norma43().into_bytes() }], &no_pdf, NaiveDate::from_ymd_opt(2026, 10, 21).unwrap());
    assert_eq!(again.new, 0);
    assert!(again.report.contains("already imported"), "{}", again.report);
}

const ACTUAL: &str = "Account,Date,Payee,Notes,Category,Group,Transfer,Amount,Imported ID
Unicaja,2024-09-21,/Txt/Bar Gianicolo,,Food,Usual Expenses,,-15.00,x1
Wallet,2024-09-22,Cajero,,,,Unicaja,50.00,
";

#[test]
fn another_apps_rows_take_the_banks_dates_and_complete_unknown_sides() {
    let mut files = vec![
        account("finance/accounts/U.md", "Assets:Unicaja:Cuenta", "iban: ES27 2103 7241 2500 1004 3663\nopened: 2024-01-01\n"),
        account("finance/accounts/C.md", "Assets:Cash", "opened: 2024-01-01\n"),
        // Paisa's ATM withdrawal, its other side unknown; the opening the Norma 43 file starts from.
        ("finance/journal/2024.fin".to_string(), "2024-09-20 * Opening\n  Assets:Unicaja:Cuenta  1000.00 EUR\n  Equity:Opening\n\n2024-09-22 ! CAJERO\n  Expenses:Unknown\n  Assets:Unicaja:Cuenta  -50.00 EUR\n".to_string()),
        ("finance/importers/actual.toml".to_string(), "id = \"actual-mine\"\nextends = \"actual-csv\"\nname = \"Mine\"\norder = 0\n[accounts]\nUnicaja = \"Assets:Unicaja:Cuenta\"\nWallet = \"Assets:Cash\"\n".to_string()),
    ];
    // The bank's file: the bar booked on the 24th (value date the 21st), and the ATM's 50 on the 22nd.
    let n43 = norma43().replace("00000000096500", "00000000093500");
    let n43 = n43.replace("RECARGA PREPAGO", "CAJERO 4B").replace("00000000002000", "00000000005000").replace("240923240923", "240922240922").replace("240923261021", "240922261021");
    let loaded = load_texts(&files);
    let inputs = vec![
        Input { path: "inbox/actual.csv".into(), bytes: ACTUAL.as_bytes().to_vec() },
        Input { path: "inbox/u.csb".into(), bytes: n43.into_bytes() },
    ];
    let out = run(&Mem(files.clone()), &|_| None, &loaded, "finance", inputs, &no_pdf, NaiveDate::from_ymd_opt(2026, 10, 21).unwrap());
    assert!(out.errors.is_empty(), "{:?}\n{}", out.errors, out.report);
    let journal = &out.texts.iter().find(|t| t.0 == "finance/journal/2024.fin").unwrap().1;
    // The ATM withdrawal's unknown side became the cash account: no second copy.
    assert!(journal.contains("2024-09-22 ! CAJERO\n  Assets:Cash"), "{journal}");
    // Actual's bar, matched by the bank's row, is dated as the bank booked it, with Actual's date as the value date.
    assert!(journal.contains("2024-09-24 ! Bar Gianicolo"), "{journal}");
    assert!(journal.contains("value-date: 2024-09-21"), "{journal}");
    assert!(journal.contains("Expenses:Food"), "the category Actual gave: {journal}");
    files.retain(|f| !out.texts.iter().any(|t| t.0 == f.0));
    files.extend(out.texts.iter().cloned());
    let after = load_texts(&files);
    assert!(after.ledger.diags.iter().all(|d| d.severity != Severity::Error), "{:?}", after.ledger.diags);
}

const EXCHANGE: &str = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
Topup,Current,2026-05-01 10:00:00,2026-05-01 10:00:00,Top-up by *1234,200.00,0.00,EUR,COMPLETED,200.00
Exchange,Current,2026-05-01 22:41:20,2026-05-01 22:41:20,Exchanged to CAD,-157.69,0.00,EUR,COMPLETED,42.31
Exchange,Current,2026-05-01 22:41:20,2026-05-01 22:41:20,Exchanged to CAD,80.24,0.80,CAD,COMPLETED,79.44
";

fn revolut_files(journal: &str) -> Vec<(String, String)> {
    vec![
        account("finance/accounts/R.md", "Assets:Revolut", "import: [revolut-csv]\ncurrencies: [CAD]\n"),
        account("finance/accounts/T.md", "Assets:Transfers", ""),
        ("finance/journal/2026.fin".to_string(), journal.to_string()),
    ]
}

fn reads_back(mut files: Vec<(String, String)>, texts: &[(String, String)]) {
    files.retain(|f| !texts.iter().any(|t| t.0 == f.0));
    files.extend(texts.iter().cloned());
    let after = load_texts(&files);
    assert!(after.ledger.diags.iter().all(|d| d.severity != Severity::Error), "{:?}", after.ledger.diags);
}

#[test]
fn both_pockets_of_an_exchange_are_one_priced_transaction() {
    let files = revolut_files("");
    let out = run(&Mem(files.clone()), &|_| None, &load_texts(&files), "finance", vec![Input { path: "inbox/r.csv".into(), bytes: EXCHANGE.as_bytes().to_vec() }], &no_pdf, NaiveDate::from_ymd_opt(2026, 10, 22).unwrap());
    assert!(out.errors.is_empty(), "{:?}\n{}", out.errors, out.report);
    let journal = &out.texts.iter().find(|t| t.0 == "finance/journal/2026.fin").unwrap().1;
    let flat = journal.split_whitespace().collect::<Vec<_>>().join(" ");
    // The CAD units priced at the euros that left; Revolut's CAD fee a posting of its own.
    assert!(flat.contains("Assets:Revolut 80.24 CAD @@ 157.69 EUR"), "{journal}");
    assert!(flat.contains("Expenses:Bank:Fees 0.80 CAD"), "{journal}");
    assert_eq!(journal.matches("! Exchanged to CAD").count(), 1, "{journal}");
    assert!(!journal.contains("bank-to"), "the same text said once: {journal}");
    reads_back(files, &out.texts);
}

#[test]
fn a_pocket_file_completes_the_exchange_the_ledger_has_waiting() {
    let files = revolut_files("2026-04-30 * Opening\n  Assets:Revolut  200.00 EUR\n  Equity:Opening\n\n2026-05-01 ! Exchanged to CAD\n  Assets:Transfers\n  Assets:Revolut  -157.69 EUR\n\n2026-05-02 ! Exchanged to CAD\n  Assets:Transfers\n  Assets:Revolut  -30.00 EUR\n");
    // Two waiting exchanges: the first one's fee adds lines above the second, which is still found.
    let mut cad = EXCHANGE.lines().filter(|l| !l.contains(",EUR,")).collect::<Vec<_>>().join("\n");
    cad.push_str("\nExchange,Current,2026-05-02 10:00:00,2026-05-02 10:00:00,Exchanged to CAD,45.00,0.00,CAD,COMPLETED,124.44\n");
    let out = run(&Mem(files.clone()), &|_| None, &load_texts(&files), "finance", vec![Input { path: "inbox/cad.csv".into(), bytes: cad.into_bytes() }], &no_pdf, NaiveDate::from_ymd_opt(2026, 10, 22).unwrap());
    assert!(out.errors.is_empty(), "{:?}\n{}", out.errors, out.report);
    assert_eq!(out.new, 0, "{}", out.report);
    let journal = &out.texts.iter().find(|t| t.0 == "finance/journal/2026.fin").unwrap().1;
    let flat = journal.split_whitespace().collect::<Vec<_>>().join(" ");
    assert!(flat.contains("Assets:Revolut 80.24 CAD @@ 157.69 EUR") && flat.contains("Expenses:Bank:Fees 0.80 CAD"), "{journal}");
    assert!(flat.contains("Assets:Revolut 45.00 CAD @@ 30.00 EUR"), "{journal}");
    assert!(!journal.contains("Assets:Transfers\n"), "the waiting side is gone: {journal}");
    reads_back(files, &out.texts);
}
