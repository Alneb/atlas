//! OpenID Connect sign-in for any plugin. Authorization code + PKCE, as a public
//! client (no client secret lives in a vault):
//! 1. `start` reads the provider's endpoints (`<issuer>/.well-known/openid-configuration`) and makes the sign-in address;
//! 2. the page shows it (`atlas.signIn`) and hands back the address the provider sent the browser to;
//! 3. `finish` trades the code for tokens, kept once per provider in `@signin` (outside the vault, never sent to a page)
//!    and shared by every plugin: a plugin's secret `oauth.<name>` only names the provider it signed in with;
//! 4. `atlas.fetch` fills a header `{ oauth: name }` with `Bearer <access token>`, refreshed when it is about to expire.
//!
//! `ready` gets a token with no click when it can: the vault's provider already signed in (another plugin did), or a
//! kept gate session (the door's cookie) that the provider takes for a silent `prompt=none` sign-in.
//! Every address the provider gives must be one the plugin may reach (`[permissions] net`), like any of its requests.
//! The provider is the plugin's `issuer`, else the one the service names in its 401 (`resource`: RFC 9728's
//! `WWW-Authenticate: Bearer resource_metadata=…`), else the vault's (`[plugins] oidc_issuer`); likewise the client.
use crate::secrets::Store;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use ts_rs::TS;

/// What a plugin asks for: which provider, as which client, and where the provider sends the browser back.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct OauthStart {
    /// The sign-in's name inside the plugin (`authelia`, `work`): one plugin may keep several.
    pub name: String,
    /// `https://auth.example.org` — the provider's address, before `/.well-known/openid-configuration`.
    /// Default: the one `resource` names, else the vault's `[plugins] oidc_issuer`.
    #[serde(default)]
    #[ts(optional)]
    pub issuer: Option<String>,
    /// An address of the service the sign-in is for: asked without a token, its 401 names the provider.
    #[serde(default)]
    #[ts(optional)]
    pub resource: Option<String>,
    /// Default: the vault's `[plugins] oidc_client_id`.
    #[serde(default)]
    #[ts(optional)]
    pub client_id: Option<String>,
    /// Default: `openid offline_access` (offline_access: a refresh token, so the sign-in lasts).
    #[serde(default)]
    #[ts(optional)]
    pub scopes: Option<Vec<String>>,
    /// The redirect address registered with the provider for this client (`https://localhost/atlas`).
    /// Default: the vault's `[plugins] oidc_redirect`.
    #[serde(default)]
    #[ts(optional)]
    pub redirect: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct OauthStarted {
    /// The provider's sign-in page, to open with `atlas.signIn(url, redirect)`.
    pub url: String,
    /// Where the provider sends the browser back (the plugin's or the vault's).
    pub redirect: String,
}

/// A kept sign-in, as far as a page may know it.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct OauthStatus {
    pub signed_in: bool,
    /// Unix seconds; 0 when the provider did not say.
    #[ts(type = "number")]
    pub expires: u64,
    /// A refresh token is kept: the sign-in renews itself.
    pub renews: bool,
}

/// A provider's tokens, kept once in `@signin` as `oidc.<key>` and used by every plugin that signed in with it.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Tokens {
    access: String,
    #[serde(default)]
    refresh: String,
    #[serde(default)]
    expires: u64,
    token_endpoint: String,
    client_id: String,
    /// The provider's address, for Settings and for matching the vault's `oidc_issuer` (empty in tokens moved from a plugin).
    #[serde(default)]
    issuer: String,
    /// When the provider last answered with tokens (unix seconds): the keep-alive renews long-unused ones.
    #[serde(default)]
    renewed: u64,
}

/// A plugin's secret `oauth.<name>`: the provider it signed in with, or (kept before tokens were shared) its own tokens.
#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum Link {
    To { provider: String },
    Own(Tokens),
}

/// The sign-ins' section of the secrets store (service_signin's): no plugin can read it.
const SECTION: &str = "@signin";

/// A provider's key in `@signin`: its token endpoint, hashed to a plain name.
fn provider_key(token_endpoint: &str) -> String {
    let h = Sha256::digest(token_endpoint.trim().trim_end_matches('/').as_bytes());
    format!("oidc.{}", h.iter().take(8).map(|b| format!("{b:02x}")).collect::<String>())
}

/// A sign-in between `start` and `finish`, found again by its `state`.
struct Pending {
    plugin: String,
    name: String,
    issuer: String,
    verifier: String,
    token_endpoint: String,
    client_id: String,
    redirect: String,
    made: Instant,
}

const PENDING_FOR: Duration = Duration::from_secs(15 * 60);
/// An access token this close to its end is renewed before it is used.
const RENEW_BEFORE: u64 = 60;

