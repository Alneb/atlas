//! A PDF's own naming for the references: the first page's reading and the Info dictionary's are the shared ones
//! (`atlas_catalog::first_page`, the catalog's documents use them too); here what only the references need — Crossref's
//! record for a first page read right.
use crate::net::Net;
use crate::remote::enc;
pub use atlas_catalog::first_page::{from_info, read, FirstPage, Info};

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

    #[test]
    fn a_lecture_s_first_page_names_it_and_its_citekey() {
        let p = read(NOTES, "Georges%202026_Jouvence_NOTES_GW_EDMFT.pdf").unwrap();
        let key = crate::refs::citekey(&p.authors.iter().map(|a| crate::remote::last_first(a)).collect::<Vec<_>>(), p.year.as_deref(), &p.title, &|_| false);
        assert_eq!(key, "georges2026screening");
    }
}
