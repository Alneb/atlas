//! Android parity (docs/design/DESIGN-android-native-app.md §9): every feature of the app has a line in `parity.toml`
//! saying how the phone does it, so a new feature cannot land without someone deciding how the phone gets it.
//!
//! The features are found in the repository, never listed by hand here:
//! - **commands**: every built-in command of the page (each `id: "…", title:` of a file that holds an `Action[]`
//!   table under `ui/src`: `lib/actions.ts` and the tables it spreads, the bookmarks', the workspaces'), and the core's
//!   built-ins (`atlas_core::commands::BuiltinId::ALL`, as `core:<id>`). A command family made at run time
//!   (`` `ui.tabs.${n}` ``) is one feature, `ui.tabs.*`;
//! - **plugins**: every folder of `plugins/stable` and `plugins/beta`, read by the core's own manifest reader
//!   (`atlas_core::plugins::list`), with what its manifest says about Android;
//! - **settings**: every page of the page's Settings (`PAGES` in `ui/src/lib/settings-pages.ts`, with its `only`) and
//!   every page of the phone's native Settings (`SettingsPages.java`, as `phone:<page>`).
//!
//! `check` is a pure function over (features, table, Java classes); the repository is read only by `discover`.
//! `cargo test -p atlas-android --lib -- parity` runs both; the gaps (`missing = "…"`) are printed on every run.
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};

/// A kind of feature: one section of `parity.toml`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Kind {
    Command,
    Plugin,
    Setting,
}

impl Kind {
    pub const ALL: [Kind; 3] = [Kind::Command, Kind::Plugin, Kind::Setting];

    pub fn section(self) -> &'static str {
        match self {
            Kind::Command => "commands",
            Kind::Plugin => "plugins",
            Kind::Setting => "settings",
        }
    }

    fn of_section(s: &str) -> Option<Kind> {
        Kind::ALL.into_iter().find(|k| k.section() == s)
    }
}

/// What a feature's own source says about the phone; the table must agree with it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Said {
    /// Nothing either way (a command; a Settings page shown everywhere).
    Nothing,
    /// It runs on Android (a plugin whose manifest is not `no` there).
    Runs,
    /// A native screen of the app is its Android side (a plugin's `[android] main`, as a class name).
    NativeMain(String),
    /// It is not on the phone, and why (a plugin's `android = "no"`, a Settings page `only` elsewhere).
    NotThere(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Feature {
    pub kind: Kind,
    pub id: String,
    pub said: Said,
}

/// How the phone does a feature, as the table says it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum How {
    /// The WebView does it as on the desktop.
    Page,
    /// A Java class of the app (its simple name; a qualified name is read by its last part).
    Native(String),
    /// Not on the phone yet, and why: allowed, and listed on every run.
    Missing(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub kind: Kind,
    /// A feature's id, or a pattern with `*` covering a whole family (`"editor.*"`).
    pub key: String,
    pub how: How,
    /// Optional words beside it (what is partly there, what is planned), printed with the gaps.
    pub note: Option<String>,
}

/// One reason the table is wrong.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Offence {
    /// A feature with no line in the table.
    Unlisted { feature: Feature },
    /// A `native` class with no `<Class>.java` in the app or a plugin's `android/`.
    NoClass { kind: Kind, key: String, class: String },
    /// A line for no feature that exists any more.
    Stale { kind: Kind, key: String },
    /// The table contradicts the feature's own source (its manifest, its Settings page).
    Inconsistent { feature: Feature, key: String, how: How },
}

/// A TOML string, quoted and escaped: keys and values are written as the table reads them.
fn q(s: &str) -> String {
    toml::Value::String(s.to_string()).to_string()
}

fn simple(class: &str) -> &str {
    class.rsplit('.').next().unwrap_or(class)
}

impl Offence {
    fn kind(&self) -> Kind {
        match self {
            Offence::Unlisted { feature } | Offence::Inconsistent { feature, .. } => feature.kind,
            Offence::NoClass { kind, .. } | Offence::Stale { kind, .. } => *kind,
        }
    }

