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

/// The first address in the text: `https://…`, or the whole text when it is a bare `host.tld/…` (atlas-text's, the
/// capture box's hint uses the same).
pub fn first_url(text: &str) -> Option<String> {
    atlas_text::recognize::first_url(text, crate::model::trim_link_end)
}

/// The candidates for `text`, most likely first (most patterns matched; ties in the registry's order) — the matching
/// is atlas-text's `recognize`, shared with the capture box's hint so the two never disagree.
pub fn recognise(reg: &Registry, text: &str) -> Vec<Candidate> {
    let url = first_url(text);
    let patterns: Vec<atlas_text::recognize::Pattern<'_>> = reg.patterns.iter().map(|p| atlas_text::recognize::Pattern { re: &p.re, group: p.group }).collect();
    let found = atlas_text::recognize::matches(&patterns, text, |i, raw| normalise(&reg.patterns[i].id, raw));
    let mut out: Vec<Candidate> = atlas_text::recognize::by_kind(&found, |i| reg.patterns[i].kind.clone())
        .into_iter()
        .map(|(kind, ms)| {
            let mut c = Candidate { kind, ids: Ids::new(), url: url.clone(), by: Vec::new(), label: None };
            for m in ms {
                let p = &reg.patterns[m.pattern];
                c.ids.entry(p.id.clone()).or_insert_with(|| m.value.clone());
                if !c.by.contains(&p.plugin) {
                    c.by.push(p.plugin.clone());
                }
            }
            c
        })
        .collect();
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
