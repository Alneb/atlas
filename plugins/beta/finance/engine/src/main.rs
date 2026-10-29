//! The finance plugin's helper: started by Atlas with no arguments it serves the plugin's methods over the pipe
//! (crates/atlas-plugin); with arguments it is a command line on a vault folder (checks, the migration on a copy).
use atlas_plugin::{error, serve, Atlas, Methods};
use finance::book::Ledger;
use finance::load::{load, Dir, Loaded, Source};
use finance::model::*;
use finance::{budget, edit, entry, export, invest, migrate, pricefeed, prices::Prices, report, write};
use serde_json::{json, Value};
use std::path::PathBuf;

/// The vault through the core.
struct Vault(Atlas);

impl Source for Vault {
    fn files(&self, folder: &str) -> Result<Vec<String>, String> {
        let pre = format!("{}/", folder.trim_end_matches('/'));
        Ok(self.0.files(false).map_err(|e| e.to_string())?.into_iter().filter(|p| p.starts_with(&pre)).collect())
    }
    fn read(&self, path: &str) -> Result<String, String> {
        self.0.read(path).map_err(|e| e.to_string())
    }
}

fn folder(p: &Value) -> String {
    p["settings"]["folder"].as_str().filter(|s| !s.is_empty()).unwrap_or("finance").trim_matches('/').to_string()
}

fn today() -> chrono::NaiveDate {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    chrono::DateTime::from_timestamp(secs as i64, 0).map(|d| d.date_naive()).unwrap_or_default()
}

fn diag_json(d: &Diagnostic) -> Value {
    json!({ "path": &*d.path, "line": d.line, "message": d.message, "severity": if d.severity == Severity::Error { "error" } else { "warning" } })
}

fn txn_json(t: &Txn) -> Value {
    json!({
        "date": t.date.to_string(), "status": t.status.mark().to_string(), "text": t.text, "payee": t.payee, "narration": t.narration,
        "tags": t.tags, "id": t.id, "meta": t.meta.iter().map(|(k, v)| json!([k, v])).collect::<Vec<_>>(),
        "path": &*t.span.path, "line": t.span.first, "last": t.span.last,
        "postings": t.postings.iter().map(|p| json!({ "account": p.account.as_str(), "amount": p.amount.as_ref().map(write::amount) })).collect::<Vec<_>>(),
    })
}

fn amounts_json(cs: &std::collections::BTreeMap<Commodity, rust_decimal::Decimal>) -> Value {
    Value::Object(cs.iter().map(|(c, q)| (c.to_string(), Value::String(q.normalize().to_string()))).collect())
}

/// The last 13 months, newest first, each summed into its top two levels (Expenses:Food, Income:Salary).
fn months_json(months: &std::collections::BTreeMap<String, report::Balances>) -> Vec<Value> {
    months.iter().rev().take(13).map(|(m, b)| {
        let mut top: std::collections::BTreeMap<String, std::collections::BTreeMap<Commodity, rust_decimal::Decimal>> = Default::default();
        for (a, cs) in b {
            let key = a.as_str().split(':').take(2).collect::<Vec<_>>().join(":");
            for (c, q) in cs {
                *top.entry(key.clone()).or_default().entry(c.clone()).or_default() += *q;
            }
        }
        json!({ "month": m, "categories": top.iter().map(|(k, cs)| json!({ "account": k, "amounts": amounts_json(cs) })).collect::<Vec<_>>() })
    }).collect()
}

fn dec(q: rust_decimal::Decimal) -> Value {
    Value::String(q.normalize().to_string())
}

/// The commodity named by a setting or a parameter (`currency`, `unit`), else EUR.
fn unit(v: &Value) -> Commodity {
    v.as_str().and_then(|s| Commodity::parse(s.trim()).ok()).unwrap_or_else(|| Commodity::parse("EUR").expect("EUR"))
}

/// The units wealth can be measured in (Settings: "Measure in"): the display currency first, then the setting's list,
/// then every currency the ledger holds.
fn units(p: &Value, l: &Loaded) -> Vec<String> {
    let mut out = vec![unit(&p["settings"]["currency"]).to_string()];
    let listed = p["settings"]["measures"].as_str().unwrap_or("EUR, CAD, USD, XAU, BTC").split([',', ' ']).filter(|s| !s.is_empty()).map(str::to_string);
    let held = pricefeed::currencies(&l.ledger, &l.notes, &unit(&p["settings"]["currency"])).into_keys().map(|c| c.to_string());
    for u in listed.chain(held) {
        if !out.contains(&u) {
            out.push(u);
        }
    }
    out
}

/// A currency (drawn with its symbol), not an asset measured in units: three capitals, no lots, not a priced measure.
fn is_money(c: &str, l: &Loaded) -> bool {
    Commodity::parse(c).is_ok_and(|x| x.looks_like_currency() && !l.notes.is_lotted(&x) && price_config(l).ok().and_then(|cfg| cfg.measure(c).cloned()).is_none())
}

fn measure_name(c: &str, l: &Loaded) -> String {
    let c2 = Commodity::parse(c).ok();
    c2.as_ref().and_then(|c| l.notes.commodities.get(c)).and_then(|n| n.name.clone())
        .or_else(|| price_config(l).ok()?.measure(c).map(|m| m.name.clone())).unwrap_or_else(|| c.to_string())
}

/// The price sources: the plugin's data/prices.toml with the vault's finance/prices.toml over it.
fn price_config(l: &Loaded) -> Result<pricefeed::Config, String> {
    pricefeed::Config::load(l.notes.data.get("prices.toml").map(String::as_str))
}

fn budget_json(b: &budget::Budget) -> Value {
    json!({
        "currency": b.currency.as_str(), "month": b.month, "elapsed": dec(b.elapsed.round_dp(4)), "unpriced": b.unpriced,
        "lines": b.lines.iter().map(|l| json!({ "account": l.account, "spent": dec(l.spent.round_dp(2)), "usual": dec(l.usual.round_dp(2)),
            "target": l.target.map(|t| dec(t.round_dp(2))), "target_note": l.target_note, "history": l.history.iter().map(|h| dec(h.round_dp(2))).collect::<Vec<_>>() })).collect::<Vec<_>>(),
        "months": b.months.iter().map(|m| json!({ "month": m.month, "income": dec(m.income.round_dp(2)), "spent": dec(m.spent.round_dp(2)), "unknown_out": dec(m.unknown_out.round_dp(2)),
            "unknown_in": dec(m.unknown_in.round_dp(2)), "rate": m.rate().map(|r| dec(r.round_dp(4))), "rate_all": m.rate_all().map(|r| dec(r.round_dp(4))) })).collect::<Vec<_>>(),
        "recurring": b.recurring.iter().map(|r| json!({ "payee": r.payee, "account": r.account, "period": r.period.word(), "amount": dec(r.amount), "per_month": dec(r.per_month),
            "count": r.count, "last": r.last.to_string(), "next": r.next.to_string(), "path": r.path, "line": r.line })).collect::<Vec<_>>(),
    })
}

fn wealth_json(l: &Loaded, prices: &Prices, u: &Commodity) -> Value {
    let until = l.ledger.txns.last().map_or(today(), |b| b.txn.date).max(today());
    let w = report::wealth(&l.ledger, prices, u, until);
    json!(w.iter().map(|m| json!({ "month": m.month, "total": dec(m.total.round_dp(if u.looks_like_currency() { 2 } else { 6 })),
        "by": m.by.iter().map(|(c, v)| (c.to_string(), dec(*v))).collect::<serde_json::Map<_, _>>(), "unpriced": m.unpriced.iter().map(|c| c.as_str()).collect::<Vec<_>>() })).collect::<Vec<_>>())
}

