//! Write leases (docs/design/DESIGN-mirror-v2.md §2): a mirrored vault is written by one device at a time, and only on
//! top of the last version, so Syncthing never sees two concurrent changes — the only thing it makes a conflict of
//! (measured: the same bytes written on both sides are not a conflict, different bytes are). The server's core keeps
//! this table; every core (the server's own writes too) asks it before writing a vault file.
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Who writes: a device's core (its stable id), or the server's own core.
pub type Holder = String;

/// The answer to "may I write `path`?".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Answer<H> {
    Granted,
    Wait(Why<H>),
}

/// Why a write has to wait; both clear by themselves (the holder finishes, Syncthing carries the last version over).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Why<H> {
    /// another device is writing it (a one-off write, or the writer of a live room)
    HeldBy(Holder),
    /// this copy is not the last version yet (`None`: the last version is "no file")
    Behind { last: Option<H> },
}

struct Entry<H> {
    /// the last content written by anyone (`None`: absent)
    version: Option<H>,
    holder: Option<(Holder, Instant)>,
}

/// The table, per vault. `H` is the content hash (`vault_write::ContentHash`).
pub struct Leases<H> {
    table: Mutex<HashMap<String, Entry<H>>>,
}

impl<H> Default for Leases<H> {
    fn default() -> Self {
        Self { table: Mutex::new(HashMap::new()) }
    }
}

impl<H: Clone + Eq> Leases<H> {
    /// May `holder`, whose copy of `path` is `have`, write it for up to `hold`? A path never seen takes the server's own
    /// copy (`disk_now`) as its last version. Asking again while holding renews.
    pub fn ask(&self, path: &str, holder: &str, have: Option<H>, disk_now: impl FnOnce() -> Option<H>, hold: Duration, now: Instant) -> Answer<H> {
        let mut table = self.table.lock().expect("leases");
        let e = table.entry(path.to_string()).or_insert_with(|| Entry { version: disk_now(), holder: None });
        if let Some((other, until)) = &e.holder {
            if other != holder && *until > now {
                return Answer::Wait(Why::HeldBy(other.clone()));
            }
        }
        if have != e.version {
            return Answer::Wait(Why::Behind { last: e.version.clone() });
        }
        e.holder = Some((holder.to_string(), now + hold));
        Answer::Granted
    }

    /// `holder` wrote `path` (now `version`; `None`: removed) and lets it go. From anyone else it is stale and ignored:
    /// a lease that ran out was granted again meanwhile.
    pub fn done(&self, path: &str, holder: &str, version: Option<H>) -> bool {
        let mut table = self.table.lock().expect("leases");
        match table.get_mut(path) {
            Some(e) if e.holder.as_ref().is_some_and(|(h, _)| h == holder) => {
                e.version = version;
                e.holder = None;
                true
            }
            _ => false,
        }
    }

    /// The last version known for `path`, if it was ever asked for.
    pub fn version(&self, path: &str) -> Option<Option<H>> {
        self.table.lock().expect("leases").get(path).map(|e| e.version.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOLD: Duration = Duration::from_secs(30);

    #[test]
    fn one_writer_at_a_time_and_only_on_top_of_the_last_version() {
        let l = Leases::<u32>::default();
        let t = Instant::now();
        // the server's copy is version 1; the desktop has it too → granted
        assert_eq!(l.ask("log.md", "desktop", Some(1), || Some(1), HOLD, t), Answer::Granted);
        // the phone (on the server's core) asks meanwhile → held
        assert_eq!(l.ask("log.md", "server", Some(1), || unreachable!(), HOLD, t), Answer::Wait(Why::HeldBy("desktop".into())));
        assert!(l.done("log.md", "desktop", Some(2)));
        // the server's disk is still 1 (Syncthing has not brought 2): it waits for its copy, never writes on top of 1
        assert_eq!(l.ask("log.md", "server", Some(1), || unreachable!(), HOLD, t), Answer::Wait(Why::Behind { last: Some(2) }));
        assert_eq!(l.ask("log.md", "server", Some(2), || unreachable!(), HOLD, t), Answer::Granted);
        assert!(l.done("log.md", "server", Some(3)));
        assert_eq!(l.version("log.md"), Some(Some(3)));
    }

    #[test]
    fn a_lease_runs_out_and_a_stale_done_is_ignored() {
        let l = Leases::<u32>::default();
        let t = Instant::now();
        assert_eq!(l.ask("a.md", "desktop", None, || None, HOLD, t), Answer::Granted); // a new file: both see none
        let later = t + HOLD + Duration::from_secs(1);
        assert_eq!(l.ask("a.md", "server", None, || unreachable!(), HOLD, later), Answer::Granted, "the desktop vanished");
        assert!(!l.done("a.md", "desktop", Some(9)), "too late: not the holder any more");
        assert_eq!(l.version("a.md"), Some(None));
        // the holder asking again renews instead of waiting on itself
        assert_eq!(l.ask("a.md", "server", None, || unreachable!(), HOLD, later), Answer::Granted);
    }
}
