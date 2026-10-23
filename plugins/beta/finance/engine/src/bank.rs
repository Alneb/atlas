//! Enable Banking (DESIGN-finance "Enable Banking", revised: it runs on the server only, clients get its transactions
//! through the mirror). The API is signed with the user's application key (an RS256 JWT per request); a consent is
//! asked at the bank (`auth` → the bank's page → a `code` back on the redirect), turned into a session, and the
//! session's accounts are read. What comes back is written as a CSV into the statements inbox, which the
//! `enable-banking` preset reads: one import path for every source (duplicates, transfers, balances, archives).
//! The network is the caller's (the core's fetch); everything here is pure.
use base64::Engine;
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs8::DecodePrivateKey;
use rsa::signature::{SignatureEncoding, Signer};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::Sha256;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub api: String,
    pub consent_days: i64,
    pub first_days: i64,
}

const BUILT_IN: &str = include_str!("../../data/enable-banking.toml");

impl Config {
    pub fn load(vault: Option<&str>) -> Result<Config, String> {
        let mut t: toml::Table = BUILT_IN.parse().map_err(|e| format!("data/enable-banking.toml: {e}"))?;
        if let Some(v) = vault {
            t.extend(v.parse::<toml::Table>().map_err(|e| format!("finance/enable-banking.toml: {e}"))?);
        }
        toml::Value::Table(t).try_into().map_err(|e| format!("enable-banking.toml: {e}"))
    }
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// The JWT that signs one hour of requests: `kid` is the application's id, the key its private key (PEM, PKCS#8 as
/// Enable Banking's control panel gives it, or PKCS#1).
pub fn jwt(app_id: &str, key_pem: &str, now: i64) -> Result<String, String> {
    let key = rsa::RsaPrivateKey::from_pkcs8_pem(key_pem)
        .or_else(|_| <rsa::RsaPrivateKey as rsa::pkcs1::DecodeRsaPrivateKey>::from_pkcs1_pem(key_pem))
        .map_err(|e| format!("the Enable Banking key is not a PEM private key: {e}"))?;
    let head = b64(json!({ "typ": "JWT", "alg": "RS256", "kid": app_id }).to_string().as_bytes());
    let body = b64(json!({ "iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": now, "exp": now + 3600 }).to_string().as_bytes());
    let signed = format!("{head}.{body}");
    let sig = SigningKey::<Sha256>::new(key).sign(signed.as_bytes());
    Ok(format!("{signed}.{}", b64(&sig.to_bytes())))
}

/// One request: method, address, JSON body.
#[derive(Debug, Clone, PartialEq)]
pub struct Request {
    pub method: &'static str,
    pub url: String,
    pub body: Option<Value>,
}

fn q(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

pub fn banks(cfg: &Config, country: &str) -> Request {
    Request { method: "GET", url: format!("{}/aspsps?country={}", cfg.api, q(country)), body: None }
}

/// Asks the bank for a consent: the answer's `url` is the bank's page, which comes back to `redirect` with `?code=`.
pub fn auth(cfg: &Config, bank: &str, country: &str, redirect: &str, state: &str, until: chrono::NaiveDate) -> Request {
    Request { method: "POST", url: format!("{}/auth", cfg.api), body: Some(json!({
        "access": { "valid_until": format!("{until}T00:00:00Z") }, "aspsp": { "name": bank, "country": country },
        "state": state, "redirect_url": redirect, "psu_type": "personal",
    })) }
}

/// The `code` in the address the bank came back to (pasted by the user, or the redirect's own request).
pub fn code_of(address: &str) -> Option<String> {
    let query = address.split_once('?').map_or(address, |x| x.1);
    query.split('&').find_map(|kv| kv.strip_prefix("code=")).map(|c| c.split('#').next().unwrap_or(c).to_string()).filter(|c| !c.is_empty())
}

pub fn session(cfg: &Config, code: &str) -> Request {
    Request { method: "POST", url: format!("{}/sessions", cfg.api), body: Some(json!({ "code": code })) }
}

pub fn transactions(cfg: &Config, account: &str, from: chrono::NaiveDate, continuation: Option<&str>) -> Request {
    let mut url = format!("{}/accounts/{}/transactions?date_from={from}", cfg.api, q(account));
    if let Some(k) = continuation {
        url += &format!("&continuation_key={}", q(k));
    }
    Request { method: "GET", url, body: None }
}

/// An account of a session: its id at Enable Banking and what the bank calls it.
#[derive(Debug, Clone, PartialEq)]
pub struct Linked {
    pub uid: String,
    pub iban: Option<String>,
    pub name: Option<String>,
    pub currency: Option<String>,
}

/// A session's answer → its id, the accounts, and until when the consent holds.
pub fn session_of(v: &Value) -> Result<(String, Vec<Linked>, Option<String>), String> {
    let id = v["session_id"].as_str().ok_or_else(|| format!("Enable Banking answered no session: {v}"))?.to_string();
    let accounts = v["accounts"].as_array().cloned().unwrap_or_default().iter().map(|a| Linked {
        uid: a["uid"].as_str().unwrap_or_default().to_string(),
        iban: a["account_id"]["iban"].as_str().map(str::to_string),
        name: a["name"].as_str().or(a["product"].as_str()).map(str::to_string),
        currency: a["currency"].as_str().map(str::to_string),
    }).filter(|a| !a.uid.is_empty()).collect();
    Ok((id, accounts, v["access"]["valid_until"].as_str().map(|s| s[..10.min(s.len())].to_string())))
}

/// The transactions of one page as CSV rows (and the key of the next page): booked ones only.
pub fn rows(v: &Value, iban: &str) -> (Vec<Vec<String>>, Option<String>) {
    let mut out = vec![];
    for t in v["transactions"].as_array().cloned().unwrap_or_default() {
        if t["status"].as_str().is_some_and(|s| s != "BOOK") {
            continue;
        }
        let amount = t["transaction_amount"]["amount"].as_str().map(str::to_string).or_else(|| t["transaction_amount"]["amount"].as_f64().map(|f| f.to_string())).unwrap_or_default();
        let signed = if t["credit_debit_indicator"].as_str() == Some("DBIT") && !amount.starts_with('-') { format!("-{amount}") } else { amount };
        let other = if signed.starts_with('-') { &t["creditor"]["name"] } else { &t["debtor"]["name"] };
        let info: Vec<String> = t["remittance_information"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(str::to_string)).collect();
        let balance = &t["balance_after_transaction"]["balance_amount"]["amount"];
        out.push(vec![
            t["entry_reference"].as_str().or(t["transaction_id"].as_str()).unwrap_or_default().to_string(),
            iban.to_string(),
            t["booking_date"].as_str().unwrap_or_default().to_string(),
            t["value_date"].as_str().or(t["booking_date"].as_str()).unwrap_or_default().to_string(),
            signed,
            t["transaction_amount"]["currency"].as_str().unwrap_or_default().to_string(),
            other.as_str().unwrap_or_default().to_string(),
            info.join(" "),
            balance.as_str().map(str::to_string).or_else(|| balance.as_f64().map(|f| f.to_string())).unwrap_or_default(),
        ]);
    }
    (out, v["continuation_key"].as_str().filter(|k| !k.is_empty()).map(str::to_string))
}

/// The bank and country a consent was asked for, from the `state` the bank hands back (`Unicaja%20Banco|ES`): the
/// address alone finishes a connection, whichever tab or device it comes back to.
pub fn state_of(address: &str) -> Option<(String, String)> {
    let query = address.split_once('?').map_or(address, |x| x.1);
    let raw = query.split('&').find_map(|kv| kv.strip_prefix("state="))?.split('#').next()?;
    let state = decode(raw);
    let (bank, country) = state.rsplit_once('|')?;
    (!bank.is_empty() && !country.is_empty()).then(|| (bank.to_string(), country.to_string()))
}

/// Percent-decoding of a query value (`+` is a space there); a malformed escape stays as written.
fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = b.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u8::from_str_radix(h, 16).ok());
        match (b[i], hex) {
            (b'%', Some(x)) => { out.push(x); i += 3; continue; }
            (b'+', _) => out.push(b' '),
            (x, _) => out.push(x),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Whether Enable Banking refused a code because it was already turned into a session (it is single-use).
pub fn code_spent(error: &str) -> bool {
    let e = error.to_lowercase();
    e.contains(" 422") && (e.contains("already authorized") || e.contains("already used"))
}

/// A connection's note (`finance/sources/<bank>.md`): what the pane lists and the sync reads. No secret in it.
pub fn source_note(s: &crate::notes::SourceNote) -> String {
    let yaml = |s: &str| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""));
    let day = |d: Option<chrono::NaiveDate>| d.map(|d| d.to_string()).unwrap_or_default();
    let mut t = format!("---\ntype: finance-source\nsource: enable-banking\nbank: {}\ncountry: {}\n", yaml(&s.bank), s.country);
    t += &format!("session: {}\nuntil: {}\nsynced: {}\n", yaml(s.session.as_deref().unwrap_or("")), day(s.until), day(s.synced));
    t += "accounts:\n";
    for (uid, iban, name) in &s.accounts {
        t += &format!("  - uid: {}\n    iban: {}\n    name: {}\n", yaml(uid), yaml(iban), yaml(name));
    }
    t += &format!("error: {}\n---\n\n# {}\n\nConnected through Enable Banking, which reads the bank's transactions with your consent (PSD2). Each sync writes them as a CSV into the statements inbox and imports it: duplicates, transfers and balances as for any statement. An account is matched to its ledger account by its IBAN, or by its `uid` listed as `bank-uid:` in that account's note. The consent lasts until `until`; renew it from the Finance pane (Sources) before then. Written by the finance plugin.\n", yaml(s.error.as_deref().unwrap_or("")), s.bank);
    t
}

