//! The catalog's tools (plugin.toml `[[tool]]`, ported from the Python helper.py): `lookup` — a paper's metadata from
//! OpenAlex (any DOI) or arXiv itself (an arXiv id), in the catalog's terms — and `add` — the paper into the library
//! (refs.rs `add`: metadata, citekey, note, open-access PDF, refs.bib), the PDF sources other plugins contribute asked
//! when the built-in ones found none (docs/guides/PAPERS-PDF-SOURCES.md), answering the entry's note.
use crate::net::Net;
use crate::refs::{Lib, Res};
use crate::remote::{self, enc, last_first, openalex_doi, ArxivRecord};
use serde_json::{json, Map, Value};

/// The identifiers the catalog recognised (`params.ids`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Ids {
    pub doi: Option<String>,
    pub arxiv: Option<String>,
}

impl Ids {
    pub fn of(params: &Value) -> Ids {
        let one = |k: &str| params["ids"][k].as_str().map(str::trim).filter(|v| !v.is_empty()).map(String::from);
        Ids { doi: one("doi"), arxiv: one("arxiv") }
    }

    /// The DOI to ask OpenAlex about: the paper's own, else its arXiv DOI.
    pub fn doi_for_openalex(&self) -> Option<String> {
        self.doi.as_deref().map(str::to_lowercase).or_else(|| self.arxiv.as_ref().map(|a| format!("10.48550/arxiv.{}", a.to_lowercase())))
    }
}

/// OpenAlex's abstract, kept as word → places.
fn abstract_of(inverted: &Value) -> Option<String> {
    let mut at: Vec<(u64, &str)> = Vec::new();
    for (word, places) in inverted.as_object()? {
        at.extend(places.as_array().into_iter().flatten().filter_map(Value::as_u64).map(|i| (i, word.as_str())));
    }
    at.sort();
    (!at.is_empty()).then(|| at.iter().map(|(_, w)| *w).collect::<Vec<_>>().join(" "))
}

/// `{ids, fields}` without the empty fields.
fn found(ids: Map<String, Value>, fields: Vec<(&str, Value)>) -> Value {
    let fields: Map<String, Value> = fields
        .into_iter()
        .filter(|(_, v)| !(v.is_null() || v.as_str() == Some("") || v.as_array().is_some_and(Vec::is_empty)))
        .map(|(k, v)| (k.to_string(), v))
        .collect();
    json!({ "ids": ids, "fields": fields })
}

/// An OpenAlex work in the catalog's terms: its IDs and the fields a paper note shows.
pub fn from_openalex(w: &Value) -> Value {
    let mut ids = Map::new();
    let doi = openalex_doi(w);
    match doi.strip_prefix("10.48550/arxiv.") {
        Some(a) => drop(ids.insert("arxiv".into(), a.into())),
        None if !doi.is_empty() => drop(ids.insert("doi".into(), doi.clone().into())),
        None => {}
    }
    for loc in w["locations"].as_array().into_iter().flatten() {
        let page = loc["landing_page_url"].as_str().unwrap_or_default();
        if let Some(a) = page.split_once("arxiv.org/").and_then(|(_, r)| remote::parse_arxiv(&format!("arxiv:{}", r.trim_start_matches("abs/").trim_start_matches("pdf/")))) {
            ids.entry("arxiv").or_insert(a.into());
        }
    }
    let authors: Vec<Value> = w["authorships"].as_array().into_iter().flatten().filter_map(|a| a["author"]["display_name"].as_str()).filter(|n| !n.is_empty()).map(|n| last_first(n).into()).collect();
    let pdf = w["best_oa_location"]["pdf_url"].as_str().or_else(|| w["open_access"]["oa_url"].as_str());
    found(
        ids,
        vec![
            ("title", w["display_name"].as_str().or_else(|| w["title"].as_str()).into()),
            ("authors", authors.into()),
            ("year", w["publication_year"].clone()),
            ("journal", w["primary_location"]["source"]["display_name"].clone()),
            ("abstract", abstract_of(&w["abstract_inverted_index"]).into()),
            ("openalex", w["id"].clone()),
            ("pdf", pdf.into()),
        ],
    )
}

/// arXiv's own record in the catalog's terms: the authority for an arXiv paper.
pub fn from_arxiv(r: &ArxivRecord, id: &str) -> Value {
    let mut ids = Map::new();
    ids.insert("arxiv".into(), id.into());
    if let Some(d) = &r.doi {
        ids.insert("doi".into(), d.to_lowercase().into());
    }
    let year = r.published.as_deref().and_then(|p| p.get(..4)).and_then(|y| y.parse::<u64>().ok());
    found(
        ids,
        vec![
            ("title", r.title.clone().into()),
            ("authors", r.authors.clone().into()),
            ("year", year.into()),
            ("journal", r.journal_ref.clone().into()),
            ("abstract", r.summary.clone().into()),
            ("pdf", format!("https://arxiv.org/pdf/{id}").into()),
        ],
    )
}

