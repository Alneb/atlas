//! A scheduled tool (a plugin's round: `[[tool]] schedule = …`) runs one call at a time per vault. The schedule, an
//! agent over MCP, a page's button and a capture hook all reach a tool through `plugin_tools::call`; two rounds at once
//! each see the same state and act on it twice (a timed-out cluster job resubmitted twice, a "resubmit at most twice"
//! limit read before either wrote). A second call waits for the first, then sees what the first did.
//! Other tools are not held: an SSH `run` or a catalog `add` may be called by several at once.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use tokio::sync::OwnedMutexGuard;

type Key = (PathBuf, String, String);

static TURNS: LazyLock<Mutex<HashMap<Key, Arc<tokio::sync::Mutex<()>>>>> = LazyLock::new(Mutex::default);

/// Whether `name` of plugin `id` is a scheduled tool here (its manifest read off the async threads).
async fn is_round(root: &Path, id: &str, name: &str) -> bool {
    let (root, id, name) = (root.to_path_buf(), id.to_string(), name.to_string());
    tokio::task::spawn_blocking(move || {
        crate::plugins::tool_parts(&root, &id).is_ok_and(|(tools, _, _)| tools.iter().any(|t| t.name == name && t.schedule.is_some()))
    })
    .await
    .unwrap_or(false)
}

/// The turn of tool `name` of plugin `id` in the vault at `root`: held until dropped when the tool is a round, `None`
/// (nothing to wait for) otherwise.
pub async fn take(root: &Path, id: &str, name: &str) -> Option<OwnedMutexGuard<()>> {
    if !is_round(root, id, name).await {
        return None;
    }
    let lock = TURNS.lock().unwrap_or_else(|e| e.into_inner()).entry((root.to_path_buf(), id.into(), name.into())).or_default().clone();
    Some(lock.lock_owned().await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

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
        let first = take(vault.path(), "demo", "tick").await;
        assert!(first.is_some(), "a scheduled tool takes its turn");
        let root = vault.path().to_path_buf();
        let second = tokio::spawn(async move { take(&root, "demo", "tick").await.is_some() });
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(!second.is_finished(), "a second round waits while the first runs");
        drop(first);
        assert!(tokio::time::timeout(Duration::from_secs(5), second).await.unwrap().unwrap(), "then runs");
        assert!(take(vault.path(), "demo", "other").await.is_none(), "a tool that is not a round is never held");

        let plain = tempfile::tempdir().unwrap();
        plugin(plain.path(), false);
        let (a, b) = (take(plain.path(), "demo", "tick").await, take(plain.path(), "demo", "tick").await);
        assert!(a.is_none() && b.is_none(), "an unscheduled tool runs as often as it is called");
    }
}
