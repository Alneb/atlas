//! What the indexes say about a paper, all through [`Net`]: identifiers in text, Crossref and arXiv records as an
//! entry's Zotero-shaped fields, and where the open-access copies of a DOI's PDF are (OpenAlex, Unpaywall).
//! Moved from the core's refs.rs; arXiv's Atom is read once here for both the library and the catalog's lookup.
use crate::net::Net;
use serde_json::Value as Json;
use serde_yaml::{Mapping, Value};

// --- identifiers -----------------------------------------------------------------------------------------------

/// An arXiv id in text (new `2301.12345`, old `cond-mat/0101001`; a URL, `arXiv:`), without its version.
pub fn parse_arxiv(text: &str) -> Option<String> {
    let low = text.to_lowercase();
    let start = ["arxiv.org/abs/", "arxiv.org/pdf/", "arxiv:"].iter().find_map(|p| low.find(p).map(|i| i + p.len())).unwrap_or(0);
    let id: String = text[start..].trim().chars().take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '/' | '-')).collect();
    let id = id.trim_end_matches(".pdf");
    // drop a trailing version (v2) — the library tracks the paper, not one revision
    let id = match id.rfind('v') {
        Some(i) if i > 0 && !id[i + 1..].is_empty() && id[i + 1..].chars().all(|c| c.is_ascii_digit()) => &id[..i],
        _ => id,
    };
    let new_style = id.len() >= 9 && id[..4].chars().all(|c| c.is_ascii_digit()) && id.as_bytes()[4] == b'.' && id[5..].chars().all(|c| c.is_ascii_digit());
    let old_style = id.split_once('/').is_some_and(|(a, n)| {
        a.chars().all(|c| c.is_ascii_lowercase() || c == '-' || c == '.') && n.len() == 7 && n.chars().all(|c| c.is_ascii_digit())
    });
    (new_style || old_style).then(|| id.to_string())
}

/// `10.xxxx/...` from a bare DOI, `doi:` prefix or a doi.org URL.
pub fn parse_doi(text: &str) -> Option<String> {
    let i = text.find("10.")?;
    let doi: String = text[i..].chars().take_while(|c| !c.is_whitespace()).collect();
    let doi = doi.trim_end_matches(['.', ',', ';', ')']).to_string();
    (doi.contains('/') && doi[3..].split('/').next().is_some_and(|reg| reg.chars().all(|c| c.is_ascii_digit() || c == '.'))).then_some(doi)
}

/// Percent-encodes what goes into an address: all but the unreserved characters and `keep` (a DOI keeps its `/`).
pub fn enc(s: &str, keep: &str) -> String {
    s.bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) || keep.as_bytes().contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}

// --- Crossref ------------------------------------------------------------------------------------------------------

/// A DOI's record at Crossref, as an entry's fields.
pub fn crossref(net: &dyn Net, doi: &str) -> Result<Mapping, String> {
    let v = net.json(&format!("https://api.crossref.org/works/{}", enc(doi, "/")))
        .map_err(|e| format!("Crossref: {e}"))?;
    Ok(crossref_fields(&v["message"], doi))
}

fn crossref_fields(w: &Json, doi: &str) -> Mapping {
    let mut m = Mapping::new();
    let put = |m: &mut Mapping, k: &str, v: Option<String>| {
        if let Some(v) = v.filter(|x| !x.is_empty()) {
            m.insert(k.into(), v.into());
        }
    };
    let first = |x: &Json| x.as_array().and_then(|a| a.first()).and_then(|t| t.as_str()).map(String::from);
    put(&mut m, "title", first(&w["title"]));
    let kind = match w["type"].as_str().unwrap_or("") {
        "journal-article" => "journalArticle",
        "book" | "monograph" => "book",
        "book-chapter" => "bookSection",
        "proceedings-article" => "conferencePaper",
        "posted-content" => "preprint",
        "dissertation" => "thesis",
        _ => "document",
    };
    m.insert("type".into(), kind.into());
    let authors: Vec<Value> = w["author"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|a| match (a["family"].as_str(), a["given"].as_str()) {
            (Some(f), Some(g)) => format!("{f}, {g}"),
            (Some(f), None) => f.to_string(),
            _ => a["name"].as_str().unwrap_or("").to_string(),
        })
        .filter(|a| !a.is_empty())
        .map(Value::from)
        .collect();
    m.insert("author".into(), Value::Sequence(authors));
    let parts = w["issued"]["date-parts"][0].as_array().cloned().unwrap_or_default();
    let date: Vec<String> = parts.iter().filter_map(|p| p.as_u64()).map(|p| format!("{p:02}")).collect();
    put(&mut m, "date", Some(date.join("-")));
    put(&mut m, "publicationTitle", first(&w["container-title"]));
    put(&mut m, "volume", w["volume"].as_str().map(String::from));
    put(&mut m, "issue", w["issue"].as_str().map(String::from));
    put(&mut m, "pages", w["page"].as_str().map(String::from));
    put(&mut m, "publisher", w["publisher"].as_str().map(String::from));
    put(&mut m, "DOI", Some(doi.to_string()));
    put(&mut m, "url", w["URL"].as_str().map(String::from));
    // JATS abstracts carry <jats:p> tags
    put(&mut m, "abstractNote", w["abstract"].as_str().map(|a| strip_tags(a).trim().to_string()));
    m
}