fn pending() -> &'static Mutex<HashMap<String, Pending>> {
    static P: OnceLock<Mutex<HashMap<String, Pending>>> = OnceLock::new();
    P.get_or_init(Default::default)
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// RFC 4648 base64url without padding (PKCE's encoding).
fn b64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 3);
    for c in bytes.chunks(3) {
        let n = (u32::from(c[0]) << 16) | (u32::from(*c.get(1).unwrap_or(&0)) << 8) | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..=c.len() {
            out.push(A[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

fn random(n: usize) -> Result<String> {
    let mut b = vec![0u8; n];
    getrandom::getrandom(&mut b).map_err(|e| Error::Other(anyhow::anyhow!("no randomness: {e}")))?;
    Ok(b64url(&b))
}

/// The secret that holds sign-in `name`: a short plain name, so it is a valid secret name.
fn secret_of(name: &str) -> Result<String> {
    let ok = !name.is_empty() && name.len() <= 40 && name.chars().all(|c| c.is_ascii_alphanumeric() || "_-".contains(c));
    if !ok {
        return Err(Error::BadRequest(format!("oauth: the sign-in's name {name:?}: letters, digits, - and _ only")));
    }
    Ok(format!("oauth.{name}"))
}

fn client() -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("Atlas/", env!("CARGO_PKG_VERSION"), " (plugin sign-in)"))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| Error::Other(e.into()))
}

/// The provider's JSON answer, or its own error words (`error_description`) as the error.
fn answer(r: reqwest::blocking::Response, what: &str) -> Result<serde_json::Value> {
    let status = r.status();
    let v: serde_json::Value = r.json().unwrap_or_default();
    if !status.is_success() {
        let said = v["error_description"].as_str().or(v["error"].as_str()).unwrap_or("no reason given");
        return Err(Error::BadRequest(format!("oauth: {what}: the provider answered {status}: {said}")));
    }
    Ok(v)
}

/// The plugin's value, else the vault's; neither is an error naming both.
fn either(own: &Option<String>, vault: &str, what: &str, key: &str) -> Result<String> {
    own.as_deref().map(str::trim).filter(|v| !v.is_empty()).or(Some(vault.trim()).filter(|v| !v.is_empty())).map(String::from).ok_or_else(|| {
        Error::BadRequest(format!("oauth: no {what}: the plugin names none and Settings → Plugins & automation has none ([plugins] {key})"))
    })
}

/// The parameters of the `Bearer` challenge in a `WWW-Authenticate` header (RFC 6750 §3), names lower-cased.
fn bearer_params(header: &str) -> Option<HashMap<String, String>> {
    let at = header.to_ascii_lowercase().find("bearer")?;
    let mut rest = header[at + "bearer".len()..].trim_start();
    let mut out = HashMap::new();
    while let Some(eq) = rest.find('=') {
        let key = rest[..eq].trim().trim_start_matches(',').trim();
        if key.contains(' ') {
            break; // `Basic realm=…`: the next challenge
        }
        let tail = rest[eq + 1..].trim_start();
        let (value, after) = match tail.strip_prefix('"') {
            Some(q) => {
                let end = q.find('"').unwrap_or(q.len());
                (q[..end].to_string(), q.get(end + 1..).unwrap_or(""))
            }
            None => {
                let end = tail.find(',').unwrap_or(tail.len());
                (tail[..end].trim().to_string(), &tail[end..])
            }
        };
        out.insert(key.to_ascii_lowercase(), value);
        rest = after.trim_start().trim_start_matches(',');
    }
    Some(out)
}

/// The provider a service names (RFC 9728): its 401's `resource_metadata`, else its well-known metadata → the first
/// of `authorization_servers`. Older services' `as_uri` / `issuer` in the challenge are taken as they are.
fn issuer_of(perm: &crate::plugins::Permissions, id: &str, resource: &str) -> Result<String> {
    let http = client()?;
    let get = |u: &str| http.get(crate::plugin_net::checked_url(perm, id, u)?).send().map_err(|e| Error::BadRequest(format!("oauth: {u}: {e}")));
    let r = get(resource)?;
    let challenge = r.headers().get(reqwest::header::WWW_AUTHENTICATE).and_then(|v| v.to_str().ok()).and_then(bearer_params).unwrap_or_default();
    if r.status().is_redirection() && challenge.is_empty() {
        let to = r.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok()).unwrap_or("?");
        return Err(Error::BadRequest(format!("oauth: {resource} sends the browser to {to}: a sign-in door in front of the service, not a token — sign in to it as a service (atlas.signIn)")));
    }
    if let Some(i) = challenge.get("as_uri").or(challenge.get("issuer")) {
        return Ok(i.clone());
    }
    let u = crate::plugin_net::checked_url(perm, id, resource)?;
    let well_known = |path: &str| format!("{}://{}/.well-known/oauth-protected-resource{path}", u.scheme(), u.authority());
    let mut tries: Vec<String> = challenge.get("resource_metadata").cloned().into_iter().collect();
    if u.path() != "/" {
        tries.push(well_known(u.path().trim_end_matches('/')));
    }
    tries.push(well_known(""));
    for t in &tries {
        let r = get(t)?;
        if r.status().is_success() {
            let meta: serde_json::Value = r.json().unwrap_or_default();
            if let Some(i) = meta["authorization_servers"].get(0).and_then(|v| v.as_str()) {
                return Ok(i.to_string());
            }
        }
    }
    Err(Error::BadRequest(format!("oauth: {resource} names no provider (no Bearer resource_metadata, nothing at {}): give the plugin an issuer", tries.join(", "))))
}

