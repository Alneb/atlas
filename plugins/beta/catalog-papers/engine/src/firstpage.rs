//! What a PDF without identifiers says about itself on its first page: the title (its first line of words), the
//! authors (the next line that is only personal names), the year (a "Dated:" / "Received" line, else the file's
//! name). Lecture notes, theses and old scans carry no DOI, but their first page names them as a reader would; a
//! note named after the file ("georges") is what this avoids. Shape-based, no list of journals: a line that does not
//! read as words (an OCR'd scan, "ON TH E") gives nothing, and the file's name is used as before.
use crate::net::Net;
use crate::remote::enc;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct FirstPage {
    pub title: String,
    /// As written ("Antoine Georges"); the entry stores them "Last, First".
    pub authors: Vec<String>,
    pub year: Option<String>,
}

/// Lines that are a page's furniture, never its title: a preprint stamp, a link, a journal line, a copyright.
fn furniture(l: &str) -> bool {
    let low = l.to_lowercase();
    ["arxiv", "doi", "http", "www.", "©", "copyright", "preprint", "issn", "isbn", "vol.", "volume ", "pp."].iter().any(|w| low.contains(w))
        || l.chars().filter(|c| c.is_alphabetic()).count() < 4
}

/// A line of real words: not mostly single letters (an OCR'd "PROPERTIES OFA GAS O F").
fn reads_as_words(l: &str) -> bool {
    let words: Vec<&str> = l.split_whitespace().collect();
    let singles = words.iter().filter(|w| w.chars().filter(|c| c.is_alphabetic()).count() == 1 && !matches!(**w, "a" | "A" | "I")).count();
    words.len() >= 2 && singles * 4 <= words.len() && !words.iter().any(|w| w.len() > 30)
}

/// A line that names people and nothing else: "Antoine Georges", "A. Georges, G. Kotliar and W. Krauth".
fn names_in(l: &str) -> Option<Vec<String>> {
    const PARTICLES: &[&str] = &["de", "van", "von", "der", "den", "da", "di", "du", "la", "le", "del", "dos", "y"];
    const PLACES: &[&str] = &["university", "université", "universität", "institute", "institut", "department", "laboratory", "laboratoire", "school", "college", "center", "centre", "lecture", "abstract", "dated", "physics", "école", "faculty"];
    let clean: String = l.chars().filter(|c| !c.is_ascii_digit() && !matches!(c, '*' | '†' | '‡' | '§' | '¶' | '(' | ')')).collect();
    let parts: Vec<String> = clean
        .split([',', ';', '&'])
        .flat_map(|p| p.split(" and "))
        .map(|p| p.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|p| !p.is_empty())
        .collect();
    let person = |p: &str| {
        let words: Vec<&str> = p.split_whitespace().collect();
        (2..=5).contains(&words.len())
            && words.iter().all(|w| PARTICLES.contains(w) || w.chars().next().is_some_and(char::is_uppercase))
            && !words.iter().any(|w| PLACES.contains(&w.to_lowercase().as_str()))
            && words.last().is_some_and(|w| w.chars().filter(|c| c.is_alphabetic()).count() >= 2)
    };
    (!parts.is_empty() && parts.iter().all(|p| person(p))).then_some(parts)
}

fn year_in(s: &str) -> Option<String> {
    let b = s.as_bytes();
    (0..b.len().saturating_sub(3)).find_map(|i| {
        let y = s.get(i..i + 4)?;
        let edge = |j: Option<&u8>| j.is_none_or(|c| !c.is_ascii_digit());
        ((y.starts_with("19") || y.starts_with("20")) && y.bytes().all(|c| c.is_ascii_digit()) && edge(i.checked_sub(1).and_then(|j| b.get(j))) && edge(b.get(i + 4))).then(|| y.to_string())
    })
}