fn strip_tags(x: &str) -> String {
    let mut out = String::new();
    let mut tag = false;
    for c in x.chars() {
        match c {
            '<' => tag = true,
            '>' => tag = false,
            c if !tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

// --- arXiv -----------------------------------------------------------------------------------------------------

/// Text of every `<tag>…</tag>` inside an XML fragment (enough for arXiv's Atom feed).
fn xml_all<'a>(x: &'a str, tag: &str) -> Vec<&'a str> {
    let (open, close) = (format!("<{tag}"), format!("</{tag}>"));
    let mut out = Vec::new();
    let mut rest = x;
    while let Some(i) = rest.find(&open) {
        let after = &rest[i..];
        let Some(gt) = after.find('>') else { break };
        let Some(end) = after.find(&close) else { break };
        // `<tag` must end the name (`<title` is not `<titles`)
        let named = after[open.len()..].starts_with(['>', ' ', '/', '\n', '\t']);
        if gt < end && named {
            out.push(&after[gt + 1..end]);
        }
        rest = &after[end + close.len()..];
    }
    out
}

/// XML's five entities, and whitespace runs as one space.
fn xml_text(x: &str) -> String {
    let t = x.split_whitespace().collect::<Vec<_>>().join(" ");
    t.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

/// arXiv's own record of a paper (its Atom API).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ArxivRecord {
    pub title: String,
    /// "Last, First", as the notes keep authors.
    pub authors: Vec<String>,
    /// `YYYY-MM-DD`
    pub published: Option<String>,
    pub summary: Option<String>,
    pub doi: Option<String>,
    pub journal_ref: Option<String>,
}

/// "P. W. Anderson" → "Anderson, P. W."
pub fn last_first(name: &str) -> String {
    match name.trim().rsplit_once(' ') {
        Some((given, family)) => format!("{family}, {}", given.trim()),
        None => name.trim().to_string(),
    }
}

/// The feed's first entry; None when arXiv has none (an unknown id answers an empty feed).
pub fn parse_atom(xml: &str) -> Option<ArxivRecord> {
    let entry = *xml_all(xml, "entry").first()?;
    let one = |t: &str| xml_all(entry, t).first().map(|v| xml_text(v)).filter(|v| !v.is_empty());
    Some(ArxivRecord {
        title: one("title")?,
        authors: xml_all(entry, "author").iter().filter_map(|a| xml_all(a, "name").first().map(|n| last_first(&xml_text(n)))).collect(),
        published: one("published").map(|d| d.chars().take(10).collect()),
        summary: one("summary"),
        doi: one("arxiv:doi"),
        journal_ref: one("arxiv:journal_ref"),
    })
}

/// The Atom record of an arXiv id.
pub fn arxiv_record(net: &dyn Net, id: &str) -> Result<ArxivRecord, String> {
    let xml = net.text(&format!("https://export.arxiv.org/api/query?id_list={}", enc(id, "/"))).map_err(|e| format!("arXiv: {e}"))?;
    parse_atom(&xml).ok_or_else(|| format!("arXiv has no entry {id}"))
}

/// An arXiv paper as an entry's fields.
pub fn arxiv(net: &dyn Net, id: &str) -> Result<Mapping, String> {
    Ok(arxiv_fields(&arxiv_record(net, id)?, id))
}

fn arxiv_fields(r: &ArxivRecord, id: &str) -> Mapping {
    let mut m = Mapping::new();
    m.insert("title".into(), r.title.clone().into());
    m.insert("type".into(), "preprint".into());
    m.insert("author".into(), Value::Sequence(r.authors.iter().cloned().map(Value::from).collect()));
    if let Some(d) = &r.published {
        m.insert("date".into(), d.clone().into());
    }
    if let Some(a) = &r.summary {
        m.insert("abstractNote".into(), a.clone().into());
    }
    m.insert("url".into(), format!("https://arxiv.org/abs/{id}").into());
    m.insert("archiveID".into(), format!("arXiv:{id}").into());
    m.insert("repository".into(), "arXiv".into());
    if let Some(doi) = &r.doi {
        m.insert("DOI".into(), doi.clone().into());
    }
    m
}

// --- open-access PDFs ------------------------------------------------------------------------------------------

/// The open-access indexes asked after OpenAlex and Unpaywall: the papers-open-access plugin's, folded in. CORE needs the plugin's `core_key` secret.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Index {
    SemanticScholar,
    EuropePmc,
    Core,
}

