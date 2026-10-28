//! Write leases (docs/design/DESIGN-mirror-v2.md §2): a mirrored vault is written by one device at a time, and only on
//! top of the last version, so Syncthing never sees two concurrent changes — the only thing it makes a conflict of
//! (measured: the same bytes written on both sides are not a conflict, different bytes are). The server's core keeps
//! this table; every core (the server's own writes too) asks it before writing a vault file.
use serde::{de::DeserializeOwned, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
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

/// How long Syncthing gets to carry a reported write to the server before the table trusts the server's disk again.
pub const SETTLE: Duration = Duration::from_secs(120);

/// How many superseded versions a path remembers: enough to tell "Syncthing has not brought the last write yet" from
/// "a write this table never heard of" (made offline) on a server whose disk lags.
const PAST: usize = 16;

struct Entry<H> {
    /// the last content written by anyone (`None`: absent)
    version: Option<H>,
    /// versions `version` replaced, newest last: a copy holding one of them is behind, never ahead
    past: Vec<Option<H>>,
    /// when a device reported `version` (`None`: read from the server's disk)
    reported: Option<Instant>,
    holder: Option<(Holder, Instant)>,
}

/// The table, per vault. `H` is the content hash (`vault_write::ContentHash`).
pub struct Leases<H> {
    table: Mutex<HashMap<String, Entry<H>>>,
    /// where the recent versions are kept across a restart ([`Leases::kept_in`]); `None`: in memory only
    keep: Option<PathBuf>,
}

/// How long a reported version is kept on disk: a restart within it would otherwise re-read the server's disk, which
/// may not have that version yet, and grant another device a write on top of the old one (a fork, merged against the
/// wrong base). Older versions are settled: the disk is their reference anyway.
const KEEP_FOR: Duration = Duration::from_secs(600);

/// One path in the kept file.
#[derive(serde::Serialize, serde::Deserialize)]
struct Kept<H> {
    path: String,
    version: Option<H>,
    past: Vec<Option<H>>,
}

impl<H: PartialEq> Entry<H> {
    fn remember(&mut self, was: Option<H>) {
        if was != self.version {
            self.past.retain(|p| *p != self.version); // a version written again is current, not past
            self.past.push(was);
            if self.past.len() > PAST {
                self.past.remove(0);
            }
        }
    }
}

impl<H> Default for Leases<H> {
    fn default() -> Self {
        Self { table: Mutex::new(HashMap::new()), keep: None }
    }
}

impl<H: Clone + Eq + Serialize + DeserializeOwned> Leases<H> {
    /// The table of a server's vault, its recent versions kept in `file` (`.atlas/cache/leases.json`): they come back
    /// after a restart as just reported, so they are trusted over the disk for [`SETTLE`] again. Holders are not kept
    /// (a lease runs out in seconds; its device asks again).
    pub fn kept_in(file: PathBuf) -> Self {
        let now = Instant::now();
        let kept: Vec<Kept<H>> = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        let table = kept.into_iter().map(|k| (k.path, Entry { version: k.version, past: k.past, reported: Some(now), holder: None })).collect();
        Self { table: Mutex::new(table), keep: Some(file) }
    }

    /// The recent versions to `keep` (best effort: a lost file only narrows what a restart remembers).
    fn save(&self, table: &HashMap<String, Entry<H>>) {
        let Some(file) = &self.keep else { return };
        let recent: Vec<Kept<H>> = table
            .iter()
            .filter(|(_, e)| e.reported.is_some_and(|at| at.elapsed() < KEEP_FOR))
            .map(|(p, e)| Kept { path: p.clone(), version: e.version.clone(), past: e.past.clone() })
            .collect();
        let saved = serde_json::to_vec(&recent).map_err(|e| crate::Error::Other(e.into())).and_then(|b| crate::vault_write::cache::write(file, &b));
        if let Err(e) = saved {
            eprintln!("atlas: leases: not kept in {}: {e}", file.display());
        }
    }

    /// May `holder`, whose copy of `path` is `have`, write it for up to `hold`? A path never seen takes the server's own
    /// copy (`disk_now`) as its last version. Asking again while holding renews.
    ///
    /// The table can fall behind the files: a write made while the server was unreachable never reports its version,
    /// yet Syncthing carries it over. So a settled version (read from disk, or reported over [`SETTLE`] ago) yields to
    /// the server's disk when that equals the asker's copy, as a path never seen would.
    pub fn ask(&self, path: &str, holder: &str, have: Option<H>, disk_now: impl FnOnce() -> Option<H>, hold: Duration, now: Instant) -> Answer<H> {
        let mut table = self.table.lock().expect("leases");
        let mut disk_now = Some(disk_now);
        let e = table.entry(path.to_string()).or_insert_with(|| Entry { version: disk_now.take().and_then(|f| f()), past: Vec::new(), reported: None, holder: None });
        let holds = match &e.holder {
            Some((other, until)) if *until > now && other != holder => return Answer::Wait(Why::HeldBy(other.clone())),
            Some((other, until)) => *until > now && other == holder,
            None => false,
        };
        // a holder renewing passes whatever its copy is: nobody else wrote meanwhile, so a difference is its own write
        // whose `done` was lost (a network blip), not a newer version it lacks
        if have != e.version && !holds {
            let settled = e.reported.is_none_or(|at| now.saturating_duration_since(at) >= SETTLE);
            match disk_now.filter(|_| settled).map(|f| f()) {
                // a version this table saw replaced is a server disk still behind (Syncthing slow), not an offline write
                Some(disk) if disk == have && !e.past.contains(&disk) => {
                    let was = std::mem::replace(&mut e.version, disk);
                    e.remember(was);
                    e.reported = None;
                }
                _ => return Answer::Wait(Why::Behind { last: e.version.clone() }),
            }
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
                let was = std::mem::replace(&mut e.version, version);
                e.remember(was);
                e.reported = Some(Instant::now());
                e.holder = None;
                self.save(&table);
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

    #[test]
    fn a_settled_version_yields_to_the_disk_that_matches_the_asker() {
        let l = Leases::<u32>::default();
        let t = Instant::now();
        // known as 1; the desktop then wrote 2 offline and Syncthing carried it: the server's disk and the desktop agree
        assert_eq!(l.ask("a.md", "server", Some(1), || Some(1), HOLD, t), Answer::Granted);
        assert!(l.done("a.md", "server", Some(1)));
        assert_eq!(l.ask("a.md", "desktop", Some(2), || Some(2), HOLD, t), Answer::Wait(Why::Behind { last: Some(1) }), "1 was just reported");
        let later = t + SETTLE + Duration::from_secs(1);
        assert_eq!(l.ask("a.md", "phone", Some(3), || Some(2), HOLD, later), Answer::Wait(Why::Behind { last: Some(1) }), "the disk is not the phone's copy");
        assert_eq!(l.ask("a.md", "desktop", Some(2), || Some(2), HOLD, later), Answer::Granted);
    }

    #[test]
    fn a_server_disk_still_on_a_replaced_version_never_wins_back() {
        // the desktop wrote 1 then 2; the server's Syncthing is stuck past SETTLE with 1 on disk: the server's own core
        // (whose copy is its disk) must not be granted on top of 1 — that would fork 2 into a conflict
        let l = Leases::<u32>::default();
        let t = Instant::now();
        assert_eq!(l.ask("a.md", "desktop", Some(1), || Some(1), HOLD, t), Answer::Granted);
        assert!(l.done("a.md", "desktop", Some(2)));
        let later = t + SETTLE + Duration::from_secs(1);
        assert_eq!(l.ask("a.md", "server", Some(1), || Some(1), HOLD, later), Answer::Wait(Why::Behind { last: Some(2) }));
        // a version the table never saw (an offline write Syncthing carried) still settles in
        assert_eq!(l.ask("a.md", "server", Some(7), || Some(7), HOLD, later), Answer::Granted);
        assert!(l.done("a.md", "server", Some(8)));
        assert_eq!(l.ask("a.md", "phone", Some(2), || Some(2), HOLD, later + SETTLE + SETTLE), Answer::Wait(Why::Behind { last: Some(8) }), "2 was replaced too");
    }

    #[test]
    fn a_restarted_server_remembers_the_last_reported_version() {
        // the desktop reported 2; the server restarts before Syncthing brought 2 to its disk (still 1): the phone, whose
        // copy is that 1, must wait, not fork 2
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join(".atlas/cache/leases.json");
        let l = Leases::<u32>::kept_in(file.clone());
        let t = Instant::now();
        assert_eq!(l.ask("a.md", "desktop", Some(1), || Some(1), HOLD, t), Answer::Granted);
        assert!(l.done("a.md", "desktop", Some(2)));
        drop(l);
        let again = Leases::<u32>::kept_in(file);
        assert_eq!(again.version("a.md"), Some(Some(2)));
        assert_eq!(again.ask("a.md", "phone", Some(1), || Some(1), HOLD, Instant::now()), Answer::Wait(Why::Behind { last: Some(2) }));
        assert_eq!(again.ask("b.md", "phone", None, || None, HOLD, Instant::now()), Answer::Granted, "paths never kept: the disk");
    }

    #[test]
    fn a_holder_whose_done_was_lost_renews_on_its_own_write() {
        let l = Leases::<u32>::default();
        let t = Instant::now();
        assert_eq!(l.ask("a.md", "desktop", Some(1), || Some(1), HOLD, t), Answer::Granted);
        // it wrote 2, the `done` never arrived: its next save is not refused as behind its own write
        assert_eq!(l.ask("a.md", "desktop", Some(2), || Some(1), HOLD, t + Duration::from_secs(1)), Answer::Granted);
        assert_eq!(l.ask("a.md", "phone", Some(1), || Some(1), HOLD, t + Duration::from_secs(2)), Answer::Wait(Why::HeldBy("desktop".into())));
        // once the lease ran out, the same copy is behind again (until reported, or settled)
        let gone = t + HOLD + Duration::from_secs(2);
        assert_eq!(l.ask("a.md", "desktop", Some(2), || Some(1), HOLD, gone), Answer::Wait(Why::Behind { last: Some(1) }));
    }
}
