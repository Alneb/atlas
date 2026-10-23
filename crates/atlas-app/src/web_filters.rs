//! Ad blocking for Atlas's browsing windows. WebKitGTK runs no browser extensions, so uBlock Origin itself
//! cannot run there; what it has is WebKit's content blocker (Safari's rule format, compiled natively and applied to
//! every request and page). The filter lists uBlock Origin starts with (EasyList, EasyPrivacy, uBlock's own) are
//! fetched here, kept a week, and converted into that format by Brave's adblock-rust (`content-blocking`, what Brave
//! does on iOS); the window compiles the result (crates/atlas-app `browser.rs`). uBlock's extended syntax (scriptlets,
//! procedural cosmetic filters) has no equivalent in WebKit and is left out. docs/WEB-WINDOWS.md.
use atlas_core::config::WebConfig;
use atlas_core::Result;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// A list older than this is fetched again (when the network answers; else the old one is used).
const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 3600);
/// Names the converter in a rule set's id: bump it when an `adblock` update changes what the same lists become.
const CONVERTER: &str = "adblock-0.13";

/// The rules for WebKit, ready to compile.
#[derive(Debug, Clone)]
pub struct Rules {
    /// Names the rules (a hash of the lists they come from): the same lists are neither converted nor compiled again.
    pub id: String,
    /// The JSON file (Safari's content-blocker format).
    pub path: PathBuf,
    /// How many rules, when they were converted this time (None: the kept conversion of the same lists).
    pub count: Option<usize>,
    /// One line per list: where its text came from ("fetched", "kept", "missing: why").
    pub report: Vec<String>,
}

/// Where lists and rules are kept: the user's cache, not a vault (they are the same for every vault).
pub fn cache_dir() -> PathBuf {
    std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".cache"))
        .join("atlas/web-filters")
}

/// FNV-1a: a stable name for a list's file and for a rule set (std's hasher may change between Rust versions).
fn fnv(bytes: &[u8]) -> String {
    let h = bytes.iter().fold(0xcbf29ce484222325u64, |h, b| (h ^ u64::from(*b)).wrapping_mul(0x100000001b3));
    format!("{h:016x}")
}

/// A list's text: the kept copy while it is fresh, else fetched (and kept), else the old copy; None when there is none.
fn list_text(url: &str, dir: &Path, fetch: &dyn Fn(&str) -> Result<String>) -> (Option<String>, String) {
    let file = dir.join("lists").join(format!("{}.txt", fnv(url.as_bytes())));
    let age = std::fs::metadata(&file).and_then(|m| m.modified()).ok().and_then(|t| SystemTime::now().duration_since(t).ok());
    if age.is_some_and(|a| a < MAX_AGE) {
        if let Ok(t) = std::fs::read_to_string(&file) {
            return (Some(t), format!("{url}: kept"));
        }
    }
    match fetch(url) {
        Ok(text) => {
            let _ = std::fs::create_dir_all(file.parent().expect("has a parent")).and_then(|_| std::fs::write(&file, &text));
            (Some(text), format!("{url}: fetched"))
        }
        Err(e) => match std::fs::read_to_string(&file) {
            Ok(t) => (Some(t), format!("{url}: kept (not refreshed: {e})")),
            Err(_) => (None, format!("{url}: missing ({e})")),
        },
    }
}