/// The first page's title, authors and year; None unless a line that reads as a title has a line of names below it. `file`: the PDF's name,
/// a second place for the year ("Georges 2026_notes.pdf").
pub fn read(first_page: &str, file: &str) -> Option<FirstPage> {
    let lines: Vec<&str> = first_page.lines().map(str::trim).filter(|l| !l.is_empty()).take(20).collect();
    let at = lines.iter().position(|l| !furniture(l))?;
    let mut title = lines[at].to_string();
    // a title that wraps: its next line goes on in lower case
    let mut next = at + 1;
    while next < lines.len() && lines[next].starts_with(|c: char| c.is_lowercase()) && title.len() < 200 {
        title = format!("{title} {}", lines[next]);
        next += 1;
    }
    let title = title.trim_end_matches(['.', ':', ';', ',', ' ']).to_string();
    if !reads_as_words(&title) || names_in(&title).is_some() {
        return None;
    }
    // no line of names under it: the first line was not a title either (a society's name over an old scan)
    let authors = lines.iter().skip(next).take(5).find_map(|l| names_in(l))?;
    let dated = lines.iter().take(20).find(|l| {
        let low = l.to_lowercase();
        ["dated", "date:", "received", "submitted", "published"].iter().any(|w| low.contains(w))
    });
    let year = dated.and_then(|l| year_in(l)).or_else(|| year_in(&atlas_text::links::percent_decoded(file)));
    Some(FirstPage { title, authors, year })
}

/// A PDF's Info dictionary (what its author's program wrote: `/Title`, `/Author`, `/CreationDate`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Info {
    pub title: Option<String>,
    pub author: Option<String>,
    pub created: Option<String>,
}

/// What the Info dictionary says, when the first page says nothing readable: its title (else the file's name, made
/// readable) and authors; the year it was made. None when it names no author — a title alone is no better than the
/// file's name. A program's stand-in is no title: a file name ("main.tex", "Microsoft Word - x.docx"), "untitled".
pub fn from_info(info: &Info, file: &str) -> Option<FirstPage> {
    let authors: Vec<String> = info.author.as_deref().map(crate::remote::split_names).unwrap_or_default().into_iter().filter(|a| a.chars().filter(|c| c.is_alphabetic()).count() >= 2 && !a.contains('@')).collect();
    if authors.is_empty() {
        return None;
    }
    let stand_in = |t: &str| {
        let low = t.to_lowercase();
        low.starts_with("microsoft ") || low.starts_with("untitled") || low.rsplit_once('.').is_some_and(|(_, ext)| (1..=4).contains(&ext.len()) && ext.chars().all(|c| c.is_ascii_alphanumeric()) && !ext.chars().all(|c| c.is_ascii_digit()))
    };
    let title = info.title.as_deref().map(str::trim).filter(|t| t.chars().filter(|c| c.is_alphabetic()).count() >= 3 && !stand_in(t)).map(String::from).unwrap_or_else(|| {
        let name = atlas_text::links::percent_decoded(file);
        let stem = name.rsplit('/').next().unwrap_or(&name);
        let stem = stem.rsplit_once('.').map_or(stem, |(s, _)| s);
        stem.replace(['_', '-'], " ").split_whitespace().collect::<Vec<_>>().join(" ")
    });
    // a PDF date: "D:20111012153000+02'00'"
    let year = info.created.as_deref().map(|d| d.trim().trim_start_matches("D:")).and_then(|d| d.get(..4)).filter(|y| (y.starts_with("19") || y.starts_with("20")) && y.bytes().all(|c| c.is_ascii_digit())).map(String::from);
    Some(FirstPage { title, authors, year })
}