impl Index {
    const ALL: [Index; 3] = [Index::SemanticScholar, Index::EuropePmc, Index::Core];

    fn name(self) -> &'static str {
        match self {
            Index::SemanticScholar => "semanticscholar",
            Index::EuropePmc => "europepmc",
            Index::Core => "core",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Index::SemanticScholar => "Semantic Scholar",
            Index::EuropePmc => "Europe PMC",
            Index::Core => "CORE",
        }
    }

    /// The indexes a setting names, in its order (unknown names left out); all of them when it names none.
    pub fn order(setting: &str) -> Vec<Index> {
        let named: Vec<Index> = setting
            .to_lowercase()
            .split([',', ' ', '\t', '\n'])
            .filter_map(|n| Index::ALL.into_iter().find(|i| i.name() == n))
            .fold(Vec::new(), |mut v, i| {
                if !v.contains(&i) {
                    v.push(i);
                }
                v
            });
        if named.is_empty() {
            Index::ALL.to_vec()
        } else {
            named
        }
    }

    /// The open copies this index knows of a DOI's paper; an index that is down or has none gives nothing.
    fn pdf_urls(self, net: &dyn Net, doi: &str) -> Vec<String> {
        let q = enc(&doi.to_lowercase(), "/");
        match self {
            Index::SemanticScholar => net
                .json(&format!("https://api.semanticscholar.org/graph/v1/paper/DOI:{q}?fields=openAccessPdf"))
                .map(|v| v["openAccessPdf"]["url"].as_str().map(String::from).into_iter().collect())
                .unwrap_or_default(),
            Index::EuropePmc => {
                let query = enc(&format!("DOI:\"{}\"", doi.to_lowercase()), "");
                net.json(&format!("https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={query}&resultType=core&format=json"))
                    .map(|v| europepmc_pdf_urls(&v))
                    .unwrap_or_default()
            }
            Index::Core => net
                .json_with_secret(&format!("https://api.core.ac.uk/v3/search/works?q=doi:%22{q}%22&limit=5"), "core_key", "Bearer ")
                .map(|v| v["results"].as_array().into_iter().flatten().filter_map(|r| r["downloadUrl"].as_str().map(String::from)).collect())
                .unwrap_or_default(),
        }
    }
}

/// Europe PMC's full texts that are PDFs and open (`OA`) or free (`F`).
fn europepmc_pdf_urls(v: &Json) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for r in v["resultList"]["result"].as_array().into_iter().flatten() {
        for f in r["fullTextUrlList"]["fullTextUrl"].as_array().into_iter().flatten() {
            let open = matches!(f["availabilityCode"].as_str(), Some("OA" | "F"));
            if let Some(u) = f["url"].as_str().filter(|u| open && f["documentStyle"] == "pdf" && !out.iter().any(|o| o == u)) {
                out.push(u.to_string());
            }
        }
    }
    out
}

