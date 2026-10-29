//! What the catalog will make of a capture, said before it is saved (the desktop box's status line): the vault's
//! catalog plugins' `recognize` patterns matched here, locally and at once — no service asked. A link no pattern
//! knows is a web page (the catalog files those too); plain words are nothing. The catalog itself decides on save.
use crate::config::Config;
use regex::Regex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

type Patterns = Vec<(Regex, String)>;
static PATTERNS: LazyLock<Mutex<HashMap<PathBuf, (Instant, Patterns)>>> = LazyLock::new(Mutex::default);
const FRESH: Duration = Duration::from_secs(30);
static LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"https?://\S+").expect("static"));

/// The patterns of the catalog plugins that can run in this vault (none when the catalog is off, or its
/// `on_capture` setting — "File links from every capture" — is false), read again after FRESH so a change shows up.
fn patterns(root: &Path, cfg: &Config) -> Patterns {
    let mut cache = PATTERNS.lock().unwrap();
    if let Some((at, p)) = cache.get(root) {
        if at.elapsed() < FRESH {
            return p.clone();
        }
    }
    let all = crate::plugins::list(root);
    // the role, not a plugin's id: whichever plugin `provides = ["catalog"]` (its contributions are `[contributes.catalog]`)
    let on = crate::plugins::provider(&all, &cfg.plugins.off, "catalog").is_some_and(|p| p.settings.get("on_capture") != Some(&serde_json::Value::Bool(false)));
    let mut out = vec![];
    if on {
        for (_, t) in crate::plugins::contributions(root, &cfg.plugins.off, "catalog").unwrap_or_default() {
            for r in t["recognize"].as_array().into_iter().flatten() {
                if let (Some(p), Some(k)) = (r["pattern"].as_str(), r["kind"].as_str()) {
                    if let Ok(re) = Regex::new(p) {
                        out.push((re, k.to_string()));
                    }
                }
            }
        }
        // a link no pattern knows: the catalog's own web page kind
        out.push((LINK.clone(), WEB_PAGE.into()));
    }
    cache.insert(root.to_path_buf(), (Instant::now(), out.clone()));
    out
}

const WEB_PAGE: &str = "article";

/// The kind the catalog would file this text as, by the first pattern that matches; None: it will not catalogue it.
pub fn kind_of(root: &Path, cfg: &Config, text: &str) -> Option<String> {
    patterns(root, cfg).into_iter().find(|(re, _)| re.is_match(text)).map(|(_, k)| k)
}

/// A kind in words: "a film", "an album", "a web page".
pub fn kind_words(kind: &str) -> String {
    match kind {
        "movie" => "a film".into(),
        "show" => "a series".into(),
        "article" => "a web page".into(),
        "science_book" => "a science book".into(),
        k if k.starts_with(['a', 'e', 'i', 'o', 'u']) => format!("an {}", k.replace('_', " ")),
        k => format!("a {}", k.replace('_', " ")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_catalogs_patterns_say_what_a_capture_will_be() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(".atlas/plugins");
        std::fs::create_dir_all(p.join("catalog")).unwrap();
        std::fs::create_dir_all(p.join("catalog-letterboxd")).unwrap();
        std::fs::write(p.join("catalog/plugin.toml"), "title = \"Catalog\"\n").unwrap();
        std::fs::write(p.join("catalog-letterboxd/plugin.toml"), "title = \"LB\"\nrequires = [\"catalog\"]\n[contributes.catalog]\nrecognize = [{ pattern = \"letterboxd\\\\.com/film/([\\\\w-]+)\", kind = \"movie\", id = \"letterboxd\" }]\n").unwrap();
        let cfg = Config::default();
        assert_eq!(kind_of(d.path(), &cfg, "see https://letterboxd.com/film/the-realm-2018/").as_deref(), Some("movie"));
        assert_eq!(kind_of(d.path(), &cfg, "https://example.org/post").as_deref(), Some("article"));
        assert_eq!(kind_of(d.path(), &cfg, "buy milk"), None);
        assert_eq!((kind_words("movie"), kind_words("album"), kind_words("article")), ("a film".into(), "an album".into(), "a web page".into()));
    }

    /// With "File links from every capture" off the catalog files nothing from a capture, so the box promises nothing.
    #[test]
    fn no_hint_while_the_catalog_files_nothing_from_captures() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(".atlas/plugins/catalog");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("plugin.toml"), "title = \"Catalog\"\nprovides = [\"catalog\"]\n[settings]\non_capture = false\n").unwrap();
        assert_eq!(kind_of(d.path(), &Config::default(), "https://example.org/post"), None);
    }
}
