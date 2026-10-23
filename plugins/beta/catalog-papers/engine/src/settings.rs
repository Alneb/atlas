//! The plugin's settings (`[[setting]]` in plugin.toml; values in `.atlas/plugin-settings/catalog-papers.toml`): what
//! the core's `[refs]` table was (config.rs `RefsConfig`), plus the PDF sources' order.
use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct Settings {
    /// The references' folder: one folder per entry, `<key>/<key>.md` and its PDF.
    pub dir: String,
    /// The BibTeX file rewritten after every change.
    pub bib: String,
    /// Fetch the open-access PDF when adding by DOI or arXiv id.
    pub download_pdfs: bool,
    /// Sent with the open-access lookups (OpenAlex, Unpaywall), as they ask; Unpaywall only with it.
    pub email: String,
    /// Answer the Zotero browser extension on 127.0.0.1:23119 while the plugin is on.
    pub connector: bool,
    /// Ask the PDF sources other plugins add when the built-in ones found none.
    pub pdf_sources_on: bool,
    /// Their order: plugin ids, `-id` switches one off.
    pub pdf_order: String,
    /// The open-access indexes asked after OpenAlex and Unpaywall, in order (remote::Index); empty: all of them.
    pub indexes: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            dir: "refs/papers".into(),
            bib: "refs/refs.bib".into(),
            download_pdfs: true,
            email: String::new(),
            connector: false,
            pdf_sources_on: true,
            pdf_order: String::new(),
            indexes: String::new(),
        }
    }
}

impl Settings {
    /// From the form's values; a field missing or of the wrong shape keeps its default, a blank folder too.
    pub fn from_value(v: &Value) -> Settings {
        let mut s = Settings::default();
        let Some(o) = v.as_object() else { return s };
        let text = |k: &str| o.get(k).and_then(Value::as_str).map(|t| t.trim().to_string());
        let flag = |k: &str| o.get(k).and_then(Value::as_bool);
        if let Some(d) = text("dir").filter(|d| !d.is_empty()) {
            s.dir = d.trim_matches('/').to_string();
        }
        if let Some(b) = text("bib").filter(|b| !b.is_empty()) {
            s.bib = b;
        }
        s.email = text("email").unwrap_or_default();
        s.pdf_order = text("pdf_order").unwrap_or_default();
        s.indexes = text("indexes").unwrap_or_default();
        s.download_pdfs = flag("download_pdfs").unwrap_or(s.download_pdfs);
        s.connector = flag("connector").unwrap_or(s.connector);
        s.pdf_sources_on = flag("pdf_sources_on").unwrap_or(s.pdf_sources_on);
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_forms_values_with_defaults_where_missing_or_blank() {
        let s = Settings::from_value(&serde_json::json!({ "dir": "/library/", "bib": "", "connector": true, "download_pdfs": "yes" }));
        assert_eq!((s.dir.as_str(), s.bib.as_str(), s.connector, s.download_pdfs), ("library", "refs/refs.bib", true, true));
        assert_eq!(Settings::from_value(&Value::Null), Settings::default());
    }
}
