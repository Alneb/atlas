//! The accounts: one card each in the plugin's settings (`accounts` records), their secrets in Atlas's store
//! (`accounts.<name>.password` / `.oauth_refresh`). Every call carries both; the background sync keeps the last ones.

use serde_json::Value;

/// Outlook / Microsoft 365: fixed servers, OAuth2 only (passwords are refused over IMAP and SMTP).
pub const OUTLOOK_IMAP: (&str, u16) = ("outlook.office365.com", 993);
pub const OUTLOOK_SMTP: (&str, u16) = ("smtp.office365.com", 587);
/// Thunderbird's public client id: used when the card names none (many organisations allow it; checked 2026-10-15).
pub const THUNDERBIRD_CLIENT: &str = "9e5f94bc-e8a4-4e73-b8be-63364c29d753";
/// Gmail / Google Workspace: fixed servers, signed in with OAuth2 as Thunderbird does (no app password).
pub const GMAIL_IMAP: (&str, u16) = ("imap.gmail.com", 993);
pub const GMAIL_SMTP: (&str, u16) = ("smtp.gmail.com", 465);
/// Thunderbird's public Google application (an "installed app": its secret is public by design, as in Thunderbird's
/// own source, OAuth2Providers). Used when the card names none; a card may name its own Google Cloud client.
pub const THUNDERBIRD_GOOGLE_CLIENT: &str = "406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com";
pub const THUNDERBIRD_GOOGLE_SECRET: &str = "kSmqreRr0qwBWJgbf5Y-PNpK";

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
    /// Gmail: the same sign-in also grants Google Calendar (the Calendar plugin's token, `calendar_token`).
    Google { client_id: String, client_secret: String, refresh: Option<String> },
}

impl Auth {
    /// Signed in with a token (XOAUTH2), not a password.
    pub fn is_oauth(&self) -> bool {
        !matches!(self, Auth::Password(_))
    }
    /// The service's name, for what the person reads ("sign in to Gmail").
    pub fn service(&self) -> &'static str {
        match self {
            Auth::Password(_) => "the mail server",
            Auth::Outlook { .. } => "Outlook",
            Auth::Google { .. } => "Gmail",
        }
    }
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
        if want.is_empty() { "no mail account yet: add one in Settings → Plugins → Email".to_string() } else { format!("no account named {want}") }
    })?;
    of_card(params, &cards[i], i == 0)
}

fn of_card(params: &Value, c: &Value, main: bool) -> Result<Account, String> {
    let name = s(c, "name").to_string();
    let outlook = s(c, "auth") == "outlook";
    let google = s(c, "auth") == "google";
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
    } else if google {
        let own = Some(s(c, "client_id")).filter(|t| !t.is_empty());
        // a client of the card's own needs its own secret; Thunderbird's goes with Thunderbird's
        let (client_id, client_secret) = match own {
            Some(id) => (id.to_string(), s(c, "client_secret").to_string()),
            None => (THUNDERBIRD_GOOGLE_CLIENT.to_string(), THUNDERBIRD_GOOGLE_SECRET.to_string()),
        };
        (
            Server { host: GMAIL_IMAP.0.into(), port: GMAIL_IMAP.1, security: Security::Tls },
            Server { host: GMAIL_SMTP.0.into(), port: GMAIL_SMTP.1, security: Security::Tls },
            Auth::Google { client_id, client_secret, refresh: secret(params, &name, "oauth_refresh") },
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
        return Err(format!("set the account {name} first: its address and IMAP server (Settings → Plugins → Email)"));
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
                { "name": "g", "auth": "google", "user": "me@gmail.example" },
                { "name": "" }
            ]},
            "secrets": { "accounts.gmail.password": "pw", "accounts.uni.oauth_refresh": "rt" }
        });
        let all: Vec<_> = all(&p).into_iter().map(Result::unwrap).collect();
        assert_eq!(all.len(), 3, "a card without a name is no account");
        let gg = &all[2];
        assert_eq!((gg.imap.host.as_str(), gg.smtp.port, gg.smtp.security), ("imap.gmail.com", 465, Security::Tls));
        assert_eq!(gg.auth, Auth::Google { client_id: THUNDERBIRD_GOOGLE_CLIENT.into(), client_secret: THUNDERBIRD_GOOGLE_SECRET.into(), refresh: None });
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
