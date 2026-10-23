//! Whether a web page lets itself be shown inside Atlas, as a tab. A site says no with `X-Frame-Options` or a CSP `frame-ancestors`; WebKit obeys that, so
//! such a page goes to Atlas's browsing window instead (ui lib/web-links.ts). `GET /api/web/frameable?url=`.
use reqwest::header::HeaderMap;

/// Whether these response headers let any page frame the document.
pub fn frameable(h: &HeaderMap) -> bool {
    if h.get("x-frame-options").and_then(|v| v.to_str().ok()).is_some_and(|v| {
        let v = v.trim().to_ascii_lowercase();
        v == "deny" || v == "sameorigin" || v.starts_with("allow-from")
    }) {
        return false;
    }
    for csp in h.get_all("content-security-policy").iter().filter_map(|v| v.to_str().ok()) {
        for directive in csp.split(';') {
            let mut words = directive.split_whitespace();
            if words.next().is_some_and(|d| d.eq_ignore_ascii_case("frame-ancestors")) && !words.any(|w| w == "*") {
                return false;
            }
        }
    }
    true
}

/// Asks `url` (its answer's headers only; the body is not read). A site that does not answer is not framed.
pub async fn check(url: &str) -> bool {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return false;
    }
    let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).user_agent(concat!("Mozilla/5.0 (X11; Linux x86_64) Atlas/", env!("CARGO_PKG_VERSION"))).build() else {
        return false;
    };
    match client.get(url).send().await {
        Ok(res) => res.status().is_success() && frameable(res.headers()),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderValue, CONTENT_SECURITY_POLICY};

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.append(*k, HeaderValue::from_static(v));
        }
        h
    }

    #[test]
    fn a_site_that_forbids_framing_is_not_framed() {
        assert!(frameable(&headers(&[])));
        assert!(!frameable(&headers(&[("x-frame-options", "DENY")])));
        assert!(!frameable(&headers(&[("x-frame-options", "SAMEORIGIN")])));
        assert!(!frameable(&headers(&[("content-security-policy", "default-src 'self'; frame-ancestors 'self'")])));
        assert!(frameable(&headers(&[("content-security-policy", "frame-ancestors *")])));
        let mut h = HeaderMap::new();
        h.append(CONTENT_SECURITY_POLICY, HeaderValue::from_static("default-src *"));
        assert!(frameable(&h));
    }
}
