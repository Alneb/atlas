//! A web page read on the server (`POST /api/clip`): what it says about itself — OpenGraph, Twitter cards, JSON-LD,
//! Highwire `citation_*` tags — and its readable text as Markdown. One implementation for every client (the page, the
//! phone, a helper, an agent): the catalog's web-page source (catalog-web), anything that turns a link into a note.
//! It only reads; nothing is written here.
use regex::Regex;
use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::LazyLock;

#[derive(Debug, Clone, Deserialize)]
pub struct ClipRequest {
    pub url: String,
}

/// What a page declares itself to be, from its own tags — the catalog's kinds use the same words.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PageKind {
    Article,
    Video,
    Movie,
    Show,
    Album,
    Track,
    Book,
    Paper,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Clip {
    /// the address after redirects
    pub url: String,
    pub kind: Option<PageKind>,
    /// identifiers the page names: `doi`, `arxiv`, `youtube`, `imdb`, `isbn`
    pub ids: BTreeMap<String, String>,
    /// only what the page gave, legible as a note's properties: title, site, author, published (YYYY-MM-DD), year,
    /// description, cover, journal; for a film, album, song or book also director, cast, creator, genres, artist,
    /// album, tracks, pages, duration ("2h 47m", "3:34"), language (`es`). People are names, several of them a list.
    pub fields: BTreeMap<String, Value>,
    /// the readable text as Markdown (its `<article>` or `<main>`, else the body), headings, lists, quotes, code
    pub text: String,
}

fn sel(s: &str) -> Selector {
    Selector::parse(s).expect("static selector")
}

static META: LazyLock<Selector> = LazyLock::new(|| sel("meta"));
static LDJSON: LazyLock<Selector> = LazyLock::new(|| sel(r#"script[type="application/ld+json"]"#));
static CANONICAL: LazyLock<Selector> = LazyLock::new(|| sel(r#"link[rel="canonical"]"#));
static TITLE: LazyLock<Selector> = LazyLock::new(|| sel("title"));
static H1: LazyLock<Selector> = LazyLock::new(|| sel("h1"));
static ROOTS: LazyLock<[Selector; 2]> = LazyLock::new(|| [sel("article"), sel("main")]);
static PARAS: LazyLock<Selector> = LazyLock::new(|| sel("body p"));
static BODY: LazyLock<Selector> = LazyLock::new(|| sel("body"));
static PARA: LazyLock<Selector> = LazyLock::new(|| sel("p"));
static BLOCKS: LazyLock<Selector> = LazyLock::new(|| sel("h1, h2, h3, p, li, blockquote, pre"));
/// A class, id or role that names a page's chrome rather than its text: menus, sidebars, Wikipedia's navboxes and
/// infoboxes, a table of contents, reference lists, share bars, cookie banners. Whole words of the name only.
static CHROME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(^|[\s_-])(nav|navbar|navbox|navigation|sidebar|infobox|toc|menu|breadcrumbs?|reflist|references?|mw-editsection|hatnote|share|social|cookie|banner|related|advert|ads?|footnotes?|metadata|catlinks)($|[\s_-])").expect("static")
});
static DOI: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(10\.\d{4,9}/[^\s\x22<>]+)").expect("static"));
static YT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:youtube(?:-nocookie)?\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([\w-]{11})").expect("static"));
static IMDB: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"imdb\.com/title/(tt\d{6,10})").expect("static"));
static ARXIV: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})").expect("static"));
static COMMENTS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?s)/\*.*?\*/|<!\[CDATA\[|\]\]>").expect("static"));
static ISO_DURATION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$").expect("static"));
/// What a bot check or an error page calls itself: such a page says nothing about the address asked.
static CHALLENGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(just a moment|attention required|verifying (you are human|your browser)|human verification|are you a (robot|human)|access denied|security check|please wait|one more step|simple page|redirect(ing)?|403 forbidden|404 not found|page not found|captcha)\b").expect("static")
});