fn invest_json(l: &Loaded, prices: &Prices, cur: &Commodity) -> Value {
    let pf = invest::portfolio(&l.ledger, &l.notes, prices, cur, today());
    let fx = report::currencies(&l.ledger, &l.notes, prices, cur, today());
    let opt = |q: Option<rust_decimal::Decimal>| q.map(dec);
    json!({
        "currency": cur.as_str(), "xirr": pf.xirr,
        "holdings": pf.holdings.iter().map(|h| json!({ "account": h.account.as_str(), "commodity": h.commodity.as_str(), "name": h.name, "note": h.note,
            "units": dec(h.units), "cost": opt(h.cost), "value": opt(h.value), "gain": opt(h.gain()), "price": h.price.map(|(d, p)| json!({ "date": d.to_string(), "price": dec(p.round_dp(6)) })),
            "lots": h.lots.iter().map(|x| json!({ "date": x.date.to_string(), "units": dec(x.units), "cost": x.cost.as_ref().map(write::amount) })).collect::<Vec<_>>() })).collect::<Vec<_>>(),
        "realised": pf.realised.iter().map(|(y, g)| json!({ "year": y, "gain": dec(g.round_dp(2)) })).collect::<Vec<_>>(),
        "allocation": pf.allocation.iter().map(|(k, v)| (k.clone(), dec(*v))).collect::<serde_json::Map<_, _>>(),
        "currencies": fx.iter().map(|h| json!({ "currency": h.currency.as_str(), "amount": dec(h.amount), "value": opt(h.value), "rate": opt(h.rate.map(|r| r.round_dp(6))),
            "fx_gain": opt(h.fx_gain), "history": h.history.iter().map(|(m, r)| json!([m, dec(r.round_dp(6))])).collect::<Vec<_>>() })).collect::<Vec<_>>(),
        "prices": prices.latest().map(|(b, q, d, p)| json!({ "base": b.as_str(), "quote": q.as_str(), "date": d.to_string(), "price": dec(p.round_dp(6)) })).collect::<Vec<_>>(),
    })
}

fn summary(l: &Loaded) -> Value {
    summary_in(l, &json!({}))
}

fn summary_in(l: &Loaded, p: &Value) -> Value {
    let led: &Ledger = &l.ledger;
    let prices = Prices::new(led);
    let cur = unit(&p["settings"]["currency"]);
    let measure = if p["unit"].is_string() { unit(&p["unit"]) } else { cur.clone() };
    let baseline = p["settings"]["baseline_months"].as_u64().unwrap_or(6).clamp(1, 36) as usize;
    let bal = report::balances(led, None);
    let accounts: Vec<Value> = l.notes.accounts.values().map(|n| {
        let b = bal.get(&n.account).cloned().unwrap_or_default();
        json!({ "account": n.account.as_str(), "note": &*n.path, "closed": n.closed.map(|d| d.to_string()),
                "balances": amounts_json(&b) })
    }).collect();
    let spending = months_json(&report::monthly(led, Root::Expenses));
    let income = months_json(&report::monthly(led, Root::Income));
    let mut known: std::collections::BTreeSet<&str> = led.txns.iter().flat_map(|b| b.postings.iter().map(|p| p.account.as_str())).collect();
    known.extend(l.notes.accounts.keys().map(|a| a.as_str()));
    let errors = led.diags.iter().filter(|d| d.severity == Severity::Error).count();
    json!({
        "accounts": accounts,
        "review": led.txns.iter().filter(|b| b.txn.status == Status::Review).count(),
        "transactions": led.txns.len(),
        "months": spending,
        "income": income,
        "net_worth": wealth_json(l, &prices, &measure),
        "unit": measure.as_str(),
        "units": units(p, l).iter().map(|u| json!({ "unit": u, "name": measure_name(u, l), "money": is_money(u, l) })).collect::<Vec<_>>(),
        "budget": budget_json(&budget::budget(led, &l.notes, &prices, &cur, baseline, today())),
        "sources": l.notes.sources.iter().map(|s| json!({ "path": &*s.path, "bank": s.bank, "country": s.country, "until": s.until.map(|d| d.to_string()),
            "synced": s.synced.map(|d| d.to_string()), "accounts": s.accounts.iter().map(|a| json!({ "iban": a.1, "name": a.2 })).collect::<Vec<_>>(), "error": s.error })).collect::<Vec<_>>(),
        "known": known,
        "errors": errors,
        "warnings": led.diags.len() - errors,
        "first_use": led.first_use.iter().map(|(a, s)| json!({ "account": a.as_str(), "path": &*s.path, "line": s.first })).collect::<Vec<_>>(),
    })
}

fn register_json(l: &Ledger, account: &str) -> Value {
    let rows: Vec<Value> = report::register(l, account).iter().map(|r| json!({
        "date": r.txn.date.to_string(), "status": r.txn.status.mark().to_string(), "payee": r.txn.payee, "narration": r.txn.narration,
        "account": r.account.as_str(), "amount": write::amount(r.amount), "running": r.running.normalize().to_string(),
        "path": &*r.txn.span.path, "line": r.txn.span.first,
    })).collect();
    json!({ "account": account, "rows": rows })
}

/// The statements inbox: a dry run (the report and counts) or, with `write`, the import itself. The originals are read
/// from this machine's copy of the vault (ATLAS_ROOT: the helper runs beside it); everything written, the archives'
/// bytes too, goes through the core, so the index, open tabs and the mirror follow.
fn import_run(p: &Value, write: bool) -> Result<Value, atlas_plugin::Error> {
    let folder = folder(p);
    let root = PathBuf::from(std::env::var("ATLAS_ROOT").map_err(|_| error("ATLAS_ROOT is not set"))?);
    let atlas = Atlas::new();
    let vault = Vault(Atlas::new());
    let inbox = format!("{folder}/statements/inbox/");
    let mut paths: Vec<String> = vault.files(&folder).map_err(error)?.into_iter().filter(|f| f.starts_with(&inbox)).collect();
    paths.sort();
    let inputs = paths.iter().map(|f| Ok(finance::statement::batch::Input { path: f.clone(), bytes: std::fs::read(root.join(f)).map_err(|e| error(format!("{f}: {e}")))? }))
        .collect::<Result<Vec<_>, atlas_plugin::Error>>()?;
    let loaded = load(&vault, &folder).map_err(error)?;
    let out = finance::statement::batch::run(&vault, &|rel| std::fs::read(root.join(rel)).ok(), &loaded, &folder, inputs, &finance::statement::pdf::text, today());
    let write = write && out.errors.is_empty();
    if write {
        for (path, text) in &out.texts {
            atlas.write(path, text)?;
        }
        for (path, bytes) in &out.archives {
            atlas.write_bytes(path, bytes)?;
        }
        for f in &out.consumed {
            atlas.post(&format!("/api/fs/trash?path={}", atlas_plugin::q(f)), &json!({}))?;
        }
    }
    Ok(json!({ "files": paths, "report": out.report, "new": out.new, "errors": out.errors, "written": write, "statements": out.lines, "notes": out.consumed.len() }))
}

/// Enable Banking (bank.rs) through the core's fetch, every request signed with the application's key (the secret
/// `enable_banking_key`, its id in Settings).
fn bank_call(p: &Value, r: &finance::bank::Request) -> Result<Value, atlas_plugin::Error> {
    let app = p["settings"]["bank_app_id"].as_str().filter(|s| !s.is_empty()).ok_or_else(|| error("Enable Banking: set the application id in Settings → Finance"))?;
    let key = p["secrets"]["enable_banking_key"].as_str().map(str::to_string).or_else(|| Atlas::new().secret("enable_banking_key").ok().flatten())
        .ok_or_else(|| error("Enable Banking: the application's private key is not set (Finance → Sources → key)"))?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let jwt = finance::bank::jwt(app, &key, now).map_err(error)?;
    let mut req = json!({ "url": r.url, "method": r.method, "headers": { "authorization": format!("Bearer {jwt}"), "content-type": "application/json", "accept": "application/json" }, "timeout_secs": 60 });
    if let Some(b) = &r.body {
        req["body"] = json!(b.to_string());
    }
    let a = Atlas::new().post("/api/plugins/finance/fetch", &req)?;
    let text = a["text"].as_str().unwrap_or_default();
    let v: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    match a["status"].as_u64() {
        Some(200..=299) => Ok(v),
        s => Err(error(format!("Enable Banking answered {}: {}", s.map_or("nothing".into(), |s| s.to_string()), v["message"].as_str().or(v["detail"].as_str()).unwrap_or(text)))),
    }
}