fn http_get(url: &str) -> Result<String> {
    let res = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent(concat!("Atlas/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| atlas_core::Error::Other(e.into()))?
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| atlas_core::Error::BadRequest(format!("{}", e.without_url())))?;
    res.text().map_err(|e| atlas_core::Error::BadRequest(e.to_string()))
}

/// Lists in Adblock Plus / uBlock syntax → WebKit content-blocker rules (what WebKit cannot express is left out).
pub fn convert(lists: &[String]) -> Vec<adblock::content_blocking::CbRule> {
    let mut set = adblock::lists::FilterSet::new(true); // debug: keeps each rule's text, which the conversion needs
    for text in lists {
        set.add_filter_list(text.clone(), adblock::lists::ParseOptions::default());
    }
    set.into_content_blocking().map(|(rules, _)| rules).unwrap_or_default()
}

/// The rules for the configured lists; None when blocking is off or no list could be had.
pub fn rules(cfg: &WebConfig) -> Result<Option<Rules>> {
    rules_with(cfg, &cache_dir(), &http_get)
}

fn rules_with(cfg: &WebConfig, dir: &Path, fetch: &dyn Fn(&str) -> Result<String>) -> Result<Option<Rules>> {
    if !cfg.block_ads {
        return Ok(None);
    }
    let (mut texts, mut report) = (Vec::new(), Vec::new());
    for url in &cfg.filter_lists {
        let (text, said) = list_text(url, dir, fetch);
        texts.extend(text);
        report.push(said);
    }
    if texts.is_empty() {
        return Ok(None);
    }
    let id = fnv(format!("{CONVERTER}\0{}", texts.join("\0")).as_bytes());
    let path = dir.join(format!("rules-{id}.json"));
    if path.exists() {
        return Ok(Some(Rules { id, path, count: None, report }));
    }
    let rules = convert(&texts);
    let json = serde_json::to_string(&rules).map_err(|e| atlas_core::Error::Other(e.into()))?;
    std::fs::create_dir_all(dir)?;
    // only the current rule set is kept
    for old in std::fs::read_dir(dir)?.flatten().filter(|e| e.file_name().to_string_lossy().starts_with("rules-")) {
        let _ = std::fs::remove_file(old.path());
    }
    std::fs::write(&path, &json)?;
    Ok(Some(Rules { id, path, count: Some(rules.len()), report }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The real lists, over the network: `cargo test -p atlas-core --lib real_lists -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_lists() {
        let t = std::time::Instant::now();
        let r = rules(&WebConfig::default()).unwrap().expect("rules");
        println!("{:?} rules in {:?}, {} KB: {:?}", r.count, t.elapsed(), std::fs::metadata(&r.path).unwrap().len() / 1024, r.report);
        assert!(r.count.is_none_or(|n| n > 10_000));
    }

    const LIST: &str = "[Adblock Plus 2.0]\n! a comment\n||ads.example.com^\n||tracker.example.net^$third-party\nexample.org##.banner-ad\n##.sponsored\n@@||ads.example.com/allowed.js\nexample.org#$#abort-on-property-read foo\n";

    #[test]
    fn a_list_becomes_webkit_rules_and_is_kept_for_a_week() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = WebConfig { filter_lists: vec!["https://lists.example/easylist.txt".into()], ..WebConfig::default() };
        let calls = std::cell::Cell::new(0);
        let fetch = |_: &str| -> Result<String> { calls.set(calls.get() + 1); Ok(LIST.to_string()) };
        let r = rules_with(&cfg, dir.path(), &fetch).unwrap().expect("rules");
        let json = std::fs::read_to_string(&r.path).unwrap();
        assert!(json.contains("ads\\\\.example\\\\.com") && json.contains("\"block\""), "network rule: {json}");
        assert!(json.contains(".banner-ad") && json.contains("css-display-none"), "cosmetic rule: {json}");
        assert!(json.contains("ignore-previous-rules"), "exception: {json}");
        assert!(!json.contains("abort-on-property-read"), "uBlock scriptlets have no WebKit form");
        assert_eq!(r.report, ["https://lists.example/easylist.txt: fetched"]);
        // the second time: the kept copy, the same rules (the window reuses what it compiled)
        let again = rules_with(&cfg, dir.path(), &fetch).unwrap().unwrap();
        assert_eq!((calls.get(), again.id.as_str(), again.report[0].ends_with("kept")), (1, r.id.as_str(), true));
        assert_eq!((r.count, again.count), (Some(6), None), "converted once, then the kept conversion");
        // the network gone and the list too old: the old copy still blocks
        let lists = dir.path().join("lists");
        for f in std::fs::read_dir(&lists).unwrap().flatten() {
            std::fs::File::options().write(true).open(f.path()).unwrap().set_modified(SystemTime::now() - MAX_AGE * 2).unwrap();
        }
        let offline = |_: &str| -> Result<String> { Err(atlas_core::Error::BadRequest("offline".into())) };
        let stale = rules_with(&cfg, dir.path(), &offline).unwrap().unwrap();
        assert!(stale.report[0].contains("not refreshed") && stale.report[0].contains("offline") && stale.id == r.id, "{:?}", stale.report);
        // off, or nothing to be had: no rules
        assert!(rules_with(&WebConfig { block_ads: false, ..cfg.clone() }, dir.path(), &fetch).unwrap().is_none());
        let nowhere = WebConfig { filter_lists: vec!["https://nowhere.example/x.txt".into()], ..cfg };
        assert!(rules_with(&nowhere, dir.path(), &offline).unwrap().is_none());
    }
}