/// The header the `enable-banking` preset recognises.
pub const HEADER: [&str; 9] = ["Reference", "IBAN", "Booking date", "Value date", "Amount", "Currency", "Counterparty", "Information", "Balance after"];

pub fn csv(rows: &[Vec<String>]) -> String {
    let mut w = csv::Writer::from_writer(vec![]);
    let _ = w.write_record(HEADER);
    for r in rows {
        let _ = w.write_record(r);
    }
    String::from_utf8(w.into_inner().unwrap_or_default()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_address_alone_says_which_bank_it_was_and_a_spent_code_is_recognised() {
        let back = "https://atlas.example/finance/enable-banking?state=Unicaja+Banco%7CES&code=abc";
        assert_eq!(state_of(back), Some(("Unicaja Banco".into(), "ES".into())));
        assert_eq!(state_of("https://x/?code=a&state=Cr%C3%A9dit%20Agricole|FR#f"), Some(("Crédit Agricole".into(), "FR".into())));
        assert_eq!(state_of("https://x/?code=a&state=%zz|ES"), Some(("%zz".into(), "ES".into())), "a malformed escape stays");
        assert_eq!(state_of("https://x/?code=a"), None);
        assert!(code_spent("Enable Banking answered 422: Session is already authorized"));
        assert!(!code_spent("Enable Banking answered 401: Wrong signature"));
    }
    use rsa::pkcs8::EncodePrivateKey;
    use rsa::signature::Verifier;

    #[test]
    fn the_jwt_is_signed_with_the_key() {
        let mut rng = rand::thread_rng();
        let key = rsa::RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let pem = key.to_pkcs8_pem(rsa::pkcs8::LineEnding::LF).unwrap();
        let t = jwt("app-123", &pem, 1_700_000_000).unwrap();
        let parts: Vec<&str> = t.split('.').collect();
        let head: Value = serde_json::from_slice(&base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[0]).unwrap()).unwrap();
        assert_eq!((head["kid"].as_str(), head["alg"].as_str()), (Some("app-123"), Some("RS256")));
        let sig = rsa::pkcs1v15::Signature::try_from(base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[2]).unwrap().as_slice()).unwrap();
        rsa::pkcs1v15::VerifyingKey::<Sha256>::new(key.to_public_key()).verify(format!("{}.{}", parts[0], parts[1]).as_bytes(), &sig).unwrap();
        assert!(jwt("x", "not a key", 0).is_err());
    }

    #[test]
    fn answers_become_rows_and_a_code_is_found() {
        let v: Value = serde_json::from_str(r#"{"transactions":[
            {"entry_reference":"R1","transaction_amount":{"amount":"12.40","currency":"EUR"},"credit_debit_indicator":"DBIT","status":"BOOK",
             "booking_date":"2026-10-20","value_date":"2026-10-19","creditor":{"name":"CAFE CAUS"},"remittance_information":["CARD 1234"],
             "balance_after_transaction":{"balance_amount":{"amount":"100.00","currency":"EUR"}}},
            {"entry_reference":"R2","transaction_amount":{"amount":"5","currency":"EUR"},"credit_debit_indicator":"CRDT","status":"PDNG","booking_date":"2026-10-21"}],
            "continuation_key":"next"}"#).unwrap();
        let (r, k) = rows(&v, "ES12");
        assert_eq!(r.len(), 1, "a pending one waits");
        assert_eq!(r[0], ["R1", "ES12", "2026-10-20", "2026-10-19", "-12.40", "EUR", "CAFE CAUS", "CARD 1234", "100.00"]);
        assert_eq!(k.as_deref(), Some("next"));
        assert!(csv(&r).starts_with("Reference,IBAN,Booking date"));
        let made = crate::notes::SourceNote {
            path: "finance/sources/Unicaja.md".into(), bank: "Unicaja Banco".into(), country: "ES".into(), session: Some("s-1".into()),
            until: chrono::NaiveDate::from_ymd_opt(2027, 4, 20), synced: None,
            accounts: vec![("u1".into(), "ES12".into(), "Cuenta \"Joven\"".into())], error: None,
        };
        let note = source_note(&made);
        let (mut n, mut d) = (crate::notes::Notes::default(), vec![]);
        assert!(n.add("finance/sources/Unicaja.md", &note, &mut d), "{note}");
        assert!(d.is_empty(), "{d:?}");
        assert_eq!(n.sources[0], made, "the note reads back as it was written");
        assert_eq!(code_of("https://atlas.example/finance/bank?state=s&code=abc123#x").as_deref(), Some("abc123"));
        assert_eq!(code_of("https://atlas.example/?error=denied"), None);
    }

    #[test]
    fn the_csv_is_read_by_the_preset() {
        let r = vec![["R1", "ES1221030000000000001234", "2026-10-20", "2026-10-19", "-12.40", "EUR", "CAFE CAUS", "CARD 1234", "100.00"].iter().map(|s| s.to_string()).collect::<Vec<_>>()];
        let (presets, problems) = crate::statement::preset::presets(&[]);
        assert!(problems.is_empty(), "{problems:?}");
        let st = crate::statement::read("eb.csv", csv(&r).as_bytes(), &presets, &|_| Err("no pdf".into())).unwrap().remove(0);
        assert_eq!(st.preset, "enable-banking");
        assert_eq!((st.rows.len(), st.holder.as_deref()), (1, Some("ES1221030000000000001234")));
        assert_eq!(st.rows[0].description, "CAFE CAUS");
    }
}