/// Step 1: the provider's sign-in address for this plugin.
pub fn start(root: &Path, id: &str, s: &OauthStart, vault: &crate::config::PluginsConfig) -> Result<OauthStarted> {
    secret_of(&s.name)?;
    let perm = crate::plugins::permissions(root, id)?;
    if !perm.secrets {
        return Err(Error::BadRequest(format!("oauth: plugin {id} keeps no secrets: add [permissions] secrets = true to its plugin.toml")));
    }
    let issuer = match (&s.issuer, s.resource.as_deref().map(str::trim).filter(|r| !r.is_empty())) {
        (Some(i), _) if !i.trim().is_empty() => i.clone(),
        (_, Some(r)) => issuer_of(&perm, id, r)?,
        _ => either(&None, &vault.oidc_issuer, "provider (issuer)", "oidc_issuer")?,
    };
    let client_id = either(&s.client_id, &vault.oidc_client_id, "client id", "oidc_client_id")?;
    let redirect = either(&s.redirect, &vault.oidc_redirect, "redirect address", "oidc_redirect")?;
    let discovery = format!("{}/.well-known/openid-configuration", issuer.trim().trim_end_matches('/'));
    let found = answer(client()?.get(crate::plugin_net::checked_url(&perm, id, &discovery)?).send().map_err(|e| Error::BadRequest(format!("oauth: {discovery}: {e}")))?, "discovery")?;
    let endpoint = |k: &str| -> Result<reqwest::Url> {
        let u = found[k].as_str().ok_or_else(|| Error::BadRequest(format!("oauth: {discovery} names no {k}")))?;
        crate::plugin_net::checked_url(&perm, id, u)
    };
    let (auth, token) = (endpoint("authorization_endpoint")?, endpoint("token_endpoint")?);
    let (verifier, state) = (random(48)?, random(24)?);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let scopes = s.scopes.clone().filter(|v| !v.is_empty()).map(|v| v.join(" ")).unwrap_or_else(|| "openid offline_access".into());
    let mut url = auth;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("scope", &scopes)
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");
    let mut p = pending().lock().unwrap_or_else(|e| e.into_inner());
    p.retain(|_, v| v.made.elapsed() < PENDING_FOR);
    p.insert(state, Pending { plugin: id.into(), name: s.name.clone(), issuer: issuer.trim().trim_end_matches('/').into(), verifier, token_endpoint: token.to_string(), client_id, redirect: redirect.clone(), made: Instant::now() });
    Ok(OauthStarted { url: url.to_string(), redirect })
}

/// Step 3: the address the provider sent the browser back to (`…?code=…&state=…`) → tokens, kept. Answers the name.
pub fn finish(secrets: &Store, id: &str, address: &str) -> Result<String> {
    let u = reqwest::Url::parse(address.trim()).map_err(|e| Error::BadRequest(format!("oauth: {address:?}: {e}")))?;
    let q: HashMap<String, String> = u.query_pairs().into_owned().collect();
    if let Some(e) = q.get("error") {
        return Err(Error::BadRequest(format!("oauth: the provider said no: {}", q.get("error_description").unwrap_or(e))));
    }
    let (code, state) = q.get("code").zip(q.get("state")).ok_or_else(|| Error::BadRequest("oauth: the address has no code and state: the sign-in did not finish".into()))?;
    let p = {
        let mut all = pending().lock().unwrap_or_else(|e| e.into_inner());
        match all.remove(state) {
            Some(p) if p.plugin == id && p.made.elapsed() < PENDING_FOR => p,
            _ => return Err(Error::BadRequest("oauth: this sign-in is unknown or too old: start it again".into())),
        }
    };
    let form = [("grant_type", "authorization_code"), ("code", code), ("redirect_uri", &p.redirect), ("client_id", &p.client_id), ("code_verifier", &p.verifier)];
    let v = answer(client()?.post(&p.token_endpoint).form(&form).send().map_err(|e| Error::BadRequest(format!("oauth: {}: {e}", p.token_endpoint)))?, "the code")?;
    let tokens = share(secrets, &v, &p.token_endpoint, &p.client_id, &p.issuer, "")?;
    link(secrets, id, &p.name, &provider_key(&tokens.token_endpoint))?;
    Ok(p.name)
}

/// The token answer, kept as the provider's (shared); a refresh that brings no new refresh token keeps the old one.
fn share(secrets: &Store, v: &serde_json::Value, token_endpoint: &str, client_id: &str, issuer: &str, old_refresh: &str) -> Result<Tokens> {
    let access = v["access_token"].as_str().ok_or_else(|| Error::BadRequest("oauth: the provider sent no access_token".into()))?;
    let t = Tokens {
        access: access.into(),
        refresh: v["refresh_token"].as_str().unwrap_or(old_refresh).into(),
        expires: v["expires_in"].as_u64().map(|s| now() + s).unwrap_or(0),
        token_endpoint: token_endpoint.into(),
        client_id: client_id.into(),
        issuer: issuer.into(),
        renewed: now(),
    };
    secrets.set(SECTION, &provider_key(token_endpoint), &serde_json::to_string(&t).map_err(|e| Error::Other(e.into()))?)?;
    Ok(t)
}