    /// What is wrong and the line that fixes it, ready to paste under the offence's section.
    pub fn fix(&self) -> String {
        match self {
            Offence::Unlisted { feature } => {
                let line = match &feature.said {
                    Said::NativeMain(c) => format!("{} = {{ native = {} }}", q(&feature.id), q(simple(c))),
                    Said::NotThere(why) => format!("{} = {{ missing = {} }}", q(&feature.id), q(why)),
                    Said::Runs => format!("{} = \"page\"   # its manifest says it runs on Android; or {{ native = \"Class\" }}", q(&feature.id)),
                    Said::Nothing => format!("{} = \"page\"   # or {{ native = \"Class\" }}, or {{ missing = \"why\" }}: say which is true", q(&feature.id)),
                };
                format!("not in the table, add:\n    {line}")
            }
            Offence::NoClass { key, class, .. } => format!(
                "{} names native {}, but no {}.java is under crates/atlas-android/android/java or plugins/*/*/android: fix the name, or:\n    {} = {{ missing = \"why\" }}",
                q(key),
                q(class),
                simple(class),
                q(key)
            ),
            Offence::Stale { key, .. } => format!("{} is in the table but no such feature exists any more: remove its line", q(key)),
            Offence::Inconsistent { feature, key, how } => {
                let line = match &feature.said {
                    Said::NativeMain(c) => format!("{} = {{ native = {} }}", q(key), q(simple(c))),
                    Said::NotThere(why) => format!("{} = {{ missing = {} }}", q(key), q(why)),
                    Said::Runs => format!("{} = \"page\"   # or {{ native = \"Class\" }}; or say `no` for Android in its manifest", q(key)),
                    Said::Nothing => unreachable!("nothing said contradicts no line"),
                };
                let said = match &feature.said {
                    Said::NativeMain(c) => format!("its manifest's [android] main is {c}"),
                    Said::NotThere(why) => format!("its source says it is not on the phone ({why})"),
                    Said::Runs => "its manifest says it runs on Android".to_string(),
                    Said::Nothing => String::new(),
                };
                format!("{} is {how:?} in the table, but {said}; make it:\n    {line}", q(&feature.id))
            }
        }
    }
}

/// What `check` found: the offences (the test fails on any) and the gaps (listed, allowed).
#[derive(Debug, Default)]
pub struct Verdict {
    pub offences: Vec<Offence>,
    /// Every feature not on the phone — its `missing` line, or its own source's `no`: (section, key, why).
    pub gaps: Vec<(Kind, String, String)>,
    /// Every page/native line with a note: (section, key, note).
    pub notes: Vec<(Kind, String, String)>,
    /// How many features of each kind were checked.
    pub counts: BTreeMap<Kind, usize>,
}

impl Verdict {
    /// The offences grouped by section, each with its fix.
    pub fn offences_text(&self) -> String {
        let mut out = String::new();
        for kind in Kind::ALL {
            let mine: Vec<&Offence> = self.offences.iter().filter(|o| o.kind() == kind).collect();
            if mine.is_empty() {
                continue;
            }
            let _ = writeln!(out, "under [{}] in crates/atlas-android/parity.toml:", kind.section());
            for o in mine {
                let _ = writeln!(out, "  - {}", o.fix());
            }
        }
        out
    }

    pub fn summary(&self) -> String {
        let mut out = String::from("android parity:");
        for kind in Kind::ALL {
            let _ = write!(out, " {} {}", self.counts.get(&kind).copied().unwrap_or(0), kind.section());
        }
        let _ = writeln!(out, "; {} missing on the phone:", self.gaps.len());
        for (kind, key, why) in &self.gaps {
            let _ = writeln!(out, "  [{}] {key}: {why}", kind.section());
        }
        if !self.notes.is_empty() {
            let _ = writeln!(out, "partly, or planned:");
            for (kind, key, note) in &self.notes {
                let _ = writeln!(out, "  [{}] {key}: {note}", kind.section());
            }
        }
        out
    }
}