/// The connected accounts no ledger account names (by IBAN, or by `uid` in its `bank-uid`): the pane asks which they are.
fn unlinked(l: &Loaded, accounts: &[finance::bank::Linked]) -> Vec<Value> {
    accounts.iter().filter(|a| {
        let id = a.iban.as_deref().filter(|i| !i.is_empty()).unwrap_or(&a.uid);
        !matches!(finance::statement::account_named(id, &Default::default(), &l.notes, a.currency.as_deref().and_then(|c| Commodity::parse(c).ok()).as_ref()), Ok(Some(_)))
    }).map(|a| json!({ "uid": a.uid, "iban": a.iban, "name": a.name, "currency": a.currency })).collect()
}

/// The transaction the pane names by its place and its header as drawn (`path`, `line`, `text`): a moved or edited
/// one is refused rather than guessed.
fn txn_at<'a>(l: &'a Loaded, p: &Value) -> Result<&'a Txn, atlas_plugin::Error> {
    let (path, line) = (p["path"].as_str().unwrap_or_default(), p["line"].as_u64().unwrap_or(0) as usize);
    l.ledger.txns.iter().map(|b| &b.txn).find(|t| &*t.span.path == path && t.span.first == line && Some(t.text.as_str()) == p["text"].as_str())
        .ok_or_else(|| error(format!("{path}:{line} changed since the pane read it: reload")))
}

/// Writes `text` to `path` only when the books read with it have no error they did not have before.
fn guarded_write(p: &Value, l: &Loaded, path: &str, text: &str) -> Result<(), atlas_plugin::Error> {
    let base = Vault(Atlas::new());
    let after = load(&finance::load::Overlay { base: &base, path: path.to_string(), text: text.to_string() }, &folder(p)).map_err(error)?;
    let new = entry::new_errors(&l.ledger.diags, &after.ledger.diags);
    if !new.is_empty() {
        return Err(error(format!("not written, it would make the books wrong: {}", new.join("; "))));
    }
    Atlas::new().write(path, text)
}

fn bank_config(l: &Loaded) -> Result<finance::bank::Config, atlas_plugin::Error> {
    finance::bank::Config::load(l.notes.data.get("enable-banking.toml").map(String::as_str)).map_err(error)
}

/// One connection's sync: every linked account from the last day read (less a week, for late bookings) or the first
/// span, as one CSV into the inbox. Answers the rows written; a failure is written into the note and returned.
fn bank_sync_one(p: &Value, l: &Loaded, s: &finance::notes::SourceNote) -> Result<usize, String> {
    let cfg = bank_config(l).map_err(|e| e.why)?;
    let from = s.synced.map_or(today() - chrono::Duration::days(cfg.first_days), |d| d - chrono::Duration::days(7));
    let mut rows = vec![];
    for (uid, iban, _) in &s.accounts {
        let id = if iban.is_empty() { uid } else { iban }; // what the statement names it by (account_named)
        let mut key: Option<String> = None;
        for _ in 0..200 {
            let v = bank_call(p, &finance::bank::transactions(&cfg, uid, from, key.as_deref())).map_err(|e| e.why)?;
            let (mut r, next) = finance::bank::rows(&v, id);
            rows.append(&mut r);
            key = next;
            if key.is_none() {
                break;
            }
        }
    }
    if !rows.is_empty() {
        let path = format!("{}/statements/inbox/enable-banking {} {}.csv", folder(p), s.bank, today());
        Atlas::new().write(&path, &finance::bank::csv(&rows)).map_err(|e| e.why)?;
    }
    Ok(rows.len())
}

/// The banks' own sites (data/banks.toml, or the vault's finance/banks.toml instead).
fn banks_list(l: &Loaded) -> Result<Value, atlas_plugin::Error> {
    let text = l.notes.data.get("banks.toml").map(String::as_str).unwrap_or(include_str!("../../data/banks.toml"));
    let t: toml::Table = text.parse().map_err(|e| error(format!("banks.toml: {e}")))?;
    serde_json::to_value(t.get("bank").cloned().unwrap_or(toml::Value::Array(vec![]))).map_err(|e| error(e.to_string()))
}

/// The downloads folder on the machine running the core (Settings → Downloads folder, else ~/Downloads).
fn downloads_dir(p: &Value) -> PathBuf {
    expand(p["settings"]["downloads"].as_str().filter(|s| !s.is_empty()).unwrap_or("~/Downloads"))
}

/// Files in the downloads folder changed since `since` (Unix seconds) that a preset recognises are moved into the
/// statements inbox: what "Fetch from the bank's site" waits for while the user downloads in their browser.
fn take_downloads(p: &Value) -> Result<Value, atlas_plugin::Error> {
    let folder_name = folder(p);
    let dir = downloads_dir(p);
    let since = std::time::UNIX_EPOCH + std::time::Duration::from_secs(p["since"].as_u64().unwrap_or(0));
    let vault = Vault(Atlas::new());
    let files = vault.files(&folder_name).map_err(error)?;
    let preset_files: Vec<(String, String)> = files.iter().filter(|f| f.starts_with(&format!("{folder_name}/importers/")) && f.ends_with(".toml"))
        .filter_map(|f| Some((f.clone(), vault.read(f).ok()?))).collect();
    let (presets, _) = finance::statement::preset::presets(&preset_files);
    let mut taken = vec![];
    let mut ignored = vec![];
    for e in std::fs::read_dir(&dir).map_err(|e| error(format!("{}: {e}", dir.display())))?.flatten() {
        let path = e.path();
        let Ok(meta) = e.metadata() else { continue };
        if !meta.is_file() || meta.modified().map_or(true, |m| m < since) || path.extension().is_some_and(|x| x == "part" || x == "crdownload") {
            continue;
        }
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let bytes = std::fs::read(&path).map_err(|e| error(format!("{name}: {e}")))?;
        match finance::statement::detect(&presets, &bytes, &finance::statement::pdf::text).first() {
            Some(preset) => {
                let rel = format!("{folder_name}/statements/inbox/{name}");
                Atlas::new().write_bytes(&rel, &bytes)?;
                std::fs::remove_file(&path).map_err(|e| error(format!("{name}: {e}")))?;
                taken.push(json!({ "name": name, "preset": preset.name }));
            }
            None => ignored.push(name),
        }
    }
    Ok(json!({ "taken": taken, "ignored": ignored, "folder": dir.to_string_lossy() }))
}

