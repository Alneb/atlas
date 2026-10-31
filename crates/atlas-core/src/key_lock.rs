//! One mutex per path, made on first use and left out of its table once nobody holds it: a file's edits
//! (vault_write.rs `modify`), a vault's index build (links.rs).
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex, Weak};

pub struct KeyLocks(LazyLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>>);

impl KeyLocks {
    pub const fn new() -> Self {
        Self(LazyLock::new(Mutex::default))
    }

    /// The lock of `key`, shared with whoever holds it now.
    pub fn get(&self, key: &Path) -> Arc<Mutex<()>> {
        let mut all = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(held) = all.get(key).and_then(Weak::upgrade) {
            return held;
        }
        if all.len() > 64 {
            all.retain(|_, w| w.strong_count() > 0);
        }
        let fresh = Arc::new(Mutex::new(()));
        all.insert(key.to_path_buf(), Arc::downgrade(&fresh));
        fresh
    }
}

impl Default for KeyLocks {
    fn default() -> Self {
        Self::new()
    }
}
