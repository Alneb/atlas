//! The accounts: one card each in the plugin's settings (`accounts` records), their secrets in Atlas's store
//! (`accounts.<name>.password` / `.oauth_refresh`). Every call carries both; the background sync keeps the last ones.

use serde_json::Value;

/// Outlook / Microsoft 365: fixed servers, OAuth2 only (passwords are refused over IMAP and SMTP).
pub const OUTLOOK_IMAP: (&str, u16) = ("outlook.office365.com", 993);
pub const OUTLOOK_SMTP: (&str, u16) = ("smtp.office365.com", 587);
/// Thunderbird's public client id: used when the card names none (many organisations allow it; checked 2026-10-15).
pub const THUNDERBIRD_CLIENT: &str = "9e5f94bc-e8a4-4e73-b8be-63364c29d753";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Security {
    /// TLS from the first byte (993 / 465)
    Tls,
    StartTls,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Auth {
    Password(String),
    Outlook { tenant: String, client_id: String, refresh: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Server {
    pub host: String,
    pub port: u16,
    pub security: Security,
}

/// One account, ready to connect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub name: String,
    pub user: String,
    /// "Name <address>" for mail sent from it
    pub from: String,
    pub imap: Server,
    pub smtp: Server,
    pub auth: Auth,
    pub signature: String,
    /// extra addresses that are also "me" (identities), from the card's `aliases`
    pub aliases: Vec<String>,
    pub claude: Consent,
    pub main: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Consent {
    Ask,
    Always,
    Never,
}

impl Account {
    /// The bare addresses that are this account's own, lower-cased.
    pub fn own(&self) -> Vec<String> {
        let mut v = vec![self.user.to_lowercase(), crate::parse::bare(&self.from).to_lowercase()];
        v.extend(self.aliases.iter().map(|a| crate::parse::bare(a).to_lowercase()));
        v.retain(|a| a.contains('@'));
        v.dedup();
        v
    }
}

fn s<'a>(card: &'a Value, k: &str) -> &'a str {
    card.get(k).and_then(Value::as_str).map(str::trim).unwrap_or("")
}

fn port(card: &Value, k: &str) -> Option<u16> {
    match card.get(k) {
        Some(Value::Number(n)) => n.as_u64().and_then(|p| u16::try_from(p).ok()),
        Some(Value::String(t)) => t.trim().parse().ok(),
        _ => None,
    }
}

/// The cards in the order Settings shows them (the first is the main account).
pub fn cards(params: &Value) -> Vec<Value> {
    params.pointer("/settings/accounts").and_then(Value::as_array).cloned().unwrap_or_default()
}

/// A secret of an account, from the call's `secrets` (the page's and the tools' calls carry them).
pub fn secret(params: &Value, account: &str, key: &str) -> Option<String> {
    params
        .get("secrets")
        .and_then(|s| s.get(format!("accounts.{account}.{key}")))
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
        .map(String::from)
}

/// Every account the settings describe, with its secrets; cards without a name are skipped.
pub fn all(params: &Value) -> Vec<Result<Account, String>> {
    cards(params)
        .iter()
        .enumerate()
        .filter(|(_, c)| !s(c, "name").is_empty())
        .map(|(i, c)| of_card(params, c, i == 0))
        .collect()
}

/// The account a call names (`account`), else the main one.
pub fn pick(params: &Value) -> Result<Account, String> {
    let want = params.get("account").and_then(Value::as_str).unwrap_or("");
    let cards = cards(params);
    let i = if want.is_empty() {
        cards.iter().position(|c| !s(c, "name").is_empty())
    } else {
        cards.iter().position(|c| s(c, "name") == want)
    };
    let i = i.ok_or_else(|| {
        if want.is_empty() { "no mail account yet: add one in Settings → Plugins & automation → Email".to_string() } else { format!("no account named {want}") }
    })?;
    of_card(params, &cards[i], i == 0)
}

fn of_card(params: &Value, c: &Value, main: bool) -> Result<Account, String> {
    let name = s(c, "name").to_string();
    let outlook = s(c, "auth") == "outlook";
    let security = match s(c, "security") {
        "starttls" => Security::StartTls,
        "none" => Security::None,
        _ => Security::Tls,
    };
    let user = s(c, "user").to_string();
    let (imap, smtp, auth) = if outlook {
        let tenant = Some(s(c, "tenant")).filter(|t| !t.is_empty()).unwrap_or("common").to_string();
        let client_id = Some(s(c, "client_id")).filter(|t| !t.is_empty()).unwrap_or(THUNDERBIRD_CLIENT).to_string();
        (
            Server { host: OUTLOOK_IMAP.0.into(), port: OUTLOOK_IMAP.1, security: Security::Tls },
            Server { host: OUTLOOK_SMTP.0.into(), port: OUTLOOK_SMTP.1, security: Security::StartTls },
            Auth::Outlook { tenant, client_id, refresh: secret(params, &name, "oauth_refresh") },
        )
    } else {
        let host = s(c, "imap_host").to_string();
        let imap_port = port(c, "imap_port").unwrap_or(if security == Security::Tls { 993 } else { 143 });
        let smtp_host = Some(s(c, "smtp_host")).filter(|h| !h.is_empty()).map(String::from).unwrap_or_else(|| host.clone());
        let smtp_port = port(c, "smtp_port").unwrap_or(if security == Security::Tls { 465 } else { 587 });
        // SMTP's security follows its port: 465 is TLS from the start, anything else STARTTLS (unless none)
        let smtp_sec = match (smtp_port, security) {
            (_, Security::None) => Security::None,
            (465, _) => Security::Tls,
            _ => Security::StartTls,
        };
        (
            Server { host, port: imap_port, security },
            Server { host: smtp_host, port: smtp_port, security: smtp_sec },
            Auth::Password(secret(params, &name, "password").unwrap_or_default()),
        )
    };
    if imap.host.is_empty() || user.is_empty() {
        return Err(format!("set the account {name} first: its address and IMAP server (Settings → Plugins & automation → Email)"));
    }
    let from = Some(s(c, "from")).filter(|f| !f.is_empty()).map(String::from).unwrap_or_else(|| user.clone());
    let aliases = s(c, "aliases").split([',', '\n']).map(str::trim).filter(|a| !a.is_empty()).map(String::from).collect();
    let claude = match s(c, "claude") {
        "always" => Consent::Always,
        "never" => Consent::Never,
        _ => Consent::Ask,
    };
    Ok(Account { name, user, from, imap, smtp, auth, signature: s(c, "signature").to_string(), aliases, claude, main })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn cards_become_accounts_with_their_secrets_and_defaults() {
        let p = json!({
            "settings": { "accounts": [
                { "name": "gmail", "user": "me@gmail.example", "imap_host": "imap.gmail.com", "smtp_host": "smtp.gmail.com", "smtp_port": "465", "aliases": "me@alias.example, Other <o@x.example>" },
                { "name": "uni", "auth": "outlook", "user": "me@uni.example.org", "claude": "never" },
                { "name": "" }
            ]},
            "secrets": { "accounts.gmail.password": "pw", "accounts.uni.oauth_refresh": "rt" }
        });
        let all: Vec<_> = all(&p).into_iter().map(Result::unwrap).collect();
        assert_eq!(all.len(), 2, "a card without a name is no account");
        let g = &all[0];
        assert!(g.main);
        assert_eq!((g.imap.port, g.imap.security), (993, Security::Tls));
        assert_eq!((g.smtp.port, g.smtp.security), (465, Security::Tls));
        assert_eq!(g.auth, Auth::Password("pw".into()));
        assert_eq!(g.own(), vec!["me@gmail.example", "me@alias.example", "o@x.example"]);
        let u = &all[1];
        assert_eq!(u.imap.host, "outlook.office365.com");
        assert_eq!(u.smtp.security, Security::StartTls);
        assert_eq!(u.auth, Auth::Outlook { tenant: "common".into(), client_id: THUNDERBIRD_CLIENT.into(), refresh: Some("rt".into()) });
        assert_eq!(u.claude, Consent::Never);
        assert_eq!(pick(&json!({ "settings": p["settings"], "account": "uni" })).unwrap().name, "uni");
        assert!(pick(&json!({ "settings": p["settings"], "account": "nope" })).is_err());
    }

    #[test]
    fn a_card_without_a_server_says_what_to_set() {
        let p = json!({ "settings": { "accounts": [{ "name": "x", "user": "a@b.c" }] } });
        assert!(pick(&p).unwrap_err().contains("IMAP server"));
    }
}