/// The DOI of the published work with exactly this title (and this first author, when known), from Crossref's
/// search: a first page read right is upgraded to the full record. Only an exact title match counts — the search
/// always answers something.
pub fn crossref_match(net: &dyn Net, p: &FirstPage) -> Option<String> {
    let norm = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect::<String>();
    let query = format!("{} {}", p.title, p.authors.first().map(String::as_str).unwrap_or(""));
    let v = net.json(&format!("https://api.crossref.org/works?rows=3&select=DOI,title,author&query.bibliographic={}", enc(&query, ""))).ok()?;
    // "Last, First" (as an Info dictionary may write it) or "First Last"
    let surname = p.authors.first().and_then(|a| a.split_once(',').map(|(l, _)| l).or_else(|| a.split_whitespace().last())).map(norm);
    v["message"]["items"].as_array()?.iter().find_map(|w| {
        let same_title = w["title"][0].as_str().is_some_and(|t| norm(t) == norm(&p.title));
        let same_author = surname.as_ref().is_none_or(|s| w["author"].as_array().is_some_and(|a| a.iter().any(|x| x["family"].as_str().map(norm).as_ref() == Some(s))));
        (same_title && same_author).then(|| w["DOI"].as_str().map(String::from)).flatten()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // The first page of a lecture's notes, as a PDF's text comes out (no DOI, no arXiv id).
    const NOTES: &str = "Screening, RPA, GW and GW+EDMFT: an Introduction.\nLecture at a winter school on ‘Computational Quantum Materials’\nAntoine Georges\n(Dated: June, 2026)\n\nDisclaimer: Some mistakes or misprints may remain.\n\nCONTENTS\nI. Motivations\n";

    /// Personal notes with nothing readable on the first page: the Info dictionary names them (title, author, the
    /// year they were made); a program's stand-in title gives way to the file's name; no author, nothing.
    #[test]
    fn the_info_dictionary_names_a_pdf_its_first_page_does_not() {
        let info = Info { title: Some("Mecánica y Ondas I".into()), author: Some("Ana Pérez".into()), created: Some("D:20190314120000+01'00'".into()) };
        let p = from_info(&info, "teoria%20mecanica.pdf").unwrap();
        assert_eq!((p.title.as_str(), p.authors.clone(), p.year.as_deref()), ("Mecánica y Ondas I", vec!["Ana Pérez".to_string()], Some("2019")));
        let tex = Info { title: Some("main.tex".into()), ..info.clone() };
        assert_eq!(from_info(&tex, "Mechanics_notes.pdf").unwrap().title, "Mechanics notes");
        assert_eq!(from_info(&Info { author: None, ..info }, "x.pdf"), None);
    }

    #[test]
    fn a_lecture_s_first_page_names_it() {
        let p = read(NOTES, "Georges%202026_Jouvence_NOTES_GW_EDMFT.pdf").unwrap();
        assert_eq!(p.title, "Screening, RPA, GW and GW+EDMFT: an Introduction");
        assert_eq!(p.authors, vec!["Antoine Georges"]);
        assert_eq!(p.year.as_deref(), Some("2026"));
        let key = crate::refs::citekey(&p.authors.iter().map(|a| crate::remote::last_first(a)).collect::<Vec<_>>(), p.year.as_deref(), &p.title, &|_| false);
        assert_eq!(key, "georges2026screening");
    }

    #[test]
    fn several_authors_furniture_and_a_wrapped_title() {
        let page = "arXiv:2401.00001v2 [cond-mat.str-el] 3 Jan 2024\nPhys. Rev. B vol. 99\nDynamical mean-field theory of strongly correlated\nfermion systems\nA. Georges, G. Kotliar, W. Krauth and M. J. Rozenberg\nLaboratoire de Physique Théorique, École Normale Supérieure\n";
        let p = read(page, "x.pdf").unwrap();
        assert_eq!(p.title, "Dynamical mean-field theory of strongly correlated fermion systems");
        assert_eq!(p.authors, vec!["A. Georges", "G. Kotliar", "W. Krauth", "M. J. Rozenberg"]);
        assert_eq!(p.year, None, "the arXiv stamp's date is furniture, not the work's");
    }

    #[test]
    fn an_ocr_d_scan_gives_nothing() {
        // a 1954 scan's text layer: words broken by the OCR; the file's name is used instead
        let page = "Det Kongelige Danske Videnskabernes Selska b\nMatematisk-fysiske Meddelelser, bind 28, nr . 8\nON TH E\nPROPERTIES OFA GAS O F\nCHARGED PARTICLE S\nBY\nJ . LINDIIAß D\n";
        assert_eq!(read(page, "mfm-28-8.pdf"), None);
    }
}
