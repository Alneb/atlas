//! General word frequencies per language (`GET /api/words/{lang}`): what the Predictor ranks the words it finishes by and
//! Spelling ranks its suggestions by, beside the vault's own counts — the same on the desktop, a server and the phone
//! (which has no Hunspell). Built into the core from `data/words/<lang>.words` (scripts/dev/wordlists.mjs, from
//! wordfreq's lists, data CC BY-SA 4.0 — `data/words/NOTICE`). One word per line, most frequent first; `@<n>` starts the
//! words seen 10^(-n/100) times per word of text.

/// The list of `lang` (`en`, `es`), or None for a language with none.
pub fn list(lang: &str) -> Option<&'static str> {
    match lang {
        "en" => Some(include_str!("../data/words/en.words")),
        "es" => Some(include_str!("../data/words/es.words")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn each_list_starts_with_its_commonest_words_and_is_large() {
        let first = |l: &str| super::list(l).unwrap().lines().filter(|w| !w.starts_with('@')).take(3).collect::<Vec<_>>();
        assert_eq!(first("en"), ["the", "to", "and"]);
        assert_eq!(first("es"), ["de", "la", "que"]);
        assert!(super::list("en").unwrap().lines().count() > 50_000);
        assert!(super::list("xx").is_none());
    }
}