/// The citekey the library would give a paper (title, year, authors) — none when it cannot say.
pub type KeyOf<'a> = &'a dyn Fn(&str, Option<String>, &[String]) -> Option<String>;

/// What `lookup` answers when it has nothing: empty fields and why.
fn skipped(why: String) -> Value {
    json!({ "fields": {}, "skipped": why })
}

/// The `lookup` tool. arXiv ids are asked of arXiv itself (OpenAlex sometimes merges a preprint with another work:
/// 1706.03762 was once answered with a 2025 record); DOIs of OpenAlex, whose answer about another work is
/// refused. `key_of(title, year, authors)`: the citekey the library would give it, so a preview names the real file.
pub fn lookup(net: &dyn Net, params: &Value, email: &str, key_of: KeyOf) -> Value {
    let ids = Ids::of(params);
    let mut got = match (&ids.arxiv, &ids.doi) {
        (Some(a), None) => match remote::arxiv_record(net, a) {
            Ok(r) => from_arxiv(&r, a),
            Err(_) => return skipped(format!("arXiv does not know {a}")),
        },
        _ => {
            let Some(doi) = ids.doi_for_openalex() else { return skipped("no DOI or arXiv id".into()) };
            let mailto = if email.is_empty() { String::new() } else { format!("?mailto={}", enc(email, "")) };
            let w = match net.json(&format!("https://api.openalex.org/works/doi:{}{mailto}", enc(&doi, "/"))) {
                Ok(w) if w["id"].is_string() => w,
                _ => return skipped(format!("OpenAlex does not know {doi}")),
            };
            let answered = openalex_doi(&w);
            if !answered.is_empty() && answered != doi {
                return skipped(format!("OpenAlex answered {answered} for {doi}; not used"));
            }
            from_openalex(&w)
        }
    };
    let f = &got["fields"];
    if let Some(title) = f["title"].as_str() {
        let authors: Vec<String> = f["authors"].as_array().into_iter().flatten().filter_map(Value::as_str).map(String::from).collect();
        let year = f["year"].as_u64().map(|y| y.to_string()).or_else(|| f["year"].as_str().map(String::from));
        if let Some(key) = key_of(title, year, &authors) {
            got["fields"]["citekey"] = key.into();
        }
    }
    got
}

/// A PDF source another plugin contributes (`[contributes.catalog-papers] pdf_sources = [{ tool, label }]`).
#[derive(Debug, Clone, PartialEq)]
pub struct Source {
    pub plugin: String,
    pub tool: String,
    pub label: String,
}

/// The PDF sources, in the setting's order: plugins named there first, `-<id>` switches one off, the rest after, by id.
pub fn pdf_sources(contributions: &Map<String, Value>, order: &str) -> Vec<Source> {
    let mut found = Vec::new();
    let mut ids: Vec<&String> = contributions.keys().collect();
    ids.sort();
    for pid in ids {
        for src in contributions[pid]["pdf_sources"].as_array().into_iter().flatten() {
            if let Some(tool) = src["tool"].as_str().filter(|t| !t.is_empty()) {
                let label = src["label"].as_str().filter(|l| !l.is_empty()).unwrap_or(pid);
                found.push(Source { plugin: pid.clone(), tool: tool.into(), label: label.into() });
            }
        }
    }
    let names: Vec<&str> = order.split([',', ' ', '\t', '\n']).filter(|n| !n.is_empty()).collect();
    let off: Vec<&str> = names.iter().filter_map(|n| n.strip_prefix('-')).collect();
    let first: Vec<&str> = names.iter().copied().filter(|n| !n.starts_with('-')).collect();
    let rank = |s: &Source| (first.iter().position(|f| *f == s.plugin).unwrap_or(first.len()), s.plugin.clone());
    found.retain(|s| !off.contains(&s.plugin.as_str()));
    found.sort_by_key(rank); // stable: one plugin's sources keep their order
    found
}

/// What asking the sources came to.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct FoundPdf {
    pub pdf: bool,
    pub from: Option<String>,
    pub tried: Vec<String>,
}

/// The SDK's file name for a paper's download: the key with anything but letters, digits, `.`, `-`, `_` as `_`.
fn sdk_name(key: &str) -> String {
    key.chars().map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' }).collect()
}