/// `*` matches any run of characters (none too); everything else itself.
fn glob(pat: &str, s: &str) -> bool {
    let parts: Vec<&str> = pat.split('*').collect();
    if parts.len() == 1 {
        return pat == s;
    }
    let (first, last) = (parts[0], parts[parts.len() - 1]);
    if !s.starts_with(first) || !s[first.len()..].ends_with(last) || s.len() < first.len() + last.len() {
        return false;
    }
    let mut rest = &s[first.len()..s.len() - last.len()];
    for mid in &parts[1..parts.len() - 1] {
        match rest.find(mid) {
            Some(i) => rest = &rest[i + mid.len()..],
            None => return false,
        }
    }
    true
}

/// The table's line for `f`: its own key first, else the most specific pattern (the longest) that covers it.
fn line_for<'a>(table: &'a [Entry], f: &Feature) -> Option<&'a Entry> {
    let mine = table.iter().filter(|e| e.kind == f.kind);
    if let Some(e) = mine.clone().find(|e| e.key == f.id) {
        return Some(e);
    }
    mine.filter(|e| e.key.contains('*') && glob(&e.key, &f.id)).max_by_key(|e| e.key.len())
}

/// Whether line `how` contradicts what the feature's source says.
fn contradicts(said: &Said, how: &How) -> bool {
    match (said, how) {
        (Said::Nothing, _) => false,
        (Said::Runs, How::Missing(_)) => true,
        (Said::Runs, _) => false,
        (Said::NotThere(_), How::Missing(_)) => false,
        (Said::NotThere(_), _) => true,
        (Said::NativeMain(c), How::Native(n)) => simple(c) != simple(n),
        (Said::NativeMain(_), _) => true,
    }
}

/// The parity check: every feature has a line, every line a feature, every `native` class a file, and no line
/// contradicts its feature's source. `classes` holds the simple names of every Java class the app can carry.
pub fn check(features: &[Feature], table: &[Entry], classes: &BTreeSet<String>) -> Verdict {
    let mut v = Verdict::default();
    let mut used: BTreeSet<(Kind, &str)> = BTreeSet::new();
    for f in features {
        *v.counts.entry(f.kind).or_default() += 1;
        match line_for(table, f) {
            // its own source already says it is not on the phone, and why: that is its line (a plugin only the
            // private tree has needs none in a table both trees share)
            None => match &f.said {
                Said::NotThere(why) => v.gaps.push((f.kind, f.id.clone(), why.clone())),
                _ => v.offences.push(Offence::Unlisted { feature: f.clone() }),
            },
            Some(e) => {
                used.insert((e.kind, e.key.as_str()));
                if contradicts(&f.said, &e.how) {
                    v.offences.push(Offence::Inconsistent { feature: f.clone(), key: e.key.clone(), how: e.how.clone() });
                }
            }
        }
    }
    for e in table {
        if !used.contains(&(e.kind, e.key.as_str())) {
            v.offences.push(Offence::Stale { kind: e.kind, key: e.key.clone() });
            continue;
        }
        match &e.how {
            How::Native(c) if !classes.contains(simple(c)) => {
                v.offences.push(Offence::NoClass { kind: e.kind, key: e.key.clone(), class: c.clone() })
            }
            How::Missing(why) => v.gaps.push((e.kind, e.key.clone(), why.clone())),
            _ => {}
        }
        if let (Some(n), false) = (&e.note, matches!(e.how, How::Missing(_))) {
            v.notes.push((e.kind, e.key.clone(), n.clone()));
        }
    }
    v
}

