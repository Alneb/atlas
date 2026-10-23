//! The `[[` list: every file a wikilink can point at, ranked for what is typed ("the [[ autocompletion
//! was a bit lackluster"; "needs to be smarter not just alphabetical, otherwise all dates just appear
//! first"). Match quality first ([`Tier`]), then usefulness ([`useful`]): recently opened, linked with the current
//! note, linked to by many, recently changed. Notes named by a date (daily notes, kept mail, `2026-10-17 Meeting`)
//! go below the rest unless the query looks like a date. The editor's completion and the property fields ask the same `GET /api/link-targets`.
use crate::api::{LinkTarget, TargetKind};
use crate::config::Config;
use std::cmp::Reverse;
use std::path::Path;
use std::time::SystemTime;

pub const MAX_TARGETS: usize = 50;
/// The UI's recently opened files (lib/recent.ts), most recent first.
const RECENT_FILE: &str = ".atlas/cache/recent.json";
/// A query this short (or empty) says little: dated notes wait below every other match.
const SHORT_QUERY: usize = 3;
/// Fewer letters than this never match fuzzily (too loose to mean anything).
const FUZZY_MIN: usize = 3;

/// How well the query names a file, best first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Tier {
    /// the name, an alias or the title is the query
    Exact,
    Prefix,
    /// every word of the query starts a word of the name
    WordStart,
    Substring,
    /// an alias or the title holds every word
    Alias,
    /// the folder path does
    Path,
    /// the query's letters in order, gaps allowed (three letters or more)
    Fuzzy,
}

/// Sort key, smallest first: dated notes held back for a short query, tier, dated within the tier,
/// fuzzy spread, usefulness, shortest path.
type Rank = (bool, Tier, bool, usize, Reverse<u32>, usize);

fn kind_of(rel: &str, props: Option<&crate::note_props::Props>) -> TargetKind {
    let ext = rel.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        // shape, not folder: a kept mail is a note with a message id
        "md" if props.is_some_and(|p| p.contains_key("message-id")) => TargetKind::Mail,
        "md" | "markdown" => TargetKind::Note,
        "page" => TargetKind::Page,
        "pdf" => TargetKind::Pdf,
        "base" => TargetKind::Base,
        "canvas" => TargetKind::Canvas,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "avif" | "bmp" => TargetKind::Image,
        _ => TargetKind::Other,
    }
}

/// A picture, by its extension (what Obsidian draws as an image).
pub(crate) fn is_image(rel: &str) -> bool {
    kind_of(rel, None) == TargetKind::Image
}

/// `aliases: [a, b]` / `alias: a` and `title:` of a note's frontmatter.
fn names_in(props: &crate::note_props::Props) -> (Vec<String>, Option<String>) {
    let text = |v: &serde_yaml::Value| v.as_str().map(str::to_string);
    let mut aliases = Vec::new();
    for key in ["aliases", "alias"] {
        match props.get(key) {
            Some(serde_yaml::Value::Sequence(s)) => aliases.extend(s.iter().filter_map(text)),
            Some(v) => aliases.extend(text(v)),
            None => {}
        }
    }
    (aliases, props.get("title").and_then(text))
}

/// The query, lower case, and its words.
struct Query {
    q: String,
    tokens: Vec<String>,
    /// starts with a digit (`2026`, `10-17`): dates are what is looked for
    date: bool,
}

impl Query {
    fn new(q: &str) -> Self {
        let q = q.trim().to_lowercase();
        let tokens = q.split_whitespace().map(String::from).collect();
        let date = q.starts_with(|c: char| c.is_ascii_digit());
        Query { q, tokens, date }
    }

    fn holds_all(&self, hay: &str) -> bool {
        self.tokens.iter().all(|t| hay.contains(t.as_str()))
    }