/// Where open-access copies of a DOI's PDF are, best first, with who said so: OpenAlex's best location and its other
/// open ones, then Unpaywall's (only with an email, which it requires), then the `more` indexes in their order. Lazy:
/// an index is asked only when the copies before it failed.
pub fn open_access_pdfs<'a>(net: &'a dyn Net, doi: &'a str, email: &'a str, more: &'a [Index]) -> impl Iterator<Item = (String, &'static str)> + 'a {
    let openalex = std::iter::once(()).flat_map(move |_| {
        let mailto = if email.is_empty() { String::new() } else { format!("?mailto={}", enc(email, "")) };
        let v = net.json(&format!("https://api.openalex.org/works/doi:{}{mailto}", enc(doi, "/")));
        v.map(|v| openalex_pdf_urls(&v, doi)).unwrap_or_default().into_iter().map(|u| (u, "OpenAlex"))
    });
    let unpaywall = std::iter::once(()).filter(move |_| !email.is_empty()).flat_map(move |_| {
        let v = net.json(&format!("https://api.unpaywall.org/v2/{}?email={}", enc(doi, "/"), enc(email, "")));
        v.map(|v| unpaywall_pdf_urls(&v)).unwrap_or_default().into_iter().map(|u| (u, "Unpaywall"))
    });
    let more = more.iter().flat_map(move |i| i.pdf_urls(net, doi).into_iter().map(move |u| (u, i.label())));
    openalex.chain(unpaywall).chain(more)
}

/// The DOI OpenAlex answered about (it merges records now and then: an arXiv preprint was once answered
/// with another work), lower-case, without `https://doi.org/`.
pub fn openalex_doi(w: &Json) -> String {
    let d = w["ids"]["doi"].as_str().or_else(|| w["doi"].as_str()).unwrap_or_default();
    d.trim_start_matches("https://doi.org/").to_lowercase()
}

/// OpenAlex's open PDF addresses for a work — only when the work it answered is that DOI's.
pub fn openalex_pdf_urls(v: &Json, doi: &str) -> Vec<String> {
    if openalex_doi(v) != doi.to_lowercase() {
        return Vec::new();
    }
    let mut out: Vec<String> = Vec::new();
    let locations = std::iter::once(&v["best_oa_location"]).chain(v["locations"].as_array().into_iter().flatten());
    for l in locations.filter(|l| l["is_oa"].as_bool().unwrap_or(true)) {
        if let Some(u) = l["pdf_url"].as_str().filter(|u| !out.iter().any(|o| o == u)) {
            out.push(u.to_string());
        }
    }
    out
}

