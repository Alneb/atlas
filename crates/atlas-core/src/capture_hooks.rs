//! After every capture — the app's box, the phone, the desktop's capture window, `atlas capture`, an agent — the
//! plugins' `on = "capture"` tools run in the background (the catalog files a captured link or identifier as its
//! note). A tool answering `{ path }` (a note) gets the capture's line linked to it (`… → [[Dune (2021)]]`) and the
//! user a notice; `{ skipped }` (a plain thought) changes nothing. The capture itself never waits for a hook.
//! Also `on = "fs"`: called with `{ paths }` for each batch of files the watcher saw change (the Syncthing plugin asks
//! Syncthing to scan them at once, DESIGN-mirror-v2.md §5); the batches that come while one call runs are joined.
use crate::api::{Event, Notice, NoticeLevel};
use crate::events::{Captured, EventBus};
use crate::helper::Helpers;
use crate::Workspace;
use serde_json::{json, Value};
use std::path::Path;

/// How often the captures other devices left in `.atlas/pending` are looked for.
const PENDING_EVERY: std::time::Duration = std::time::Duration::from_secs(60);

pub fn spawn(ws: Workspace, bus: EventBus, helpers: Helpers) -> tokio::task::JoinHandle<()> {
    let mut captured = bus.on_captured();
    let fs = spawn_fs(ws.clone(), bus.clone(), helpers.clone());
    // the bus keeps 64 captures; a hook may take minutes (a slow lookup), so a forwarder that does nothing else moves
    // them into an unbounded queue at once, and the hooks work through that — a burst is filed late, never skipped
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Captured>();
    let forward = {
        let bus = bus.clone();
        tokio::spawn(async move {
            loop {
                match captured.recv().await {
                    Ok(c) => {
                        if tx.send(c).is_err() {
                            return;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => bus.publish(Event::Notify(
                        Notice::new(format!("{n} captures were not handed to the plugins")).body("They are in their notes; only the catalog's filing (and other capture hooks) skipped them.").level(NoticeLevel::Failure),
                    )),
                    Err(_) => return,
                }
            }
        })
    };
    tokio::spawn(async move {
        let _fs = Stops(fs); // the fs hooks end with these (the vault stopped)
        let _forward = Stops(forward);
        // what was captured while no Atlas served the vault (capture::capture_unserved), or on the phone: at start, then
        // every minute, as Syncthing brings other devices' files in. The phone leaves them to the desktop.
        let mut sweep = tokio::time::interval(PENDING_EVERY);
        loop {
            tokio::select! {
                _ = sweep.tick(), if !cfg!(target_os = "android") => {
                    for c in crate::capture::take_pending(ws.root()) {
                        run(&ws, &bus, &helpers, c).await;
                    }
                }
                got = rx.recv() => match got {
                    Some(c) => run(&ws, &bus, &helpers, c).await,
                    None => return,
                },
            }
        }
    })
}

async fn run(ws: &Workspace, bus: &EventBus, helpers: &Helpers, c: Captured) {
    let Ok(cfg) = ws.config() else { return };
    let store = crate::secrets::Store::for_vault(ws.root());
    for (plugin, tool) in crate::plugin_tools::listening(ws.root(), &cfg, "capture") {
        let input = json!({ "text": c.text, "path": c.path, "line": c.line });
        match crate::plugin_tools::call(ws.root(), &cfg, helpers, &store, &plugin, &tool, input).await {
            Ok(v) if v.get("skipped").is_some() => {}
            Ok(v) => {
                let Some(note) = v.get("path").and_then(Value::as_str) else { continue };
                if link_line(ws.root(), &c, note) {
                    bus.publish(Event::Fs { paths: vec![c.path.clone()] });
                }
                let said = v.get("notice").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("Filed as {note}"));
                bus.publish(Event::Notify(Notice::new(said).source(plugin.as_str()).level(NoticeLevel::Success).open(note)));
            }
            Err(e) => bus.publish(Event::Notify(Notice::new(format!("{plugin} could not file the capture")).body(e.to_string()).source(plugin.as_str()).level(NoticeLevel::Failure).open(c.path.as_str()))),
        }
    }
}

/// The `on = "fs"` tools, one call at a time: what changed meanwhile goes in the next call, together.
fn spawn_fs(ws: Workspace, bus: EventBus, helpers: Helpers) -> tokio::task::JoinHandle<()> {
    let mut rx = bus.on_fs();
    tokio::spawn(async move {
        loop {
            let mut paths = std::collections::BTreeSet::new();
            match rx.recv().await {
                Ok(p) => paths.extend(p),
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => return,
            }
            while let Ok(p) = rx.try_recv() {
                paths.extend(p);
            }
            let Ok(cfg) = ws.config() else { continue };
            let tools = crate::plugin_tools::listening(ws.root(), &cfg, "fs");
            if tools.is_empty() {
                continue;
            }
            let store = crate::secrets::Store::for_vault(ws.root());
            let input = json!({ "paths": paths.into_iter().collect::<Vec<_>>() });
            for (plugin, tool) in tools {
                if let Err(e) = crate::plugin_tools::call(ws.root(), &cfg, &helpers, &store, &plugin, &tool, input.clone()).await {
                    eprintln!("atlas: {plugin}/{tool} on changed files: {e}");
                }
            }
        }
    })
}

/// Aborts its task when dropped.
struct Stops(tokio::task::JoinHandle<()>);

impl Drop for Stops {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// A day's log was just made (POST /api/log/today): the plugins' `on = "log"` tools run on it in the background (the
/// weather plugin writes the day's weather, as it does after the first capture).
pub fn log_made(ws: Workspace, helpers: Helpers, path: String) {
    tokio::spawn(async move {
        let Ok(cfg) = ws.config() else { return };
        let store = crate::secrets::Store::for_vault(ws.root());
        for (plugin, tool) in crate::plugin_tools::listening(ws.root(), &cfg, "log") {
            if let Err(e) = crate::plugin_tools::call(ws.root(), &cfg, &helpers, &store, &plugin, &tool, json!({ "text": "", "path": path, "line": 1 })).await {
                eprintln!("atlas: {plugin}/{tool} on the new log: {e}");
            }
        }
    });
}

/// Adds ` → [[note]]` to the capture's line (captures::link_line), if that line still holds the capture and does not
/// link it yet. The capture's own line, written a moment ago by the capture path (PHILOSOPHY §2); anything else is left alone.
fn link_line(root: &Path, c: &Captured, note: &str) -> bool {
    let file = root.join(&c.path);
    let Ok(text) = std::fs::read_to_string(&file) else { return false };
    let first = c.text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let mut lines: Vec<String> = text.split('\n').map(str::to_string).collect();
    let Some(line) = lines.get_mut((c.line as usize).saturating_sub(1)) else { return false };
    if first.is_empty() || !line.contains(first) {
        return false;
    }
    let Some(linked) = crate::captures::link_line(line, note) else { return false };
    *line = linked;
    crate::vault_write::write(&file, lines.join("\n").as_bytes()).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_capture_line_links_its_note_once_and_nothing_else_is_touched() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("log.md"), "# Today\n- 10:02 https://letterboxd.com/film/dune-part-two/\n- 10:05 milk\n").unwrap();
        let c = Captured { text: "https://letterboxd.com/film/dune-part-two/".into(), path: "log.md".into(), line: 2 };
        assert!(link_line(dir.path(), &c, "Films/Dune Part Two (2024).md"));
        assert!(!link_line(dir.path(), &c, "Films/Dune Part Two (2024).md"), "linked once");
        let other = Captured { line: 3, ..c.clone() };
        assert!(!link_line(dir.path(), &other, "Films/X.md"), "a line that is not the capture");
        assert_eq!(std::fs::read_to_string(dir.path().join("log.md")).unwrap(), "# Today\n- 10:02 https://letterboxd.com/film/dune-part-two/ → [[Dune Part Two (2024)]]\n- 10:05 milk\n");
    }
}
