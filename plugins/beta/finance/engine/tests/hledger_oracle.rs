//! hledger as the oracle (DESIGN-finance-format.md, "Export to hledger"): the export must pass `hledger check` and give
//! the engine's balances to the cent. On a synthetic vault always, and on the user's real Paisa history when this machine
//! has it (nothing of it is committed). Skipped where hledger is not installed.
use finance::load::{load, load_texts, Dir, Loaded};
use finance::{export, migrate, report};
use rust_decimal::Decimal;
use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;
use std::str::FromStr;

fn hledger() -> bool {
    Command::new("hledger").arg("--version").output().is_ok_and(|o| o.status.success())
}

/// Exports, runs `hledger check` and `hledger bal`, and compares every (account, commodity) with the engine's.
fn agree(l: &Loaded, dir: &Path) {
    let e = export::hledger(&l.ledger, &l.notes);
    let file = dir.join("out.journal");
    std::fs::write(&file, &e.journal).unwrap();
    let check = Command::new("hledger").arg("-f").arg(&file).arg("check").output().unwrap();
    assert!(check.status.success(), "hledger check: {}", String::from_utf8_lossy(&check.stderr));
    let bal = Command::new("hledger").arg("-f").arg(&file).args(["bal", "--flat", "--no-total", "-O", "csv"]).output().unwrap();
    assert!(bal.status.success(), "{}", String::from_utf8_lossy(&bal.stderr));
    let mut theirs = BTreeMap::new();
    for line in String::from_utf8_lossy(&bal.stdout).lines().skip(1) {
        let (acct, amounts) = line.split_once("\",\"").unwrap();
        for part in amounts.trim_end_matches('"').split(", ").filter(|p| !p.is_empty() && *p != "0") {
            let (q, c) = part.rsplit_once(' ').unwrap();
            theirs.insert((acct.trim_start_matches('"').to_string(), c.to_string()), Decimal::from_str(&q.replace(',', "")).unwrap());
        }
    }
    let mut ours = BTreeMap::new();
    for (a, cs) in report::balances(&l.ledger, None) {
        for (c, q) in cs {
            ours.insert((a.to_string(), c.to_string()), q);
        }
    }
    assert!(!ours.is_empty());
    assert_eq!(ours, theirs);
}

#[test]
fn a_synthetic_vault_agrees_with_hledger() {
    if !hledger() {
        eprintln!("hledger not installed: skipped");
        return;
    }
    let note = |a: &str, extra: &str| (format!("finance/accounts/{}.md", a.replace(':', " ")), format!("---\ntype: finance-account\naccount: {a}\n{extra}---\n"));
    let files = vec![
        note("Assets:Bank", "currency: EUR\n"),
        note("Assets:Cash CAD", "currency: CAD\n"),
        note("Assets:Funds", "booking: fifo\n"),
        ("finance/assets/X.md".into(), "---\ntype: finance-commodity\nsymbol: XF\nkind: fund\nprecision: 4\n---\n".into()),
        ("finance/journal/2026.fin".into(), "\
2026-01-01 * Opening
  Assets:Bank  1000.00 EUR = 1000.00 EUR
  Equity:Opening
2026-01-02 * Fund | buy #funds ^b1
  receipt: [[contract.pdf]]
  Assets:Funds  10.0000 XF {12.3456 EUR}
  Assets:Bank
2026-02-01 * Fund | buy more
  Assets:Funds  5.0000 XF {{70.00 EUR}}
  Assets:Bank  -70.00 EUR
2026-03-01 * Fund | sell
  Assets:Funds  -12.0000 XF {fifo} @ 15.0000 EUR
  Assets:Bank  180.00 EUR
  Income:Gains
2026-03-02 * Traspaso
  Assets:Funds  -3.0000 XF {fifo}
  Assets:Funds  1.5000 YF {carry}
2026-04-01 ! Wise | to Canada
  Assets:Bank  -200.00 EUR
  Assets:Cash CAD  296.40 CAD @@ 200.00 EUR = 296.40 CAD
2026-04-02 * Cafe
  Expenses:Food  4.50 CAD
  Assets:Cash CAD
".into()),
        ("finance/prices/XF.fin".into(), "2026-03-31 price XF 15.2 EUR\n".into()),
    ];
    let l = load_texts(&files);
    assert!(l.ledger.diags.is_empty(), "{:?}", l.ledger.diags);
    agree(&l, tempfile::tempdir().unwrap().path());
}

#[test]
fn the_users_paisa_history_migrates_clean_and_agrees() {
    let src = Path::new(&std::env::var("HOME").unwrap_or_default()).join(".sync/paisa/main.ledger");
    let Ok(text) = std::fs::read_to_string(&src) else {
        eprintln!("{} absent: skipped", src.display());
        return;
    };
    let m = migrate::paisa::migrate(&text, None, chrono::NaiveDate::from_ymd_opt(2026, 10, 21).unwrap());
    assert_eq!(m.errors, 0, "{}", m.report);
    // The three fund sales: the engine's FIFO gains equal what Paisa recorded.
    for line in m.report.lines().filter(|l| l.starts_with("| 20")) {
        let cells: Vec<&str> = line.split('|').map(str::trim).collect();
        assert_eq!(cells[3], cells[4], "{line}");
    }
    let dir = tempfile::tempdir().unwrap();
    for (p, body) in &m.files {
        let t = dir.path().join(p);
        std::fs::create_dir_all(t.parent().unwrap()).unwrap();
        std::fs::write(t, body).unwrap();
    }
    let l = load(&Dir(dir.path().to_path_buf()), "finance").unwrap();
    assert!(l.ledger.diags.is_empty(), "{:?}", &l.ledger.diags[..l.ledger.diags.len().min(5)]);
    if hledger() {
        agree(&l, dir.path());
    }
}