fn link(secrets: &Store, id: &str, name: &str, provider: &str) -> Result<()> {
    secrets.set(id, &secret_of(name)?, &serde_json::to_string(&Link::To { provider: provider.into() }).map_err(|e| Error::Other(e.into()))?)
}

fn shared(secrets: &Store, provider: &str) -> Result<Option<Tokens>> {
    Ok(secrets.get(SECTION, provider)?.and_then(|t| serde_json::from_str(&t).ok()))
}

/// The provider plugin `id`'s sign-in `name` uses, and its tokens. A plugin's own tokens from before sharing move to
/// the shared place on the way.
fn linked(secrets: &Store, id: &str, name: &str) -> Result<Option<(String, Tokens)>> {
    let Some(raw) = secrets.get(id, &secret_of(name)?)? else { return Ok(None) };
    match serde_json::from_str::<Link>(&raw) {
        Ok(Link::To { provider }) => Ok(shared(secrets, &provider)?.map(|t| (provider, t))),
        Ok(Link::Own(t)) => {
            let key = provider_key(&t.token_endpoint);
            let issuer = t.issuer.clone();
            let mut answer = serde_json::json!({ "access_token": t.access, "refresh_token": t.refresh });
            if t.expires != 0 {
                answer["expires_in"] = t.expires.saturating_sub(now()).into();
            }
            let t = share(secrets, &answer, &t.token_endpoint, &t.client_id, &issuer, "")?;
            link(secrets, id, name, &key)?;
            Ok(Some((key, t)))
        }
        Err(_) => Ok(None),
    }
}

/// Usable: still valid, or able to renew itself.
fn fresh_or_renewable(t: &Tokens) -> bool {
    t.expires == 0 || t.expires > now() + RENEW_BEFORE || !t.refresh.is_empty()
}

/// One renewal at a time: a provider rotating refresh tokens (Authelia) refuses one used twice.
fn renewing() -> &'static Mutex<()> {
    static R: OnceLock<Mutex<()>> = OnceLock::new();
    R.get_or_init(Default::default)
}

/// The provider's tokens renewed with its refresh token; the rotated one kept.
fn renew(secrets: &Store, provider: &str) -> Result<Tokens> {
    let _one = renewing().lock().unwrap_or_else(|e| e.into_inner());
    let t = shared(secrets, provider)?.ok_or_else(|| Error::BadRequest("oauth: the sign-in is gone: sign in again".into()))?;
    if t.expires != 0 && t.expires > now() + RENEW_BEFORE && now().saturating_sub(t.renewed) < 60 {
        return Ok(t); // renewed by another plugin while this one waited
    }
    if t.refresh.is_empty() {
        return Err(Error::BadRequest("oauth: the sign-in has ended (no refresh token): sign in again".into()));
    }
    let form = [("grant_type", "refresh_token"), ("refresh_token", t.refresh.as_str()), ("client_id", t.client_id.as_str())];
    let v = answer(client()?.post(&t.token_endpoint).form(&form).send().map_err(|e| Error::BadRequest(format!("oauth: {}: {e}", t.token_endpoint)))?, "renewing the sign-in")?;
    share(secrets, &v, &t.token_endpoint, &t.client_id, &t.issuer, &t.refresh)
}

/// Before a fetch with `{ oauth: name }`: can sign-in `name` give a token? When the plugin has none yet it takes the
/// vault's provider's, if signed in already; otherwise a silent sign-in through a kept gate session is tried (the
/// provider's own page never shown). False: the page offers the sign-in window.
pub fn ready(root: &Path, secrets: &Store, id: &str, name: &str, resource: &str) -> Result<bool> {
    if linked(secrets, id, name)?.is_some_and(|(_, t)| fresh_or_renewable(&t)) {
        return Ok(true);
    }
    let vault = crate::config::Config::load(root).map(|c| c.plugins).unwrap_or_default();
    let issuer = vault.oidc_issuer.trim().trim_end_matches('/');
    if !issuer.is_empty() {
        for key in secrets.names(SECTION)?.into_iter().filter(|k| k.starts_with("oidc.")) {
            if shared(secrets, &key)?.is_some_and(|t| t.issuer == issuer && fresh_or_renewable(&t)) {
                link(secrets, id, name, &key)?;
                return Ok(true);
            }
        }
    }
    Ok(silent(root, secrets, id, name, resource, &vault).unwrap_or_else(|e| {
        eprintln!("atlas: a silent sign-in for {id} ({name}): {e}");
        false
    }))
}

/// The authorization request with `prompt=none` and the kept gate cookie for the provider's host: a provider that
/// knows the session (Authelia's portal shares its cookie with its OpenID side) answers the redirect with a code at
/// once. Anything else (`login_required`, no cookie kept, a page) is false.
fn silent(root: &Path, secrets: &Store, id: &str, name: &str, resource: &str, vault: &crate::config::PluginsConfig) -> Result<bool> {
    let perm = crate::plugins::permissions(root, id)?;
    let ask = OauthStart { name: name.into(), issuer: None, resource: vault.oidc_issuer.trim().is_empty().then(|| resource.to_string()), client_id: None, scopes: None, redirect: None };
    let started = start(root, id, &ask, vault)?;
    let mut url = reqwest::Url::parse(&started.url).map_err(|e| Error::Other(e.into()))?;
    url.query_pairs_mut().append_pair("prompt", "none");
    let Some(cookie) = crate::plugin_net::kept_cookie(&perm, secrets, &url, &Default::default())? else { return Ok(false) };
    let r = client()?.get(url).header(reqwest::header::COOKIE, cookie).send().map_err(|e| Error::BadRequest(format!("oauth: {e}")))?;
    let to = r.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok()).unwrap_or_default();
    if !r.status().is_redirection() || !to.starts_with(&started.redirect) || !to.contains("code=") {
        return Ok(false);
    }
    finish(secrets, id, to)?;
    Ok(true)
}