/// Reads `parity.toml`: `[commands]`, `[plugins]`, `[settings]`, each line `"id" = "page"`, `"id" = { native = "Class" }`
/// or `"id" = { missing = "why" }`, an inline table taking an optional `note` (and `page = true` for a page with a note).
pub fn parse_table(text: &str) -> Result<Vec<Entry>, String> {
    let doc: toml::Table = toml::from_str(text).map_err(|e| format!("parity.toml does not parse: {e}"))?;
    let mut out = Vec::new();
    let mut errors = Vec::new();
    for (section, lines) in &doc {
        let Some(kind) = Kind::of_section(section) else {
            errors.push(format!("[{section}]: no such section (commands, plugins, settings)"));
            continue;
        };
        let Some(lines) = lines.as_table() else {
            errors.push(format!("{section}: a section, not a value"));
            continue;
        };
        for (key, value) in lines {
            match entry_of(value) {
                Ok((how, note)) => out.push(Entry { kind, key: key.clone(), how, note }),
                Err(e) => errors.push(format!("[{section}] {}: {e}", q(key))),
            }
        }
    }
    if errors.is_empty() { Ok(out) } else { Err(errors.join("\n")) }
}

fn entry_of(value: &toml::Value) -> Result<(How, Option<String>), String> {
    let text = |t: &toml::Table, k: &str| -> Result<Option<String>, String> {
        match t.get(k) {
            None => Ok(None),
            Some(toml::Value::String(s)) if !s.trim().is_empty() => Ok(Some(s.clone())),
            Some(_) => Err(format!("`{k}` must be a non-empty string")),
        }
    };
    match value {
        toml::Value::String(s) if s == "page" => Ok((How::Page, None)),
        toml::Value::String(s) => Err(format!("{} is not a way: \"page\", {{ native = \"Class\" }} or {{ missing = \"why\" }}", q(s))),
        toml::Value::Table(t) => {
            if let Some(k) = t.keys().find(|k| !["page", "native", "missing", "note"].contains(&k.as_str())) {
                return Err(format!("unknown key `{k}`"));
            }
            let page = match t.get("page") {
                None => false,
                Some(toml::Value::Boolean(true)) => true,
                Some(_) => return Err("`page` is written `page = true`".into()),
            };
            let note = text(t, "note")?;
            match (page, text(t, "native")?, text(t, "missing")?) {
                (true, None, None) => Ok((How::Page, note)),
                (false, Some(c), None) => Ok((How::Native(c), note)),
                (false, None, Some(why)) => Ok((How::Missing(why), note)),
                _ => Err("exactly one of `page = true`, `native` or `missing`".into()),
            }
        }
        _ => Err("a string (\"page\") or an inline table".into()),
    }
}

// ---- reading the repository ---------------------------------------------------------------------------------------

/// The repository's root (this crate is crates/atlas-android).
fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().expect("the repository root")
}

fn read(p: &Path) -> String {
    std::fs::read_to_string(p).unwrap_or_else(|e| panic!("parity: cannot read {}: {e}", p.display()))
}

/// Each floor guards a discovery against a refactor that moves its source: finding almost nothing fails loudly
/// instead of passing with an empty list.
fn floor(what: &str, found: usize, at_least: usize, looked: &str) {
    assert!(found >= at_least, "parity: found only {found} {what} in {looked} (expected at least {at_least}): the source moved; fix crates/atlas-android/src/parity.rs");
}