    /// Exact, Prefix, WordStart or Substring on a lower-case name.
    fn on_name(&self, low: &str) -> Option<Tier> {
        if low == self.q {
            Some(Tier::Exact)
        } else if low.starts_with(&self.q) {
            Some(Tier::Prefix)
        } else if self.tokens.iter().all(|t| starts_a_word(low, t)) {
            Some(Tier::WordStart)
        } else {
            self.holds_all(low).then_some(Tier::Substring)
        }
    }

    /// The best tier, the alias or title it matched, and the fuzzy spread (letters skipped).
    fn rank(&self, name: &str, rel: &str, aliases: &[String], title: Option<&str>) -> Option<(Tier, Option<String>, usize)> {
        let low = name.to_lowercase();
        if let Some(t) = self.on_name(&low) {
            return Some((t, None, 0));
        }
        let mut alts = aliases.iter().map(String::as_str).chain(title);
        if let Some(a) = alts.clone().find(|a| a.to_lowercase() == self.q) {
            return Some((Tier::Exact, Some(a.to_string()), 0));
        }
        if let Some(a) = alts.find(|a| self.holds_all(&a.to_lowercase())) {
            return Some((Tier::Alias, Some(a.to_string()), 0));
        }
        if self.holds_all(&rel.to_lowercase()) {
            return Some((Tier::Path, None, 0));
        }
        fuzzy_spread(&self.q, &low).map(|s| (Tier::Fuzzy, None, s))
    }
}

/// `t` occurs in `low` at the start of a word: after a non-alphanumeric character, or letters after digits
/// (`qin2022hubbard`, a citekey).
fn starts_a_word(low: &str, t: &str) -> bool {
    let letter = t.starts_with(char::is_alphabetic);
    low.match_indices(t).any(|(i, _)| low[..i].chars().next_back().is_none_or(|c| !c.is_alphanumeric() || (letter && c.is_ascii_digit())))
}

/// The query's letters in order in `low`: how many letters lie between the first and the last beyond the
/// query's own.
fn fuzzy_spread(q: &str, low: &str) -> Option<usize> {
    let letters: Vec<char> = q.chars().filter(|c| !c.is_whitespace()).collect();
    if letters.len() < FUZZY_MIN {
        return None;
    }
    let (mut first, mut last, mut want) = (None, 0, letters.iter().peekable());
    for (i, c) in low.chars().enumerate() {
        if want.peek() == Some(&&c) {
            want.next();
            first.get_or_insert(i);
            last = i;
        }
    }
    (want.peek().is_none()).then(|| last + 1 - first.unwrap_or(0) - letters.len())
}

/// Named by a date: a day's, week's, month's or year's note (`2026-10-17 Fri`, `2026-W42`, `2026-Q4`, `2026`), a
/// kept mail (`2026-10-16 Re: plan`), or any note in the log folder. There are hundreds; they crowd a short query.
fn dated(name: &str, rel: &str, cfg: &Config) -> bool {
    static STAMP: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"^(\d{4}-(\d{2}(-\d{2})?|[Ww]\d{2}|[Qq]\d)(\D|$)|\d{4}$)").expect("valid")
    });
    let log = cfg.log_dir.trim_matches('/');
    (!log.is_empty() && rel.strip_prefix(log).is_some_and(|r| r.starts_with('/'))) || STAMP.is_match(name)
}

/// How useful a file is to link to now, whatever was typed: opened lately (by its place in the recent list),
/// linked with the current note, linked to by many notes, changed lately; a note a little before other kinds.
/// Points, higher better.
fn useful(note: bool, opened: Option<usize>, near: bool, incoming: u32, age_days: f64) -> u32 {
    let note = if note { 3.0 } else { 0.0 };
    let opened = opened.map_or(0.0, |i| 40.0 - i as f64).max(0.0);
    let near = if near { 30.0 } else { 0.0 };
    let linked = (4.0 * f64::from(incoming + 1).log2()).min(20.0);
    let fresh = 15.0 / (1.0 + age_days.max(0.0) / 3.0);
    (note + opened + near + linked + fresh).round() as u32
}

