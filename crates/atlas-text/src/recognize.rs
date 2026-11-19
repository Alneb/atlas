//! What a capture might be, by the patterns the catalog's plugins contribute (`[contributes.catalog] recognize`): one
//! matching for the capture box's hint (the core's `catalog_hint`) and for what the catalog files (its engine's
//! `recognise`), so the box never promises a kind the catalog then files as another. The rules: every pattern is
//! tried; a match counts only when its ID group holds something once normalised; kinds rank by how many patterns hit
//! (ties keep the patterns' order); a link is an address with its scheme, or a whole capture that is a bare
//! `host.tld/…`.
use regex::Regex;

/// One pattern: its regex and the group holding the ID (0: the whole match).
pub struct Pattern<'a> {
    pub re: &'a Regex,
    pub group: usize,
}

/// A pattern that matched: which one (its index in the list given) and the ID it found, normalised.
#[derive(Debug, Clone, PartialEq)]
pub struct Match {
    pub pattern: usize,
    pub value: String,
}

/// Every match of every pattern in `text`, in the patterns' order; `normalise(pattern, raw)` makes the ID (an empty
/// one does not count — a DOI pattern whose group caught nothing promises nothing).
pub fn matches(patterns: &[Pattern<'_>], text: &str, normalise: impl Fn(usize, &str) -> String) -> Vec<Match> {
    let mut out = Vec::new();
    for (i, p) in patterns.iter().enumerate() {
        for caps in p.re.captures_iter(text) {
            let Some(m) = caps.get(p.group) else { continue };
            let value = normalise(i, m.as_str());
            if !value.is_empty() {
                out.push(Match { pattern: i, value });
            }
        }
    }
    out
}

/// The kinds the matches name, most matched first (ties in the order their first match came), each with its matches.
pub fn by_kind<K: PartialEq + Clone>(found: &[Match], kind_of: impl Fn(usize) -> K) -> Vec<(K, Vec<&Match>)> {
    let mut out: Vec<(K, Vec<&Match>)> = Vec::new();
    for m in found {
        let k = kind_of(m.pattern);
        match out.iter_mut().find(|(kind, _)| *kind == k) {
            Some((_, ms)) => ms.push(m),
            None => out.push((k, vec![m])),
        }
    }
    out.sort_by_key(|(_, ms)| std::cmp::Reverse(ms.len())); // stable: ties keep their order
    out
}

/// The first address in the text: `https://…`, or the whole text when it is a bare `host.tld/…` (`trim_end` cuts what
/// follows a link in prose: a closing bracket, a full stop).
pub fn first_url(text: &str, trim_end: fn(&str) -> &str) -> Option<String> {
    let re = Regex::new(r#"https?://[^\s<>"'`]+"#).expect("static pattern");
    if let Some(m) = re.find(text) {
        return Some(trim_end(m.as_str()).to_string());
    }
    let t = text.trim();
    let bare = Regex::new(r"^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(/\S*)?$").expect("static pattern");
    bare.is_match(&t.to_ascii_lowercase()).then(|| format!("https://{t}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_rank_by_how_many_patterns_hit_and_an_empty_id_does_not_count() {
        let (doi, film_a, film_b, empty) = (Regex::new(r"(10\.\d{4,}/\S+)").unwrap(), Regex::new(r"letterboxd\.com/film/([\w-]+)").unwrap(), Regex::new(r"\b(tt\d{7,})").unwrap(), Regex::new(r"isbn:?(\d*)").unwrap());
        let ps = [Pattern { re: &doi, group: 1 }, Pattern { re: &film_a, group: 1 }, Pattern { re: &film_b, group: 1 }, Pattern { re: &empty, group: 1 }];
        let kinds = ["paper", "movie", "movie", "book"];
        let text = "10.1000/x and letterboxd.com/film/dune tt1160419, isbn:";
        let found = matches(&ps, text, |_, v| v.trim().to_string());
        let ranked = by_kind(&found, |i| kinds[i]);
        assert_eq!(ranked.iter().map(|(k, ms)| (*k, ms.len())).collect::<Vec<_>>(), vec![("movie", 2), ("paper", 1)], "two film patterns beat one paper pattern; the empty ISBN is no book");
    }

    #[test]
    fn a_link_is_a_schemed_address_or_a_bare_host_alone() {
        fn keep(s: &str) -> &str {
            s.trim_end_matches(['.', ')'])
        }
        assert_eq!(first_url("see https://example.org/a).", keep).as_deref(), Some("https://example.org/a"));
        assert_eq!(first_url("example.org/post", keep).as_deref(), Some("https://example.org/post"));
        assert_eq!(first_url("buy example.org tomorrow", keep), None, "a host inside words is not a link");
    }
}