/// The page's built-in commands: every `id: …, title:` of a file under ui/src that holds an `Action[]` table. A template
/// id takes the file's `const NAME = "…"` for `${NAME}`, and `*` for anything else (`ui.tabs.${n}` → `ui.tabs.*`).
fn page_commands(repo: &Path) -> Vec<String> {
    let table = regex::Regex::new(r":\s*Action\[\]\s*=\s*\[").unwrap();
    let id = regex::Regex::new(r#"\bid:\s*(?:"([^"]+)"|`([^`]+)`)\s*,\s*title:"#).unwrap();
    let hole = regex::Regex::new(r"\$\{([^}]*)\}").unwrap();
    let mut ids = BTreeSet::new();
    let mut files = Vec::new();
    for e in walkdir::WalkDir::new(repo.join("ui/src")).into_iter().filter_entry(|e| e.file_name() != "gen" && e.file_name() != "node_modules") {
        let e = e.expect("ui/src walks");
        let p = e.path();
        if !matches!(p.extension().and_then(|x| x.to_str()), Some("ts" | "svelte")) {
            continue;
        }
        let text = read(p);
        if !table.is_match(&text) {
            continue;
        }
        files.push(p.strip_prefix(repo).unwrap().display().to_string());
        for c in id.captures_iter(&text) {
            let raw = c.get(1).or_else(|| c.get(2)).unwrap().as_str();
            let named = hole.replace_all(raw, |h: &regex::Captures| {
                let name = &h[1];
                let def = regex::Regex::new(&format!(r#"const {}\s*=\s*"([^"]*)""#, regex::escape(name))).unwrap();
                def.captures(&text).map_or("*".to_string(), |d| d[1].to_string())
            });
            let mut fam = named.to_string();
            while fam.contains("**") {
                fam = fam.replace("**", "*");
            }
            assert!(!fam.starts_with('*'), "parity: the command `{raw}` in {} has no fixed start to name its family by", p.display());
            ids.insert(fam);
        }
    }
    assert!(files.iter().any(|f| f == "ui/src/lib/actions.ts"), "parity: ui/src/lib/actions.ts holds no `Action[]` table any more (found {files:?})");
    floor("page commands", ids.len(), 20, "ui/src (files with an Action[] table)");
    ids.into_iter().collect()
}

/// The core's built-in commands, from its own list.
fn core_commands() -> Vec<String> {
    atlas_core::commands::BuiltinId::ALL.into_iter().map(|b| format!("core:{}", b.meta().0)).collect()
}

/// Every plugin of plugins/stable and plugins/beta with its word on Android, through the core's manifest reader: their
/// manifests are copied into a throwaway vault and listed there as any vault's plugins are.
fn plugins(repo: &Path) -> Vec<Feature> {
    let vault = tempfile::tempdir().expect("a temp folder");
    let mut mains = BTreeMap::new();
    for tier in ["stable", "beta"] {
        for e in std::fs::read_dir(repo.join("plugins").join(tier)).unwrap_or_else(|e| panic!("parity: plugins/{tier}: {e}")) {
            let dir = e.unwrap().path();
            let toml_path = dir.join("plugin.toml");
            if !toml_path.is_file() {
                continue;
            }
            let id = dir.file_name().unwrap().to_string_lossy().into_owned();
            let text = read(&toml_path);
            let to = vault.path().join(atlas_core::plugins::PLUGINS_DIR).join(&id);
            std::fs::create_dir_all(&to).unwrap();
            assert!(!to.join("plugin.toml").exists(), "parity: plugin {id} is in two tiers");
            std::fs::write(to.join("plugin.toml"), &text).unwrap();
            // `[android] main`: the native screen (native-plugins.sh reads the same key)
            let main = toml::from_str::<toml::Table>(&text).ok().and_then(|t| t.get("android")?.get("main")?.as_str().map(str::to_string));
            if let Some(m) = main {
                mains.insert(id, m);
            }
        }
    }
    let listed = atlas_core::plugins::list(vault.path());
    floor("plugins", listed.len(), 10, "plugins/stable and plugins/beta");
    listed
        .into_iter()
        .map(|p| {
            assert!(p.error.is_none(), "parity: plugin {}'s manifest does not read: {:?}", p.id, p.error);
            let android = p.platforms.iter().find(|c| c.platform == atlas_core::platform::Platform::Android).expect("every platform is listed");
            let said = if android.support == atlas_core::platform::Support::No {
                Said::NotThere(android.why.clone().unwrap_or_else(|| "its manifest says no for Android".into()))
            } else if let Some(m) = mains.get(&p.id) {
                Said::NativeMain(m.clone())
            } else {
                Said::Runs
            };
            Feature { kind: Kind::Plugin, id: p.id, said }
        })
        .collect()
}

/// The page's Settings pages (`PAGES`), each with its `only` (where it is shown) when that leaves the phone out.
fn page_settings(repo: &Path) -> Vec<Feature> {
    let path = repo.join("ui/src/lib/settings-pages.ts");
    let text = read(&path);
    let start = text.find("export const PAGES: PageDef[] = [").expect("parity: settings-pages.ts has no `PAGES` table any more");
    let body = &text[start..start + text[start..].find("\n];").expect("the end of PAGES")];
    let id = regex::Regex::new(r#"(?m)^\s*id: "([a-z][a-z-]*)", title:"#).unwrap();
    let only = regex::Regex::new(r"only: \[([^\]]*)\]").unwrap();
    let at: Vec<(usize, String)> = id.captures_iter(body).map(|c| (c.get(0).unwrap().start(), c[1].to_string())).collect();
    let out: Vec<Feature> = at
        .iter()
        .enumerate()
        .map(|(i, (from, page))| {
            let chunk = &body[*from..at.get(i + 1).map_or(body.len(), |n| n.0)];
            let said = match only.captures(chunk) {
                Some(o) if !o[1].contains("\"phone\"") => Said::NotThere(format!("Settings shows this page only on: {}", o[1].replace('"', ""))),
                _ => Said::Nothing,
            };
            Feature { kind: Kind::Setting, id: page.clone(), said }
        })
        .collect();
    floor("Settings pages", out.len(), 10, "PAGES in ui/src/lib/settings-pages.ts");
    out
}

/// The phone's native Settings pages (SettingsPages.java: `at.equals("…")`, and `at.startsWith("…:")` families).
fn phone_settings(repo: &Path) -> Vec<Feature> {
    let text = read(&repo.join("crates/atlas-android/android/java/org/atlas/capture/SettingsPages.java"));
    let page = regex::Regex::new(r#"at\.equals\("([a-z][a-z-]*)"\)"#).unwrap();
    let family = regex::Regex::new(r#"at\.startsWith\("([a-z][a-z-]*):"\)"#).unwrap();
    let ids: BTreeSet<String> = page
        .captures_iter(&text)
        .map(|c| format!("phone:{}", &c[1]))
        .chain(family.captures_iter(&text).map(|c| format!("phone:{}:*", &c[1])))
        .collect();
    floor("phone Settings pages", ids.len(), 3, "SettingsPages.java");
    ids.into_iter().map(|id| Feature { kind: Kind::Setting, id, said: Said::Nothing }).collect()
}

/// Every feature of the repository.
pub fn discover(repo: &Path) -> Vec<Feature> {
    let command = |id: String| Feature { kind: Kind::Command, id, said: Said::Nothing };
    let mut all: Vec<Feature> = page_commands(repo).into_iter().chain(core_commands()).map(command).collect();
    all.extend(plugins(repo));
    all.extend(page_settings(repo));
    all.extend(phone_settings(repo));
    all
}

/// The simple names of every Java class the app can carry: its own and the native plugins'.
pub fn java_classes(repo: &Path) -> BTreeSet<String> {
    let mut roots = vec![repo.join("crates/atlas-android/android/java")];
    for tier in ["stable", "beta"] {
        for e in std::fs::read_dir(repo.join("plugins").join(tier)).into_iter().flatten().flatten() {
            roots.push(e.path().join("android"));
        }
    }
    let out: BTreeSet<String> = roots
        .iter()
        .filter(|r| r.is_dir())
        .flat_map(|r| walkdir::WalkDir::new(r).into_iter().flatten())
        .filter(|e| e.path().extension().is_some_and(|x| x == "java"))
        .map(|e| e.path().file_stem().unwrap().to_string_lossy().into_owned())
        .collect();
    floor("Java classes", out.len(), 20, "crates/atlas-android/android/java");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_feature_has_its_android_path() {
        let repo = repo();
        let table = parse_table(&read(&repo.join("crates/atlas-android/parity.toml"))).unwrap_or_else(|e| panic!("{e}"));
        let v = check(&discover(&repo), &table, &java_classes(&repo));
        // straight to stderr, past the test harness's capture: the gaps are seen on every run, not only on a failure
        use std::io::Write as _;
        let _ = std::io::stderr().write_all(v.summary().as_bytes());
        assert!(v.offences.is_empty(), "the Android parity table is out of step ({} offences):\n{}", v.offences.len(), v.offences_text());
    }

    // ---- the checker on synthetic inputs: one test per way the table can be wrong ----

    fn cmd(id: &str) -> Feature {
        Feature { kind: Kind::Command, id: id.into(), said: Said::Nothing }
    }
    fn plugin(id: &str, said: Said) -> Feature {
        Feature { kind: Kind::Plugin, id: id.into(), said }
    }
    fn line(kind: Kind, key: &str, how: How) -> Entry {
        Entry { kind, key: key.into(), how, note: None }
    }
    fn classes() -> BTreeSet<String> {
        ["Books", "AtlasActivity"].map(String::from).into()
    }

    #[test]
    fn a_full_table_passes_and_lists_its_gaps() {
        let f = [cmd("ui.palette"), cmd("ui.terminal"), plugin("books", Said::NativeMain("org.atlas.plugins.books.Books".into()))];
        let t = [
            line(Kind::Command, "ui.palette", How::Page),
            line(Kind::Command, "ui.terminal", How::Missing("no shell".into())),
            line(Kind::Plugin, "books", How::Native("Books".into())),
        ];
        let v = check(&f, &t, &classes());
        assert!(v.offences.is_empty(), "{}", v.offences_text());
        assert_eq!(v.gaps, vec![(Kind::Command, "ui.terminal".to_string(), "no shell".to_string())]);
        assert!(v.summary().contains("ui.terminal: no shell"));
    }

    #[test]
    fn a_new_command_without_a_line_fails_with_the_line_to_add() {
        let v = check(&[cmd("ui.palette"), cmd("ui.fake-new")], &[line(Kind::Command, "ui.palette", How::Page)], &classes());
        assert_eq!(v.offences, vec![Offence::Unlisted { feature: cmd("ui.fake-new") }]);
        let text = v.offences_text();
        assert!(text.contains("under [commands]"), "{text}");
        assert!(text.contains("\n    \"ui.fake-new\" = \"page\""), "{text}");
        // the suggested line is itself a valid line of the table
        let pasted = format!("[commands]\n{}\n", text.lines().find(|l| l.starts_with("    \"ui.fake-new\"")).unwrap().trim());
        assert_eq!(parse_table(&pasted).unwrap()[0].how, How::Page);
    }

    #[test]
    fn a_native_class_that_does_not_exist_fails() {
        let v = check(&[cmd("ui.files")], &[line(Kind::Command, "ui.files", How::Native("FilesScreen".into()))], &classes());
        assert_eq!(v.offences, vec![Offence::NoClass { kind: Kind::Command, key: "ui.files".into(), class: "FilesScreen".into() }]);
        assert!(v.offences_text().contains("no FilesScreen.java"));
        // a qualified name is read by its class
        let ok = check(&[cmd("ui.close")], &[line(Kind::Command, "ui.close", How::Native("org.atlas.capture.AtlasActivity".into()))], &classes());
        assert!(ok.offences.is_empty());
    }

    #[test]
    fn a_line_for_a_feature_gone_is_stale() {
        let t = [line(Kind::Command, "ui.palette", How::Page), line(Kind::Command, "ui.gone", How::Page), line(Kind::Command, "old.*", How::Page)];
        let v = check(&[cmd("ui.palette")], &t, &classes());
        assert_eq!(
            v.offences,
            vec![Offence::Stale { kind: Kind::Command, key: "ui.gone".into() }, Offence::Stale { kind: Kind::Command, key: "old.*".into() }]
        );
        // the same id in another section is another feature
        let other = check(&[cmd("books")], &[line(Kind::Command, "books", How::Page), line(Kind::Plugin, "books", How::Page)], &classes());
        assert_eq!(other.offences, vec![Offence::Stale { kind: Kind::Plugin, key: "books".into() }]);
    }

    #[test]
    fn a_feature_its_own_source_keeps_off_the_phone_needs_no_line() {
        let no = plugin("private-only", Said::NotThere("its manifest says no".into()));
        let v = check(&[no], &[], &classes());
        assert!(v.offences.is_empty(), "{:?}", v.offences);
        assert_eq!(v.gaps, vec![(Kind::Plugin, "private-only".to_string(), "its manifest says no".to_string())]);
        // one that runs still needs its line
        assert_eq!(check(&[plugin("weather", Said::Runs)], &[], &classes()).offences.len(), 1);
    }

    #[test]
    fn a_plugin_marked_against_its_manifest_is_inconsistent() {
        let runs = plugin("weather", Said::Runs);
        let no = plugin("ssh", Said::NotThere("no ssh on the phone".into()));
        let native = plugin("books", Said::NativeMain("org.atlas.plugins.books.Books".into()));
        let t = [
            line(Kind::Plugin, "weather", How::Missing("why".into())),
            line(Kind::Plugin, "ssh", How::Page),
            line(Kind::Plugin, "books", How::Page),
        ];
        let v = check(&[runs.clone(), no.clone(), native.clone()], &t, &classes());
        assert_eq!(v.offences.len(), 3, "{}", v.offences_text());
        assert!(v.offences.iter().all(|o| matches!(o, Offence::Inconsistent { .. })));
        let text = v.offences_text();
        assert!(text.contains("\"ssh\" = { missing = \"no ssh on the phone\" }"), "{text}");
        assert!(text.contains("\"books\" = { native = \"Books\" }"), "{text}");
        // a native line naming another class than the manifest's main is inconsistent too
        let wrong = check(&[native], &[line(Kind::Plugin, "books", How::Native("AtlasActivity".into()))], &classes());
        assert!(matches!(wrong.offences[..], [Offence::Inconsistent { .. }]));
        // and an unlisted plugin its manifest keeps off the phone is a gap, not an offence
        let unl = check(&[no], &[], &classes());
        assert!(unl.offences.is_empty() && unl.gaps.len() == 1);
    }

    #[test]
    fn a_family_line_covers_its_members_and_the_exact_line_wins() {
        let f = [cmd("editor.fold"), cmd("editor.unfold"), cmd("editor.special"), cmd("ui.tabs.*")];
        let t = [
            line(Kind::Command, "editor.*", How::Page),
            line(Kind::Command, "editor.special", How::Missing("not yet".into())),
            line(Kind::Command, "ui.tabs.*", How::Page),
        ];
        let v = check(&f, &t, &classes());
        assert!(v.offences.is_empty(), "{}", v.offences_text());
        assert_eq!(v.gaps.len(), 1);
        assert!(glob("a*b*c", "aXbYc") && !glob("a*b", "ab.c") && glob("ui.*", "ui.") && !glob("ab*ba", "aba"));
    }

    #[test]
    fn the_table_refuses_what_it_cannot_mean() {
        assert!(parse_table("[commands]\n\"a\" = \"pag\"\n").is_err());
        assert!(parse_table("[commands]\n\"a\" = { native = \"X\", missing = \"y\" }\n").is_err());
        assert!(parse_table("[commands]\n\"a\" = { missing = \"\" }\n").is_err());
        assert!(parse_table("[commands]\n\"a\" = { natve = \"X\" }\n").is_err());
        assert!(parse_table("[keys]\n\"a\" = \"page\"\n").is_err());
        let t = parse_table("[settings]\n\"a\" = { page = true, note = \"also native\" }\n\"b\" = { native = \"X\" }\n").unwrap();
        assert_eq!(t[0], Entry { kind: Kind::Setting, key: "a".into(), how: How::Page, note: Some("also native".into()) });
        assert_eq!(t[1].how, How::Native("X".into()));
    }
}
