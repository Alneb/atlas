//! Runtime suggestions for settings (shape-based discovery, nothing hardcoded): installed fonts, snippet
//! files, VS Code themes. Shown as choices next to the free-text field. (A plugin's own settings suggest through its
//! helper: `suggest` on a `[[setting]]` — the Claude plugin's commands and accounts.)
use crate::api::{Suggestion, Suggestions};
use std::collections::BTreeMap;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

/// stdout of a short command, or None if it fails or takes longer than `limit`.
fn quick(cmd: &Path, args: &[&str], limit: Duration) -> Option<String> {
    let mut child =
        Command::new(cmd).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait().ok()? {
            Some(st) if st.success() => break,
            Some(_) => return None,
            None if start.elapsed() > limit => {
                let _ = child.kill();
                return None;
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    }
    let mut out = String::new();
    std::io::Read::read_to_string(&mut child.stdout.take()?, &mut out).ok()?;
    Some(out)
}

/// Installed font families (fontconfig), monospace ones only when `mono`.
pub fn fonts(mono: bool) -> Vec<Suggestion> {
    let args: &[&str] = if mono { &[":spacing=mono", "family"] } else { &[":", "family"] };
    let Some(text) = quick(Path::new("fc-list"), args, Duration::from_secs(4)) else { return Vec::new() };
    let mut fams: Vec<String> = text
        .lines()
        .filter_map(|l| l.split(',').next())
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty() && !f.starts_with('.'))
        .collect();
    fams.sort_by_key(|f| f.to_lowercase());
    fams.dedup();
    fams.into_iter().map(|f| Suggestion { value: f.clone(), label: f }).collect()
}

/// [`suggestions`] reused for 5 minutes: it lists every installed font and snippet file.
pub fn suggestions_cached() -> Suggestions {
    use std::sync::Mutex;
    static CACHE: Mutex<Option<(std::time::Instant, Suggestions)>> = Mutex::new(None);
    let mut c = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, v)) = c.as_ref() {
        if at.elapsed() < Duration::from_secs(300) {
            return v.clone();
        }
    }
    let v = suggestions();
    *c = Some((std::time::Instant::now(), v.clone()));
    v
}

/// Suggestions per dotted setting path, for the Settings pane.
pub fn suggestions() -> Suggestions {
    let (mono, all, (snip, vars), themes) = std::thread::scope(|s| {
        let m = s.spawn(|| fonts(true));
        let a = s.spawn(|| fonts(false));
        let sn = s.spawn(crate::snippets::discover);
        let th = s.spawn(crate::vscode_theme::discover);
        (
            m.join().unwrap_or_default(),
            a.join().unwrap_or_default(),
            sn.join().unwrap_or_default(),
            th.join().unwrap_or_default(),
        )
    });
    BTreeMap::from([
        ("ui.vscode_theme".to_string(), themes),
        ("editor.latex_snippets_file".to_string(), snip),
        ("editor.latex_snippet_variables_file".to_string(), vars),
        ("editor.code_font".to_string(), mono),
        ("ui.ui_font".to_string(), all.clone()),
        ("editor.prose_font".to_string(), all),
    ])
}
