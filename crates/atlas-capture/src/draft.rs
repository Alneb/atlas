//! The box's unsent text, kept per vault (`$XDG_STATE_HOME/atlas/capture-drafts/`). The box closes when it loses the
//! focus, on Esc, or when its key starts a second box; what was typed comes back on the next open. Saved or emptied:
//! gone. Written on every change (not on close), so a killed box loses nothing either. The chips are not kept.
use std::path::{Path, PathBuf};

pub struct Drafts {
    dir: PathBuf,
    /// what is on disk now: (the vault's draft file, its text), so an unchanged frame writes nothing
    written: Option<(PathBuf, String)>,
}

impl Drafts {
    pub fn at(dir: PathBuf) -> Self {
        Self { dir, written: None }
    }

    /// The machine's draft folder (the box's main uses it; tests pass their own).
    pub fn default_dir() -> PathBuf {
        atlas_core::platform::dirs::atlas(atlas_core::platform::dirs::Base::State).join("capture-drafts")
    }

    /// One file per vault, named by its path (readable, and two vaults never share one).
    fn file(&self, vault: &Path) -> PathBuf {
        let name: String = vault.to_string_lossy().chars().map(|c| if matches!(c, '/' | '\\' | ':') { '%' } else { c }).collect();
        self.dir.join(format!("{name}.txt"))
    }

    /// The vault's kept text, if any. It stays on disk until it is saved or emptied.
    pub fn load(&mut self, vault: &Path) -> Option<String> {
        let file = self.file(vault);
        let text = std::fs::read_to_string(&file).ok().filter(|t| !t.trim().is_empty())?;
        self.written = Some((file, text.clone()));
        Some(text)
    }

    /// Keeps `text` as the vault's draft (empty: none). Moving to another vault moves the draft with it.
    pub fn keep(&mut self, vault: &Path, text: &str) {
        let file = self.file(vault);
        if self.written.as_ref().is_some_and(|(f, t)| *f == file && t == text) || (self.written.is_none() && text.trim().is_empty()) {
            return;
        }
        if let Some((old, _)) = self.written.take() {
            let _ = std::fs::remove_file(old);
        }
        if text.trim().is_empty() {
            return;
        }
        // through a temporary file: a box killed mid-write leaves the last whole draft
        let tmp = file.with_extension("tmp");
        let wrote = std::fs::create_dir_all(&self.dir).and_then(|_| std::fs::write(&tmp, text)).and_then(|_| std::fs::rename(&tmp, &file));
        match wrote {
            Ok(()) => self.written = Some((file, text.to_string())),
            Err(e) => eprintln!("atlas-capture: could not keep the draft in {}: {e}", self.dir.display()),
        }
    }

    /// Saved: the draft is done.
    pub fn clear(&mut self) {
        if let Some((file, _)) = self.written.take() {
            let _ = std::fs::remove_file(file);
        }
    }
}