fn clean(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A value a page's script left unfilled is no value.
fn real(s: String) -> Option<String> {
    let s = clean(&s);
    (!s.is_empty() && !matches!(s.as_str(), "undefined" | "null" | "NaN" | "[object Object]")).then_some(s)
}

/// Every `<meta>` by its `property` or `name`, lower-cased; the first value wins.
fn metas(doc: &Html) -> BTreeMap<String, String> {
    let mut m = BTreeMap::new();
    for e in doc.select(&META) {
        let v = e.value();
        let (Some(k), Some(c)) = (v.attr("property").or(v.attr("name")).or(v.attr("itemprop")), v.attr("content")) else { continue };
        if let Some(c) = real(c.to_string()) {
            m.entry(k.to_ascii_lowercase()).or_insert(c);
        }
    }
    m
}

/// JSON-LD objects, `@graph`s flattened; the comments and CDATA some sites wrap them in (Letterboxd) dropped.
fn ld(doc: &Html) -> Vec<Value> {
    let mut out = Vec::new();
    for s in doc.select(&LDJSON) {
        let raw: String = s.text().collect();
        let Ok(v) = serde_json::from_str::<Value>(&COMMENTS.replace_all(&raw, "")) else { continue };
        let mut stack = vec![v];
        while let Some(v) = stack.pop() {
            match v {
                Value::Array(a) => stack.extend(a.into_iter().rev()),
                Value::Object(ref o) if o.contains_key("@graph") => stack.push(o["@graph"].clone()),
                o @ Value::Object(_) => out.push(o),
                _ => {}
            }
        }
    }
    out
}

fn ld_types(o: &Value) -> Vec<String> {
    match &o["@type"] {
        Value::String(s) => vec![s.clone()],
        Value::Array(a) => a.iter().filter_map(|t| t.as_str().map(str::to_string)).collect(),
        _ => Vec::new(),
    }
}

fn ld_text(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => real(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Array(a) => a.iter().find_map(ld_text),
        Value::Object(o) => o.get("name").or(o.get("url")).and_then(ld_text),
        _ => None,
    }
}

/// Every name in a JSON-LD value (a person, a list of them, a genre's address), at most `max`, without repeats.
fn ld_names(v: &Value, max: usize) -> Vec<String> {
    let items: Vec<&Value> = match v {
        Value::Array(a) => a.iter().collect(),
        Value::Null => Vec::new(),
        v => vec![v],
    };
    let mut out: Vec<String> = Vec::new();
    for t in items.into_iter().filter_map(ld_text) {
        // a genre given as its page (Bandcamp's `…/discover/alternative`): its last word
        let t = if t.starts_with("http") { t.trim_end_matches('/').rsplit('/').next().map(human).unwrap_or_default() } else { t };
        if !t.is_empty() && !out.contains(&t) && out.len() < max {
            out.push(t);
        }
    }
    out
}

fn human(slug: &str) -> String {
    let t = slug.replace(['-', '_'], " ");
    let mut c = t.chars();
    c.next().map(|f| f.to_uppercase().chain(c).collect()).unwrap_or_default()
}

/// One name as a string, several as a list: what a property looks like when a person reads it.
fn names_value(names: Vec<String>) -> Option<Value> {
    match names.len() {
        0 => None,
        1 => names.into_iter().next().map(Value::String),
        _ => Some(Value::Array(names.into_iter().map(Value::String).collect())),
    }
}

/// A date in any of the shapes pages use (ISO, `2005/10/06`, `05 Nov 2021 00:00:00 GMT`, `November 5, 2021`, a year).
fn date_of(s: &str) -> Option<chrono::NaiveDate> {
    use chrono::NaiveDate;
    let s = s.trim();
    let iso = s.get(..10).map(|d| d.replace('/', "-"));
    if let Some(d) = iso.as_deref().and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()) {
        return Some(d);
    }
    let words = s.split_whitespace().take(3).collect::<Vec<_>>().join(" ").replace(',', "");
    for f in ["%d %b %Y", "%d %B %Y", "%b %d %Y", "%B %d %Y"] {
        if let Ok(d) = NaiveDate::parse_from_str(&words, f) {
            return Some(d);
        }
    }
    s.get(..4).filter(|y| y.chars().all(|c| c.is_ascii_digit()) && s.len() == 4).and_then(|y| NaiveDate::from_ymd_opt(y.parse().ok()?, 1, 1))
}

/// `PT2H47M` → `2h 47m`, `PT3M34S` → `3:34`, plain seconds (`214`) → `3:34`.
fn duration_of(s: &str) -> Option<String> {
    let secs: u64 = match ISO_DURATION.captures(s.trim()) {
        Some(c) => {
            let n = |i: usize| c.get(i).and_then(|m| m.as_str().parse::<u64>().ok()).unwrap_or(0);
            n(1) * 86400 + n(2) * 3600 + n(3) * 60 + n(4)
        }
        None => s.trim().parse().ok()?,
    };
    match secs {
        0 => None,
        s if s >= 3600 => Some(format!("{}h {:02}m", s / 3600, s % 3600 / 60)),
        s => Some(format!("{}:{:02}", s / 60, s % 60)),
    }
}

fn kind_of_ld(t: &str) -> Option<PageKind> {
    Some(match t {
        "Movie" => PageKind::Movie,
        "TVSeries" | "TVSeason" | "TVEpisode" => PageKind::Show,
        "MusicAlbum" => PageKind::Album,
        "MusicRecording" => PageKind::Track,
        "Book" => PageKind::Book,
        "VideoObject" => PageKind::Video,
        "ScholarlyArticle" => PageKind::Paper,
        _ => return None,
    })
}

fn kind_of_og(og: &str) -> Option<PageKind> {
    Some(match og {
        "video.movie" => PageKind::Movie,
        "video.tv_show" | "video.episode" => PageKind::Show,
        "music.album" | "album" => PageKind::Album,
        "music.song" | "song" => PageKind::Track,
        "book" | "books.book" => PageKind::Book,
        "video.other" | "video" => PageKind::Video,
        "article" => PageKind::Article,
        _ => return None,
    })
}

/// The page's kind. Its own `og:type` speaks for the page itself and comes first when it is specific (Spotify: a
/// `music.song` page that also carries a music video's `VideoObject`); then JSON-LD, then the IDs it names.
fn kind_of(og: Option<&str>, types: &[String], ids: &BTreeMap<String, String>) -> Option<PageKind> {
    let by_og = og.and_then(kind_of_og);
    if by_og.is_some_and(|k| k != PageKind::Article) {
        return by_og;
    }
    if let Some(k) = types.iter().find_map(|t| kind_of_ld(t)) {
        return Some(k);
    }
    if ids.contains_key("doi") || ids.contains_key("arxiv") {
        return Some(PageKind::Paper);
    }
    if ids.contains_key("youtube") {
        return Some(PageKind::Video);
    }
    by_og.or(Some(PageKind::Article))
}