fn serve_plugin() {
    let mut m = Methods::new();
    let vault_load = |p: &Value| load(&Vault(Atlas::new()), &folder(p)).map_err(error);
    m.add("check", move |p| {
        let l = vault_load(&p)?;
        Ok(json!({ "diagnostics": l.ledger.diags.iter().map(diag_json).collect::<Vec<_>>() }))
    });
    m.add("summary", move |p| Ok(summary_in(&vault_load(&p)?, &p)));
    // The classifier (rules.md, the history, the vocabulary) over what is still uncategorised: the sure guesses are
    // filed with `write`; every guess comes back with its reason, the doubtful ones for the user to answer.
    m.add("categorize", move |p| {
        let l = vault_load(&p)?;
        let c = finance::classify::Classifier::new(&l.ledger, &l.notes);
        let (all, sure) = guesses(&l, &c, p["shared"].as_bool() == Some(true));
        let atlas = Atlas::new();
        let (files, problems) = finance::rules::apply(&l.ledger, &sure, &|path| atlas.read(path).map_err(|e| e.to_string()));
        let write = p["write"].as_bool() == Some(true);
        if write {
            for (path, text) in &files {
                atlas.write(path, text)?;
            }
        }
        Ok(json!({ "filed": sure.len(), "asked": all.len() - sure.len(), "written": write, "problems": problems,
                   "guesses": all.iter().map(|(i, g)| { let t = &l.ledger.txns[*i].txn; json!({ "payee": t.payee, "date": t.date.to_string(), "path": &*t.span.path, "line": t.span.first,
                       "to": g.as_ref().map(|g| g.account.as_str()), "sure": g.as_ref().is_some_and(|g| g.sure()), "confidence": g.as_ref().map(|g| g.confidence), "why": g.as_ref().map(|g| g.reason()) }) }).collect::<Vec<_>>() }))
    });
    // Capture (capture.rs): `parse` is the live helper's line, `add` writes the `!` transaction, `capture` is the hook
    // after every capture from any door — it answers `skipped` for a thought that is not money.
    let captured = |p: &Value, l: &Loaded| -> Result<Option<finance::capture::Captured>, atlas_plugin::Error> {
        let voc = finance::capture::Vocabulary::load(l.notes.data.get("capture.toml").map(String::as_str)).map_err(error)?;
        let account = Account::parse(p["settings"]["capture_account"].as_str().filter(|s| !s.is_empty()).unwrap_or("Assets:Cash")).map_err(error)?;
        Ok(finance::capture::read(p["text"].as_str().unwrap_or_default(), &l.ledger, &l.notes, &voc, &account, today()))
    };
    let write_capture = move |p: &Value, c: &finance::capture::Captured| -> Result<String, atlas_plugin::Error> {
        let atlas = Atlas::new();
        let path = format!("{}/journal/{}.fin", folder(p), chrono::Datelike::year(&c.date));
        let link = p["path"].as_str().filter(|s| !s.is_empty()).map(|s| s.trim_end_matches(".md").to_string());
        let text = c.txn(p["text"].as_str().unwrap_or_default().trim(), link.as_deref());
        let (mut j, mut d) = (Journal::default(), vec![]);
        finance::parse::parse_file(&path, &text, &mut j, &mut d);
        let t = j.txns.first().filter(|_| d.is_empty()).ok_or_else(|| error(format!("the capture would not parse: {d:?}")))?;
        let old = atlas.read(&path).unwrap_or_default();
        atlas.write(&path, &write::append(&old, t))?;
        Ok(path)
    };
    m.add("parse", move |p| {
        let l = vault_load(&p)?;
        Ok(match captured(&p, &l)? {
            Some(c) => json!({ "hint": c.hint(), "why": c.why, "sure": c.sure, "date": c.date.to_string(), "amount": write::amount(&c.amount), "account": c.account.as_str(), "category": c.category.as_str(), "payee": c.payee }),
            None => json!({ "skipped": "not money: an amount with a currency, an account's name, or a leading +" }),
        })
    });
    m.add("add", move |p| {
        let l = vault_load(&p)?;
        let c = captured(&p, &l)?.ok_or_else(|| error("this does not read as money: write an amount with a currency or an account (\"12,40 café revolut\")"))?;
        let path = write_capture(&p, &c)?;
        Ok(json!({ "path": path, "hint": c.hint() }))
    });
    m.add("capture", move |p| {
        if p.pointer("/settings/on_capture").and_then(Value::as_bool) == Some(false) {
            return Ok(json!({ "skipped": "switched off in the finance settings" }));
        }
        let l = vault_load(&p)?;
        let Some(c) = captured(&p, &l)? else { return Ok(json!({ "skipped": "not money" })) };
        let path = write_capture(&p, &c)?;
        Ok(json!({ "path": path.trim_end_matches(".fin"), "notice": format!("Finance: {} (in Review)", c.hint().trim_start_matches("→ ")) }))
    });
    m.add("budget", move |p| {
        let l = vault_load(&p)?;
        let baseline = p["settings"]["baseline_months"].as_u64().unwrap_or(6).clamp(1, 36) as usize;
        Ok(budget_json(&budget::budget(&l.ledger, &l.notes, &Prices::new(&l.ledger), &unit(&p["settings"]["currency"]), baseline, today())))
    });
    m.add("wealth", move |p| {
        let l = vault_load(&p)?;
        let u = if p["unit"].is_string() { unit(&p["unit"]) } else { unit(&p["settings"]["currency"]) };
        Ok(json!({ "unit": u.as_str(), "name": measure_name(u.as_str(), &l), "money": is_money(u.as_str(), &l), "months": wealth_json(&l, &Prices::new(&l.ledger), &u) }))
    });
    m.add("invest", move |p| {
        let l = vault_load(&p)?;
        Ok(invest_json(&l, &Prices::new(&l.ledger), &unit(&p["settings"]["currency"])))
    });
    // Prices and FX (pricefeed.rs), fetched through the core (only the hosts in [permissions] net). The schedule calls
    // it with {}: it writes; the pane's "Check" passes `dry`.
    m.add("prices", move |p| {
        let l = vault_load(&p)?;
        let folder = folder(&p);
        let atlas = Atlas::new();
        let l2 = units(&p, &l).into_iter().filter_map(|u| Commodity::parse(&u).ok()).collect::<Vec<_>>();
        let cfg = price_config(&l).map_err(error)?;
        let u = pricefeed::update(&cfg, &l.ledger, &l.notes, &pricefeed::Want { folder: &folder, measures: &l2, today: today() }, &|path| atlas.read(path).ok(), &mut |url| {
            let r = atlas.post("/api/plugins/finance/fetch", &json!({ "url": url, "headers": { "user-agent": "Mozilla/5.0 (Atlas finance)" }, "timeout_secs": 30 })).map_err(|e| e.to_string())?;
            match r["status"].as_u64() {
                Some(200) => Ok(r["text"].as_str().unwrap_or_default().to_string()),
                s => Err(format!("{} answered {}", url.split('/').nth(2).unwrap_or(url), s.map_or("nothing".into(), |s| s.to_string()))),
            }
        });
        let write = p["dry"].as_bool() != Some(true);
        if write {
            for (path, text) in &u.files {
                atlas.write(path, text)?;
            }
        }
        let summary = format!("{} price files {}, {} problems", u.files.len(), if write { "written" } else { "to write" }, u.errors.len());
        Ok(json!({ "summary": summary, "files": u.files.iter().map(|f| &f.0).collect::<Vec<_>>(), "log": u.log, "errors": u.errors, "written": write }))
    });
    // A target pinned on a category (DESIGN-finance "Budget"): its note's `target:` set, or the note made. An empty
    // target unpins it.
    m.add("set_target", move |p| {
        let account = Account::parse(p["account"].as_str().unwrap_or_default()).map_err(error)?;
        let target = p["target"].as_str().unwrap_or_default().trim().to_string();
        if !target.is_empty() {
            finance::parse::parse_amount(&target).map_err(|e| error(format!("{target}: {e}")))?;
        }
        let l = vault_load(&p)?;
        let atlas = Atlas::new();
        let (path, text) = match l.notes.categories.get(&account) {
            Some(n) => (n.path.to_string(), atlas.read(&n.path)?),
            None => (format!("{}/categories/{}.md", folder(&p), account.as_str().split(':').skip(1).collect::<Vec<_>>().join(" ")),
                     format!("---\ntype: finance-category\naccount: {account}\n---\n\n# {}\n", account.as_str().rsplit(':').next().unwrap_or_default())),
        };
        let out = finance::notes::set_property(&text, "target", (!target.is_empty()).then_some(target.as_str()));
        atlas.write(&path, &out)?;
        Ok(json!({ "path": path }))
    });
    m.add("register", move |p| {
        let l = vault_load(&p)?;
        Ok(register_json(&l.ledger, p["account"].as_str().unwrap_or("Assets")))
    });
    m.add("review", move |p| {
        let l = vault_load(&p)?;
        // Each one still in Unknown carries the classifier's guess and why: Review preselects it.
        let c = finance::classify::Classifier::new(&l.ledger, &l.notes);
        let unknown = Account::parse("Expenses:Unknown").map_err(error)?;
        Ok(json!({ "transactions": l.ledger.txns.iter().filter(|b| b.txn.status == Status::Review).map(|b| {
            let mut v = txn_json(&b.txn);
            if b.txn.postings.iter().any(|p| p.account == unknown) {
                v["guess"] = c.guess_txn(&b.txn).filter(|g| g.account != unknown).map_or(Value::Null, |g| json!({ "to": g.account.as_str(), "why": g.reason(), "sure": g.sure() }));
            }
            v
        }).collect::<Vec<_>>() }))
    });
    // Review settled in one go (rules::settle): a dry run counts, `write` writes; the guesses come back with their reasons.
    m.add("settle", move |p| {
        let l = vault_load(&p)?;
        let c = finance::classify::Classifier::new(&l.ledger, &l.notes);
        let found = finance::rules::settle(&l.ledger, &c);
        let guessed: Vec<Value> = found.iter().filter_map(|(i, _, g)| g.as_ref().map(|g| {
            let t = &l.ledger.txns[*i].txn;
            json!({ "date": t.date.to_string(), "payee": t.payee, "to": g.account.as_str(), "why": g.reason() })
        })).collect();
        let waiting = l.ledger.txns.iter().filter(|b| b.txn.status == Status::Review).count();
        let edits: Vec<_> = found.into_iter().map(|(i, e, _)| (i, e)).collect();
        let atlas = Atlas::new();
        let (files, problems) = finance::rules::apply(&l.ledger, &edits, &|path| atlas.read(path).map_err(|e| e.to_string()));
        let write = p["write"].as_bool() == Some(true);
        if write {
            for (path, text) in &files {
                atlas.write(path, text)?;
            }
        }
        Ok(json!({ "settled": edits.len(), "left": waiting - edits.len(), "guessed": guessed, "written": write, "problems": problems }))
    });
    // The Transactions tab: every transaction, newest first, each leg also in the display currency (`v`, at its day's
    // price; null when unpriced) so the pane sums flows, categories and payees without asking again.
    m.add("transactions", move |p| {
        let l = vault_load(&p)?;
        let prices = Prices::new(&l.ledger);
        let cur = unit(&p["settings"]["currency"]);
        let rows: Vec<Value> = l.ledger.txns.iter().rev().map(|b| {
            let mut v = txn_json(&b.txn);
            v["legs"] = json!(b.postings.iter().map(|x| json!({ "account": x.account.as_str(), "amount": write::amount(&x.units),
                "v": prices.convert(x.units.qty, &x.units.commodity, &cur, Some(b.txn.date)).map(|q| dec(q.round_dp(2))) })).collect::<Vec<_>>());
            v
        }).collect();
        Ok(json!({ "currency": cur.as_str(), "transactions": rows }))
    });
    // A whole transaction from the editor: a new one (no `path`) or in place of the one at `path`:`line` whose header
    // still reads `text`. Written only when the books gain no error from it (an unbalanced edit, a broken assertion).
    m.add("txn_save", move |p| {
        let l = vault_load(&p)?;
        let draft = entry::Draft::from_json(&p["draft"]).map_err(error)?;
        let atlas = Atlas::new();
        let (path, text) = match p["path"].as_str() {
            Some(path) => {
                let t = txn_at(&l, &p)?;
                let file = atlas.read(path)?;
                let old = entry::lines_of(&file, t).ok_or_else(|| error(format!("{path}:{} is no longer in the file", t.span.first)))?;
                (path.to_string(), write::replace(&file, &t.span, &old, &entry::render(Some(t), &draft)).map_err(error)?)
            }
            None => {
                let path = entry::file_for(&folder(&p), draft.date);
                let file = atlas.read(&path).unwrap_or_default();
                let mut out = file.trim_end_matches('\n').to_string();
                if !out.is_empty() { out.push_str("\n\n"); }
                out.push_str(&entry::render(None, &draft));
                (path, out)
            }
        };
        guarded_write(&p, &l, &path, &text)?;
        Ok(json!({ "path": path }))
    });
    // Removes one transaction (the pane offers Undo: `txn_restore` with the `removed` text).
    m.add("txn_delete", move |p| {
        let l = vault_load(&p)?;
        let t = txn_at(&l, &p)?;
        let atlas = Atlas::new();
        let file = atlas.read(&t.span.path)?;
        let old = entry::lines_of(&file, t).ok_or_else(|| error("no longer in the file"))?;
        let out = entry::remove(&file, t, &old).map_err(error)?;
        guarded_write(&p, &l, &t.span.path, &out)?;
        Ok(json!({ "path": &*t.span.path, "removed": old }))
    });
    m.add("txn_restore", move |p| {
        let l = vault_load(&p)?;
        let path = p["path"].as_str().ok_or_else(|| error("which file?"))?;
        let text = p["text"].as_str().filter(|t| !t.trim().is_empty()).ok_or_else(|| error("nothing to restore"))?;
        let file = Atlas::new().read(path).unwrap_or_default();
        let out = format!("{}\n\n{}", file.trim_end_matches('\n'), text.trim_end_matches('\n')) + "\n";
        guarded_write(&p, &l, path, &out)?;
        Ok(json!({ "path": path }))
    });
    m.add("review_edit", move |p| {
        let (path, line) = (p["path"].as_str().unwrap_or_default(), p["line"].as_u64().unwrap_or(0) as usize);
        let account = |k: &str| p[k].as_str().map(Account::parse).transpose().map_err(error);
        let edit = edit::Edit {
            mark: (p["accept"].as_bool() == Some(true)).then_some(Status::Accepted),
            recategorize: match (account("from")?, account("to")?) { (Some(f), Some(t)) if p["split"].is_null() => Some((f, t)), _ => None },
            // [[account, "900.00 EUR"], [account, null]]: the `from` posting split into these.
            split: match (account("from")?, p["split"].as_array()) {
                (Some(f), Some(parts)) => Some((f, parts.iter().map(|x| {
                    let a = Account::parse(x[0].as_str().unwrap_or_default()).map_err(error)?;
                    let q = x[1].as_str().map(finance::parse::parse_amount).transpose().map_err(error)?;
                    Ok(q.map_or(edit::Part::Rest(a.clone()), |q| edit::Part::Amount(a, q)))
                }).collect::<Result<Vec<_>, atlas_plugin::Error>>()?)),
                _ => None,
            },
        };
        let l = vault_load(&p)?;
        // The pane names the transaction by its place and its header as drawn: a moved or edited one is refused.
        let t = l.ledger.txns.iter().map(|b| &b.txn).find(|t| &*t.span.path == path && t.span.first == line && Some(t.text.as_str()) == p["text"].as_str())
            .ok_or_else(|| error(format!("{path}:{line} changed since the pane read it: reload")))?;
        let atlas = Atlas::new();
        let out = edit::apply(&atlas.read(path)?, t, &edit).map_err(error)?;
        atlas.write(path, &out)?;
        Ok(json!({ "path": path, "line": line }))
    });
    // The statements inbox: a dry run (the report and counts) or, with `write`, the import itself. Binary files (the
    // originals, the archives) are read and written on this machine's copy of the vault (ATLAS_ROOT): the helper runs
    // beside the vault; text goes through the core so open tabs and the mirror follow.
    m.add("import", move |p| import_run(&p, p["write"].as_bool() == Some(true)));
    // Enable Banking (DESIGN-finance, revised: on the server). `bank_list` the banks of a country; `bank_connect` asks a
    // consent (the answer's url is the bank's page); `bank_finish` takes the address the bank came back to and writes
    // the connection's note; `bank_sync` (scheduled, ≤ 4 a day) reads every connection into the inbox and imports.
    m.add("bank_list", move |p| {
        let l = vault_load(&p)?;
        let v = bank_call(&p, &finance::bank::banks(&bank_config(&l)?, p["country"].as_str().unwrap_or("ES")))?;
        Ok(json!({ "banks": v["aspsps"].as_array().cloned().unwrap_or_default().iter().map(|a| json!({ "name": a["name"], "country": a["country"], "logo": a["logo"], "days": a["maximum_consent_validity"] })).collect::<Vec<_>>() }))
    });
    m.add("bank_connect", move |p| {
        let l = vault_load(&p)?;
        let cfg = bank_config(&l)?;
        let redirect = p["settings"]["bank_redirect"].as_str().filter(|s| !s.is_empty()).ok_or_else(|| error("Enable Banking: set the redirect address in Settings → Finance (the one registered with your application)"))?;
        let bank = p["bank"].as_str().ok_or_else(|| error("which bank?"))?;
        let country = p["country"].as_str().unwrap_or("ES");
        let until = today() + chrono::Duration::days(cfg.consent_days);
        let v = bank_call(&p, &finance::bank::auth(&cfg, bank, country, redirect, &format!("{bank}|{country}"), until))?;
        Ok(json!({ "url": v["url"], "bank": bank, "country": country }))
    });
    // The code is single-use: the note (the accounts, all a sync needs) is written the moment it became a session,
    // before anything else can fail. The bank and country come from the address's `state` when the pane forgot them.
    m.add("bank_finish", move |p| {
        let l = vault_load(&p)?;
        let cfg = bank_config(&l)?;
        let address = p["address"].as_str().unwrap_or_default();
        let code = finance::bank::code_of(address).ok_or_else(|| error("that address has no code= (the bank's page ends on your redirect address with ?code=…)"))?;
        let state = finance::bank::state_of(address);
        let bank = p["bank"].as_str().map(str::to_string).or_else(|| state.clone().map(|s| s.0)).unwrap_or_else(|| "Bank".into());
        let country = p["country"].as_str().map(str::to_string).or_else(|| state.map(|s| s.1)).unwrap_or_else(|| "ES".into());
        let path = format!("{}/sources/{bank}.md", folder(&p));
        let v = bank_call(&p, &finance::bank::session(&cfg, &code)).map_err(|e| {
            if !finance::bank::code_spent(&e.why) {
                return e;
            }
            let made = l.notes.sources.iter().any(|s| s.bank == bank && !s.accounts.is_empty());
            error(format!("{bank}: this answer from the bank was already used (a code works once){}", if made { " — its connection is in Sources already" } else { "; connect again for a new one" }))
        })?;
        let (session, accounts, until) = finance::bank::session_of(&v).map_err(error)?;
        let note = finance::notes::SourceNote {
            path: path.as_str().into(), bank: bank.clone(), country, session: Some(session),
            until: until.as_deref().and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()), synced: None,
            accounts: accounts.iter().map(|a| (a.uid.clone(), a.iban.clone().unwrap_or_default(), a.name.clone().unwrap_or_default())).collect(),
            error: None,
        };
        Atlas::new().write(&path, &finance::bank::source_note(&note))?;
        Ok(json!({ "path": path, "bank": bank, "accounts": accounts.len(), "until": until, "unlinked": unlinked(&l, &accounts) }))
    });
    // `bank_link`: the ledger account a connected account is (its `uid` added to that note's `bank-uid`), for one the
    // finish could not match by IBAN — a pocket in another currency, an account the bank gives no IBAN.
    m.add("bank_link", move |p| {
        let account = Account::parse(p["account"].as_str().unwrap_or_default()).map_err(error)?;
        let uid = p["uid"].as_str().filter(|u| !u.is_empty()).ok_or_else(|| error("which connected account (uid)?"))?;
        let l = vault_load(&p)?;
        let n = l.notes.accounts.get(&account).ok_or_else(|| error(format!("{account} has no account note")))?;
        let atlas = Atlas::new();
        let text = atlas.read(&n.path)?;
        // the sync names an account by its IBAN when the bank gives one, by its uid otherwise: the note lists both
        let iban = l.notes.sources.iter().flat_map(|s| &s.accounts).find(|a| a.0 == uid).map(|a| a.1.clone()).filter(|i| !i.is_empty());
        let mut out = text;
        for (key, value) in [("bank-uid", Some(uid.to_string())), ("iban", iban)] {
            let Some(value) = value else { continue };
            let mut list = finance::notes::property_list(&out, key);
            if !list.iter().any(|x| x.replace(' ', "") == value.replace(' ', "")) {
                list.push(value);
            }
            out = finance::notes::set_property(&out, key, Some(&format!("[{}]", list.iter().map(|u| format!("{u:?}")).collect::<Vec<_>>().join(", "))));
        }
        atlas.write(&n.path, &out)?;
        Ok(json!({ "path": n.path.to_string() }))
    });
    m.add("bank_sync", move |p| {
        let l = vault_load(&p)?;
        let atlas = Atlas::new();
        let mut said = vec![];
        let mut rows = 0;
        for s in l.notes.sources.iter().filter(|s| !s.accounts.is_empty()) {
            if s.until.is_some_and(|u| u < today()) {
                said.push(format!("{}: the consent ended on {} (renew it in Finance → Sources)", s.bank, s.until.unwrap()));
                continue;
            }
            let (synced, err) = match bank_sync_one(&p, &l, s) {
                Ok(n) => { rows += n; said.push(format!("{}: {n} transactions read", s.bank)); (Some(today().to_string()), None) }
                Err(e) => { said.push(format!("{}: {e}", s.bank)); (s.synced.map(|d| d.to_string()), Some(e)) }
            };
            let synced = synced.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());
            atlas.write(&s.path, &finance::bank::source_note(&finance::notes::SourceNote { synced, error: err, ..s.clone() }))?;
        }
        if l.notes.sources.is_empty() {
            return Ok(json!({ "skipped": "no bank connected (Finance → Sources)" }));
        }
        let imported = if rows > 0 { import_run(&p, true)? } else { json!({ "new": 0 }) };
        Ok(json!({ "summary": format!("{}; {} new transactions", said.join("; "), imported["new"]), "said": said, "import": imported }))
    });
    // `downloads`: the folder only where it exists — a server has none, so its page offers no "From the bank's site"
    m.add("banks", move |p| {
        let dir = downloads_dir(&p);
        Ok(json!({ "banks": banks_list(&vault_load(&p)?)?, "downloads": dir.is_dir().then(|| dir.display().to_string()) }))
    });
    m.add("downloads", move |p| take_downloads(&p));
    m.add("export_hledger", move |p| {
        let l = vault_load(&p)?;
        let e = export::hledger(&l.ledger, &l.notes);
        let path = format!("{}/export/hledger.journal", folder(&p));
        Atlas::new().write(&path, &e.journal)?;
        Ok(json!({ "path": path, "losses": e.losses }))
    });
    m.add("migrate_paisa", move |p| {
        let src = p["source"].as_str().ok_or_else(|| error("source: the path of Paisa's main.ledger"))?;
        let text = std::fs::read_to_string(expand(src)).map_err(|e| error(format!("{src}: {e}")))?;
        let atlas = Atlas::new();
        let mapping = atlas.read("finance/migration/paisa-mapping.md").ok().filter(|s| !s.is_empty());
        let mig = migrate::paisa::migrate(&text, mapping.as_deref(), today());
        let mut written = vec![];
        let mut kept = vec![];
        if p["write"].as_bool() == Some(true) {
            for (path, body) in &mig.files {
                // Never over a file that exists (the mapping note is the user's to edit; the report is renewed).
                let exists = atlas.read(path).map(|t| !t.is_empty()).unwrap_or(false);
                if exists && !path.ends_with("paisa-report.md") {
                    kept.push(path.clone());
                } else {
                    atlas.write(path, body)?;
                    written.push(path.clone());
                }
            }
        }
        Ok(json!({ "report": mig.report, "errors": mig.errors, "files": mig.files.iter().map(|f| &f.0).collect::<Vec<_>>(), "written": written, "kept": kept }))
    });
    serve(m);
}

