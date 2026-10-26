//! Which template a note gets, for every way Atlas makes one (docs/design/DESIGN-templates-automation.md): a new note,
//! a capture made a note, the day's log, a file's companion note, a property set on a note. The one place that
//! answers; `notes.rs`, `capture.rs` and `companion.rs` ask here instead of choosing on their own.
//!
//! Rules come, in this order, from: each template's own `apply_when:` (most specific first), the vault's
//! `[notes] template_rules` (else Templater's rules), and the older one-name settings as rules (`capture_template`,
//! `log_template`, the `literature` template for companion notes). The first rule that fits and whose template is
//! there wins.
use crate::config::Config;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::Path;

/// When a template is asked for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Moment<'a> {
    /// a note being made: New…, a link followed, the phone's +, an agent, a plugin (`path`: where it would go)
    NewNote { path: &'a str },
    /// a capture becoming a note of its own
    Capture { path: &'a str },
    /// the log of a day, made when first written to or opened
    Day { path: &'a str },
    /// a file's companion note (`file`: the PDF, the picture…)
    Companion { file: &'a str, path: &'a str },
    /// a note's property just set to a value (`type: movie`)
    PropertySet { path: &'a str, key: &'a str, value: &'a str },
}

/// `moment:` in a rule: the times that are not "a note at this path".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MomentKind {
    Capture,
    Day,
}

/// One condition of `apply_when:`; every part given must fit, and at least one is given.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct When {
    /// a folder the note goes into, or under (a new note, a capture)
    #[serde(default)]
    pub folder: Option<String>,
    /// a regex searched in the note's path, as Templater's file rules (a new note, a capture)
    #[serde(default)]
    pub title: Option<String>,
    /// a glob on the file a companion note is for (`refs/**/*.pdf`; `*` within a folder, `**` across folders)
    #[serde(default)]
    pub file: Option<String>,
    /// a property set to this value on a note (`{ type: movie }`; several: all of them)
    #[serde(default)]
    pub property: Option<BTreeMap<String, serde_yaml::Value>>,
    #[serde(default)]
    pub moment: Option<MomentKind>,
}

/// Where a rule was written, so Settings can say it and a template's own rules come first.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// the template's own `apply_when:`
    Template,
    /// `[notes] template_rules`
    Config,
    /// the vault's Templater settings (`.obsidian/plugins/templater-obsidian/data.json`)
    Templater,
    /// an older one-name setting, as a rule (`capture_template`, `log_template`, the `literature` template)
    Setting(&'static str),
}

#[derive(Debug, Clone)]
pub struct Rule {
    pub template: String,
    pub when: When,
    pub source: Source,
}

/// The template chosen, and the rule that chose it.
#[derive(Debug, Clone)]
pub struct Chosen {
    pub template: String,
    pub rule: Rule,
}

/// The template `moment` gets, when a rule fits and its template is there.
pub fn choose(root: &Path, cfg: &Config, moment: &Moment) -> Option<Chosen> {
    rules(root, cfg).into_iter().find(|r| r.when.fits(moment) && usable(root, cfg, r)).map(|r| Chosen { template: r.template.clone(), rule: r })
}

/// A rule's template can be used: it is there; a Templater rule's template is not built on a script (`<%* … %>`:
/// Atlas runs none, and the note would hold the script's text).
fn usable(root: &Path, cfg: &Config, r: &Rule) -> bool {
    crate::notes::template_text(root, cfg, &r.template).is_ok_and(|t| r.source != Source::Templater || !t.contains("<%*"))
}

/// Every rule, in the order they are tried.
pub fn rules(root: &Path, cfg: &Config) -> Vec<Rule> {
    let mut own = own_rules(root, cfg);
    own.sort_by_key(|r| std::cmp::Reverse(r.when.specificity())); // stable: a tie keeps the templates' order
    let config: Vec<Rule> = match cfg.notes.template_rules.is_empty() {
        false => cfg.notes.template_rules.iter().map(|r| Rule { template: r.template.clone(), when: When { folder: r.folder.clone(), title: r.title.clone(), ..When::default() }, source: Source::Config }).collect(),
        true => crate::notes::templater_rules(root, cfg)
            .into_iter()
            .map(|r| Rule { template: r.template, when: When { folder: r.folder, title: r.title, ..When::default() }, source: Source::Templater })
            .collect(),
    };
    let setting = |name: &str, key: &'static str, when: When| (!name.trim().is_empty()).then(|| Rule { template: name.trim().to_string(), when, source: Source::Setting(key) });
    let settings = [
        setting(&cfg.notes.capture_template, "capture_template", When { moment: Some(MomentKind::Capture), ..When::default() }),
        setting(&cfg.log_template, "log_template", When { moment: Some(MomentKind::Day), ..When::default() }),
        setting(crate::companion::TEMPLATE, "the literature template", When { file: Some("**".into()), ..When::default() }),
    ];
    own.into_iter().chain(config).chain(settings.into_iter().flatten()).collect()
}

/// The `apply_when:` of every template in the templates folder, by the templates' names.
fn own_rules(root: &Path, cfg: &Config) -> Vec<Rule> {
    let dir = cfg.notes.templates.trim().trim_matches('/');
    let Ok(abs) = crate::paths::safe_join(root, dir) else { return vec![] };
    let mut files: Vec<_> = std::fs::read_dir(abs).into_iter().flatten().flatten().filter(|e| e.file_type().is_ok_and(|t| t.is_file())).collect();
    files.sort_by_key(|e| e.file_name());
    let mut out = vec![];
    for e in files {
        let file = e.file_name().to_string_lossy().into_owned();
        let Some(name) = file.strip_suffix(".md") else { continue };
        let Ok(text) = std::fs::read_to_string(e.path()) else { continue };
        for when in apply_when(&text) {
            out.push(Rule { template: name.to_string(), when, source: Source::Template });
        }
    }
    out
}

/// A template's `apply_when:` — one condition or a list of them. The template's other properties may hold `{{…}}`
/// tags (not YAML), so only this key's lines are read; a condition that does not parse is left out.
pub fn apply_when(template: &str) -> Vec<When> {
    let Some(snippet) = own_block(template, "apply_when") else { return vec![] };
    let Ok(v) = serde_yaml::from_str::<serde_yaml::Value>(&snippet) else { return vec![] };
    let items = match v.get("apply_when") {
        Some(serde_yaml::Value::Sequence(s)) => s.clone(),
        Some(m @ serde_yaml::Value::Mapping(_)) => vec![m.clone()],
        _ => vec![],
    };
    items.into_iter().filter_map(|i| serde_yaml::from_value::<When>(i).ok()).filter(When::any).collect()
}

/// The lines of a frontmatter key and what is indented under it (`key:` then `  - …`), as YAML text.
pub(crate) fn own_block(template: &str, key: &str) -> Option<String> {
    let head = atlas_text::frontmatter::split(template).0?;
    let mut lines = head.lines().skip_while(|l| !l.starts_with(&format!("{key}:")));
    let first = lines.next()?;
    let rest: Vec<&str> = lines.take_while(|l| l.starts_with([' ', '\t', '-'])).collect();
    Some(std::iter::once(first).chain(rest).collect::<Vec<_>>().join("\n"))
}

/// Each template's rules in words, in the order they are tried ("a new note in lectures/ (its own rule)"): what
/// Settings → Templates shows.
pub fn described(root: &Path, cfg: &Config) -> BTreeMap<String, Vec<String>> {
    let mut out: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for r in rules(root, cfg) {
        let whose = match r.source {
            Source::Template => "its own rule".to_string(),
            Source::Config => "the vault's template_rules".to_string(),
            Source::Templater => "Templater's settings".to_string(),
            Source::Setting(k) if k.starts_with("the ") => k.to_string(),
            Source::Setting(k) => format!("the setting {k}"),
        };
        out.entry(r.template).or_default().push(format!("{} ({whose})", r.when.words()));
    }
    out
}

impl When {
    /// The condition in words: "a new note in lectures/ whose path matches ^Lecture".
    pub fn words(&self) -> String {
        let mut parts = vec![];
        match self.moment {
            Some(MomentKind::Day) => parts.push("the day's log".to_string()),
            Some(MomentKind::Capture) => parts.push("a capture made a note".to_string()),
            None if self.folder.is_some() || self.title.is_some() => parts.push("a new note".to_string()),
            None => {}
        }
        if let Some(f) = &self.folder {
            parts.push(format!("in {}/", f.trim_matches('/')));
        }
        if let Some(t) = &self.title {
            parts.push(format!("whose path matches {t}"));
        }
        if let Some(g) = &self.file {
            parts.push(if g == "**" { "the note of any file".to_string() } else { format!("the note of a file matching {g}") });
        }
        if let Some(p) = &self.property {
            let set: Vec<String> = p.iter().map(|(k, v)| format!("{k} becomes {}", serde_yaml::to_string(v).map(|s| s.trim().to_string()).unwrap_or_default())).collect();
            parts.push(format!("a note whose {}", set.join(" and ")));
        }
        parts.join(" ")
    }

    fn any(&self) -> bool {
        self.folder.is_some() || self.title.is_some() || self.file.is_some() || self.property.as_ref().is_some_and(|p| !p.is_empty()) || self.moment.is_some()
    }

    /// How narrowly it picks: a file pattern or a title regex over a folder, a deeper folder over a shallower one.
    fn specificity(&self) -> u32 {
        let folder = self.folder.as_deref().map_or(0, |f| 10 + f.trim_matches('/').split('/').count() as u32);
        let parts = [self.file.is_some(), self.title.is_some()].iter().filter(|b| **b).count() as u32 * 100;
        let prop = self.property.as_ref().map_or(0, |p| 50 + p.len() as u32);
        parts + folder + prop + u32::from(self.moment.is_some())
    }

    /// Whether every part given fits `m`. A folder or a title is about a note at a path (a new note, a capture); a
    /// file only about a companion note; a property only about a property set; `moment` about its own moment.
    pub fn fits(&self, m: &Moment) -> bool {
        if !self.any() {
            return false;
        }
        let (path, file, prop, moment) = match *m {
            Moment::NewNote { path } => (Some(path), None, None, None),
            Moment::Capture { path } => (Some(path), None, None, Some(MomentKind::Capture)),
            Moment::Day { .. } => (None, None, None, Some(MomentKind::Day)),
            Moment::Companion { file, .. } => (None, Some(file), None, None),
            Moment::PropertySet { key, value, .. } => (None, None, Some((key, value)), None),
        };
        let dir = |p: &str| p.rsplit_once('/').map_or(String::new(), |(d, _)| d.to_string());
        let folder_fits = |f: &str| path.is_some_and(|p| {
            let (d, f) = (dir(p), f.trim_matches('/'));
            d == f || d.starts_with(&format!("{f}/"))
        });
        let title_fits = |re: &str| path.is_some_and(|p| regex::Regex::new(re).is_ok_and(|re| re.is_match(p)));
        let file_fits = |g: &str| file.is_some_and(|f| glob(g).is_some_and(|re| re.is_match(f)));
        let prop_fits = |want: &BTreeMap<String, serde_yaml::Value>| {
            prop.is_some_and(|(k, v)| want.len() == 1 && want.get(k).is_some_and(|w| same_value(w, v)))
        };
        self.folder.as_deref().is_none_or(folder_fits)
            && self.title.as_deref().is_none_or(title_fits)
            && self.file.as_deref().is_none_or(file_fits)
            && self.property.as_ref().is_none_or(prop_fits)
            && self.moment.is_none_or(|k| moment == Some(k))
            // a folder or title rule never answers a moment it does not name (the day's log, a companion note)
            && (self.moment.is_some() || self.file.is_some() || self.property.is_some() || matches!(m, Moment::NewNote { .. } | Moment::Capture { .. }))
    }
}

/// A rule's value against a note's: text compared without case, `[[links]]` by their target.
fn same_value(want: &serde_yaml::Value, got: &str) -> bool {
    let norm = |s: &str| s.trim().trim_start_matches("[[").trim_end_matches("]]").trim().to_lowercase();
    match want {
        serde_yaml::Value::String(s) => norm(s) == norm(got),
        serde_yaml::Value::Number(n) => n.to_string() == got.trim(),
        serde_yaml::Value::Bool(b) => b.to_string() == got.trim().to_lowercase(),
        _ => false,
    }
}

/// A glob as an anchored regex: `**` any folders, `*` within one, `?` one character.
fn glob(pattern: &str) -> Option<regex::Regex> {
    let mut re = String::from("^");
    let mut chars = pattern.trim_matches('/').chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' if chars.peek() == Some(&'*') => {
                chars.next();
                if chars.peek() == Some(&'/') {
                    chars.next();
                    re.push_str("(?:.*/)?");
                } else {
                    re.push_str(".*");
                }
            }
            '*' => re.push_str("[^/]*"),
            '?' => re.push_str("[^/]"),
            c => re.push_str(&regex::escape(&c.to_string())),
        }
    }
    re.push('$');
    regex::Regex::new(&re).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(templates: &[(&str, &str)]) -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        for (n, t) in templates {
            std::fs::write(d.path().join(format!("templates/{n}.md")), t).unwrap();
        }
        d
    }
    fn pick(d: &tempfile::TempDir, cfg: &Config, m: Moment) -> Option<String> {
        choose(d.path(), cfg, &m).map(|c| c.template)
    }

    #[test]
    fn a_templates_own_rules_choose_it_for_each_moment() {
        let d = vault(&[
            ("lecture", "---\ntemplate_title: Lecture\napply_when:\n  - folder: lectures\n  - file: \"lectures/**/*.pdf\"\n  - property: { type: lecture }\ntype: lecture\ndate: {{now}}\n---\n## Summary\n"),
            ("lab", "---\napply_when: { folder: lectures/labs }\n---\n"),
            ("day", "---\napply_when:\n  - moment: day\n---\n# {{date}}\n"),
            ("paper", "---\napply_when:\n- file: refs/*.pdf\n---\n"),
        ]);
        let cfg = Config::default();
        assert_eq!(pick(&d, &cfg, Moment::NewNote { path: "lectures/QFT/week 1.md" }).as_deref(), Some("lecture"));
        assert_eq!(pick(&d, &cfg, Moment::NewNote { path: "lectures/labs/a.md" }).as_deref(), Some("lab"), "the deeper folder wins");
        assert_eq!(pick(&d, &cfg, Moment::NewNote { path: "notes/x.md" }), None);
        assert_eq!(pick(&d, &cfg, Moment::Companion { file: "lectures/QFT/slides.pdf", path: "lectures/QFT/slides.md" }).as_deref(), Some("lecture"));
        assert_eq!(pick(&d, &cfg, Moment::Companion { file: "refs/a.pdf", path: "refs/a.md" }).as_deref(), Some("paper"));
        assert_eq!(pick(&d, &cfg, Moment::Companion { file: "refs/deep/a.pdf", path: "refs/deep/a.md" }), None, "`*` stays within a folder");
        assert_eq!(pick(&d, &cfg, Moment::PropertySet { path: "n.md", key: "type", value: "[[Lecture]]" }).as_deref(), Some("lecture"), "a link compared by its target, case aside");
        assert_eq!(pick(&d, &cfg, Moment::PropertySet { path: "n.md", key: "type", value: "movie" }), None);
        assert_eq!(pick(&d, &cfg, Moment::Day { path: "notes/log/2026-10-25.md" }).as_deref(), Some("day"));
        assert_eq!(pick(&d, &cfg, Moment::Day { path: "lectures/2026-10-25.md" }).as_deref(), Some("day"), "a folder rule never answers the day");
    }

    #[test]
    fn the_older_settings_are_rules_after_the_templates_own() {
        let d = vault(&[("fleeting", "---\n---\n"), ("log", "---\n---\n"), ("literature", "---\n---\n"), ("inbox note", "---\napply_when: { folder: inbox }\n---\n")]);
        let cfg = Config { log_template: "log".into(), ..Config::default() };
        assert_eq!(pick(&d, &cfg, Moment::Day { path: "notes/log/x.md" }).as_deref(), Some("log"));
        assert_eq!(pick(&d, &cfg, Moment::Capture { path: "notes/a.md" }).as_deref(), Some("fleeting"));
        assert_eq!(pick(&d, &cfg, Moment::Capture { path: "inbox/a.md" }).as_deref(), Some("inbox note"), "the template's own rule first");
        assert_eq!(pick(&d, &cfg, Moment::Companion { file: "any/where.pdf", path: "any/where.md" }).as_deref(), Some("literature"));
        assert_eq!(pick(&d, &cfg, Moment::NewNote { path: "notes/a.md" }), None, "a setting's moment is its own");
    }

    #[test]
    fn a_rule_naming_a_missing_template_is_passed_by() {
        let d = vault(&[("b", "---\n---\n")]);
        let mut cfg = Config::default();
        cfg.notes.template_rules = vec![
            crate::config::TemplateRule { title: None, folder: Some("labs".into()), template: "gone".into() },
            crate::config::TemplateRule { title: None, folder: Some("labs".into()), template: "b".into() },
        ];
        assert_eq!(pick(&d, &cfg, Moment::NewNote { path: "labs/x.md" }).as_deref(), Some("b"));
    }

    #[test]
    fn apply_when_is_read_alone_and_a_bad_condition_is_left_out() {
        let t = "---\ndate: {{now}}\napply_when:\n  - folder: a\n  - colour: red\n  - {}\ntags: [x]\n---\n";
        assert_eq!(apply_when(t), [When { folder: Some("a".into()), ..When::default() }]);
        assert!(apply_when("---\ndate: {{now}}\n---\n").is_empty());
        assert!(apply_when("no frontmatter").is_empty());
    }

    #[test]
    fn globs() {
        let g = |p: &str, f: &str| glob(p).unwrap().is_match(f);
        assert!(g("**", "a/b/c.pdf") && g("**/*.pdf", "c.pdf") && g("**/*.pdf", "a/b/c.pdf") && g("refs/*.pdf", "refs/x y.pdf"));
        assert!(!g("refs/*.pdf", "refs/a/x.pdf") && !g("*.pdf", "a/x.pdf") && !g("a?.md", "a/.md"));
    }
}