/// The JSON-LD object about the page's thing: the first whose type is a kind, the one naming this address preferred.
fn main_entity<'a>(objects: &'a [Value], url: &str) -> Option<&'a Value> {
    let typed = || objects.iter().filter(|o| ld_types(o).iter().any(|t| kind_of_ld(t).is_some()));
    let here = |o: &&Value| ["@id", "url", "mainEntityOfPage"].iter().any(|k| o.get(*k).and_then(Value::as_str).is_some_and(|u| same_page(u, url)));
    typed().find(here).or_else(|| typed().next())
}

fn same_page(a: &str, b: &str) -> bool {
    let norm = |u: &str| u.split(['?', '#']).next().unwrap_or(u).trim_end_matches('/').trim_start_matches("https://").trim_start_matches("http://").trim_start_matches("www.").to_string();
    norm(a) == norm(b)
}

/// A title without the site's name around it (`Beau Is Afraid - Wikipedia`, `… | Rust Blog`, `GitHub - rust-lang/rust:
/// …`) or the year the page adds when the year is known (`Dune: Part Two (2024)`). The site is its `og:site_name` or
/// its address: a part naming it is one of the address's words (`wikipedia` in `en.wikipedia.org`).
fn tidy_title(title: &str, site: Option<&str>, year: Option<i32>) -> String {
    const SEPS: [&str; 5] = [" - ", " | ", " · ", " — ", " – "];
    let mut t = title.trim().trim_start_matches('\u{200e}').to_string();
    let site = site.map(str::to_lowercase).unwrap_or_default();
    let words: Vec<&str> = site.split(['.', ' ', '-']).filter(|w| w.len() >= 3 && !matches!(*w, "www" | "com" | "org" | "net")).collect();
    let names_site = |part: &str| {
        let p = part.trim().to_lowercase();
        !p.is_empty() && p.len() <= 40 && (p == site || words.iter().any(|w| p == *w || p.split([' ', '.']).any(|x| x == *w)))
    };
    for sep in SEPS {
        if let Some((head, tail)) = t.rsplit_once(sep) {
            if !head.trim().is_empty() && names_site(tail) {
                t = head.trim().to_string();
                break;
            }
        }
    }
    for sep in SEPS {
        if let Some((head, rest)) = t.split_once(sep) {
            if !rest.trim().is_empty() && names_site(head) {
                t = rest.trim().to_string();
                break;
            }
        }
    }
    if let Some(y) = year {
        if let Some(head) = t.strip_suffix(&format!(" ({y})")) {
            t = head.trim().to_string();
        }
    }
    t
}

/// The thing's own fields from its JSON-LD object and the `music:` / `books:` / `video:` tags.
fn thing_fields(e: Option<&Value>, m: &BTreeMap<String, String>, put: &mut dyn FnMut(&str, Value)) {
    let names = |key: &str, max: usize| e.and_then(|e| e.get(key)).map(|v| ld_names(v, max)).unwrap_or_default();
    let tag = |keys: &[&str]| keys.iter().find_map(|k| m.get(*k).cloned());
    let mut people = |field: &str, keys: &[&str], tags: &[&str], max: usize| {
        let mut n: Vec<String> = keys.iter().flat_map(|k| names(k, max)).collect();
        if n.is_empty() {
            // a tag that is the person's page (Spotify's `music:musician`) is no name
            n = tag(tags).filter(|t| !t.starts_with("http")).map(|t| vec![t]).unwrap_or_default();
        }
        n.dedup();
        n.truncate(max);
        if let Some(v) = names_value(n) {
            put(field, v);
        }
    };
    people("director", &["director"], &["video:director"], 4);
    people("cast", &["actor", "actors"], &["video:actor"], 6);
    people("creator", &["creator"], &[], 4);
    people("artist", &["byArtist"], &["music:musician_description", "music:creator"], 4);
    people("genres", &["genre"], &[], 6);
    let album = e.and_then(|e| e.get("inAlbum")).and_then(ld_text);
    if let Some(a) = album {
        put("album", Value::String(a));
    }
    let n = |key: &str| e.and_then(|e| e.get(key)).and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok()));
    if let Some(t) = n("numTracks").or_else(|| e.and_then(|e| e.pointer("/track/numberOfItems")).and_then(Value::as_u64)) {
        put("tracks", t.into());
    }
    // the thing's own language (ISO 639-1, `es`): what a vault's "original titles for these languages" goes by
    if let Some(l) = e.and_then(|e| e.get("inLanguage")).and_then(ld_text).filter(|l| l.len() <= 8) {
        put("language", Value::String(l.to_lowercase()));
    }
    if let Some(p) = n("numberOfPages") {
        put("pages", p.into());
    }
    let duration = e.and_then(|e| e.get("duration")).and_then(Value::as_str).map(str::to_string).or_else(|| tag(&["music:duration", "video:duration"]));
    if let Some(d) = duration.as_deref().and_then(duration_of) {
        put("duration", Value::String(d));
    }
}

