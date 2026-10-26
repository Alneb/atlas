//! The usage journal (docs/guides/MALLEABLE.md R5): what the user does in Atlas — files opened, searches acted
//! on, commands run — appended to `.atlas/cache/usage.jsonl` (derived, local, rebuildable by just
//! using Atlas; capped). The toolsmith's miners read it (`suggest.rs`), and it is the one record of the files opened
//! lately ([`opened`]: the palette's recent files, the `[[` list's ranking, the phone's Home).
use crate::config::Config;
use crate::{Result, Workspace};
use std::path::Path;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const JOURNAL: &str = ".atlas/cache/usage.jsonl";
/// Past this size the oldest half is dropped: patterns are recent habits, not history.
const CAP_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "lowercase")]
#[ts(export)]
pub enum UsageEvent {
    /// A file shown in a pane.
    Open { path: String },
    /// A search whose result the user opened (typing alone is not recorded).
    Search { q: String },
    /// A palette / keyboard command.
    Command { id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    /// Unix seconds.
    pub t: i64,
    #[serde(flatten)]
    pub event: UsageEvent,
}

pub fn record(ws: &Workspace, event: UsageEvent) -> Result<()> {
    record_at(ws, event, chrono::Utc::now().timestamp())
}

pub fn record_at(ws: &Workspace, event: UsageEvent, t: i64) -> Result<()> {
    use crate::vault_write::cache;
    let path = ws.root().join(JOURNAL);
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > CAP_BYTES) {
        let text = std::fs::read_to_string(&path).unwrap_or_default();
        let keep = text.len() / 2;
        let cut = text[keep..].find('\n').map_or(text.len(), |i| keep + i + 1);
        cache::write(&path, &text.as_bytes()[cut..])?;
    }
    let line = serde_json::to_string(&Entry { t, event }).map_err(anyhow::Error::from)?;
    cache::append(&path, format!("{line}\n").as_bytes())
}

/// Every readable entry, oldest first (a malformed line is skipped, never fatal).
pub fn read(ws: &Workspace) -> Vec<Entry> {
    read_at(ws.root())
}

fn read_at(root: &Path) -> Vec<Entry> {
    std::fs::read_to_string(root.join(JOURNAL))
        .unwrap_or_default()
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

/// The user's files opened lately, newest first, once each, at most `limit`; gone files and the agent's own
/// (`editor.index_exclude`) left out.
pub fn opened(root: &Path, cfg: &Config, limit: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for e in read_at(root).into_iter().rev() {
        if out.len() >= limit {
            break;
        }
        if let UsageEvent::Open { path } = e.event {
            if !out.contains(&path) && !cfg.is_agent_file(&path) && root.join(&path).is_file() {
                out.push(path);
            }
        }
    }
    out
}

/// The files to come back to (`GET /api/recent`: the palette, the phone's Home): [`opened`], then the ones changed
/// lately to fill up to `limit`.
pub fn recent(ws: &Workspace, limit: usize) -> Result<Vec<String>> {
    let cfg = ws.config()?;
    let mut out = opened(ws.root(), &cfg, limit);
    if out.len() >= limit {
        return Ok(out);
    }
    let mut changed: Vec<(std::time::SystemTime, String)> = crate::walk::files(ws.root(), &cfg)
        .filter(|(_, rel)| !cfg.is_agent_file(rel) && !out.contains(rel))
        .filter_map(|(abs, rel)| Some((std::fs::metadata(abs).ok()?.modified().ok()?, rel)))
        .collect();
    changed.sort_by_key(|b| std::cmp::Reverse(b.0));
    out.extend(changed.into_iter().map(|(_, rel)| rel).take(limit - out.len()));
    Ok(out)
}

#[cfg(test)]
mod recent_tests {
    use super::*;

    #[test]
    fn recent_puts_opened_files_first_then_changed_ones_and_skips_gone_files() {
        let t = tempfile::tempdir().unwrap();
        for f in ["a.md", "b.md", "c.md"] {
            std::fs::write(t.path().join(f), "x").unwrap();
        }
        let ws = Workspace::open(t.path()).unwrap();
        for p in ["b.md", "gone.md", "a.md", "b.md"] {
            record(&ws, UsageEvent::Open { path: p.into() }).unwrap();
        }
        let r = recent(&ws, 10).unwrap();
        assert_eq!(&r[..3], ["b.md", "a.md", "c.md"], "opened newest first, once each; then the rest by change: {r:?}");
        assert!(!r.contains(&"gone.md".to_string()));
        assert_eq!(recent(&ws, 1).unwrap(), ["b.md"]);
    }
}