/// Each source in turn until one gave a PDF. A source answers `{ file, from }` (a download in its cache, attached
/// here through `attach`) or `{ attached: true }` (the SDK's `attach_pdf` left it at `pdf/<key>.pdf` in the source's
/// cache, attached from there), else `{ skipped }`. A source that fails
/// is noted and the next one asked: one broken plugin never stops the others.
pub fn find_pdf(ask: &dyn Fn(&Source, &Value) -> Res<Value>, attach: &dyn Fn(&str, &str) -> Res<()>, sources: &[Source], paper: &Value) -> FoundPdf {
    let mut tried = Vec::new();
    for src in sources {
        let r = match ask(src, paper) {
            Ok(r) => r,
            Err(e) => {
                tried.push(format!("{}: {e}", src.label));
                continue;
            }
        };
        let from = r["from"].as_str().filter(|f| !f.is_empty()).unwrap_or(&src.label).to_string();
        // `{ attached: true }` without a file: a source on the SDK's `attach_pdf`, which downloads to its fixed place in
        // the source's cache (`pdf/<key>.pdf`) and no longer attaches itself (the helper would wait on itself)
        let file = r["file"].as_str().map(String::from).or_else(|| {
            (r["attached"].as_bool() == Some(true)).then(|| format!(".atlas/cache/plugins/{}/pdf/{}.pdf", src.plugin, sdk_name(paper["key"].as_str().unwrap_or_default())))
        });
        let attached = match file {
            Some(file) => attach(&file, &from).map_err(|e| tried.push(format!("{}: {e}", src.label))).is_ok(),
            None => false,
        };
        if attached {
            return FoundPdf { pdf: true, from: Some(from), tried };
        }
        if r["file"].is_null() {
            tried.push(format!("{}: {}", src.label, r["skipped"].as_str().unwrap_or("no PDF")));
        }
    }
    FoundPdf { pdf: false, from: None, tried }
}

