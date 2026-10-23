//! Text → what it might be. Every subplugin pattern is tried; matches of one kind pool their IDs into one candidate.
//! A link no pattern knows is still a web page (`article`), so a URL is never just text. Nothing here starts a process.
use crate::contrib::Registry;
use crate::model::{normalise, IdName, Ids, KindName, PluginId};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Candidate {
    pub kind: KindName,
    pub ids: Ids,
    /// the address in the text, if any (sources use it as a hint even when it is not an ID)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// the plugins whose patterns matched (empty: the web-page fallback)
    pub by: Vec<PluginId>,
    /// what a search source called it ("Dune (2021), Denis Villeneuve"), for choosing among several
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// The first address in the text: `https://…`, or the whole text when it is a bare `host.tld/…`.
pub fn first_url(text: &str) -> Option<String> {
    let re = regex::Regex::new(r#"https?://[^\s<>"'`]+"#).expect("static pattern");
    if let Some(m) = re.find(text) {
        return Some(crate::model::trim_link_end(m.as_str()).to_string());
    }
    let t = text.trim();
    let bare = regex::Regex::new(r"^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(/\S*)?$").expect("static pattern");
    bare.is_match(&t.to_ascii_lowercase()).then(|| format!("https://{t}"))
}

/// The candidates for `text`, most likely first (most patterns matched; ties in the registry's order).
pub fn recognise(reg: &Registry, text: &str) -> Vec<Candidate> {
    let url = first_url(text);
    let mut out: Vec<(usize, Candidate)> = Vec::new();
    for p in &reg.patterns {
        for caps in p.re.captures_iter(text) {
            let Some(m) = caps.get(p.group) else { continue };
            let value = normalise(&p.id, m.as_str());
            if value.is_empty() {
                continue;
            }
            let at = match out.iter().position(|(_, c)| c.kind == p.kind) {
                Some(i) => i,
                None => {
                    out.push((0, Candidate { kind: p.kind.clone(), ids: Ids::new(), url: url.clone(), by: Vec::new(), label: None }));
                    out.len() - 1
                }
            };
            let (hits, c) = &mut out[at];
            *hits += 1;
            c.ids.entry(p.id.clone()).or_insert(value);
            if !c.by.contains(&p.plugin) {
                c.by.push(p.plugin.clone());
            }
        }
    }
    out.sort_by_key(|(hits, _)| std::cmp::Reverse(*hits)); // stable: ties keep the registry's order
    let mut out: Vec<Candidate> = out.into_iter().map(|(_, c)| c).collect();
    if let Some(u) = url {
        let article = KindName::new(crate::kind::WEB_PAGE);
        if out.is_empty() && reg.kinds.get(&article).is_some() {
            let id = IdName::new("url");
            out.push(Candidate { kind: article, ids: Ids::from([(id.clone(), normalise(&id, &u))]), url: Some(u), by: Vec::new(), label: None });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kind::Kinds;
    use crate::model::Narration;
    use serde_json::json;

    fn registry() -> Registry {
        let c = json!({
            "catalog-zotero": { "recognize": [
                { "pattern": "(?i)\\b(?:doi:\\s*|doi\\.org/)?(10\\.\\d{4,9}/[^\\s\"<>]+)", "kind": "paper", "id": "doi" },
                { "pattern": "(?i)arxiv(?:\\.org/(?:abs|pdf)/|:)\\s*(\\d{4}\\.\\d{4,5}(?:v\\d+)?)", "kind": "paper", "id": "arxiv" }
            ]},
            "catalog-letterboxd": { "recognize": [{ "pattern": "letterboxd\\.com/film/([a-z0-9-]+)", "kind": "movie", "id": "letterboxd" }] }
        });
        Registry::build(Kinds::builtin(), c.as_object().unwrap(), &mut Narration::default())
    }

    #[test]
    fn a_doi_or_arxiv_link_is_a_paper_and_any_other_link_a_web_page() {
        let r = registry();
        let c = recognise(&r, "read this https://doi.org/10.1103/RevModPhys.77.1027.");
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].kind.as_str(), "paper");
        assert_eq!(c[0].ids[&IdName::new("doi")], "10.1103/revmodphys.77.1027");
        assert_eq!(c[0].by, [PluginId::new("catalog-zotero")]);

        let c = recognise(&r, "https://arxiv.org/abs/2101.00001v2");
        assert_eq!((c[0].kind.as_str(), c[0].ids[&IdName::new("arxiv")].as_str()), ("paper", "2101.00001"));

        assert_eq!(first_url("(see https://en.wikipedia.org/wiki/Harakiri_(1962_film)).").as_deref(), Some("https://en.wikipedia.org/wiki/Harakiri_(1962_film)"));
        assert_eq!(first_url("(https://example.org/a)").as_deref(), Some("https://example.org/a"));
        let c = recognise(&r, "https://letterboxd.com/film/dune-part-two/");
        assert_eq!((c[0].kind.as_str(), c[0].ids[&IdName::new("letterboxd")].as_str()), ("movie", "dune-part-two"));

        let c = recognise(&r, "www.example.org/post?utm_source=feed");
        assert_eq!(c[0].kind.as_str(), "article");
        assert_eq!(c[0].ids[&IdName::new("url")], "https://example.org/post");

        assert!(recognise(&r, "buy milk").is_empty());
    }
}