/// Step 4: a current access token for sign-in `name`, renewed first when it is (nearly) out of date.
pub fn access_token(secrets: &Store, id: &str, name: &str) -> Result<String> {
    let (provider, t) = linked(secrets, id, name)?.ok_or_else(|| Error::BadRequest(format!("oauth: plugin {id} is not signed in to {name:?}: sign in first")))?;
    if t.expires == 0 || t.expires > now() + RENEW_BEFORE {
        return Ok(t.access);
    }
    Ok(renew(secrets, &provider)?.access)
}

pub fn status(secrets: &Store, id: &str, name: &str) -> Result<OauthStatus> {
    Ok(match linked(secrets, id, name)? {
        Some((_, t)) => OauthStatus { signed_in: t.expires == 0 || t.expires > now() || !t.refresh.is_empty(), expires: t.expires, renews: !t.refresh.is_empty() },
        None => OauthStatus { signed_in: false, expires: 0, renews: false },
    })
}

/// The plugin stops using the provider; the provider's sign-in stays for the others (Settings forgets it).
pub fn sign_out(secrets: &Store, id: &str, name: &str) -> Result<bool> {
    secrets.delete(id, &secret_of(name)?)
}

/// A provider's sign-in, as Settings lists it (no token).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct OidcSignin {
    /// Its key, to forget it by.
    pub key: String,
    /// The provider's address (empty for one kept before it was recorded: then its token endpoint).
    pub issuer: String,
    /// Unix seconds the access token lasts to; 0 when the provider did not say.
    #[ts(type = "number")]
    pub expires: u64,
    pub renews: bool,
    /// Unix seconds the provider last answered.
    #[ts(type = "number")]
    pub renewed: u64,
    /// The plugins signed in with it.
    pub plugins: Vec<String>,
}

/// Every provider signed in, with the plugins that use it (`ids`: the vault's plugins).
pub fn providers(secrets: &Store, ids: &[String]) -> Result<Vec<OidcSignin>> {
    let mut out = Vec::new();
    for key in secrets.names(SECTION)?.into_iter().filter(|k| k.starts_with("oidc.")) {
        let Some(t) = shared(secrets, &key)? else { continue };
        let mut plugins = Vec::new();
        for id in ids {
            for n in secrets.names(id).unwrap_or_default().into_iter().filter_map(|n| n.strip_prefix("oauth.").map(String::from)) {
                if linked(secrets, id, &n).ok().flatten().is_some_and(|(p, _)| p == key) && !plugins.contains(id) {
                    plugins.push(id.clone());
                }
            }
        }
        let issuer = if t.issuer.is_empty() { t.token_endpoint.clone() } else { t.issuer.clone() };
        out.push(OidcSignin { key, issuer, expires: t.expires, renews: !t.refresh.is_empty(), renewed: t.renewed, plugins });
    }
    Ok(out)
}

pub fn forget(secrets: &Store, key: &str) -> Result<bool> {
    if !key.starts_with("oidc.") {
        return Err(Error::BadRequest(format!("oauth: {key:?} is not a provider's sign-in")));
    }
    secrets.delete(SECTION, key)
}

