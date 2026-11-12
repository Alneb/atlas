//! What the indexes say about a paper, all through [`Net`]: identifiers in text, Crossref and arXiv records as an
//! entry's Zotero-shaped fields, and where the open-access copies of a DOI's PDF are (OpenAlex, Unpaywall).
//! Moved from the core's refs.rs; arXiv's Atom is read once here for both the library and the catalog's lookup.
use crate::net::Net;
use serde_json::Value as Json;
use serde_yaml::{Mapping, Value};

// --- identifiers -----------------------------------------------------------------------------------------------

/// An arXiv id in text (new `2301.12345`, old `cond-mat/0101001`; a URL, `arXiv:`), without its version.
pub fn parse_arxiv(text: &str) -> Option<String> {
    let low = text.to_ascii_lowercase(); // its offsets are the text's: a full lower case can be longer (`İ`)
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

/// An ISBN in text (a book's copyright page: `ISBN 978-3-540-32897-1`, `ISBN-10: 0-19-…`), as its digits, checked:
/// one marked `ISBN` first, else a bare 978/979 run; a number that fails its check digit is not one.
pub fn parse_isbn(text: &str) -> Option<String> {
    let low = text.to_ascii_lowercase(); // offsets kept: ASCII only
    let digits_at = |from: usize| -> String {
        text[from..].chars().skip_while(|c| !c.is_ascii_digit()).take_while(|c| c.is_ascii_digit() || matches!(c, '-' | 'X' | 'x')).filter(|c| *c != '-').collect::<String>().to_ascii_uppercase()
    };
    // the mark's own `-10` / `-13` / `13:` is a label, not the number
    let label = |at: usize| ["-10", "-13", "10", "13"].iter().find(|p| low[at..].starts_with(*p) && !low[at + p.len()..].starts_with(|c: char| c.is_ascii_digit() || c == '-')).map_or(0, |p| p.len());
    let marked = low.match_indices("isbn").map(|(i, _)| digits_at(i + 4 + label(i + 4))).map(|d| if d.len() > 13 { d[..13].to_string() } else { d });
    let bare = text.char_indices().filter(|(i, _)| low[*i..].starts_with("978") || low[*i..].starts_with("979")).filter(|(i, _)| *i == 0 || !text[..*i].ends_with(|c: char| c.is_ascii_digit())).map(|(i, _)| digits_at(i).chars().take(13).collect::<String>());
    marked.chain(bare).find(|d| isbn_valid(d))
}

/// ISBN-10's mod 11 or ISBN-13's mod 10 check.
fn isbn_valid(d: &str) -> bool {
    let v: Vec<u32> = d.chars().map(|c| if c == 'X' { 10 } else { c.to_digit(10).unwrap_or(99) }).collect();
    match v.len() {
        10 => v[..9].iter().all(|x| *x < 10) && v.iter().enumerate().map(|(i, x)| (10 - i as u32) * x).sum::<u32>() % 11 == 0,
        13 => v.iter().all(|x| *x < 10) && v.iter().enumerate().map(|(i, x)| if i % 2 == 0 { *x } else { 3 * x }).sum::<u32>() % 10 == 0,
        _ => false,
    }
}

/// A book by its ISBN, as an entry's fields (`type: book`): Open Library, else Google Books.
pub fn isbn_book(net: &dyn Net, isbn: &str) -> Result<Mapping, String> {
    let ol = net.json(&format!("https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data")).ok();
    let b = ol.as_ref().map(|j| &j[format!("ISBN:{isbn}").as_str()]).filter(|b| b["title"].is_string());
    let mut m = Mapping::new();
    m.insert("type".into(), "book".into());
    let put = |m: &mut Mapping, k: &str, v: Option<String>| {
        if let Some(v) = v.map(|x| x.trim().to_string()).filter(|x| !x.is_empty()) {
            m.insert(k.into(), v.into());
        }
    };
    let names = |a: &Json, key: &str| -> Vec<Value> { a.as_array().into_iter().flatten().filter_map(|x| if key.is_empty() { x.as_str() } else { x[key].as_str() }).flat_map(split_names).map(|n| Value::from(last_first(&n))).collect() };
    if let Some(b) = b {
        let title = match b["subtitle"].as_str() {
            Some(sub) => format!("{}: {sub}", b["title"].as_str().unwrap_or_default()),
            None => b["title"].as_str().unwrap_or_default().to_string(),
        };
        put(&mut m, "title", Some(title));
        m.insert("author".into(), Value::Sequence(names(&b["authors"], "name")));
        put(&mut m, "date", b["publish_date"].as_str().and_then(year_in).map(String::from));
        put(&mut m, "publisher", b["publishers"][0]["name"].as_str().map(String::from));
        put(&mut m, "numPages", b["number_of_pages"].as_u64().map(|n| n.to_string()));
        put(&mut m, "url", b["url"].as_str().map(String::from));
    } else {
        let g = net.json(&format!("https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}"))?;
        let v = &g["items"][0]["volumeInfo"];
        if !v["title"].is_string() {
            return Err(format!("ISBN {isbn}: neither Open Library nor Google Books knows it"));
        }
        let title = match v["subtitle"].as_str() {
            Some(sub) => format!("{}: {sub}", v["title"].as_str().unwrap_or_default()),
            None => v["title"].as_str().unwrap_or_default().to_string(),
        };
        put(&mut m, "title", Some(title));
        m.insert("author".into(), Value::Sequence(names(&v["authors"], "")));
        put(&mut m, "date", v["publishedDate"].as_str().and_then(year_in).map(String::from));
        put(&mut m, "publisher", v["publisher"].as_str().map(String::from));
        put(&mut m, "numPages", v["pageCount"].as_u64().map(|n| n.to_string()));
    }
    put(&mut m, "ISBN", Some(isbn.to_string()));
    Ok(m)
}

/// The first four-digit year in a free-form date ("June 2010", "2010-06-01").
fn year_in(d: &str) -> Option<&str> {
    d.as_bytes().windows(4).position(|w| w.iter().all(u8::is_ascii_digit) && matches!(w[0], b'1' | b'2')).map(|i| &d[i..i + 4])
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

/// "P. W. Anderson" → "Anderson, P. W."; a name already "Last, First" stays as it is.
pub fn last_first(name: &str) -> String {
    if name.contains(',') {
        return name.trim().to_string();
    }
    match name.trim().rsplit_once(' ') {
        Some((given, family)) => format!("{family}, {}", given.trim()),
        None => name.trim().to_string(),
    }
}

/// Several people written in one string, as indexes and a PDF's Info dictionary do ("Herbert Goldstein, Charles
/// Poole, John Safko", "A. Smith and B. Jones", "Doe, J.; Roe, R."): one name each. Commas separate people only when
/// every part is a whole name (has a space); "Goldstein, Herbert" is one person.
pub fn split_names(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    for part in s.split([';', '\n']).flat_map(|p| p.split(" and ")).flat_map(|p| p.split(" & ")) {
        let commas: Vec<&str> = part.split(',').map(str::trim).filter(|p| !p.is_empty()).collect();
        if commas.len() > 1 && commas.iter().all(|c| c.contains(' ')) {
            out.extend(commas.into_iter().map(String::from));
        } else if !part.trim().is_empty() {
            out.push(part.trim().to_string());
        }
    }
    out
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
        let v = net.json(&format!("https://api.unpaywall.org/v2/{}?email={}", enc(doi, "/"), enc(email, ""))).unwrap_or_default();
        let direct = unpaywall_pdf_urls(&v);
        // then the repository copies Unpaywall knows only by their page: the PDF that page names, asked for lazily
        let pages = unpaywall_landing_pages(&v);
        let named = pages.into_iter().filter_map(move |page| net.text(&page).ok().and_then(|html| citation_pdf_url(&html, &page)));
        direct.into_iter().map(|u| (u, "Unpaywall")).chain(named.map(|u| (u, "Unpaywall (repository page)")))
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

/// Unpaywall's locations, its best first, then the others by version: the published one before the accepted
/// manuscript before the preprint (a reader wants the journal's pages when an open copy of them exists).
fn unpaywall_locations(v: &Json) -> Vec<&Json> {
    let rank = |l: &Json| match l["version"].as_str() {
        Some("publishedVersion") => 0,
        Some("acceptedVersion") => 1,
        Some("submittedVersion") => 2,
        _ => 3,
    };
    let mut others: Vec<&Json> = v["oa_locations"].as_array().into_iter().flatten().collect();
    others.sort_by_key(|l| rank(l)); // stable: Unpaywall's own order within a version
    std::iter::once(&v["best_oa_location"]).chain(others).collect()
}

pub fn unpaywall_pdf_urls(v: &Json) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for l in unpaywall_locations(v) {
        if let Some(u) = l["url_for_pdf"].as_str().filter(|u| !out.iter().any(|o| o == u)) {
            out.push(u.to_string());
        }
    }
    out
}

/// The pages of Unpaywall's open copies that have no PDF address of their own (a repository's record page).
pub fn unpaywall_landing_pages(v: &Json) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for l in unpaywall_locations(v).into_iter().filter(|l| l["url_for_pdf"].is_null()) {
        if let Some(u) = l["url_for_landing_page"].as_str().filter(|u| !out.iter().any(|o| o == u)) {
            out.push(u.to_string());
        }
    }
    out
}

/// The PDF a scholarly page names in its `<meta name="citation_pdf_url" content="…">` (the Highwire tags Google
/// Scholar reads, which repositories and publishers write), made absolute against the page's address.
pub fn citation_pdf_url(html: &str, page: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(i) = lower[from..].find("<meta") {
        let start = from + i;
        let end = start + lower[start..].find('>')?;
        let tag = &html[start..end];
        from = end;
        let attr = |name: &str| -> Option<String> {
            let t = tag.to_ascii_lowercase();
            let at = t.find(&format!("{name}="))? + name.len() + 1;
            let rest = &tag[at..];
            let q = rest.chars().next().filter(|c| *c == '"' || *c == '\'')?;
            Some(rest[1..].split(q).next()?.to_string())
        };
        if attr("name").is_some_and(|n| n.eq_ignore_ascii_case("citation_pdf_url")) {
            let u = attr("content")?.replace("&amp;", "&");
            return Some(absolute(&u, page));
        }
    }
    None
}

/// `u` made absolute against `page` (`/x.pdf` → the page's site + `/x.pdf`; `x.pdf` → beside the page).
fn absolute(u: &str, page: &str) -> String {
    if u.starts_with("http://") || u.starts_with("https://") {
        return u.to_string();
    }
    let site_end = page.find("://").map_or(0, |i| i + 3);
    let site = &page[..site_end + page[site_end..].find('/').unwrap_or(page.len() - site_end)];
    if let Some(rest) = u.strip_prefix("//") {
        return format!("{}//{rest}", &page[..site_end.saturating_sub(2)]);
    }
    if u.starts_with('/') {
        return format!("{site}{u}");
    }
    format!("{}/{u}", page.rsplit_once('/').map_or(page, |(d, _)| d))
}

#[cfg(test)]
mod tests {
    /// One string with several people (Open Library's authors, an Info dictionary): one name each, "Last, First".
    #[test]
    fn several_people_in_one_string_are_split() {
        let names: Vec<String> = super::split_names("Herbert Goldstein, Charles Poole, John Safko").iter().map(|n| super::last_first(n)).collect();
        assert_eq!(names, ["Goldstein, Herbert", "Poole, Charles", "Safko, John"]);
        assert_eq!(super::split_names("Goldstein, Herbert"), ["Goldstein, Herbert"]);
        assert_eq!(super::last_first("Goldstein, Herbert"), "Goldstein, Herbert");
        assert_eq!(super::split_names("A. Smith and B. Jones; C. Roe"), ["A. Smith", "B. Jones", "C. Roe"]);
    }

    #[test]
    fn an_isbn_is_found_on_a_copyright_page_and_checked() {
        let page = "Springer\nISBN 978-3-540-32897-1 e-ISBN 978-3-540-32899-8\nDOI 10.1007/978-3-540-32899-8\n";
        assert_eq!(super::parse_isbn(page).as_deref(), Some("9783540328971"));
        assert_eq!(super::parse_isbn("ISBN-10: 0-306-40615-2").as_deref(), Some("0306406152"));
        assert_eq!(super::parse_isbn("call 978-3-540-32897-2 now"), None, "a bad check digit");
        assert_eq!(super::parse_isbn("printed 9783540328971."), Some("9783540328971".into()), "bare, no mark");
        assert_eq!(super::parse_isbn("no number here"), None);
    }

    #[test]
    fn a_book_comes_from_open_library_else_google_books() {
        use crate::net::fake::{Answer, Table};
        let ol = serde_json::json!({ "ISBN:9783540328971": { "title": "Group Theory", "subtitle": "Application to the Physics of Condensed Matter",
            "authors": [{ "name": "Mildred S. Dresselhaus" }, { "name": "Gene Dresselhaus" }], "publish_date": "2008", "publishers": [{ "name": "Springer" }], "number_of_pages": 582 } });
        let net = Table::default().on("https://openlibrary.org/api/books?bibkeys=ISBN:9783540328971", Answer::Json(ol));
        let m = super::isbn_book(&net, "9783540328971").unwrap();
        let get = |k: &str| m.get(k).and_then(|v| v.as_str()).map(String::from);
        assert_eq!(get("title").as_deref(), Some("Group Theory: Application to the Physics of Condensed Matter"));
        assert_eq!((get("type").as_deref(), get("date").as_deref(), get("publisher").as_deref(), get("ISBN").as_deref()), (Some("book"), Some("2008"), Some("Springer"), Some("9783540328971")));
        assert_eq!(m.get("author").and_then(|a| a.as_sequence()).map(|a| a[0].as_str().unwrap().to_string()).as_deref(), Some("Dresselhaus, Mildred S."));
        let g = serde_json::json!({ "items": [{ "volumeInfo": { "title": "Some Book", "authors": ["Ada Lovelace"], "publishedDate": "1843-01-01", "pageCount": 120 } }] });
        let net = Table::default().on("https://openlibrary.org/", Answer::Json(serde_json::json!({}))).on("https://www.googleapis.com/books/v1/volumes?q=isbn:0306406152", Answer::Json(g));
        let m = super::isbn_book(&net, "0306406152").unwrap();
        assert_eq!(m.get("title").and_then(|v| v.as_str()), Some("Some Book"));
        assert_eq!(m.get("date").and_then(|v| v.as_str()), Some("1843"));
    }

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
    fn unpaywall_prefers_the_published_version_and_follows_a_repository_page_to_its_pdf() {
        let up = json!({
            "best_oa_location": { "url_for_pdf": "https://best.example/b.pdf", "version": "acceptedVersion" },
            "oa_locations": [
                { "url_for_pdf": "https://arxiv.example/pre.pdf", "version": "submittedVersion" },
                { "url_for_pdf": null, "url_for_landing_page": "https://hal.example/record/42", "version": "publishedVersion" },
                { "url_for_pdf": "https://journal.example/pub.pdf", "version": "publishedVersion" }
            ]
        });
        assert_eq!(unpaywall_pdf_urls(&up), ["https://best.example/b.pdf", "https://journal.example/pub.pdf", "https://arxiv.example/pre.pdf"]);
        assert_eq!(unpaywall_landing_pages(&up), ["https://hal.example/record/42"]);
        let page = r#"<html><head><meta name="citation_title" content="X"><META NAME='citation_pdf_url' CONTENT='/record/42/file.pdf?a=1&amp;b=2'></head></html>"#;
        assert_eq!(citation_pdf_url(page, "https://hal.example/record/42").as_deref(), Some("https://hal.example/record/42/file.pdf?a=1&b=2"));
        assert_eq!(citation_pdf_url("<meta name=\"citation_pdf_url\" content=\"f.pdf\">", "https://r.example/a/b").as_deref(), Some("https://r.example/a/f.pdf"));
        assert_eq!(citation_pdf_url("<meta name=\"description\" content=\"x\">", "https://r.example/"), None);
        // the page is asked only after the direct copies, and its PDF comes last, said where it came from
        let net = Table::default()
            .on("https://api.openalex.org/", Answer::Json(json!({})))
            .on("https://api.unpaywall.org/", Answer::Json(up))
            .on("https://hal.example/record/42", Answer::Text(page.into()));
        let found: Vec<_> = open_access_pdfs(&net, "10.1/x", "me@example.org", &[]).collect();
        assert_eq!(found.last().unwrap(), &("https://hal.example/record/42/file.pdf?a=1&b=2".to_string(), "Unpaywall (repository page)"));
        assert_eq!(found.len(), 4);
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
        // a letter whose full lower case is longer, before the id, does not move where it is read
        assert_eq!(parse_arxiv("İnce, Kelvin K — arXiv:2409.01234").as_deref(), Some("2409.01234"));
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
