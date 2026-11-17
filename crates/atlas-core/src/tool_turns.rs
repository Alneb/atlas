//! A scheduled tool (a plugin's round: `[[tool]] schedule = …`) runs one call at a time per vault. The schedule, an
//! agent over MCP, a page's button and a capture hook all reach a tool through `plugin_tools::call`; two rounds at once
//! each see the same state and act on it twice (a timed-out cluster job resubmitted twice, a "resubmit at most twice"
//! limit read before either wrote). A second call waits for the first, then sees what the first did.
//! Other tools are not held: an SSH `run` or a catalog `add` may be called by several at once.
//!
//! The same holds across machines: a round runs only on a core the vault lets its rounds run on (`[automation]
//! schedules_on`, the tool's `background`; server_role::job_here), whoever calls it. An agent over MCP on the server
//! calling the Runs round, while the desktop runs it on its schedule, is refused with where it runs — two cores acting
//! on the same files through Syncthing would be the double resubmission above, with conflict copies on top.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use tokio::sync::OwnedMutexGuard;

type Key = (PathBuf, String, String);

static TURNS: LazyLock<Mutex<HashMap<Key, Arc<tokio::sync::Mutex<()>>>>> = LazyLock::new(Mutex::default);

/// The `background` of `name` of plugin `id` when it is a scheduled tool (a round), `None` when it is not (its manifest
/// read off the async threads).
async fn round(root: &Path, id: &str, name: &str) -> Option<crate::server_role::Background> {
    let (root, id, name) = (root.to_path_buf(), id.to_string(), name.to_string());
    tokio::task::spawn_blocking(move || {
        let (tools, _, _) = crate::plugins::tool_parts(&root, &id).ok()?;
        tools.into_iter().find(|t| t.name == name && t.schedule.is_some()).map(|t| t.background())
    })
    .await
    .ok()
    .flatten()
}

/// The turn of tool `name` of plugin `id` in the vault at `root`: held until dropped when the tool is a round, `None`
/// (nothing to wait for) otherwise. A round this core may not run (`auto`, server_role::job_here) is `Err` with where
/// it runs.
pub async fn take(root: &Path, auto: &crate::config::AutomationConfig, id: &str, name: &str) -> Result<Option<OwnedMutexGuard<()>>, String> {
    let Some(bg) = round(root, id, name).await else { return Ok(None) };
    take_at(root, auto, id, name, bg, &crate::platform::proc::hostname(), crate::server_role::Seat::of(root)).await
}

/// [`take`] on a core named `host` in `seat` (the tests' computers).
async fn take_at(
    root: &Path,
    auto: &crate::config::AutomationConfig,
    id: &str,
    name: &str,
    bg: crate::server_role::Background,
    host: &str,
    seat: crate::server_role::Seat,
) -> Result<Option<OwnedMutexGuard<()>>, String> {
    crate::server_role::job_here(auto, host, seat, bg, &[&format!("plugin.{id}.{name}"), &format!("plugin.{id}")])
        .map_err(|why| format!("{id}'s {name} is a round and is not run here: {why}"))?;
    let lock = TURNS.lock().unwrap_or_else(|e| e.into_inner()).entry((root.to_path_buf(), id.into(), name.into())).or_default().clone();
    Ok(Some(lock.lock_owned().await))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AutomationConfig;
    use crate::server_role::{Background, Seat};
    use std::time::Duration;

    /// A vault that names no computer and no background: every core runs its rounds.
    fn any() -> AutomationConfig {
        AutomationConfig::default()
    }

    fn plugin(root: &Path, schedule: bool) {
        let dir = root.join(".atlas/plugins/demo");
        std::fs::create_dir_all(&dir).unwrap();
        let every = if schedule { "schedule = \"every 5m\"\n" } else { "" };
        std::fs::write(dir.join("plugin.toml"), format!("title = \"Demo\"\ndescription = \"a test\"\n\n[helper]\njs = \"helper.js\"\n\n[[tool]]\nname = \"tick\"\ndescription = \"a round\"\n{every}")).unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_round_runs_one_call_at_a_time_and_other_tools_are_not_held() {
        let vault = tempfile::tempdir().unwrap();
        plugin(vault.path(), true);
        let first = take(vault.path(), &any(), "demo", "tick").await.unwrap();
        assert!(first.is_some(), "a scheduled tool takes its turn");
        let root = vault.path().to_path_buf();
        let second = tokio::spawn(async move { take(&root, &any(), "demo", "tick").await.unwrap().is_some() });
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(!second.is_finished(), "a second round waits while the first runs");
        drop(first);
        assert!(tokio::time::timeout(Duration::from_secs(5), second).await.unwrap().unwrap(), "then runs");
        assert!(take(vault.path(), &any(), "demo", "other").await.unwrap().is_none(), "a tool that is not a round is never held");

        let plain = tempfile::tempdir().unwrap();
        plugin(plain.path(), false);
        let (a, b) = (take(plain.path(), &any(), "demo", "tick").await.unwrap(), take(plain.path(), &any(), "demo", "tick").await.unwrap());
        assert!(a.is_none() && b.is_none(), "an unscheduled tool runs as often as it is called");
    }

    /// A round called on a core the vault does not run its rounds on is refused with where it runs; switching the
    /// timer off (`run_schedules = false`) refuses nothing.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_round_called_where_the_vault_does_not_run_it_is_refused_with_where() {
        let vault = tempfile::tempdir().unwrap();
        let at = |auto: AutomationConfig, bg: Background, host: &'static str, seat: Seat| {
            let root = vault.path().to_path_buf();
            async move { take_at(&root, &auto, "runs", "round", bg, host, seat).await.map(|g| g.is_some()) }
        };
        let desk = AutomationConfig { schedules_on: vec!["Desk".into()], ..any() };
        let why = at(desk.clone(), Background::Any, "laptop", Seat::LoneDevice).await.unwrap_err();
        assert!(why.contains("Desk") && why.contains("laptop") && why.contains("runs's round"), "{why}");
        assert_eq!(at(desk, Background::Any, "desk", Seat::LoneDevice).await, Ok(true), "the named computer, any case");
        // Runs says `device`: an agent over MCP on the server is refused, a device is not
        let why = at(any(), Background::Device, "srv", Seat::Server).await.unwrap_err();
        assert!(why.contains("never on a server") && why.contains("the vault's server"), "{why}");
        assert_eq!(at(any(), Background::Device, "desk", Seat::MirroredDevice).await, Ok(true));
        // the vault's word over the plugin's
        let mut anywhere = any();
        anywhere.background.insert("plugin.runs".into(), Background::Any);
        assert_eq!(at(anywhere, Background::Device, "srv", Seat::Server).await, Ok(true));
        // the timer off: a button or an agent still runs the round
        assert_eq!(at(AutomationConfig { run_schedules: false, ..any() }, Background::Any, "desk", Seat::LoneDevice).await, Ok(true));
    }
}