pub fn unpaywall_pdf_urls(v: &Json) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for l in std::iter::once(&v["best_oa_location"]).chain(v["oa_locations"].as_array().into_iter().flatten()) {
        if let Some(u) = l["url_for_pdf"].as_str().filter(|u| !out.iter().any(|o| o == u)) {
            out.push(u.to_string());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::fake::{Answer, Table};
    use serde_json::json;

    #[test]
    fn open_access_pdfs_are_read_best_first_and_only_for_the_doi_asked() {
        let work = json!({
            "doi": "https://doi.org/10.1103/revmodphys.77.1027",
            "best_oa_location": { "is_oa": true, "pdf_url": "https://arxiv.org/pdf/cond-mat/0404055" },
            "locations": [
                { "is_oa": false, "pdf_url": "https://publisher.example/paywalled.pdf" },
                { "is_oa": true, "pdf_url": "https://arxiv.org/pdf/cond-mat/0404055" },
                { "is_oa": true, "pdf_url": "https://repo.example/oa.pdf" }
            ]
        });
        assert_eq!(openalex_pdf_urls(&work, "10.1103/RevModPhys.77.1027"), ["https://arxiv.org/pdf/cond-mat/0404055", "https://repo.example/oa.pdf"]);
        assert!(openalex_pdf_urls(&work, "10.1/another").is_empty(), "an answer about another work is not used");
        let up = json!({ "best_oa_location": { "url_for_pdf": "https://a.example/x.pdf" }, "oa_locations": [{ "url_for_pdf": "https://a.example/x.pdf" }, { "url_for_pdf": null }, { "url_for_pdf": "https://b.example/y.pdf" }] });
        assert_eq!(unpaywall_pdf_urls(&up), ["https://a.example/x.pdf", "https://b.example/y.pdf"]);
        // lazily: Unpaywall only without an email is never asked
        let net = Table::default().on("https://api.openalex.org/", Answer::Json(work));
        let found: Vec<_> = open_access_pdfs(&net, "10.1103/revmodphys.77.1027", "", &[]).collect();
        assert_eq!(found.len(), 2);
        assert!(net.asked.borrow().iter().all(|u| !u.contains("unpaywall")));
    }

    #[test]
    fn the_other_indexes_come_after_in_the_settings_order_and_only_when_the_ones_before_had_nothing() {
        assert_eq!(Index::order(""), [Index::SemanticScholar, Index::EuropePmc, Index::Core]);
        assert_eq!(Index::order("core, europepmc, bogus, core"), [Index::Core, Index::EuropePmc]);
        let epmc = json!({ "resultList": { "result": [{ "fullTextUrlList": { "fullTextUrl": [
            { "documentStyle": "pdf", "availabilityCode": "OA", "url": "https://europepmc.org/a.pdf" },
            { "documentStyle": "html", "availabilityCode": "OA", "url": "https://europepmc.org/a.html" },
            { "documentStyle": "pdf", "availabilityCode": "S", "url": "https://publisher.example/paid.pdf" } ] } }] } });
        let net = Table::default()
            .on("https://api.semanticscholar.org/graph/v1/paper/DOI:10.1/x?fields=openAccessPdf", Answer::Json(json!({ "openAccessPdf": { "url": "https://s2.example/x.pdf" } })))
            .on("https://www.ebi.ac.uk/europepmc/", Answer::Json(epmc))
            .on("https://api.core.ac.uk/", Answer::Json(json!({ "results": [{ "downloadUrl": "https://core.example/x.pdf" }, { "downloadUrl": null }] })));
        let order = Index::order("");
        let mut found = open_access_pdfs(&net, "10.1/X", "", &order);
        assert_eq!(found.next(), Some(("https://s2.example/x.pdf".into(), "Semantic Scholar")));
        assert!(net.asked.borrow().iter().all(|u| !u.contains("ebi.ac.uk")), "Europe PMC waits until Semantic Scholar's copy failed");
        assert_eq!(found.collect::<Vec<_>>(), [("https://europepmc.org/a.pdf".into(), "Europe PMC"), ("https://core.example/x.pdf".into(), "CORE")]);
        assert!(net.asked.borrow().iter().any(|u| u.starts_with("https://api.core.ac.uk/") && u.ends_with("#secret=core_key")), "CORE with its key");
    }

    #[test]
    fn parses_identifier_shapes() {
        assert_eq!(parse_doi("https://doi.org/10.1103/PhysRevB.62.R9283").as_deref(), Some("10.1103/PhysRevB.62.R9283"));
        assert_eq!(parse_doi("doi:10.1017/9781108781244.").as_deref(), Some("10.1017/9781108781244"));
        assert_eq!(parse_doi("hello"), None);
        assert_eq!(parse_arxiv("https://arxiv.org/abs/2301.12345v2").as_deref(), Some("2301.12345"));
        assert_eq!(parse_arxiv("arXiv:cond-mat/0101001").as_deref(), Some("cond-mat/0101001"));
        assert_eq!(parse_arxiv("2409.01234").as_deref(), Some("2409.01234"));
        assert_eq!(parse_arxiv("10.1103/PhysRevB.62"), None);
    }

    #[test]
    fn crossref_and_arxiv_records_become_an_entrys_fields() {
        let w = json!({ "message": { "title": ["More Is Different"], "type": "journal-article", "author": [{ "family": "Anderson", "given": "P. W." }],
            "issued": { "date-parts": [[1972, 8, 4]] }, "container-title": ["Science"], "abstract": "<jats:p>The reductionist\n hypothesis</jats:p>" } });
        let net = Table::default().on("https://api.crossref.org/works/10.1126/science.177.4047.393", Answer::Json(w));
        let m = crossref(&net, "10.1126/science.177.4047.393").unwrap();
        assert_eq!((m["type"].as_str(), m["date"].as_str(), m["author"][0].as_str()), (Some("journalArticle"), Some("1972-08-04"), Some("Anderson, P. W.")));
        assert_eq!(m["abstractNote"].as_str(), Some("The reductionist hypothesis"));
        assert!(crossref(&net, "10.1/unknown").unwrap_err().starts_with("Crossref:"));
        let atom = "<feed><title>arXiv Query</title><entry><title>Attention &amp; You</title><published>2017-06-12T17:57:34Z</published>\
            <author><name>Ashish Vaswani</name></author><arxiv:doi xmlns:arxiv=\"x\">10.1/a</arxiv:doi></entry></feed>";
        let net = Table::default().on("https://export.arxiv.org/api/query?id_list=1706.03762", Answer::Text(atom.into()));
        let m = arxiv(&net, "1706.03762").unwrap();
        assert_eq!((m["title"].as_str(), m["date"].as_str(), m["DOI"].as_str()), (Some("Attention & You"), Some("2017-06-12"), Some("10.1/a")));
        assert_eq!(m["archiveID"].as_str(), Some("arXiv:1706.03762"));
        assert_eq!(parse_atom("<feed><title>none</title></feed>"), None, "no entry: arXiv does not know it");
    }
}
