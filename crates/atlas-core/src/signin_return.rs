//! Where a sign-in comes back in a browser. A provider (a bank through Enable Banking, an OAuth server) ends its page on
//! the redirect address registered with it, `…?code=…&state=…` or `…?error=…`. The desktop's sign-in window catches that
//! address itself; a browser tab lands on the server, which answers any such address it does not otherwise serve with
//! this page: it hands the address to the Atlas tab that asked (same origin, a BroadcastChannel read by
//! `ui/src/lib/signin.ts`) and closes. It also keeps the address in the browser's storage for half an hour, so a tab
//! opened later (the one that asked was closed or reloaded) can still finish it (`atlas.signInReturned`).
//! Recognised by the query's shape, never by a provider's name or a plugin's path.
use axum::http::Uri;
use axum::response::Html;

/// The channel both sides name.
pub const CHANNEL: &str = "atlas-signin";
/// The storage key both sides name: `{url, at}` of the last sign-in to come back.
pub const KEPT: &str = "atlas-signin-return";

/// The return page, when `uri` is the end of a sign-in: a query with `code` and `state`, or `error`.
pub fn page(uri: &Uri) -> Option<Html<String>> {
    let q = uri.query()?;
    let has = |k: &str| q.split('&').any(|p| p.split('=').next() == Some(k));
    if !((has("code") && has("state")) || has("error")) {
        return None;
    }
    Some(Html(format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>Atlas — signed in</title>
<style>:root{{color-scheme:light dark}}body{{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 Inter,system-ui,sans-serif}}</style></head>
<body><p id="m">Back to Atlas…</p><script>
try {{ localStorage.setItem("{KEPT}", JSON.stringify({{ url: location.href, at: Date.now() }})); }} catch {{}}
const c = new BroadcastChannel("{CHANNEL}"); c.postMessage(location.href);
document.getElementById("m").textContent = "Done: you can close this tab and go back to Atlas.";
setTimeout(() => window.close(), 600);
</script></body></html>"#
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_end_of_a_sign_in_gets_the_return_page() {
        let at = |s: &str| page(&s.parse().unwrap()).is_some();
        assert!(at("/finance/enable-banking?code=abc&state=Unicaja%7CES"));
        assert!(at("/anything?error=access_denied&state=x"));
        assert!(!at("/finance/enable-banking"), "no query: the app");
        assert!(!at("/v/vault/?code=1"), "a code without a state is not a sign-in's end");
        assert!(!at("/notes?encode=1&states=2"), "names, not substrings");
        let html = page(&"/x?code=1&state=2".parse().unwrap()).unwrap().0;
        assert!(html.contains(CHANNEL) && html.contains(KEPT), "handed to a waiting tab and kept for a later one");
    }
}