/// Where a page's text is when it names no `<article>` or `<main>`: the element whose own paragraphs hold the most
/// text, when that is most of the page's paragraph text (a blog's `div#primary`, not its header); else the body.
fn densest(doc: &Html) -> Option<ElementRef<'_>> {
    let mut score = std::collections::HashMap::new();
    let mut total = 0;
    for p in doc.select(&PARAS) {
        let n = p.text().map(str::len).sum::<usize>();
        total += n;
        // for its parent, and two thirds for its grandparent: text split over sections goes to their container, a
        // single block of paragraphs stays its own
        let mut up = p.ancestors();
        if let Some(a) = up.next() { *score.entry(a.id()).or_insert(0usize) += n * 3; }
        if let Some(a) = up.next() { *score.entry(a.id()).or_insert(0usize) += n * 2; }
    }
    let body = doc.select(&BODY).next();
    let Some(best) = score.into_iter().max_by_key(|(_, n)| *n).and_then(|(id, _)| doc.tree.get(id)).and_then(ElementRef::wrap) else { return body };
    let held: usize = best.select(&PARA).map(|p| p.text().map(str::len).sum::<usize>()).sum();
    if held * 2 < total { body } else { Some(best) }
}

/// The readable text as Markdown paragraphs: the page's `<article>`, `<main>` or densest part, without its chrome.
fn markdown(doc: &Html) -> String {
    let Some(root) = ROOTS.iter().find_map(|s| doc.select(s).next()).or_else(|| densest(doc)) else { return String::new() };
    let named_chrome = |a: &ElementRef| {
        let v = a.value();
        [v.attr("class"), v.id(), v.attr("role")].into_iter().flatten().any(|n| CHROME.is_match(n))
    };
    let chrome = |e: &ElementRef| {
        e.ancestors().filter_map(ElementRef::wrap).take_while(|a| a.id() != root.id()).any(|a| {
            matches!(a.value().name(), "nav" | "header" | "footer" | "aside" | "form" | "script" | "style" | "noscript") || named_chrome(&a)
        }) || named_chrome(e)
    };
    let mut out: Vec<String> = Vec::new();
    for e in root.select(&BLOCKS) {
        if chrome(&e) || e.ancestors().filter_map(ElementRef::wrap).any(|a| matches!(a.value().name(), "li" | "blockquote" | "pre") && a.id() != e.id()) {
            continue; // a paragraph inside a list item is said by the item
        }
        // the block's own text, without inline chrome inside it (a footnote's `<sup class="reference">[1]</sup>`)
        let raw: String = e
            .descendants()
            .filter_map(|n| n.value().as_text().map(|t| (n, t)))
            .filter(|(n, _)| !n.ancestors().take_while(|a| a.id() != e.id()).filter_map(ElementRef::wrap).any(|a| named_chrome(&a)))
            .map(|(_, t)| &**t)
            .collect();
        let t = clean(&raw);
        if t.is_empty() {
            continue;
        }
        out.push(match e.value().name() {
            "h1" => format!("## {t}"),
            "h2" => format!("### {t}"),
            "h3" => format!("#### {t}"),
            "li" => format!("- {t}"),
            "blockquote" => format!("> {t}"),
            "pre" => format!("```\n{}\n```", raw.trim()),
            _ => t,
        });
    }
    // most of the text outside any block (a lone quote above an essay of `<br><br>`): the page's loose text instead
    let blocks = out.join("\n\n");
    let rest = loose(root);
    if blocks.split_whitespace().count() * 2 < rest.split_whitespace().count() { rest } else { blocks }
}

/// A page written without paragraph elements (text and `<br><br>` in a table cell, as paulgraham.com): its text, a
/// paragraph wherever two line breaks meet.
fn loose(root: ElementRef) -> String {
    let mut raw = String::new();
    for n in root.descendants() {
        if let Some(t) = n.value().as_text() {
            if !n.ancestors().filter_map(ElementRef::wrap).any(|a| matches!(a.value().name(), "script" | "style" | "noscript" | "nav" | "header" | "footer")) {
                raw.push_str(&t.replace('\n', " ")); // the source's own line ends are not breaks
            }
        } else if let Some(e) = n.value().as_element() {
            match e.name() {
                "br" => raw.push('\n'),
                // a block of its own starts a paragraph
                "p" | "div" | "blockquote" | "li" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "pre" | "tr" | "table" => raw.push_str("\n\n"),
                _ => {}
            }
        }
    }
    raw.split("\n\n").map(clean).filter(|t| !t.is_empty()).collect::<Vec<_>>().join("\n\n")
}

