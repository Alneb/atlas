//! The desktop's bridge to a vault on a server (docs/design/DESIGN-desktop-remote.md "Revised"). A page of this computer cannot carry the gate's session (Authelia) to
//! the server — cross-site, the cookie stays behind, and a page may not set `Cookie` — so the desktop's own core does
//! what Android does in Java: `/remote/<host>/<rest>` goes to `https://<host>/<rest>` with the gate's cookies kept for
//! that host (service_signin, the same sign-in window the plugins use), and a WebSocket is piped both ways. The page is
//! the desktop's own (`/r/<host>/<vault path>`, its API base set to the bridge). Only the server vaults on the vault list
//! are reached, and only by a desktop core (server.rs checks).
use crate::secrets::Store;
use axum::body::{Body, Bytes};
use axum::extract::ws::{Message, WebSocket};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt};
use std::sync::OnceLock;

/// What never crosses a hop (RFC 9110 §7.6.1), what the bridge sets itself, and what is this computer's own.
const DROP: [&str; 13] = [
    "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
    "cookie", "origin", "referer", "content-length",
];

/// The server behind `host` (`host` or `host:port`) when it is a server vault on the vault list or a local vault's mirror
/// — the only places the bridge goes: its scheme and authority (`https://atlas.example.org`).
pub fn base(host: &str) -> Option<String> {
    base_in(&crate::vaults::list(&crate::vaults::list_file()), host)
}

fn base_in(list: &[crate::vaults::Vault], host: &str) -> Option<String> {
    list.iter()
        .flat_map(|v| [v.url.as_deref(), v.mirror.as_deref()])
        .filter_map(|u| u.and_then(|u| reqwest::Url::parse(u).ok()))
        .find(|u| {
            let authority = match u.port() { Some(p) => format!("{}:{p}", u.host_str().unwrap_or_default()), None => u.host_str().unwrap_or_default().to_string() };
            authority.eq_ignore_ascii_case(host)
        })
        .map(|u| u.origin().ascii_serialization())
}

fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    // a dead network must fail fast, not hang every save behind it until TCP gives up (minutes): the page holds its
    // edits for the mirror meanwhile (Editor.svelte)
    C.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(std::time::Duration::from_secs(6))
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("an HTTP client")
    })
}

fn said(status: StatusCode, json: serde_json::Value) -> Response {
    (status, axum::Json(json)).into_response()
}

/// One request to the server, answered as it answers — but a redirect (the gate's portal: not signed in, or the session
/// ran out) is said as JSON the app understands (`signin`), never followed into its HTML.
pub async fn forward(store: &Store, base: &str, rest: &str, query: Option<&str>, method: Method, headers: &HeaderMap, body: Bytes) -> Response {
    let host = base.split("://").nth(1).unwrap_or(base);
    let Ok(url) = reqwest::Url::parse(&format!("{base}/{rest}{}", query.map(|q| format!("?{q}")).unwrap_or_default())) else {
        return said(StatusCode::BAD_REQUEST, serde_json::json!({ "error": "not an address" }));
    };
    let mut req = client().request(method, url.clone()).header("accept-encoding", "identity");
    for (k, v) in headers {
        if !DROP.contains(&k.as_str()) && k != "accept-encoding" {
            req = req.header(k, v);
        }
    }
    if let Ok(Some(c)) = crate::service_signin::cookie_header(store, &url) {
        req = req.header("cookie", c);
    }
    let res = match req.body(body).send().await {
        Ok(r) => r,
        // `unsent`: the server never had the request (no connection), so the page may do it here instead; after a
        // timeout it may have been done there — 504, never redone elsewhere
        Err(e) if e.is_timeout() && !e.is_connect() => return said(StatusCode::GATEWAY_TIMEOUT, serde_json::json!({ "error": format!("{host} took too long: {e}") })),
        Err(e) => return said(StatusCode::BAD_GATEWAY, serde_json::json!({ "error": format!("{host} did not answer: {e}"), "unsent": e.is_connect() })),
    };
    if res.status().is_redirection() {
        return said(StatusCode::UNAUTHORIZED, serde_json::json!({ "error": format!("sign in to {host}"), "signin": { "url": format!("{base}/") } }));
    }
    let mut out = Response::builder().status(res.status().as_u16());
    for (k, v) in res.headers() {
        if !DROP.contains(&k.as_str()) && k != "set-cookie" {
            out = out.header(k.as_str(), v.as_bytes());
        }
    }
    out.body(Body::from_stream(res.bytes_stream())).unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

/// A WebSocket of the page piped to the same place on the server, both ways, until either side closes.
pub async fn pipe(socket: WebSocket, store: Store, base: String, rest: String, query: Option<String>) {
    let http = format!("{base}/{rest}{}", query.map(|q| format!("?{q}")).unwrap_or_default());
    if let Some(upstream) = connect(&store, &http).await {
        splice(socket, upstream).await;
    }
}

pub type Upstream = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// A WebSocket to the server at `http` (its `http(s)://` address), signed in with the gate's kept cookies; `None`: it
/// did not answer (in a few seconds) or refused.
pub async fn connect(store: &Store, http: &str) -> Option<Upstream> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let url = http.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1);
    let mut req = url.as_str().into_client_request().ok()?;
    let cookie = reqwest::Url::parse(http).ok().and_then(|u| crate::service_signin::cookie_header(store, &u).ok().flatten());
    if let Some(c) = cookie.and_then(|c| c.parse().ok()) {
        req.headers_mut().insert("cookie", c);
    }
    req.headers_mut().insert("x-atlas", axum::http::HeaderValue::from_static("1"));
    let connecting = tokio_tungstenite::connect_async(req);
    match tokio::time::timeout(std::time::Duration::from_secs(6), connecting).await {
        Ok(Ok((upstream, _))) => Some(upstream),
        _ => None,
    }
}

