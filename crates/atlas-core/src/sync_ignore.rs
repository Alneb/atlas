//! Syncthing's ignore patterns for what each device keeps for itself (docs/design/DESIGN-mirror-v2.md "Per-device
//! state"). `.stignore` is never synced: every device that shares the vault needs its own, and a phone or a server
//! whose `.stignore` lacks `.atlas/cache` swaps its caches (the layout, recent files, `server.json`, the merge bases,
//! the server's lease table) with the others — rewritten at every start on each side, so conflict copies pile up and a
//! device can follow another's `server.json`. So every core that serves a vault Syncthing shares (a `.stfolder` at its
//! root) adds the missing patterns to that folder's `.stignore` at start, once, keeping every line already there.
use std::path::Path;

/// Paths that are per device, in Syncthing's syntax, relative to the vault's root.
fn patterns() -> Vec<String> {
    vec![
        "/.atlas/cache".into(),                          // caches, layouts, logs, server.json, sync bases, leases
        "/.atlas/remote".into(),                         // local copies of remote files (file sources)
        format!(".*{}*", crate::files::WRITE_TMP), // an atomic write's temporary, seen half-written by a scan
    ]
}

/// The comment heading the lines Atlas adds.
const HEADING: &str = "// Atlas: this device's own state and half-written files, never synced (added by Atlas at start)";

/// A pattern line reduced to what it names: Syncthing's prefixes (`(?d)`, `(?i)`, `!`) and the anchoring `/` dropped,
/// so `.atlas/cache`, `/.atlas/cache/` and `(?d).atlas/cache` all count as the same pattern.
fn named(line: &str) -> Option<&str> {
    let mut l = line.trim();
    if l.is_empty() || l.starts_with("//") || l.starts_with("#include") {
        return None;
    }
    loop {
        let before = l;
        for p in ["(?d)", "(?i)", "!"] {
            l = l.strip_prefix(p).unwrap_or(l);
        }
        if l == before {
            break;
        }
    }
    let l = l.trim_start_matches('/').trim_end_matches("/**").trim_end_matches('/');
    (!l.is_empty()).then_some(l)
}

/// The patterns `stignore` does not name yet. One it names negated (`!/.atlas/cache`) is the owner's choice: kept.
pub fn missing(stignore: &str) -> Vec<String> {
    let have: Vec<&str> = stignore.lines().filter_map(named).collect();
    patterns().into_iter().filter(|p| named(p).is_some_and(|p| !have.contains(&p))).collect()
}

/// `stignore` with the [`missing`] patterns added under [`HEADING`]; `None` when nothing is missing (the file is then
/// never rewritten).
pub fn with_patterns(stignore: &str) -> Option<String> {
    let add = missing(stignore);
    if add.is_empty() {
        return None;
    }
    let mut out = stignore.to_string();
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    if !out.is_empty() {
        out.push('\n');
    }
    out.push_str(HEADING);
    out.push('\n');
    for p in add {
        out.push_str(&p);
        out.push('\n');
    }
    Some(out)
}

/// Adds the per-device patterns to `<root>/.stignore` when Syncthing shares `root` (its `.stfolder` marker); true when
/// the file was written. A vault inside a larger Syncthing folder is left alone: that folder's `.stignore` is outside
/// the vault, and not Atlas's to change.
pub fn ensure(root: &Path) -> crate::Result<bool> {
    if !root.join(".stfolder").exists() {
        return Ok(false);
    }
    let file = root.join(".stignore");
    let current = match std::fs::read_to_string(&file) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.into()),
    };
    match with_patterns(&current) {
        Some(next) => crate::vault_write::sync_tool::write(&file, next.as_bytes()).map(|()| true),
        None => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_patterns_are_added_once_and_the_owners_lines_kept() {
        let mine = "// mine\n.atlas/cache\n(?d).DS_Store\n";
        let out = with_patterns(mine).expect("two are missing");
        assert!(out.starts_with(mine), "{out}");
        assert!(out.contains("\n/.atlas/remote\n") && out.contains("\n.*.atlas-tmp-*\n"), "{out}");
        assert_eq!(out.lines().filter(|l| named(l) == Some(".atlas/cache")).count(), 1, "cache was already there: {out}");
        assert_eq!(with_patterns(&out), None, "nothing missing: never rewritten");
        assert!(with_patterns("").unwrap().starts_with(HEADING), "a new file starts with the heading");
        // the owner's negation stands
        assert!(!missing("!/.atlas/cache\n").contains(&"/.atlas/cache".to_string()));
        assert!(missing("(?d)/.atlas/remote/\n/.atlas/cache/**\n").len() == 1);
    }

    #[test]
    fn only_a_folder_syncthing_shares_gets_one() {
        let d = tempfile::tempdir().unwrap();
        assert!(!ensure(d.path()).unwrap());
        assert!(!d.path().join(".stignore").exists(), "no Syncthing here: nothing written");
        std::fs::create_dir(d.path().join(".stfolder")).unwrap();
        std::fs::write(d.path().join(".stignore"), "*.swp").unwrap();
        assert!(ensure(d.path()).unwrap());
        let text = std::fs::read_to_string(d.path().join(".stignore")).unwrap();
        assert!(text.starts_with("*.swp\n\n// Atlas") && text.contains("/.atlas/cache\n"), "{text}");
        let written = std::fs::metadata(d.path().join(".stignore")).unwrap().modified().unwrap();
        assert!(!ensure(d.path()).unwrap(), "the second start changes nothing");
        assert_eq!(std::fs::metadata(d.path().join(".stignore")).unwrap().modified().unwrap(), written);
    }
}