/// Reads one page's HTML; `url` is where it was found (after redirects).
pub fn read(url: &str, html: &str) -> Clip {
    let doc = Html::parse_document(html);
    let m = metas(&doc);
    let objects = ld(&doc);
    let types: Vec<String> = objects.iter().flat_map(ld_types).collect();
    let entity = main_entity(&objects, url);
    let get = |keys: &[&str]| keys.iter().find_map(|k| m.get(*k).cloned());
    let from_ld = |key: &str| entity.and_then(|o| o.get(key)).and_then(ld_text).or_else(|| objects.iter().find_map(|o| o.get(key).and_then(ld_text)));

    let mut ids = BTreeMap::new();
    let canonical = doc.select(&CANONICAL).next().and_then(|e| e.value().attr("href")).unwrap_or("");
    let hay = [url, canonical, get(&["og:url"]).as_deref().unwrap_or(""), get(&["og:video", "og:video:url", "twitter:player"]).as_deref().unwrap_or("")].join(" ");
    if let Some(d) = get(&["citation_doi", "dc.identifier", "prism.doi", "bepress_citation_doi"]).and_then(|d| DOI.captures(&d).map(|c| c[1].to_string())) {
        ids.insert("doi".into(), d);
    } else if let Some(c) = DOI.captures(url) {
        ids.insert("doi".into(), c[1].to_string());
    }
    for (re, id) in [(&*ARXIV, "arxiv"), (&*YT, "youtube"), (&*IMDB, "imdb")] {
        if let Some(c) = re.captures(&hay) {
            ids.entry(id.into()).or_insert(c[1].to_string());
        }
    }
    if let Some(i) = get(&["citation_isbn", "books:isbn", "book:isbn"]).or_else(|| from_ld("isbn")) {
        ids.insert("isbn".into(), i.replace(['-', ' '], ""));
    }

    let mut fields: BTreeMap<String, Value> = BTreeMap::new();
    let mut put = |k: &str, v: Value| {
        let v = match v {
            Value::String(s) => match real(s) {
                Some(s) => Value::String(s),
                None => return,
            },
            v => v,
        };
        fields.entry(k.to_string()).or_insert(v);
    };
    let site = get(&["og:site_name"]).or_else(|| url.split("://").nth(1).and_then(|r| r.split('/').next()).map(|h| h.trim_start_matches("www.").to_string()));
    let date = get(&["citation_publication_date", "citation_date", "article:published_time", "music:release_date", "video:release_date", "og:release_date", "date"])
        .or_else(|| ["datePublished", "dateCreated", "startDate"].iter().find_map(|k| from_ld(k)))
        .or_else(|| entity.and_then(|e| e.pointer("/releasedEvent/0/startDate")).and_then(ld_text))
        .and_then(|d| date_of(&d));
    let year = date.map(|d| chrono::Datelike::year(&d));
    // the thing's own name first (`Dune: Part Two`), else what the page calls itself
    let title = entity
        .and_then(|e| e.get("name").or(e.get("headline")))
        .and_then(ld_text)
        .or_else(|| get(&["citation_title", "og:title", "twitter:title"]))
        .or_else(|| from_ld("headline"))
        .or_else(|| doc.select(&H1).next().map(|e| e.text().collect()))
        .or_else(|| doc.select(&TITLE).next().map(|e| e.text().collect()))
        .and_then(real)
        .map(|t| tidy_title(&t, site.as_deref(), year));
    if let Some(t) = title {
        put("title", Value::String(t));
    }
    if let Some(s) = site.clone() {
        put("site", Value::String(s));
    }
    thing_fields(entity, &m, &mut put);
    let author = entity.and_then(|e| e.get("author")).map(|a| ld_names(a, 4)).and_then(names_value);
    if let Some(a) = author.or_else(|| get(&["citation_author", "author", "article:author", "books:author", "book:author", "twitter:creator"]).map(Value::String)) {
        put("author", a);
    }
    if let Some(d) = date {
        put("published", Value::String(d.format("%Y-%m-%d").to_string()));
    }
    if let Some(y) = year {
        put("year", y.into());
    }
    for (k, v) in [
        ("description", get(&["og:description", "description", "twitter:description"]).or_else(|| from_ld("description"))),
        ("cover", get(&["og:image", "twitter:image", "og:image:url"]).or_else(|| from_ld("image")).or_else(|| from_ld("thumbnailUrl"))),
        ("journal", get(&["citation_journal_title"])),
    ] {
        if let Some(v) = v {
            put(k, Value::String(v));
        }
    }

    Clip { url: url.to_string(), kind: kind_of(get(&["og:type"]).as_deref(), &types, &ids), ids, fields, text: markdown(&doc) }
}