/// The page's socket and the server's, both ways, until either side closes.
pub async fn splice(socket: WebSocket, upstream: Upstream) {
    use tokio_tungstenite::tungstenite::Message as Up;
    let (mut up_tx, mut up_rx) = upstream.split();
    let (mut down_tx, mut down_rx) = socket.split();
    loop {
        tokio::select! {
            m = down_rx.next() => match m {
                Some(Ok(Message::Text(t))) => if up_tx.send(Up::Text(t.as_str().into())).await.is_err() { break },
                Some(Ok(Message::Binary(b))) => if up_tx.send(Up::Binary(b)).await.is_err() { break },
                Some(Ok(Message::Ping(p))) => if up_tx.send(Up::Ping(p)).await.is_err() { break },
                Some(Ok(Message::Pong(_))) => {}
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
            },
            m = up_rx.next() => match m {
                Some(Ok(Up::Text(t))) => if down_tx.send(Message::Text(t.as_str().into())).await.is_err() { break },
                Some(Ok(Up::Binary(b))) => if down_tx.send(Message::Binary(b)).await.is_err() { break },
                Some(Ok(Up::Ping(p))) => if down_tx.send(Message::Ping(p)).await.is_err() { break },
                Some(Ok(Up::Pong(_) | Up::Frame(_))) => {}
                Some(Ok(Up::Close(_))) | None | Some(Err(_)) => break,
            },
        }
    }
    let _ = up_tx.close().await;
    let _ = down_tx.close().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bridge_goes_to_the_listed_servers_and_the_mirrors_of_folders_only() {
        let v = |path: &str, url: Option<&str>, mirror: Option<&str>| crate::vaults::Vault {
            name: "x".into(), path: path.into(), last_opened: 0, missing: false, url: url.map(Into::into), mirror: mirror.map(Into::into), warm: false,
        };
        let list = [v("/home/u/Work", None, Some("https://mirror.example.org/v/work/")), v("https://notes.example.org:8443/", Some("https://notes.example.org:8443/"), None)];
        assert_eq!(base_in(&list, "mirror.example.org").as_deref(), Some("https://mirror.example.org"));
        assert_eq!(base_in(&list, "notes.example.org:8443").as_deref(), Some("https://notes.example.org:8443"));
        assert_eq!(base_in(&list, "elsewhere.example.org"), None);
    }

    #[tokio::test]
    async fn a_call_goes_through_with_its_body_and_a_portal_is_said_as_a_sign_in() {
        use axum::routing::{get, post};
        let app = axum::Router::new()
            .route("/v/a/api/echo", post(|b: String| async move { format!("got {b}") }))
            .route("/v/a/api/gated", get(|| async { axum::response::Redirect::to("https://auth.example.org/?rd=x") }));
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", l.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
        let d = tempfile::tempdir().unwrap();
        let store = Store::in_dir(d.path(), d.path());
        let r = forward(&store, &base, "v/a/api/echo", None, Method::POST, &HeaderMap::new(), Bytes::from_static(b"hello")).await;
        assert_eq!(r.status(), StatusCode::OK);
        let text = axum::body::to_bytes(r.into_body(), 1024).await.unwrap();
        assert_eq!(&text[..], b"got hello");
        let r = forward(&store, &base, "v/a/api/gated", None, Method::GET, &HeaderMap::new(), Bytes::new()).await;
        assert_eq!(r.status(), StatusCode::UNAUTHORIZED);
        let j: serde_json::Value = serde_json::from_slice(&axum::body::to_bytes(r.into_body(), 4096).await.unwrap()).unwrap();
        assert!(j["signin"]["url"].as_str().unwrap().starts_with(&base));
    }
}