/// Writes an import's files into a vault folder on disk; inputs from its inbox go to `.atlas/trash/`.
fn apply_import(vault: &std::path::Path, out: &finance::statement::batch::Output) -> Result<(), String> {
    let put = |rel: &str, b: &[u8]| -> Result<(), String> {
        let target = vault.join(rel);
        std::fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(&target, b).map_err(|e| format!("{rel}: {e}"))
    };
    for (rel, text) in &out.texts {
        put(rel, text.as_bytes())?;
        eprintln!("wrote {rel}");
    }
    for (rel, b) in &out.archives {
        put(rel, b)?;
        eprintln!("archived {rel}");
    }
    for p in &out.consumed {
        let src = PathBuf::from(p);
        if let Ok(rel) = src.strip_prefix(vault) {
            let to = vault.join(".atlas/trash").join(rel);
            std::fs::create_dir_all(to.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::rename(&src, &to).map_err(|e| format!("{p}: {e}"))?;
            eprintln!("moved {p} to the trash (it is in the archive)");
        }
    }
    Ok(())
}

fn expand(p: &str) -> PathBuf {
    match p.strip_prefix("~/") {
        Some(rest) => PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(rest),
        None => PathBuf::from(p),
    }
}

const USAGE: &str = "finance check <vault> [folder]
finance balances <vault> [folder]
finance summary <vault> [folder]             (the pane's summary as JSON)
finance export-hledger <vault> <out.journal> [folder]
finance migrate-paisa <main.ledger> <vault> [--write]   (a dry run without --write; never overwrites a file)
finance import <vault> [file…] [--write]     (the files, or the vault's statements/inbox/; a dry run without --write)
finance pdf-text <file.pdf>                  (the text a pdf preset's regexes are written against)
finance count <vault> <account> <amount> [date]   (a balance counted by hand: a `!` transaction for the difference)
finance file <vault> <^id|path:line> <Category | A=900.00 EUR,B> [--accept] [--from <account>]   (Review's edit from the command line)
finance categorize <vault> [--shared] [--write]   (rules.md over what is still Expenses:Unknown; --shared: friends' transfers by the card payments around them, sent back to Review)
finance prices <vault> [--write]             (FX and prices fetched with curl; a dry run without --write)
finance budget <vault> | invest <vault> | wealth <vault> [unit]   (the pane's reports as JSON)";

fn cli(args: &[String]) -> Result<(), String> {
    let arg = |i: usize| args.get(i).cloned().ok_or_else(|| USAGE.to_string());
    match args[0].as_str() {
        "check" | "balances" => {
            let vault = PathBuf::from(arg(1)?);
            let l = load(&Dir(vault), args.get(2).map(String::as_str).unwrap_or("finance"))?;
            for d in &l.ledger.diags {
                eprintln!("{d}");
            }
            if args[0] == "balances" {
                for (a, cs) in report::balances(&l.ledger, None) {
                    for (c, q) in cs {
                        println!("{:>20} {c:<6} {a}", q.normalize());
                    }
                }
            }
            let errors = l.ledger.diags.iter().filter(|d| d.severity == Severity::Error).count();
            eprintln!("{} transactions, {errors} errors, {} warnings", l.ledger.txns.len(), l.ledger.diags.len() - errors);
            if errors > 0 { Err(format!("{errors} errors")) } else { Ok(()) }
        }
        "summary" => {
            let l = load(&Dir(PathBuf::from(arg(1)?)), args.get(2).map(String::as_str).unwrap_or("finance"))?;
            println!("{}", serde_json::to_string_pretty(&summary(&l)).map_err(|e| e.to_string())?);
            Ok(())
        }
        "export-hledger" => {
            let l = load(&Dir(PathBuf::from(arg(1)?)), args.get(3).map(String::as_str).unwrap_or("finance"))?;
            let e = export::hledger(&l.ledger, &l.notes);
            std::fs::write(arg(2)?, e.journal).map_err(|e| e.to_string())?;
            for x in e.losses {
                eprintln!("lost: {x}");
            }
            Ok(())
        }
        "migrate-paisa" => {
            let text = std::fs::read_to_string(expand(&arg(1)?)).map_err(|e| e.to_string())?;
            let vault = PathBuf::from(arg(2)?);
            let mapping = std::fs::read_to_string(vault.join("finance/migration/paisa-mapping.md")).ok();
            let m = migrate::paisa::migrate(&text, mapping.as_deref(), today());
            println!("{}", m.report);
            if args.iter().any(|a| a == "--write") {
                for (path, body) in &m.files {
                    let target = vault.join(path);
                    if target.exists() && !path.ends_with("paisa-report.md") {
                        eprintln!("kept (exists): {path}");
                        continue;
                    }
                    std::fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
                    std::fs::write(&target, body).map_err(|e| e.to_string())?;
                    eprintln!("wrote {path}");
                }
            }
            eprintln!("{} files, {} errors after the migration", m.files.len(), m.errors);
            Ok(())
        }
        "count" => {
            let vault = PathBuf::from(arg(1)?);
            let account = Account::parse(&arg(2)?)?;
            let counted: rust_decimal::Decimal = arg(3)?.parse().map_err(|e| format!("{}: {e}", args[3]))?;
            let date = args.get(4).map(|d| finance::parse::parse_date(d)).transpose()?.unwrap_or_else(today);
            let l = load(&Dir(vault.clone()), "finance")?;
            let c = l.notes.accounts.get(&account).and_then(|n| n.currency.clone()).ok_or(format!("{account}: its note names no currency"))?;
            // A recount the same day replaces that day's count while it is still in Review (it is this feature's).
            let earlier = l.ledger.txns.iter().map(|b| &b.txn).find(|t| t.date == date && t.status == Status::Review && t.payee == "Counted" && t.postings.iter().any(|p| p.account == account));
            let have: rust_decimal::Decimal = l.ledger.txns.iter().filter(|b| b.txn.date <= date && Some(&b.txn) != earlier).flat_map(|b| &b.postings)
                .filter(|p| p.account == account && p.units.commodity == c).map(|p| p.units.qty).sum();
            let diff = counted - have;
            let amt = |q: rust_decimal::Decimal| { let mut q = q.round_dp(2); q.rescale(2); write::amount(&Amount::new(q, c.clone())) };
            // `;` would begin a comment: the narration says it with a comma.
            let text = format!("{date} ! Counted | {} by hand, the ledger had {}\n  Expenses:Unknown\n  {account}  {} = {}\n", amt(counted), amt(have), amt(diff), amt(counted));
            let (mut j, mut d) = (Journal::default(), vec![]);
            finance::parse::parse_file("count", &text, &mut j, &mut d);
            let t = j.txns.first().filter(|_| d.is_empty()).ok_or(format!("{d:?}"))?;
            let path = vault.join(format!("finance/journal/{}.fin", chrono::Datelike::year(&date)));
            let mut old = std::fs::read_to_string(&path).unwrap_or_default();
            if let Some(e) = earlier.filter(|e| vault.join(&*e.span.path) == path) {
                let lines: Vec<&str> = old.split_inclusive('\n').collect();
                let end = (e.span.last + 1).min(lines.len()); // and the blank line after it
                old = [&lines[..e.span.first - 1], &lines[end..]].concat().concat();
                eprintln!("replaced the count of {date} (it was {})", e.text);
            }
            std::fs::write(&path, write::append(&old, t)).map_err(|e| e.to_string())?;
            println!("{}", write::txn(t));
            Ok(())
        }
        "file" => {
            // finance file <vault> <^id or path:line> <Category | Account=900.00 EUR,Account> [--accept] [--from <account>]
            let vault = PathBuf::from(arg(1)?);
            let (which, to) = (arg(2)?, arg(3)?);
            let l = load(&Dir(vault.clone()), "finance")?;
            let t = l.ledger.txns.iter().map(|b| &b.txn).find(|t| match which.strip_prefix('^') {
                Some(id) => t.id.as_deref() == Some(id),
                None => format!("{}:{}", t.span.path, t.span.first) == which,
            }).ok_or(format!("{which}: no such transaction"))?;
            // The posting moved: Expenses:Unknown unless `--from <account>` names another (a parked transfer).
            let from = args.iter().position(|a| a == "--from").and_then(|i| args.get(i + 1)).map_or("Expenses:Unknown", |s| s.as_str());
            let unknown = Account::parse(from)?;
            let mut e = edit::Edit { mark: args.iter().any(|a| a == "--accept").then_some(Status::Accepted), ..Default::default() };
            if to.contains('=') || to.contains(',') {
                let parts = to.split(',').map(|part| match part.split_once('=') {
                    Some((a, q)) => Ok(edit::Part::Amount(Account::parse(a.trim())?, finance::parse::parse_amount(q.trim())?)),
                    None => Ok(edit::Part::Rest(Account::parse(part.trim())?)),
                }).collect::<Result<Vec<_>, String>>()?;
                e.split = Some((unknown, parts));
            } else {
                e.recategorize = Some((unknown, Account::parse(&to)?));
            }
            let path = vault.join(&*t.span.path);
            let out = edit::apply(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?, t, &e)?;
            std::fs::write(&path, out).map_err(|e| e.to_string())?;
            println!("{} {} → {to}", t.date, t.payee);
            Ok(())
        }
        "settle" => {
            // finance settle <vault> [--write]: every transaction in Review accepted, Unknown ones on the best guess
            let vault = PathBuf::from(arg(1)?);
            let l = load(&Dir(vault.clone()), "finance")?;
            let c = finance::classify::Classifier::new(&l.ledger, &l.notes);
            let found = finance::rules::settle(&l.ledger, &c);
            for (i, _, g) in &found {
                if let Some(g) = g {
                    let t = &l.ledger.txns[*i].txn;
                    println!("GUESS\t{}\t{:.2}\t{}\t{}\t{}", t.date, g.confidence, g.account, t.payee, g.reason());
                }
            }
            let waiting = l.ledger.txns.iter().filter(|b| b.txn.status == Status::Review).count();
            let edits: Vec<_> = found.into_iter().map(|(i, e, _)| (i, e)).collect();
            let (files, problems) = finance::rules::apply(&l.ledger, &edits, &|p| std::fs::read_to_string(vault.join(p)).map_err(|e| e.to_string()));
            let write = args.iter().any(|a| a == "--write");
            if write {
                for (p, text) in &files {
                    std::fs::write(vault.join(p), text).map_err(|e| e.to_string())?;
                }
            }
            for p in &problems {
                eprintln!("problem: {p}");
            }
            eprintln!("{} settled, {} left in Review{}", edits.len(), waiting - edits.len(), if write { "" } else { " (a dry run: --write writes)" });
            Ok(())
        }
        "categorize" => {
            let vault = PathBuf::from(arg(1)?);
            let l = load(&Dir(vault.clone()), "finance")?;
            let c = finance::classify::Classifier::new(&l.ledger, &l.notes);
            let (all, sure) = guesses(&l, &c, args.iter().any(|a| a == "--shared"));
            for (i, g) in &all {
                let t = &l.ledger.txns[*i].txn;
                let flow = finance::rules::flow(t);
                match g {
                    Some(g) => println!("{}\t{}\t{:.2}\t{}\t{}\t{flow}\t{}", if g.sure() { "FILE" } else { "ASK" }, t.date, g.confidence, g.account, t.payee, g.reason()),
                    None => println!("ASK\t{}\t0\t-\t{}\t{flow}\t", t.date, t.payee),
                }
            }
            let (files, problems) = finance::rules::apply(&l.ledger, &sure, &|p| std::fs::read_to_string(vault.join(p)).map_err(|e| format!("{p}: {e}")));
            problems.iter().for_each(|x| eprintln!("problem: {x}"));
            if args.iter().any(|a| a == "--write") {
                for (p, t) in &files {
                    std::fs::write(vault.join(p), t).map_err(|e| e.to_string())?;
                }
                let after = load(&Dir(vault), "finance")?;
                let errors = after.ledger.diags.iter().filter(|d| d.severity == Severity::Error).count();
                eprintln!("{} filed, {} to ask; the ledger now: {} transactions, {errors} errors", sure.len(), all.len() - sure.len(), after.ledger.txns.len());
            } else if args.iter().any(|a| a == "--shared") {
                let exact = all.iter().filter(|(_, g)| g.as_ref().is_some_and(|g| g.sure())).count();
                eprintln!("{} guessed ({exact} exact shares); a dry run: --write files them all, back in Review", all.len());
            } else {
                eprintln!("{} sure, {} to ask (a dry run: --write files the sure ones)", sure.len(), all.len() - sure.len());
            }
            Ok(())
        }
        "prices" => {
            let vault = PathBuf::from(arg(1)?);
            let l = load(&Dir(vault.clone()), "finance")?;
            let measures: Vec<Commodity> = ["EUR", "CAD", "USD", "XAU", "BTC"].iter().map(|c| Commodity::parse(c).unwrap()).collect();
            let cfg = price_config(&l)?;
            let u = pricefeed::update(&cfg, &l.ledger, &l.notes, &pricefeed::Want { folder: "finance", measures: &measures, today: today() }, &|p| std::fs::read_to_string(vault.join(p)).ok(), &mut |url| {
                let o = std::process::Command::new("curl").args(["-sfL", "-m", "30", "-A", "Mozilla/5.0 (Atlas finance)", url]).output().map_err(|e| e.to_string())?;
                if o.status.success() { Ok(String::from_utf8_lossy(&o.stdout).into_owned()) } else { Err(format!("curl {url}: {}", o.status)) }
            });
            u.log.iter().for_each(|x| eprintln!("{x}"));
            u.errors.iter().for_each(|x| eprintln!("problem: {x}"));
            if args.iter().any(|a| a == "--write") {
                for (p, t) in &u.files {
                    let target = vault.join(p);
                    std::fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
                    std::fs::write(&target, t).map_err(|e| e.to_string())?;
                    eprintln!("wrote {p}");
                }
            }
            Ok(())
        }
        "budget" | "invest" | "wealth" => {
            let l = load(&Dir(PathBuf::from(arg(1)?)), "finance")?;
            let prices = Prices::new(&l.ledger);
            let eur = unit(&json!("EUR"));
            let v = match args[0].as_str() {
                "budget" => budget_json(&budget::budget(&l.ledger, &l.notes, &prices, &eur, 6, today())),
                "invest" => invest_json(&l, &prices, &eur),
                _ => wealth_json(&l, &prices, &unit(&json!(args.get(2)))),
            };
            println!("{}", serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?);
            Ok(())
        }
        "pdf-text" => {
            let b = std::fs::read(expand(&arg(1)?)).map_err(|e| e.to_string())?;
            let pdf = finance::statement::extract::pdf_part(&b).ok_or("not a PDF")?;
            print!("{}", finance::statement::pdf::text(pdf)?);
            Ok(())
        }
        "import" => {
            let vault = PathBuf::from(arg(1)?);
            let folder = "finance";
            let mut paths: Vec<PathBuf> = args[2..].iter().filter(|a| !a.starts_with("--")).map(|a| expand(a)).collect();
            if paths.is_empty() {
                let inbox = vault.join(folder).join("statements/inbox");
                paths = std::fs::read_dir(&inbox).map_err(|e| format!("{}: {e}", inbox.display()))?.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.is_file()).collect();
                paths.sort();
            }
            let inputs = paths.iter().map(|p| Ok(finance::statement::batch::Input { path: p.to_string_lossy().into_owned(), bytes: std::fs::read(p).map_err(|e| format!("{}: {e}", p.display()))? }))
                .collect::<Result<Vec<_>, String>>()?;
            let dir = Dir(vault.clone());
            let loaded = load(&dir, folder)?;
            let out = finance::statement::batch::run(&dir, &|rel| std::fs::read(vault.join(rel)).ok(), &loaded, folder, inputs, &finance::statement::pdf::text, today());
            println!("{}", out.report);
            if args.iter().any(|a| a == "--write") {
                apply_import(&vault, &out)?;
                let after = load(&dir, folder)?;
                let errors = after.ledger.diags.iter().filter(|d| d.severity == Severity::Error).count();
                eprintln!("{} new transactions; the ledger now: {} transactions, {errors} errors", out.new, after.ledger.txns.len());
            } else {
                eprintln!("{} new transactions (a dry run: --write writes them)", out.new);
            }
            Ok(())
        }
        _ => Err(USAGE.into()),
    }
}

/// `categorize`'s guesses and the edits that file them: what is still Expenses:Unknown (the sure ones filed, left in
/// Review), or with `shared` the friends' transfers waiting in a holding account (each guess filed and sent back to
/// Review, accepted or not: the user confirms it there).
#[allow(clippy::type_complexity)]
fn guesses(l: &Loaded, c: &finance::classify::Classifier, shared: bool) -> (Vec<(usize, Option<finance::classify::Guess>)>, Vec<(usize, edit::Edit)>) {
    if shared {
        let found = finance::rules::shared(&l.ledger, &l.notes);
        let edits = found.iter().map(|(i, from, g)| (*i, edit::Edit { mark: Some(Status::Review), recategorize: Some((from.clone(), g.account.clone())), ..Default::default() })).collect();
        return (found.into_iter().map(|(i, _, g)| (i, Some(g))).collect(), edits);
    }
    let all = finance::rules::categorize(&l.ledger, c);
    let sure: Vec<(usize, Account)> = all.iter().filter_map(|(i, g)| g.as_ref().filter(|g| g.sure()).map(|g| (*i, g.account.clone()))).collect();
    (all, finance::rules::filing(&sure))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        return serve_plugin();
    }
    if let Err(e) = cli(&args) {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