/// Refresh tokens end unused (Authelia: 30 days) and rotate on use: a provider not used for a week is renewed, so a
/// sign-in outlives a quiet month. Called by the sign-ins' keep-alive.
pub fn keep_alive(secrets: &Store) {
    const QUIET: u64 = 7 * 86400;
    for key in secrets.names(SECTION).unwrap_or_default().into_iter().filter(|k| k.starts_with("oidc.")) {
        if shared(secrets, &key).ok().flatten().is_some_and(|t| !t.refresh.is_empty() && now().saturating_sub(t.renewed) > QUIET) {
            if let Err(e) = renew(secrets, &key) {
                eprintln!("atlas: keeping the OpenID sign-in {key}: {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::PluginsConfig;
    use std::io::{BufRead, BufReader, Read, Write};

    /// A stand-in provider: discovery, then token answers in order; every request seen is returned.
    fn provider(tokens: Vec<&'static str>) -> (u16, std::thread::JoinHandle<Vec<String>>) {
        serve(move |port| {
            let mut answers = vec![json(&discovery(port))];
            answers.extend(tokens.into_iter().map(json));
            answers
        })
    }

    fn discovery(port: u16) -> String {
        format!(r#"{{"authorization_endpoint":"http://127.0.0.1:{port}/authorize","token_endpoint":"http://127.0.0.1:{port}/token"}}"#)
    }

    /// A JSON answer: 400 when it is an OAuth error, 200 otherwise.
    fn json(body: &str) -> String {
        let status = if body.contains("\"error\"") { "400 Bad Request" } else { "200 OK" };
        format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
    }

    /// A stand-in server answering whole HTTP responses in order (made knowing its port); returns what it was sent.
    fn serve(answers: impl FnOnce(u16) -> Vec<String>) -> (u16, std::thread::JoinHandle<Vec<String>>) {
        serve_with(move |port| {
            let all = answers(port);
            let n = all.len();
            let mut queue = all.into_iter();
            (n, move |_: &str| queue.next().unwrap())
        })
    }

    /// The same, for `n` requests, each answer made from the request it answers.
    fn serve_with<F: FnMut(&str) -> String + Send + 'static>(make: impl FnOnce(u16) -> (usize, F)) -> (u16, std::thread::JoinHandle<Vec<String>>) {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let (n, mut answer) = make(port);
        let t = std::thread::spawn(move || {
            let mut seen = Vec::new();
            for _ in 0..n {
                let (mut s, _) = l.accept().unwrap();
                let mut r = BufReader::new(s.try_clone().unwrap());
                let mut head = String::new();
                loop {
                    let mut line = String::new();
                    if r.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                        break;
                    }
                    head.push_str(&line);
                }
                let len = head.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|n| n.trim().parse::<usize>().unwrap())).unwrap_or(0);
                let mut b = vec![0; len];
                r.read_exact(&mut b).unwrap();
                let req = head + &String::from_utf8_lossy(&b);
                s.write_all(answer(&req).as_bytes()).unwrap();
                seen.push(req);
            }
            seen
        });
        (port, t)
    }

    fn plugin(root: &Path, net: &str) {
        let d = root.join(".atlas/plugins/net");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("plugin.toml"), format!("title = \"Net\"\n[permissions]\nnet = [\"{net}\"]\nsecrets = true\n")).unwrap();
    }

    #[test]
    fn bearer_challenges_read_with_quotes_commas_and_other_schemes() {
        let p = bearer_params(r#"Basic realm="x", Bearer realm="api, v2", resource_metadata="https://a/.well-known/oauth-protected-resource", error=invalid_token"#).unwrap();
        assert_eq!(p["realm"], "api, v2");
        assert_eq!(p["resource_metadata"], "https://a/.well-known/oauth-protected-resource");
        assert_eq!(p["error"], "invalid_token");
        assert_eq!(bearer_params(r#"Bearer as_uri="https://auth", Basic realm="b""#).unwrap().len(), 1, "the next challenge is not Bearer's");
        assert!(bearer_params("Basic realm=x").is_none());
    }

    #[test]
    fn the_provider_found_from_the_services_401_and_the_vaults_client() {
        let vault = tempfile::tempdir().unwrap();
        plugin(vault.path(), "127.0.0.1");
        // the service: 401 naming its metadata → the metadata names the provider (itself here) → discovery
        let (port, server) = serve(|port| {
            let unauthorized = format!("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer realm=\"api\", resource_metadata=\"http://127.0.0.1:{port}/meta\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            vec![unauthorized, json(&format!(r#"{{"resource":"x","authorization_servers":["http://127.0.0.1:{port}/idp"]}}"#)), json(&discovery(port))]
        });
        let vault_cfg = PluginsConfig { oidc_client_id: "atlas-vault".into(), oidc_redirect: "https://localhost/back".into(), ..Default::default() };
        let ask = OauthStart { name: "svc".into(), issuer: None, resource: Some(format!("http://127.0.0.1:{port}/api/items")), client_id: None, scopes: None, redirect: None };
        let started = start(vault.path(), "net", &ask, &vault_cfg).unwrap();
        assert_eq!(started.redirect, "https://localhost/back");
        let q: HashMap<String, String> = reqwest::Url::parse(&started.url).unwrap().query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "atlas-vault");
        let seen = server.join().unwrap();
        assert!(seen[0].starts_with("GET /api/items "), "{}", seen[0]);
        assert!(seen[1].starts_with("GET /meta "), "{}", seen[1]);
        assert!(seen[2].starts_with("GET /idp/.well-known/openid-configuration "), "{}", seen[2]);

        // no challenge: the well-known metadata at the service's path, then at its root
        let (port, server) = serve(|port| {
            let bare = "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string();
            let missing = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string();
            vec![bare, missing, json(&format!(r#"{{"authorization_servers":["http://127.0.0.1:{port}"]}}"#)), json(&discovery(port))]
        });
        let ask = OauthStart { resource: Some(format!("http://127.0.0.1:{port}/api")), ..ask };
        start(vault.path(), "net", &ask, &vault_cfg).unwrap();
        let seen = server.join().unwrap();
        assert!(seen[1].starts_with("GET /.well-known/oauth-protected-resource/api "), "{}", seen[1]);
        assert!(seen[2].starts_with("GET /.well-known/oauth-protected-resource "), "{}", seen[2]);

        // a sign-in door (forward auth): said so, not a token sign-in
        let (port, _server) = serve(|_| vec!["HTTP/1.1 302 Found\r\nLocation: https://auth.example.org/?rd=x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string()]);
        let ask = OauthStart { resource: Some(format!("http://127.0.0.1:{port}/")), ..ask };
        assert!(start(vault.path(), "net", &ask, &vault_cfg).unwrap_err().to_string().contains("sign-in door"));

        // nothing named anywhere: the error says where to set it
        let ask = OauthStart { resource: None, ..ask };
        assert!(start(vault.path(), "net", &ask, &vault_cfg).unwrap_err().to_string().contains("oidc_issuer"));
    }

    #[test]
    fn pkce_encoding_matches_python() {
        // the expected value from Python: base64.urlsafe_b64encode(hashlib.sha256(v).digest()).rstrip(b"=")
        let challenge = b64url(&Sha256::digest(b"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gXk2fV8xs"));
        assert_eq!(challenge, "BTHu763bJ02h4W5TE7m6xpETWmwm5KGn4azcgEh54qk");
        assert_eq!(b64url(b"f"), "Zg");
        assert_eq!(b64url(b"fo"), "Zm8");
        assert_eq!(b64url(b"foo"), "Zm9v");
    }

    #[test]
    fn sign_in_keeps_tokens_and_renews_them_and_the_token_never_needs_a_page() {
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let secrets = Store::in_dir(sdir.path(), vault.path());
        let (port, server) = provider(vec![
            r#"{"access_token":"acc-1","refresh_token":"ref-1","expires_in":30,"token_type":"Bearer"}"#,
            r#"{"access_token":"acc-2","expires_in":3600}"#,
        ]);

        // a provider on a host the plugin did not declare: refused before anything is sent
        plugin(vault.path(), "example.org");
        let ask = OauthStart { name: "authelia".into(), issuer: Some(format!("http://127.0.0.1:{port}/")), resource: None, client_id: Some("atlas".into()), scopes: None, redirect: Some("https://localhost/atlas".into()) };
        let none = PluginsConfig::default();
        assert!(start(vault.path(), "net", &ask, &none).unwrap_err().to_string().contains("may not reach 127.0.0.1"));

        plugin(vault.path(), "127.0.0.1");
        let url = reqwest::Url::parse(&start(vault.path(), "net", &ask, &none).unwrap().url).unwrap();
        let q: HashMap<String, String> = url.query_pairs().into_owned().collect();
        assert_eq!(url.path(), "/authorize");
        assert_eq!((q["client_id"].as_str(), q["scope"].as_str(), q["code_challenge_method"].as_str()), ("atlas", "openid offline_access", "S256"));
        assert_eq!(q["redirect_uri"], "https://localhost/atlas");

        // the provider said no / a stranger's state: errors in words, nothing kept
        assert!(finish(&secrets, "net", "https://localhost/atlas?error=access_denied&error_description=Nope").unwrap_err().to_string().contains("Nope"));
        assert!(finish(&secrets, "net", "https://localhost/atlas?code=c&state=forged").unwrap_err().to_string().contains("start it again"));
        assert!(!status(&secrets, "net", "authelia").unwrap().signed_in);

        assert_eq!(finish(&secrets, "net", &format!("https://localhost/atlas?code=the-code&state={}", q["state"])).unwrap(), "authelia");
        let st = status(&secrets, "net", "authelia").unwrap();
        assert!(st.signed_in && st.renews);
        // 30 s left is inside the renewal margin: the next use renews, and keeps the refresh token the answer lacked
        assert_eq!(access_token(&secrets, "net", "authelia").unwrap(), "acc-2");
        assert_eq!(access_token(&secrets, "net", "authelia").unwrap(), "acc-2", "fresh now: no request");
        assert!(!secrets.get("net", "oauth.authelia").unwrap().unwrap().contains("ref-1"), "the plugin keeps only a link");
        let listed = providers(&secrets, &["net".into()]).unwrap();
        assert_eq!((listed.len(), listed[0].plugins.as_slice(), listed[0].issuer.as_str()), (1, ["net".to_string()].as_slice(), format!("http://127.0.0.1:{port}").as_str()));
        assert!(secrets.get(SECTION, &listed[0].key).unwrap().unwrap().contains("ref-1"), "the provider's tokens, shared");

        let seen = server.join().unwrap();
        assert!(seen[1].contains("grant_type=authorization_code") && seen[1].contains("code=the-code") && seen[1].contains("code_verifier="), "{}", seen[1]);
        assert!(seen[2].contains("grant_type=refresh_token") && seen[2].contains("refresh_token=ref-1"), "{}", seen[2]);

        assert!(sign_out(&secrets, "net", "authelia").unwrap());
        assert!(access_token(&secrets, "net", "authelia").unwrap_err().to_string().contains("sign in first"));
        assert_eq!(providers(&secrets, &["net".into()]).unwrap()[0].plugins.len(), 0, "the provider stays for other plugins");
        assert!(secret_of("../x").is_err());
    }

    /// The vault's provider, its client and redirect, in the vault's config.
    fn vault_provider(root: &Path, port: u16) {
        std::fs::write(root.join(".atlas/config.toml"), format!("[plugins]\noidc_issuer = \"http://127.0.0.1:{port}/\"\noidc_client_id = \"atlas\"\noidc_redirect = \"https://localhost/atlas\"\n")).unwrap();
    }

    /// A query parameter of the request line `GET /path?… HTTP/1.1`.
    fn param(req: &str, key: &str) -> String {
        let target = req.split_whitespace().nth(1).unwrap();
        reqwest::Url::parse(&format!("http://x{target}")).unwrap().query_pairs().find(|(k, _)| k == key).map(|(_, v)| v.into_owned()).unwrap_or_default()
    }

    #[test]
    fn a_kept_gate_session_signs_in_silently_and_a_second_plugin_shares_the_token() {
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let secrets = Store::in_dir(sdir.path(), vault.path());
        plugin(vault.path(), "127.0.0.1");
        // the gate's session, kept from a door sign-in
        let cookie = crate::service_signin::Cookie { name: "authelia_session".into(), value: "sess".into(), domain: "127.0.0.1".into(), host_only: true, path: "/".into(), secure: false, expires: None };
        crate::service_signin::keep(&secrets, "127.0.0.1", vec![cookie]).unwrap();
        // discovery, then the authorization request answered with a code (the session is known), then the token
        let (port, server) = serve_with(|port| {
            let mut n = 0;
            (3, move |req: &str| {
                n += 1;
                match n {
                    1 => json(&discovery(port)),
                    2 => format!("HTTP/1.1 302 Found\r\nLocation: https://localhost/atlas?code=silent&state={}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", param(req, "state")),
                    _ => json(r#"{"access_token":"acc","refresh_token":"ref","expires_in":3600}"#),
                }
            })
        });
        vault_provider(vault.path(), port);
        assert!(ready(vault.path(), &secrets, "net", "svc", "http://127.0.0.1/api").unwrap());
        assert_eq!(access_token(&secrets, "net", "svc").unwrap(), "acc");
        let seen = server.join().unwrap();
        assert_eq!(param(&seen[1], "prompt"), "none");
        assert!(seen[1].contains("authelia_session=sess"), "the gate's cookie went with it: {}", seen[1]);
        assert!(seen[2].contains("code=silent"), "{}", seen[2]);

        // another plugin of the vault: the provider's token, no request at all
        let d = vault.path().join(".atlas/plugins/other");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("plugin.toml"), "title = \"Other\"\n[permissions]\nnet = [\"127.0.0.1\"]\nsecrets = true\n").unwrap();
        assert!(ready(vault.path(), &secrets, "other", "authelia", "http://127.0.0.1/x").unwrap());
        assert_eq!(access_token(&secrets, "other", "authelia").unwrap(), "acc");
        assert_eq!(providers(&secrets, &["net".into(), "other".into()]).unwrap()[0].plugins, ["net", "other"]);
    }

    #[test]
    fn a_provider_that_wants_its_page_leaves_the_sign_in_to_the_window() {
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let secrets = Store::in_dir(sdir.path(), vault.path());
        plugin(vault.path(), "127.0.0.1");
        let cookie = crate::service_signin::Cookie { name: "authelia_session".into(), value: "old".into(), domain: "127.0.0.1".into(), host_only: true, path: "/".into(), secure: false, expires: None };
        crate::service_signin::keep(&secrets, "127.0.0.1", vec![cookie]).unwrap();
        let (port, server) = serve_with(|port| {
            let mut n = 0;
            (2, move |req: &str| {
                n += 1;
                if n == 1 { json(&discovery(port)) } else { format!("HTTP/1.1 302 Found\r\nLocation: https://localhost/atlas?error=login_required&state={}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", param(req, "state")) }
            })
        });
        vault_provider(vault.path(), port);
        assert!(!ready(vault.path(), &secrets, "net", "svc", "http://127.0.0.1/api").unwrap());
        server.join().unwrap();
        // no gate session at all: nothing is asked of the provider beyond its discovery
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let secrets = Store::in_dir(sdir.path(), vault.path());
        plugin(vault.path(), "127.0.0.1");
        let (port, server) = serve(|port| vec![json(&discovery(port))]);
        vault_provider(vault.path(), port);
        assert!(!ready(vault.path(), &secrets, "net", "svc", "http://127.0.0.1/api").unwrap());
        assert_eq!(server.join().unwrap().len(), 1);
    }

    #[test]
    fn a_plugins_own_tokens_from_before_move_to_the_shared_place() {
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let secrets = Store::in_dir(sdir.path(), vault.path());
        secrets.set("net", "oauth.old", r#"{"access":"a","refresh":"r","expires":0,"token_endpoint":"https://auth.example.org/api/oidc/token","client_id":"atlas"}"#).unwrap();
        assert_eq!(access_token(&secrets, "net", "old").unwrap(), "a");
        assert!(secrets.get("net", "oauth.old").unwrap().unwrap().contains("provider"));
        let p = &providers(&secrets, &["net".into()]).unwrap()[0];
        assert_eq!((p.issuer.as_str(), p.renews, p.plugins.as_slice()), ("https://auth.example.org/api/oidc/token", true, ["net".to_string()].as_slice()));
        assert!(forget(&secrets, &p.key).unwrap());
        assert!(forget(&secrets, "door.x").is_err(), "only a provider's sign-in");
    }
}
