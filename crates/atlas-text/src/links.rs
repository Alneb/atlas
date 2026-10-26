//! Addresses as they are kept: the share-tracking parameters apps and newsletters add (`si` from YouTube and Spotify,
//! `igsh` from Instagram, `utm_*`, `fbclid`, `feature=share…`) taken off, so a capture, the catalog or a downloader
//! keeps the item's own address. By shape: any such parameter on any site; the rest of the address is kept as it was.

/// A query parameter (`key` or `key=value`) that only says how a link was shared.
pub fn is_tracking(param: &str) -> bool {
    let key = param.split('=').next().unwrap_or(param);
    key.starts_with("utm_") || matches!(key, "si" | "igsh" | "igshid" | "fbclid" | "gclid" | "mc_cid" | "mc_eid" | "ref_src" | "feature" | "pp")
}

/// One address without its tracking parameters (a `?` left with nothing after it goes too; the `#fragment` stays).
pub fn untracked_url(url: &str) -> String {
    let Some(q) = url.find('?') else { return url.to_string() };
    let hash = url[q..].find('#').map(|h| q + h);
    let query = &url[q + 1..hash.unwrap_or(url.len())];
    let kept: Vec<&str> = query.split('&').filter(|p| !p.is_empty() && !is_tracking(p)).collect();
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

    #[test]
    fn every_address_in_a_text_is_cleaned_and_the_words_kept() {
        let t = "Watch https://youtu.be/abc?si=1 and (https://open.spotify.com/track/9?si=2) — [x](https://x.org/?fbclid=3)";
        assert_eq!(untracked(t), "Watch https://youtu.be/abc and (https://open.spotify.com/track/9) — [x](https://x.org/)");
        assert_eq!(untracked("no links here"), "no links here");
    }
}
