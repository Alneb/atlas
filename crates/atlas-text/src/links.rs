//! Addresses as they are kept: the share-tracking parameters apps and newsletters add (`si` from YouTube and Spotify,
//! `igsh` from Instagram, `utm_*`, `share_*` from Reddit, `fbclid`, `feature=share…`) taken off, so a capture, the
//! catalog or a downloader keeps the item's own address. By shape: any such parameter on any site; the rest of the
//! address is kept as it was. A few sites use short keys that mean something elsewhere (X's `s` and `t`; YouTube's `t`
//! is the time to start at): those are taken off on that site only ([`SITE_TRACKING`]).

/// `%20` → ` `: a path segment as its owner named it (a file's name is usually typed with spaces). A `%` not followed by
/// two hex digits is kept; bytes that are not UTF-8 become U+FFFD.
pub fn percent_decoded(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = |c: u8| (c as char).to_digit(16);
        match (b[i], b.get(i + 1).copied().and_then(hex), b.get(i + 2).copied().and_then(hex)) {
            (b'%', Some(h), Some(l)) => {
                out.push((h * 16 + l) as u8);
                i += 3;
            }
            (c, _, _) => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A query parameter (`key` or `key=value`) that only says how a link was shared.
pub fn is_tracking(param: &str) -> bool {
    let key = param.split('=').next().unwrap_or(param);
    // `share_id`, `share_source`…: how a share was made (Reddit, TikTok, many apps' share sheets)
    key.starts_with("utm_")
        || key.starts_with("share_")
        || matches!(
            key,
            "si" | "igsh" | "igshid" | "fbclid" | "gclid" | "mc_cid" | "mc_eid" | "ref_src" | "feature" | "pp"
                // Spotify's deep-link id, Google Maps' share origin, Facebook's app id, TikTok's web share
                | "dlsi" | "g_st" | "mibextid" | "is_from_webapp" | "sender_device" | "sender_web_id" | "is_copy_url"
        )
}

/// Parameters that only track on one site (the host or any host under it), and mean something elsewhere.
pub const SITE_TRACKING: &[(&str, &[&str])] = &[("x.com", &["s", "t"]), ("twitter.com", &["s", "t"])];

/// The host of an address (`https://m.youtube.com:443/x` → `m.youtube.com`), lower case; "" for none.
fn host_of(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let host = &rest[..end];
    let host = host.rsplit_once('@').map_or(host, |(_, h)| h); // user@host
    host.split(':').next().unwrap_or(host).to_ascii_lowercase()
}

/// Whether `param` only tracks on the site at `host` ([`SITE_TRACKING`]).
fn tracks_here(host: &str, param: &str) -> bool {
    let key = param.split('=').next().unwrap_or(param);
    SITE_TRACKING.iter().any(|(site, keys)| (host == *site || host.ends_with(&format!(".{site}"))) && keys.contains(&key))
}

/// One address without its tracking parameters (a `?` left with nothing after it goes too; the `#fragment` stays).
pub fn untracked_url(url: &str) -> String {
    let Some(q) = url.find('?') else { return url.to_string() };
    let hash = url[q..].find('#').map(|h| q + h);
    let query = &url[q + 1..hash.unwrap_or(url.len())];
    let host = host_of(&url[..q]);
    let kept: Vec<&str> = query.split('&').filter(|p| !p.is_empty() && !is_tracking(p) && !tracks_here(&host, p)).collect();
    let mut out = url[..q].to_string();
    if !kept.is_empty() {
        out.push('?');
        out.push_str(&kept.join("&"));
    }
    if let Some(h) = hash {
        out.push_str(&url[h..]);
    }
    out
}

/// Every `http(s)://` address in `text` without its tracking parameters; the text around them unchanged.
pub fn untracked(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("http://").into_iter().chain(rest.find("https://")).min() {
        out.push_str(&rest[..at]);
        let end = rest[at..].find(|c: char| c.is_whitespace() || "<>\"])".contains(c)).map_or(rest.len(), |e| at + e);
        out.push_str(&untracked_url(&rest[at..end]));
        rest = &rest[end..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn share_parameters_go_and_the_rest_of_the_address_stays() {
        assert_eq!(untracked_url("https://youtu.be/abc?si=XYZ"), "https://youtu.be/abc");
        assert_eq!(untracked_url("https://www.youtube.com/watch?v=abc&si=XYZ&t=42s"), "https://www.youtube.com/watch?v=abc&t=42s");
        assert_eq!(untracked_url("https://x.org/a?utm_source=n&utm_medium=e#part"), "https://x.org/a#part");
        assert_eq!(untracked_url("https://www.instagram.com/p/C1/?igsh=MW"), "https://www.instagram.com/p/C1/");
        assert_eq!(untracked_url("https://x.org/search?q=si&page=2"), "https://x.org/search?q=si&page=2", "a value named like a key stays");
        assert_eq!(untracked_url("https://x.org/plain"), "https://x.org/plain");
    }

    /// The shapes the phone's share sheet brings (crates/atlas-android/tests/fixtures/shares.json has whole shares).
    #[test]
    fn each_apps_share_parameters_go() {
        let r = "https://www.reddit.com/r/Physics/comments/1abcde/a_title/?share_id=AbC&utm_content=1&utm_medium=android_app&utm_name=androidcss&utm_source=share&utm_term=1";
        assert_eq!(untracked_url(r), "https://www.reddit.com/r/Physics/comments/1abcde/a_title/");
        assert_eq!(untracked_url("https://maps.app.goo.gl/AbCdEf12?g_st=ic"), "https://maps.app.goo.gl/AbCdEf12");
        assert_eq!(untracked_url("https://open.spotify.com/album/1A2b?si=x1&dlsi=y2"), "https://open.spotify.com/album/1A2b");
        assert_eq!(untracked_url("https://www.facebook.com/share/p/AbC/?mibextid=WC7FNe"), "https://www.facebook.com/share/p/AbC/");
        assert_eq!(untracked_url("https://www.tiktok.com/@a/video/1?is_from_webapp=1&sender_device=pc"), "https://www.tiktok.com/@a/video/1");
        // X's `s` and `t` on X only: YouTube's `t` is where to start
        assert_eq!(untracked_url("https://x.com/someone/status/1790?s=46&t=AbCdEf"), "https://x.com/someone/status/1790");
        assert_eq!(untracked_url("https://mobile.twitter.com/someone/status/1?s=20"), "https://mobile.twitter.com/someone/status/1");
        assert_eq!(untracked_url("https://youtu.be/dQw4w9WgXcQ?si=x&t=42"), "https://youtu.be/dQw4w9WgXcQ?t=42");
        assert_eq!(untracked_url("https://box.com/f?s=1"), "https://box.com/f?s=1", "box.com is not x.com");
    }

    #[test]
    fn every_address_in_a_text_is_cleaned_and_the_words_kept() {
        let t = "Watch https://youtu.be/abc?si=1 and (https://open.spotify.com/track/9?si=2) — [x](https://x.org/?fbclid=3)";
        assert_eq!(untracked(t), "Watch https://youtu.be/abc and (https://open.spotify.com/track/9) — [x](https://x.org/)");
        assert_eq!(untracked("no links here"), "no links here");
    }
}
