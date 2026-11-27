//! Plugins kept at the release's versions by themselves (`[plugins] auto_update`, on by default; Settings → Plugins).
//! A little after the vault is served, then every few hours, the release's index (`[plugins] release_index`) is read
//! and each plugin it has newer, built for this platform and unchanged in the vault since it was installed, is
//! installed over through the install path (plugin_install.rs `auto_candidates` / `auto_update_one`: settings and the
//! plugin's own files kept, the old copy to `.atlas/trash/`). One notice says what was updated; a plugin changed in the
//! vault (a working copy being developed) is left, and one notice per start of the core says so — the person
//! decides whether to update it by hand (Settings → Plugins), it is never overwritten.
//!
//! Where it does not run: a guest folder (its plugins are its opener's), a local copy of a server vault (`mirror =`:
//! the server updates them and sync brings the files — two writers of one folder would fight), a core told to run no
//! background jobs (`ATLAS_NO_SCHEDULE`: a probe or a test serving a copy), the end-to-end tests' core
//! (`ATLAS_NO_PLUGIN_UPDATES`). A plugin with no install record (copied in by hand) is never replaced either
//! (plugin_install.rs `unchanged_install`).
use crate::api::{Event, Notice, NoticeLevel};
use crate::events::EventBus;
use crate::helper::Helpers;
use crate::plugin_install::{auto_candidates, auto_update_one, AutoStep};
use crate::Workspace;
use std::collections::HashSet;
use std::time::Duration;

/// The first check waits for the vault's start (helpers, indexing) to settle; then one every `EVERY`.
const FIRST: Duration = Duration::from_secs(90);
const EVERY: Duration = Duration::from_secs(6 * 3600);

/// The loop for a served vault, or None where it must not run (see the module's comment).
pub fn spawn(ws: Workspace, bus: EventBus, helpers: Helpers) -> Option<tokio::task::JoinHandle<()>> {
    // ATLAS_NO_PLUGIN_UPDATES: the end-to-end tests' core (playwright.config.ts) — its fixture plugins must stay theirs
    if std::env::var_os("ATLAS_NO_SCHEDULE").is_some() || std::env::var_os("ATLAS_NO_PLUGIN_UPDATES").is_some() || crate::guest::is_guest(ws.root()) || crate::mirror_guard::mirror_of(ws.root()).is_some() {
        return None;
    }
    Some(tokio::spawn(async move {
        tokio::time::sleep(FIRST).await;
        // The plugins already said to be left, so a round every few hours does not repeat the notice.
        let mut told = HashSet::new();
        loop {
            check(&ws, &bus, &helpers, &mut told).await;
            tokio::time::sleep(EVERY).await;
        }
    }))
}

/// One round: read the index, update what can be, say it. The setting is read each round, so switching it off in
/// Settings stops the next one without a restart.
async fn check(ws: &Workspace, bus: &EventBus, helpers: &Helpers, told: &mut HashSet<String>) {
    let cfg = match ws.config() {
        Ok(c) => c.plugins,
        Err(e) => return eprintln!("atlas: plugin updates: the vault's settings do not read: {e}"),
    };
    if !cfg.auto_update || cfg.release_index.trim().is_empty() {
        return;
    }
    let root = ws.root().to_path_buf();
    let index = cfg.release_index.clone();
    let steps = match tokio::task::spawn_blocking(move || auto_candidates(&root, &index)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => return eprintln!("atlas: plugin updates: the release's index could not be read ({e}); next try in {} h", EVERY.as_secs() / 3600),
        Err(e) => return eprintln!("atlas: plugin updates: {e}"),
    };
    let mut done = vec![];
    let mut left = vec![];
    for step in steps {
        match step {
            AutoStep::Leave(l) => {
                eprintln!("atlas: plugin updates: {} left: {}", l.id, l.why);
                if told.insert(l.id.clone()) {
                    left.push(l);
                }
            }
            AutoStep::Update(a) => {
                helpers.stop(&a.id); // its program is replaced with the rest (as a manual update does)
                let root = ws.root().to_path_buf();
                match tokio::task::spawn_blocking(move || auto_update_one(&root, &a)).await {
                    Ok(Ok(c)) => {
                        eprintln!("atlas: plugin updates: {} {} → {}", c.id, c.from.as_deref().unwrap_or("?"), c.to.as_deref().unwrap_or("?"));
                        crate::capture_hooks::started(ws.clone(), bus.clone(), helpers.clone(), Some(c.id.clone()));
                        done.push(c);
                    }
                    Ok(Err(e)) => eprintln!("atlas: plugin updates: the update failed: {e}"),
                    Err(e) => eprintln!("atlas: plugin updates: {e}"),
                }
            }
        }
    }
    if !done.is_empty() {
        let line = done.iter().map(|c| format!("{} {}", c.title, c.to.as_deref().unwrap_or(""))).collect::<Vec<_>>().join(", ");
        let title = if done.len() == 1 { "A plugin was updated".to_string() } else { format!("{} plugins were updated", done.len()) };
        bus.publish(Event::Notify(Notice::new(title).body(format!("{line} (Settings → Plugins: switch off \"Update plugins by themselves\")")).source("plugins").level(NoticeLevel::Info).id("plugin-auto-update")));
    }
    if !left.is_empty() {
        let names = left.iter().map(|l| l.title.as_str()).collect::<Vec<_>>().join(", ");
        let title = if left.len() == 1 { "A plugin was not updated".to_string() } else { format!("{} plugins were not updated", left.len()) };
        let body = format!("{names}: changed in this vault since it was installed, so the release's newer version was not put over it. Update it by hand in Settings → Plugins (the changed copy goes to the trash).");
        bus.publish(Event::Notify(Notice::new(title).body(body).source("plugins").level(NoticeLevel::Info).id("plugin-auto-update-left")));
    }
}