/// A YouTube video: its thumbnail as the cover when the page gave
/// none, the whole description (the page's player data; its meta tag is cut short), and the player at the top of the note.
fn youtube(c: &mut Clip, html: &str) {
    static DESC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#""shortDescription":"((?:[^"\\]|\\.)*)""#).expect("static"));
    let Some(id) = c.ids.get("youtube").cloned() else { return };
    if !c.fields.get("cover").and_then(Value::as_str).is_some_and(|s| !s.is_empty()) {
        c.fields.insert("cover".into(), Value::String(format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg")));
    }
    let full = DESC.captures(html).and_then(|m| serde_json::from_str::<String>(&format!("\"{}\"", &m[1])).ok()).filter(|d| !d.trim().is_empty());
    if let Some(d) = &full {
        c.fields.insert("description".into(), Value::String(d.lines().next().unwrap_or(d).chars().take(300).collect()));
    }
    let player = format!(r#"<iframe src="https://www.youtube-nocookie.com/embed/{id}" title="YouTube video" allowfullscreen></iframe>"#);
    let body = full.map(|d| d.trim().to_string()).unwrap_or_else(|| c.text.clone());
    c.text = format!("{player}\n\n{body}");
}

/// Not the page asked for but a bot check, an error page or a bare redirect: its words are about itself.
fn is_stand_in(c: &Clip) -> bool {
    let title = c.fields.get("title").and_then(Value::as_str).unwrap_or("");
    CHALLENGE.is_match(title) && c.text.len() < 2000
}

/// A `<meta http-equiv="refresh" content="0; url=…">` page's target, resolved against its address. Read from the raw
/// text: the tag often sits in `<noscript>`, which a parser keeps as text.
fn refresh_target(at: &str, html: &str) -> Option<String> {
    static TARGET: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?is)<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*?url\s*=\s*['"]?([^'">\s]+)"#).expect("static"));
    let target = TARGET.captures(html)?[1].to_string();
    url::Url::parse(at).ok()?.join(&target).ok().map(String::from)
}

/// What the core's fetch answered for a page (`POST /api/plugins/catalog/fetch`): its status, final address and text.
pub struct Page {
    pub status: u16,
    pub url: String,
    pub text: String,
}

/// Fetches a page through the core (the engine never reaches the network itself: `get(url, cookie)`) — a meta refresh
/// followed once — and reads it. Only `http(s)`. A bot check, an error page or a 202 "come back later" is an error
/// saying so, never a note titled "Just a moment…". Moved from the core (REFACTOR-core-to-plugins #3, 2026-10-20).
pub fn fetch(url: &str, get: impl Fn(&str, &str) -> Result<Page, String>) -> Result<Clip, String> {
    let mut url = if url.contains("://") { url.to_string() } else { format!("https://{url}") };
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(format!("only web addresses can be clipped, not {url}"));
    }
    for hop in 0..2 {
        // YouTube shows Europe a consent wall instead of the video: the answer a browser gives it once (as the phone app does)
        let consent = if YT.is_match(&url) { "CONSENT=YES+1; SOCS=CAI" } else { "" };
        let page = get(&url, consent)?;
        let at = page.url.clone();
        if !(200..300).contains(&page.status) || page.status == 202 {
            return Err(format!("{at} answered {}{}", page.status, if matches!(page.status, 202 | 403 | 429 | 503) { " (the site keeps programs out)" } else { "" }));
        }
        let html = page.text;
        if hop == 0 && html.len() < 4096 {
            if let Some(next) = refresh_target(&at, &html) {
                url = next;
                continue;
            }
        }
        let mut clip = read(&at, &html);
        youtube(&mut clip, &html);
        if is_stand_in(&clip) {
            let title = clip.fields.get("title").and_then(Value::as_str).unwrap_or("");
            return Err(format!("{at} showed \"{title}\" instead of the page (a bot check or an error page)"));
        }
        return Ok(clip);
    }
    Err(format!("{url}: redirects without end"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_youtube_video_gets_its_cover_whole_description_and_player() {
        let html = r#"<html><head><title>Talk - YouTube</title><meta property="og:title" content="Talk"></head><body><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"dQw4w9WgXcQ","shortDescription":"First line.\nSecond line with \"quotes\"."}};</script></body></html>"#;
        let mut c = read("https://www.youtube.com/watch?v=dQw4w9WgXcQ", html);
        youtube(&mut c, html);
        assert_eq!(c.fields["cover"], "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
        assert_eq!(c.fields["description"], "First line.");
        assert!(c.text.starts_with(r#"<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ""#), "{}", c.text);
        assert!(c.text.contains("Second line with \"quotes\"."), "{}", c.text);
    }

    #[test]
    fn a_pages_named_chrome_is_left_out_of_its_text() {
        // Wikipedia's "Part of a series on…" sidebar and navbox listed themselves first in a clip's text
        let html = r#"<main id="content"><table class="sidebar nomobile"><tr><td><ul><li>Introduction</li><li>Glossary</li></ul></td></tr></table>
            <div class="mw-content-ltr"><p>Quantum entanglement is the phenomenon …<sup class="reference"><a>[1]</a>: 867</sup></p><div role="navigation" class="navbox"><ul><li>Bell test</li></ul></div>
            <div class="share-bar"><p>Share this</p></div><p class="navigational-text">Kept: a word inside a longer name is not chrome.</p></div></main>"#;
        let text = read("https://en.wikipedia.org/wiki/Quantum_entanglement", html).text;
        assert_eq!(text, "Quantum entanglement is the phenomenon …\n\nKept: a word inside a longer name is not chrome.");
    }

    #[test]
    fn an_article_page_gives_its_metadata_and_readable_text_without_chrome() {
        let html = r#"<html><head><title>A post | Blog</title>
            <meta property="og:title" content="A post: on things"><meta property="og:type" content="article">
            <meta name="author" content="Ada"><meta property="article:published_time" content="2026-10-01T10:00:00Z">
            <meta property="og:image" content="https://blog/x.jpg"></head>
            <body><nav><p>Home</p></nav><article><h1>A post</h1><p>First   paragraph.</p><ul><li><p>one</p></li></ul></article><footer><p>©</p></footer></body></html>"#;
        let c = read("https://www.blog.example/post", html);
        assert_eq!(c.kind, Some(PageKind::Article));
        assert_eq!(c.fields["title"], "A post: on things");
        assert_eq!(c.fields["published"], "2026-10-01");
        assert_eq!(c.fields["site"], "blog.example");
        assert_eq!(c.text, "## A post\n\nFirst paragraph.\n\n- one");
    }

    #[test]
    fn a_page_with_no_paragraph_elements_is_split_at_its_double_line_breaks() {
        let html = r#"<html><body><table><tr><td><font>How to Do Great Work<br><br>July 2023<br><br>If you collected lives,
            the first   thing.<br>Same paragraph.<br><br>Second one.</font><blockquote>A quote.</blockquote></td></tr></table><script>var x;</script></body></html>"#;
        let t = read("https://essays.example/great", html).text;
        assert_eq!(t, "How to Do Great Work\n\nJuly 2023\n\nIf you collected lives, the first thing. Same paragraph.\n\nSecond one.\n\nA quote.");
    }

    #[test]
    fn a_page_with_no_article_gives_the_part_that_holds_its_paragraphs() {
        let long = "Words that make a real paragraph of the post, long enough to count. ".repeat(4);
        let html = format!(r#"<html><body><div id="smallhead"><h1>A Weblog</h1><p>Tagline of the site</p></div>
            <div id="primary"><h2>The post</h2><p>{long}</p><p>{long}</p><div class="part"><p>{long}</p></div></div>
            <div id="secondary"><p>Recent articles</p></div></body></html>"#);
        let t = read("https://blog.example/post", &html).text;
        assert!(t.starts_with("### The post\n\nWords"), "{t}");
        assert!(!t.contains("Tagline") && !t.contains("Recent articles"), "{t}");
        assert_eq!(t.matches("Words that make").count(), 12);
    }

    #[test]
    fn pages_say_what_they_are_by_json_ld_og_type_or_the_ids_they_name() {
        let film = r#"<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Movie","name":"Dune","datePublished":"2021-09-15","sameAs":"https://www.imdb.com/title/tt1160419/"}]}</script><link rel="canonical" href="https://www.imdb.com/title/tt1160419/">"#;
        let c = read("https://letterboxd.com/film/dune-2021/", film);
        assert_eq!((c.kind, c.ids.get("imdb").map(String::as_str)), (Some(PageKind::Movie), Some("tt1160419")));
        assert_eq!(c.fields["title"], "Dune");

        let embed = r#"<meta property="og:type" content="article"><meta property="og:video" content="https://www.youtube.com/embed/dQw4w9WgXcQ">"#;
        let c = read("https://blog.example/v", embed);
        assert_eq!((c.kind, c.ids["youtube"].as_str()), (Some(PageKind::Video), "dQw4w9WgXcQ"));

        let paper = r#"<meta name="citation_title" content="Quantum cluster theories"><meta name="citation_doi" content="doi:10.1103/RevModPhys.77.1027"><meta name="citation_publication_date" content="2005/10/06">"#;
        let c = read("https://journals.aps.org/rmp/abstract/10.1103/RevModPhys.77.1027", paper);
        assert_eq!((c.kind, c.ids["doi"].as_str(), c.fields["published"].as_str()), (Some(PageKind::Paper), "10.1103/RevModPhys.77.1027", Some("2005-10-06")));
    }

    #[test]
    fn a_film_page_gives_director_cast_genres_year_and_runtime_as_names_and_numbers() {
        // Letterboxd, trimmed: JSON-LD wrapped in a CDATA comment, the year after the title
        let html = r#"<title>&lrm;Dune: Part Two (2024) directed by Denis Villeneuve • Reviews, film + cast • Letterboxd</title>
            <meta property="og:type" content="video.movie"><meta property="og:title" content="Dune: Part Two (2024)"><meta property="og:site_name" content="Letterboxd">
            <script type="application/ld+json">
            /* <![CDATA[ */
            {"image":"https://a.ltrbxd.com/poster.jpg","@type":"Movie","inLanguage":["en"],"director":[{"@type":"Person","name":"Denis Villeneuve"}],"actor":[{"@type":"Person","name":"Timothée Chalamet"},{"@type":"Person","name":"Zendaya"},{"@type":"Person","name":"Rebecca Ferguson"},{"@type":"Person","name":"Javier Bardem"},{"@type":"Person","name":"Josh Brolin"},{"@type":"Person","name":"Austin Butler"},{"@type":"Person","name":"Florence Pugh"}],"url":"https://letterboxd.com/film/dune-part-two/","duration":"PT2H47M","dateCreated":"2024-02-06","name":"Dune: Part Two","genre":["Adventure","Science Fiction"],"releasedEvent":[{"@type":"PublicationEvent","startDate":"2024-02-27"}]}
            /* ]]> */
            </script>"#;
        let c = read("https://letterboxd.com/film/dune-part-two/", html);
        assert_eq!(c.kind, Some(PageKind::Movie));
        assert_eq!(c.fields["title"], "Dune: Part Two");
        assert_eq!(c.fields["director"], "Denis Villeneuve");
        assert_eq!(c.fields["cast"].as_array().map(Vec::len), Some(6), "the first six: {:?}", c.fields["cast"]);
        assert_eq!(c.fields["genres"], serde_json::json!(["Adventure", "Science Fiction"]));
        assert_eq!((c.fields["year"].as_i64(), c.fields["duration"].as_str()), (Some(2024), Some("2h 47m")));
        assert_eq!((c.fields["cover"].as_str(), c.fields["language"].as_str()), (Some("https://a.ltrbxd.com/poster.jpg"), Some("en")));
    }

    #[test]
    fn music_pages_say_song_or_album_with_artist_tracks_and_a_real_date() {
        // Spotify: a song page that also carries a music video's VideoObject; its og:type speaks for the page
        let song = r#"<meta property="og:type" content="music.song"><meta property="og:title" content="Never Gonna Give You Up"><meta property="og:site_name" content="Spotify">
            <meta name="music:duration" content="214"><meta name="music:release_date" content="1987-11-12">
            <meta name="music:musician" content="https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt"><meta name="music:musician_description" content="Rick Astley">
            <script type="application/ld+json">{"@type":"VideoObject","name":"Never Gonna Give You Up (video)"}</script>"#;
        let c = read("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", song);
        assert_eq!((c.kind, c.fields["duration"].as_str(), c.fields["year"].as_i64()), (Some(PageKind::Track), Some("3:34"), Some(1987)));
        assert_eq!(c.fields["artist"], "Rick Astley");

        // Bandcamp: og:type "album", a date as "05 Nov 2021 00:00:00 GMT", a genre given as its page
        let album = r#"<meta property="og:type" content="album"><meta property="og:site_name" content="Radiohead"><meta property="og:title" content="KID A MNESIA, by Radiohead">
            <script type="application/ld+json">{"@type":"MusicAlbum","@id":"https://radiohead.bandcamp.com/album/kid-a-mnesia","name":"KID A MNESIA","byArtist":{"@type":"MusicGroup","name":"Radiohead"},"numTracks":34,"datePublished":"05 Nov 2021 00:00:00 GMT","publisher":{"genre":"https://bandcamp.com/discover/alternative"}}</script>"#;
        let c = read("https://radiohead.bandcamp.com/album/kid-a-mnesia", album);
        assert_eq!(c.kind, Some(PageKind::Album));
        assert_eq!((c.fields["title"].as_str(), c.fields["artist"].as_str(), c.fields["tracks"].as_u64()), (Some("KID A MNESIA"), Some("Radiohead"), Some(34)));
        assert_eq!(c.fields["published"], "2021-11-05");
    }

    #[test]
    fn a_book_page_gives_its_authors_pages_and_isbn() {
        let html = r#"<meta property="og:type" content="books.book"><script type="application/ld+json">{"@type":"Book","name":"Dune (Dune, #1)","numberOfPages":604,"isbn":"9780340839935","author":[{"@type":"Person","name":"Frank Herbert"}]}</script>"#;
        let c = read("https://www.goodreads.com/book/show/234225.Dune", html);
        assert_eq!((c.kind, c.ids["isbn"].as_str(), c.fields["pages"].as_u64(), c.fields["author"].as_str()), (Some(PageKind::Book), "9780340839935", Some(604), Some("Frank Herbert")));
    }

    #[test]
    fn titles_lose_the_site_after_them_and_unfilled_values_are_dropped() {
        let c = read("https://en.wikipedia.org/wiki/Beau_Is_Afraid", r#"<title>Beau Is Afraid - Wikipedia</title><meta property="og:site_name" content="Wikipedia">"#);
        assert_eq!(c.fields["title"], "Beau Is Afraid");
        for (url, title, want) in [
            ("https://en.wikipedia.org/wiki/Quantum_entanglement", "Quantum entanglement - Wikipedia", "Quantum entanglement"),
            ("https://blog.rust-lang.org/2024/11/28/Rust-1.83.0/", "Announcing Rust 1.83.0 | Rust Blog", "Announcing Rust 1.83.0"),
            ("https://github.com/rust-lang/rust", "GitHub - rust-lang/rust: Empowering everyone", "rust-lang/rust: Empowering everyone"),
            ("https://example.org/a", "War - What is it good for", "War - What is it good for"),
        ] {
            assert_eq!(read(url, &format!("<title>{title}</title>")).fields["title"], want, "{url}");
        }
        let c = read("https://www.youtube.com/playlist?list=PL1", r#"<title>undefined - YouTube</title><meta property="og:title" content="undefined"><meta property="og:description" content="undefined">"#);
        assert!(!c.fields.contains_key("description"), "{:?}", c.fields);
        assert_ne!(c.fields.get("title").and_then(Value::as_str), Some("undefined"));
    }

    #[test]
    fn bot_checks_and_redirect_pages_are_known_for_what_they_are() {
        let c = read("https://www.example.com/a", "<title>Just a moment...</title><p>Checking your browser</p>");
        assert!(is_stand_in(&c));
        assert!(!is_stand_in(&read("https://www.example.com/a", "<title>Just a film about moments</title>")));
        // the Rust blog: the refresh inside <noscript>
        let html = r#"<title>Redirect</title><noscript><meta http-equiv="refresh" content="0; url=https://blog.rust-lang.org/2024/11/28/Rust-1.83.0/"></noscript>"#;
        assert_eq!(refresh_target("https://blog.rust-lang.org/2024/11/28/Rust-1.83.0.html", html).as_deref(), Some("https://blog.rust-lang.org/2024/11/28/Rust-1.83.0/"));
        assert_eq!(refresh_target("https://x.org/a/b", r#"<META HTTP-EQUIV="Refresh" CONTENT="2;URL='../c'">"#).as_deref(), Some("https://x.org/c"));
    }

    #[test]
    fn dates_and_durations_in_the_shapes_pages_use() {
        for (s, want) in [("2005/10/06", "2005-10-06"), ("2026-10-01T10:00:00Z", "2026-10-01"), ("05 Nov 2021 00:00:00 GMT", "2021-11-05"), ("November 5, 2021", "2021-11-05"), ("1997", "1997-01-01")] {
            assert_eq!(date_of(s).map(|d| d.to_string()).as_deref(), Some(want), "{s}");
        }
        assert_eq!(date_of("soon"), None);
        assert_eq!([duration_of("PT2H47M"), duration_of("PT3M34S"), duration_of("214"), duration_of("PT0S")], [Some("2h 47m".into()), Some("3:34".into()), Some("3:34".into()), None]);
    }
}
