//! The words the engine is built from: kinds, external IDs, plugins, and the narrated steps of a run.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

macro_rules! name {
    ($(#[$doc:meta])* $t:ident) => {
        $(#[$doc])*
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $t(pub String);

        impl $t {
            pub fn new(s: impl Into<String>) -> Self {
                Self(s.into())
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $t {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(&self.0)
            }
        }
    };
}

name!(
    /// A kind of thing: `movie`, `album`, `paper`, `article` (a `.atlas/kinds/<name>.yaml` or a subplugin's default).
    KindName
);
name!(
    /// An external identifier's name: `doi`, `arxiv`, `url`, `tmdb`, `imdb`, `musicbrainz`, `isbn`.
    IdName
);
name!(
    /// A plugin's id (`catalog-tmdb`): the one that contributed a pattern, a source or a link.
    PluginId
);

/// The external IDs known for one thing; values normalised (`model::normalise`) so equal things compare equal.
pub type Ids = BTreeMap<IdName, String>;

/// Fields as JSON values: what sources answer and what notes carry as properties.
pub type Fields = BTreeMap<String, serde_json::Value>;

/// One ID's value in its comparable form: DOIs and hosts are case-insensitive, URLs lose tracking and fragments.
/// What ends a link in running text: punctuation, and a closing bracket that has no opening one in the link
/// (`(see https://x.org/a)`), but not Wikipedia's `…/Harakiri_(1962_film)`.
pub fn trim_link_end(s: &str) -> &str {
    let mut s = s.trim();
    loop {
        let before = s;
        s = s.trim_end_matches(['.', ',', ';', '>', '!', '?', ':']);
        for (open, close) in [('(', ')'), ('[', ']')] {
            if s.ends_with(close) && s.matches(close).count() > s.matches(open).count() {
                s = &s[..s.len() - 1];
            }
        }
        if s == before {
            return s;
        }
    }
}

pub fn normalise(id: &IdName, value: &str) -> String {
    let v = trim_link_end(value);
    match id.as_str() {
        "doi" => {
            let v = v.trim_start_matches("https://").trim_start_matches("http://");
            let v = v.trim_start_matches("dx.doi.org/").trim_start_matches("doi.org/").trim_start_matches("doi:");
            v.to_ascii_lowercase()
        }
        "arxiv" => {
            let v = v.trim_start_matches("arXiv:").trim_start_matches("arxiv:");
            // the version is the same paper: 2101.00001v3 → 2101.00001
            match v.rfind('v') {
                Some(i) if i > 0 && v[i + 1..].chars().all(|c| c.is_ascii_digit()) && !v[i + 1..].is_empty() => v[..i].to_string(),
                _ => v.to_string(),
            }
        }
        "url" => canonical_url(v),
        // `978-0-441-17271-9`, `0441172717`: digits (and a final X) only, so the same book is one note
        "isbn" => v.chars().filter(|c| c.is_ascii_digit() || *c == 'X' || *c == 'x').collect::<String>().to_ascii_uppercase(),
        _ => v.to_string(),
    }
}

/// A URL as the same page: lower-case scheme and host, no `#fragment`, no `utm_*`/`fbclid`/`gclid` query parts,
/// no trailing `/` on the path.
pub fn canonical_url(url: &str) -> String {
    let url = url.split('#').next().unwrap_or(url);
    let (scheme, rest) = url.split_once("://").unwrap_or(("https", url));
    let (host, path) = rest.split_once('/').map_or((rest, ""), |(h, p)| (h, p));
    let host = host.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host);
    let (path, query) = path.split_once('?').map_or((path, None), |(p, q)| (p, Some(q)));
    let kept: Vec<&str> = query
        .into_iter()
        .flat_map(|q| q.split('&'))
        .filter(|kv| {
            let k = kv.split('=').next().unwrap_or("");
            !(k.is_empty() || k.starts_with("utm_") || matches!(k, "fbclid" | "gclid" | "mc_cid" | "mc_eid" | "ref_src" | "si" | "igsh" | "feature" | "pp"))
        })
        .collect();
    let path = path.trim_end_matches('/');
    let mut out = format!("{}://{host}", scheme.to_ascii_lowercase());
    if !path.is_empty() {
        out.push('/');
        out.push_str(path);
    }
    if !kept.is_empty() {
        out.push('?');
        out.push_str(&kept.join("&"));
    }
    out
}

/// The stages of a run, a closed set so every step names one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Load,
    Recognise,
    Dedupe,
    Fetch,
    Merge,
    Write,
    Sync,
}

/// One narrated step: what was done and why. Built only through [`Step::new`], so no step lacks its explanation.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Step {
    pub stage: Stage,
    pub explanation: String,
    /// a step that failed without stopping the run (one source down, a pattern that does not compile)
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub problem: bool,
}

impl Step {
    pub fn new(stage: Stage, explanation: impl Into<String>) -> Self {
        Step { stage, explanation: explanation.into(), problem: false }
    }
    pub fn problem(stage: Stage, explanation: impl Into<String>) -> Self {
        Step { stage, explanation: explanation.into(), problem: true }
    }
}

/// The run's narration, handed back with every answer (and to the plugin's log).
#[derive(Debug, Default, Clone, Serialize)]
#[serde(transparent)]
pub struct Narration(pub Vec<Step>);

impl Narration {
    pub fn say(&mut self, stage: Stage, explanation: impl Into<String>) {
        self.0.push(Step::new(stage, explanation));
    }
    pub fn problem(&mut self, stage: Stage, explanation: impl Into<String>) {
        self.0.push(Step::problem(stage, explanation));
    }
    /// What went wrong so far, in order: an error's explanation.
    pub fn problems(&self) -> Vec<String> {
        self.0.iter().filter(|s| s.problem).map(|s| s.explanation.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_compare_in_their_normal_form() {
        let doi = IdName::new("doi");
        assert_eq!(normalise(&doi, "https://doi.org/10.1103/RevModPhys.77.1027"), "10.1103/revmodphys.77.1027");
        assert_eq!(normalise(&doi, "doi:10.1103/RevModPhys.77.1027."), "10.1103/revmodphys.77.1027");
        let arxiv = IdName::new("arxiv");
        assert_eq!(normalise(&arxiv, "arXiv:2101.00001v3"), "2101.00001");
        assert_eq!(normalise(&arxiv, "cond-mat/0512345"), "cond-mat/0512345");
        let url = IdName::new("url");
        assert_eq!(normalise(&url, "HTTPS://www.Example.org/a/b/?utm_source=x&id=3#top"), "https://example.org/a/b?id=3");
        // the share sheets' tracking (YouTube's si / feature / pp, Instagram's igsh) is not part of the address
        assert_eq!(normalise(&url, "https://youtu.be/bkMKtf2V6Js?si=Ab12&feature=shared"), "https://youtu.be/bkMKtf2V6Js");
        assert_eq!(normalise(&url, "https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=x"), "https://music.youtube.com/watch?v=dQw4w9WgXcQ");
        assert_eq!(normalise(&url, "example.org"), "https://example.org");
    }
}