fn recent_opened(root: &Path) -> Vec<String> {
    std::fs::read_to_string(root.join(RECENT_FILE)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn targets(root: &Path, cfg: &Config, q: &str, from: Option<&str>) -> Vec<LinkTarget> {
    let snap = crate::links::snapshot(root, cfg);
    let stats = snap.link_stats(from);
    let opened = recent_opened(root);
    let query = Query::new(q);
    let short = query.q.chars().count() <= SHORT_QUERY;
    let now = SystemTime::now();
    let mut hits: Vec<(Rank, LinkTarget)> = Vec::new();
    for rel in snap.files() {
        if Some(rel.as_str()) == from || cfg.index_excluded(rel) || cfg.is_agent_file(rel) {
            continue;
        }
        let parsed = snap.parsed.get(rel);
        let kind = kind_of(rel, parsed.map(|p| &p.props));
        if kind == TargetKind::Other && !query.q.contains('.') {
            continue; // code, build output (.aux, .pyc…): only when an extension is typed
        }
        let file = rel.rsplit('/').next().unwrap_or(rel);
        let note = matches!(kind, TargetKind::Note | TargetKind::Mail);
        let name = if note { file.rsplit_once('.').map_or(file, |(n, _)| n) } else { file };
        let (aliases, title) = parsed.map(|p| names_in(&p.props)).unwrap_or_default();
        let is_near = stats.near.contains(rel);
        let opened_at = opened.iter().position(|p| p == rel);
        let incoming = stats.incoming.get(rel).copied().unwrap_or(0);
        let (tier, matched, spread) = if query.tokens.is_empty() {
            (Tier::Exact, None, 0)
        } else {
            match query.rank(name, rel, &aliases, title.as_deref()) {
                Some(r) => r,
                None => continue,
            }
        };
        // a note's mtime is in the index; any other file is asked only once it matched (one stat, not thousands)
        let mtime = match parsed {
            Some(p) => p.mtime,
            None if !query.tokens.is_empty() => root.join(rel).metadata().and_then(|m| m.modified()).ok(),
            None => None,
        };
        let age_days = mtime.and_then(|m| now.duration_since(m).ok()).map_or(f64::INFINITY, |d| d.as_secs_f64() / 86_400.0);
        let score = useful(kind == TargetKind::Note, opened_at, is_near, incoming, age_days);
        if query.tokens.is_empty() && score < 5 {
            continue; // nothing typed: what is opened, linked or changed lately; the rest says nothing yet
        }
        let held = !query.date && dated(name, rel, cfg);
        // the shortest unambiguous text: the name, or the path when another file shares it
        let link = if snap.same_name(file) > 1 { if note { rel.rsplit_once('.').map_or(rel.as_str(), |(p, _)| p) } else { rel } } else { name };
        let key = (held && short, tier, held, spread, Reverse(score), rel.len());
        hits.push((key, LinkTarget { path: rel.clone(), link: link.to_string(), kind, alias: matched, title, near: is_near }));
    }
    hits.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.path.cmp(&b.1.path)));
    one_per_thing(root, hits.into_iter().take(MAX_TARGETS * 3).map(|(_, t)| t).collect())
}