/// The `add` tool: through the library (the entry, its note, the PDF, refs.bib), then the PDF sources when the
/// built-in ones found none; answers `{ path, created, pdf, notice? }` (`exists`: the note the catalog found already).
pub fn add(lib: &Lib, params: &Value, sources_of: &dyn Fn() -> Res<Map<String, Value>>, ask: &dyn Fn(&Source, &Value) -> Res<Value>) -> Res<Value> {
    if let Some(path) = params["exists"].as_str().filter(|p| !p.is_empty()) {
        return Ok(json!({ "path": path }));
    }
    let ids = Ids::of(params);
    let ident = match (&ids.arxiv, &ids.doi) {
        (Some(a), None) => format!("arXiv:{a}"),
        (_, Some(d)) => d.clone(),
        (None, None) => return Err("a paper needs a DOI or an arXiv id".into()),
    };
    let added = lib.add(&ident)?;
    let key = added.paper.key.clone();
    let mut found = FoundPdf { pdf: added.pdf, ..Default::default() };
    if !added.pdf && added.created && lib.cfg.pdf_sources_on {
        let p = &added.paper;
        let paper = json!({ "key": key, "doi": ids.doi.clone().or(p.doi.clone()), "arxiv": ids.arxiv, "title": p.title, "year": p.year, "authors": p.authors });
        let sources = pdf_sources(&sources_of().unwrap_or_default(), &lib.cfg.pdf_order);
        found = find_pdf(ask, &|file, from| lib.attach_pdf(&key, file, from).map(drop), &sources, &paper);
    }
    let mut out = json!({ "path": lib.note(&key)?, "created": added.created, "pdf": found.pdf });
    if let Some(from) = &found.from {
        out["notice"] = format!("PDF from {from}").into();
    } else if !found.pdf && !found.tried.is_empty() {
        out["notice"] = format!("No PDF found ({})", found.tried.join("; ")).into();
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::fake::{Answer, Table};
    use crate::refs::tests::Vault;
    use std::cell::RefCell;

    fn work() -> Value {
        // "More Is Different", cut down to what the helper reads
        json!({
            "id": "https://openalex.org/W2045313424",
            "display_name": "More Is Different",
            "ids": { "doi": "https://doi.org/10.1126/science.177.4047.393" },
            "publication_year": 1972,
            "authorships": [{ "author": { "display_name": "P. W. Anderson" } }],
            "primary_location": { "source": { "display_name": "Science" } },
            "abstract_inverted_index": { "The": [0], "reductionist": [1], "hypothesis": [2] },
        })
    }
    const NO_KEY: KeyOf<'static> = &|_, _, _| None;

    #[test]
    fn a_doi_brings_title_authors_as_the_notes_keep_them_venue_and_abstract() {
        let net = Table::default().on("https://api.openalex.org/works/doi:10.1126/science.177.4047.393", Answer::Json(work()));
        let r = lookup(&net, &json!({ "ids": { "doi": "10.1126/Science.177.4047.393" } }), "me@example.org", NO_KEY);
        assert_eq!(*net.asked.borrow(), ["https://api.openalex.org/works/doi:10.1126/science.177.4047.393?mailto=me%40example.org"]);
        assert_eq!(r["ids"], json!({ "doi": "10.1126/science.177.4047.393" }));
        assert_eq!(r["fields"]["authors"], json!(["Anderson, P. W."]));
        assert_eq!((&r["fields"]["year"], &r["fields"]["journal"], &r["fields"]["abstract"]), (&json!(1972), &json!("Science"), &json!("The reductionist hypothesis")));
    }

    #[test]
    fn the_citekey_is_the_one_the_library_gives_so_a_preview_names_the_real_file() {
        let net = Table::default().on("https://api.openalex.org/", Answer::Json(work()));
        let asked = RefCell::new(Vec::new());
        let key_of = |t: &str, y: Option<String>, a: &[String]| {
            asked.borrow_mut().push((t.to_string(), y, a.to_vec()));
            Some("anderson1972more".to_string())
        };
        let r = lookup(&net, &json!({ "ids": { "doi": "10.1126/science.177.4047.393" } }), "", &key_of);
        assert_eq!(r["fields"]["citekey"], "anderson1972more");
        assert_eq!(*asked.borrow(), [("More Is Different".to_string(), Some("1972".to_string()), vec!["Anderson, P. W.".to_string()])]);
    }

    #[test]
    fn an_arxiv_doi_answered_by_openalex_keeps_its_arxiv_id_and_pdf() {
        let preprint = json!({ "id": "https://openalex.org/W1", "display_name": "Attention Is All You Need",
            "ids": { "doi": "https://doi.org/10.48550/arxiv.1706.03762" }, "publication_year": 2017,
            "authorships": [{ "author": { "display_name": "Ashish Vaswani" } }], "best_oa_location": { "pdf_url": "https://arxiv.org/pdf/1706.03762" } });
        let net = Table::default().on("https://api.openalex.org/works/doi:10.48550/arxiv.1706.03762", Answer::Json(preprint));
        let r = lookup(&net, &json!({ "ids": { "doi": "10.48550/arXiv.1706.03762" } }), "", NO_KEY);
        assert_eq!(r["ids"], json!({ "arxiv": "1706.03762" }));
        assert_eq!(r["fields"]["pdf"], "https://arxiv.org/pdf/1706.03762");
    }

    #[test]
    fn an_arxiv_id_is_asked_from_arxiv_itself_and_a_mismatched_openalex_answer_is_refused() {
        let atom = r#"<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry>
          <title>Attention Is All
            You Need</title><published>2017-06-12T17:57:34Z</published><summary> The dominant models </summary>
          <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author></entry></feed>"#;
        let net = Table::default().on("https://export.arxiv.org/", Answer::Text(atom.into()));
        let r = lookup(&net, &json!({ "ids": { "arxiv": "1706.03762" } }), "", NO_KEY);
        assert!(net.asked.borrow().iter().all(|u| !u.contains("openalex")), "not OpenAlex");
        assert_eq!(r["ids"], json!({ "arxiv": "1706.03762" }));
        assert_eq!((&r["fields"]["title"], &r["fields"]["year"]), (&json!("Attention Is All You Need"), &json!(2017)));
        assert_eq!(r["fields"]["authors"], json!(["Vaswani, Ashish", "Shazeer, Noam"]));
        let mut merged = work();
        merged["ids"]["doi"] = "https://doi.org/10.65215/2q58a426".into();
        let net = Table::default().on("https://api.openalex.org/", Answer::Json(merged));
        let r = lookup(&net, &json!({ "ids": { "doi": "10.1126/science.177.4047.393" } }), "", NO_KEY);
        assert!(r["skipped"].as_str().unwrap().contains("not used"), "{r}");
        assert!(lookup(&Table::default(), &json!({ "ids": { "arxiv": "9999.99999" } }), "", NO_KEY)["skipped"].as_str().unwrap().contains("arXiv does not know"));
        assert_eq!(lookup(&Table::default(), &json!({}), "", NO_KEY)["skipped"], "no DOI or arXiv id");
    }

    #[test]
    fn pdf_sources_follow_the_setting_and_one_can_be_switched_off() {
        let c = json!({ "zz": { "pdf_sources": [{ "tool": "find", "label": "Z" }] }, "oa": { "pdf_sources": [{ "tool": "find_pdf" }] },
            "mine": { "pdf_sources": [{ "tool": "get" }] }, "other": { "kinds": [] } });
        let c = c.as_object().unwrap();
        let ids = |order: &str| pdf_sources(c, order).into_iter().map(|s| s.plugin).collect::<Vec<_>>();
        assert_eq!(ids(""), ["mine", "oa", "zz"]);
        assert_eq!(ids("zz, mine"), ["zz", "mine", "oa"]);
        assert_eq!(ids("-oa"), ["mine", "zz"]);
        assert_eq!(pdf_sources(c, "")[2].label, "Z");
    }

    #[test]
    fn a_broken_source_is_noted_and_the_next_one_asked() {
        let srcs = pdf_sources(json!({ "a": { "pdf_sources": [{ "tool": "t" }] }, "b": { "pdf_sources": [{ "tool": "t" }] } }).as_object().unwrap(), "");
        let ask = |s: &Source, _: &Value| if s.plugin == "a" { Err("down".to_string()) } else { Ok(json!({ "attached": true, "from": "B's index" })) };
        let r = find_pdf(&ask, &|_, _| Ok(()), &srcs, &json!({ "key": "k" }));
        assert_eq!(r, FoundPdf { pdf: true, from: Some("B's index".into()), tried: vec!["a: down".into()] });
    }

    /// The catalog's `add`: the library's entry and note; the sources asked only when no PDF came, and only when on;
    /// a source's download (`file`) is attached here.
    #[test]
    fn add_files_the_paper_and_asks_the_sources_only_when_no_pdf_came() {
        let mut v = Vault::new();
        v.net = Table::default().on("https://api.crossref.org/works/10.1/x", Answer::Json(json!({ "message": { "title": ["Kinks"], "type": "journal-article" } })));
        let cache = v.root.join(".atlas/cache/plugins/oa");
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::write(cache.join("k.pdf"), b"%PDF-1.4 found").unwrap();
        let lib = v.lib();
        let asked = RefCell::new(Vec::new());
        let ask = |s: &Source, paper: &Value| -> Res<Value> {
            asked.borrow_mut().push(paper.clone());
            Ok(json!({ "file": ".atlas/cache/plugins/oa/k.pdf", "from": format!("a mirror via {}", s.plugin) }))
        };
        let sources = || -> Res<Map<String, Value>> { Ok(json!({ "another-source": { "pdf_sources": [{ "tool": "find_pdf" }] } }).as_object().unwrap().clone()) };
        let r = add(&lib, &json!({ "ids": { "doi": "10.1/x" } }), &sources, &ask).unwrap();
        assert_eq!((&r["pdf"], &r["notice"], &r["created"]), (&json!(true), &json!("PDF from a mirror via another-source"), &json!(true)));
        assert_eq!(r["path"], "refs/papers/kinks/kinks.md");
        assert!(v.root.join("refs/papers/kinks/kinks.pdf").is_file() && !cache.join("k.pdf").exists());
        assert_eq!((&asked.borrow()[0]["key"], &asked.borrow()[0]["doi"]), (&json!("kinks"), &json!("10.1/x")));
        // the same paper again: not created, the sources not asked
        asked.borrow_mut().clear();
        let again = add(&lib, &json!({ "ids": { "doi": "10.1/x" } }), &sources, &ask).unwrap();
        assert_eq!((again["created"].as_bool(), asked.borrow().len()), (Some(false), 0));
        assert_eq!(add(&lib, &json!({ "ids": { "doi": "10.1/x" }, "exists": "refs/papers/a/a.md" }), &sources, &ask).unwrap(), json!({ "path": "refs/papers/a/a.md" }));
        assert!(add(&lib, &json!({ "ids": {} }), &sources, &ask).is_err());
    }

    #[test]
    fn switched_off_the_sources_are_not_asked() {
        let mut v = Vault::new();
        v.net = Table::default().on("https://api.crossref.org/", Answer::Json(json!({ "message": { "title": ["Kinks"] } })));
        v.cfg.pdf_sources_on = false;
        let lib = v.lib();
        let r = add(&lib, &json!({ "ids": { "doi": "10.1/x" } }), &|| Ok(Map::new()), &|_, _| panic!("not asked")).unwrap();
        assert_eq!((r["pdf"].as_bool(), r.get("notice")), (Some(false), None));
    }
}