/// A file and its companion note are one target: the one that stands for both (companion::stands_for), where it ranks.
fn one_per_thing(root: &Path, hits: Vec<LinkTarget>) -> Vec<LinkTarget> {
    let stands: Vec<String> = hits.iter().map(|t| crate::companion::stands_for(root, &t.path)).collect();
    let listed: std::collections::HashSet<&str> = hits.iter().zip(&stands).filter(|(t, s)| t.path == **s).map(|(_, s)| s.as_str()).collect();
    let mut seen = std::collections::HashSet::new();
    let keep: Vec<bool> = hits.iter().zip(&stands).map(|(t, s)| (t.path == *s || !listed.contains(s.as_str())) && seen.insert(s.clone())).collect();
    hits.into_iter().zip(keep).filter_map(|(t, k)| k.then_some(t)).take(MAX_TARGETS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(files: &[(&str, &str)]) -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        for (p, text) in files {
            let f = d.path().join(p);
            std::fs::create_dir_all(f.parent().unwrap()).unwrap();
            std::fs::write(f, text).unwrap();
        }
        d
    }

    #[test]
    fn a_file_and_its_companion_note_are_one_target() {
        let d = vault(&[("p/a.pdf", "%PDF"), ("p/a.md", "---\npdf: '[[a.pdf]]'\nshown: false\n---\n"), ("b/dune.epub", "PK"), ("b/dune.md", "# Dune\n")]);
        let paths = |q: &str| targets(d.path(), &Config::default(), q, None).into_iter().map(|t| t.path).collect::<Vec<_>>();
        assert_eq!(paths("a"), ["p/a.pdf"]);
        assert_eq!(paths("dune"), ["b/dune.md"]);
    }

    #[test]
    fn templates_are_never_offered_and_their_links_never_count() {
        // templates are never link targets: not offered by the [[ completion, and their links do not count
        let d = vault(&[("templates/movie.md", "---\ntype: movie\n---\n[[Cinema]] {{title}}"), ("notes/Movie night.md", "x"), ("notes/Cinema.md", "x")]);
        let cfg = Config::default();
        let got: Vec<String> = targets(d.path(), &cfg, "movie", None).into_iter().map(|t| t.path).collect();
        assert_eq!(got, vec!["notes/Movie night.md"], "{got:?}");
        let stats = crate::links::snapshot(d.path(), &cfg).link_stats(None);
        assert_eq!(stats.incoming.get("notes/Cinema.md").copied().unwrap_or(0), 0, "a template's link is not a backlink");
    }

    #[test]
    fn names_then_aliases_then_paths_and_every_kind() {
        let d = vault(&[
            ("notes/Kondo model.md", "# Kondo\n"),
            ("notes/impurity.md", "---\naliases: [Kondo problem]\n---\n"),
            ("kondo/readme.md", "x"),
            ("refs/kondo1964.pdf", "%PDF"),
            ("mail/re-kondo.md", "---\nmessage-id: <a@b>\n---\nhi"),
            ("pics/kondo plot.png", "png"),
            ("tex/kondo.aux", "x"),
        ]);
        let got: Vec<(String, TargetKind, Option<String>)> =
            targets(d.path(), &Config::default(), "kondo", None).into_iter().map(|t| (t.link, t.kind, t.alias)).collect();
        assert_eq!(got[0].0, "Kondo model", "a name starting with the query first: {got:?}");
        let pos = |l: &str| got.iter().position(|g| g.0 == l).unwrap_or_else(|| panic!("{l} missing: {got:?}"));
        assert!(pos("impurity") > pos("kondo1964.pdf"), "an alias after names: {got:?}");
        assert!(pos("readme") > pos("impurity"), "a folder match last: {got:?}");
        assert_eq!(got[pos("impurity")].2.as_deref(), Some("Kondo problem"));
        assert_eq!(got[pos("re-kondo")].1, TargetKind::Mail);
        assert_eq!(got[pos("kondo plot.png")].1, TargetKind::Image);
        assert!(!got.iter().any(|g| g.0.ends_with(".aux")), "build output only when an extension is typed: {got:?}");
        assert_eq!(targets(d.path(), &Config::default(), "kondo.aux", None)[0].link, "kondo.aux");
    }

    #[test]
    fn the_notes_linked_with_the_current_one_come_first_and_a_shared_name_needs_its_path() {
        let d = vault(&[
            ("a/plan.md", "x"),
            ("b/plan.md", "x"),
            ("today.md", "see [[b/plan]]"),
            ("other.md", "about [[today]]"),
        ]);
        let got = targets(d.path(), &Config::default(), "", Some("today.md"));
        let links: Vec<(&str, bool)> = got.iter().map(|t| (t.link.as_str(), t.near)).collect();
        assert_eq!(&links[..2].iter().filter(|l| l.1).count(), &2, "{links:?}");
        assert!(links.contains(&("b/plan", true)) && links.contains(&("other", true)), "{links:?}");
        assert!(!links.iter().any(|l| l.0 == "today"), "not the note itself");
    }

    #[test]
    fn exact_then_prefix_then_word_start_then_substring_then_fuzzy() {
        let d = vault(&[
            ("Heat flow lab.md", "x"),
            ("Schall.md", "x"),
            ("Quantum Hall.md", "x"),
            ("Hall effect.md", "x"),
            ("Hall.md", "x"),
            ("klitzing1980hall.md", "x"),
        ]);
        let got: Vec<String> = targets(d.path(), &Config::default(), "hall", None).into_iter().map(|t| t.link).collect();
        assert_eq!(got, ["Hall", "Hall effect", "Quantum Hall", "klitzing1980hall", "Schall", "Heat flow lab"]);
        assert!(targets(d.path(), &Config::default(), "hl", None).is_empty(), "two letters never match fuzzily");
    }

    // "otherwise all dates just appear first" (on the user's vault: hundreds of kept mails and days)
    #[test]
    fn dated_notes_wait_below_the_rest_unless_a_date_is_typed() {
        let d = vault(&[
            ("log/2026-10-16.md", "x"),
            ("notes/periodic/2026/10-October/2026-10-17 Fri.md", "x"),
            ("notes/periodic/2026/2026-W42.md", "x"),
            ("notes/2026-10-17 Meeting with Bob.md", "x"),
            ("notes/Fermi liquid.md", "x"),
            ("notes/Free energy.md", "x"),
            ("notes/Afro beat.md", "x"),
        ]);
        let cfg = Config { log_dir: "log".into(), ..Config::default() };
        let links = |q: &str| targets(d.path(), &cfg, q, None).into_iter().map(|t| t.link).collect::<Vec<_>>();
        let empty = links("");
        assert_eq!(empty.iter().position(|l| l.starts_with("2026")), Some(3), "the regular notes before the dated: {empty:?}");
        // "fr": the day "… Fri" starts a word, yet waits below a mere substring ("Afro beat")
        let fr = links("fr");
        assert_eq!(fr.last().map(String::as_str), Some("2026-10-17 Fri"), "{fr:?}");
        assert_eq!(fr, ["Free energy", "Afro beat", "2026-10-17 Fri"]);
        let mut day = links("2026-10-1");
        day.sort();
        assert_eq!(day, ["2026-10-16", "2026-10-17 Fri", "2026-10-17 Meeting with Bob"], "a date typed: the days are not held back");
        assert!(dated("2026-Q4", "q.md", &cfg) && dated("2026-10", "m.md", &cfg) && dated("x", "log/x.md", &cfg));
        assert!(!dated("2026 plans for the lab", "p.md", &cfg) && !dated("2024 exam 2025-11-21", "e.md", &cfg));
    }

    #[test]
    fn opened_and_linked_notes_first_within_a_tier() {
        let d = vault(&[
            ("plan a.md", "x"),
            ("plan b.md", "x"),
            ("plan c.md", "x"),
            ("x.md", "[[plan c]]"),
            ("y.md", "[[plan c]] [[plan c]]"),
            ("z.md", "[[plan c]]"),
            (RECENT_FILE, r#"["plan b.md", "gone.md"]"#),
        ]);
        let got: Vec<String> = targets(d.path(), &Config::default(), "plan", None).into_iter().map(|t| t.link).collect();
        assert_eq!(got, ["plan b", "plan c", "plan a"], "opened, then linked to by three notes");
        let empty: Vec<String> = targets(d.path(), &Config::default(), "", None).into_iter().map(|t| t.link).collect();
        assert_eq!(empty.first().map(String::as_str), Some("plan b"), "{empty:?}");
    }
}
