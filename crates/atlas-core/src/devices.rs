//! The devices of a person and when each was last used, shared through the mirror server
//! (docs/design/DESIGN-calendar-tasks-nudges.md §3.7): every device's core that mirrors a server vault reports its own
//! presence (`notify::Presence::active_at`) once a minute and gets back everyone's, so the planner of nudges can tell
//! which device the person is at. The server keeps the table in memory only — presence is not vault data, and a
//! restarted server learns it again within a minute. One table per process: presence is the person's, not a vault's.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// What a device is, for the rule that picks the one to nudge on (a desktop the person is at, else the phone).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Desktop,
    Phone,
}

impl Kind {
    pub fn here() -> Self {
        if cfg!(target_os = "android") {
            Self::Phone
        } else {
            Self::Desktop
        }
    }
}

/// One device as it last reported itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Device {
    /// its stable id (mirror_guard.rs `device_id`)
    pub id: String,
    /// its computer's name, as `GET /api/device` says it
    pub name: String,
    pub kind: Kind,
    /// when the person last used it (ms since the epoch), when known
    pub active_at: Option<i64>,
    /// when it reported (ms since the epoch, the server's clock): a device whose core stopped stops reporting
    pub reported_at: i64,
    /// what a phone's app armed to wake for (its `.atlas/cache/alarms.json`), so the rule can trust the phone with a
    /// nudge while the app is closed; absent from a desktop and from an older core (both directions: an older server
    /// drops the field, an older device never sends it)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alarms: Option<Alarms>,
}

/// The phone app's alarms for Plan's nudges, as `ReminderAlarms` writes them each time it sets them: whether they are
/// exact (Android may withhold the permission, and an inexact alarm can come minutes late in Doze), when they were
/// set, and the `plan/next.md` stamps it wakes for, one after the other (ms since the epoch).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Alarms {
    pub exact: bool,
    pub armed_at: i64,
    pub nudges: Vec<i64>,
}

/// Where the phone app keeps them, in the vault it set them for.
pub const ALARMS_FILE: &str = ".atlas/cache/alarms.json";

impl Alarms {
    /// The alarms the app set for the vault at `root`; none on a desktop (a synced `.atlas/cache` from a phone is not
    /// this device's), when the app has set none, or when the file is not one.
    pub fn of_vault(root: &std::path::Path) -> Option<Self> {
        if Kind::here() != Kind::Phone {
            return None;
        }
        Self::read(&root.join(ALARMS_FILE))
    }

    /// The file's alarms, or none when it is missing or not one (said once on stderr: the app wrote something else).
    pub fn read(file: &std::path::Path) -> Option<Self> {
        let text = std::fs::read_to_string(file).ok()?;
        match serde_json::from_str(&text) {
            Ok(a) => Some(a),
            Err(e) => {
                eprintln!("atlas: devices: {} is not the app's alarms ({e})", file.display());
                None
            }
        }
    }
}

/// A device that has not reported for this long is forgotten (ms): its core has been off a whole day.
pub const FORGET: i64 = 24 * 3600 * 1000;

/// The devices that reported, by id.
#[derive(Default)]
pub struct Table(Mutex<HashMap<String, Device>>);

impl Table {
    /// The server's (and, on a device, the last answer it got).
    pub fn global() -> &'static Table {
        static ONE: LazyLock<Table> = LazyLock::new(Table::default);
        &ONE
    }

    /// A device's report at `now`: kept (its `reported_at` set to `now`), the forgotten ones dropped; everyone's, by name.
    pub fn report(&self, mut d: Device, now: i64) -> Vec<Device> {
        d.reported_at = now;
        let mut t = self.0.lock().unwrap_or_else(|e| e.into_inner());
        t.insert(d.id.clone(), d);
        t.retain(|_, d| now - d.reported_at < FORGET);
        sorted(t.values().cloned().collect())
    }

    /// The server's answer, as a device keeps it until the next.
    pub fn replace(&self, all: Vec<Device>) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = all.into_iter().map(|d| (d.id.clone(), d)).collect();
    }

    pub fn all(&self) -> Vec<Device> {
        sorted(self.0.lock().unwrap_or_else(|e| e.into_inner()).values().cloned().collect())
    }
}

fn sorted(mut v: Vec<Device>) -> Vec<Device> {
    v.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
    v
}

/// The devices as `GET /api/device` answers them: the table, with this device's own entry taken from its presence now
/// (fresher than its last report) when it knows one — a server's core knows none and is no device of the person —, and
/// each marked `here` or not.
pub fn with_here(all: Vec<Device>, mut me: Device) -> Vec<serde_json::Value> {
    // its alarms as it last reported them when its presence now carries none (`this_device` reads no vault)
    if me.alarms.is_none() {
        me.alarms = all.iter().find(|d| d.id == me.id).and_then(|d| d.alarms.clone());
    }
    let mut v: Vec<Device> = all.into_iter().filter(|d| d.id != me.id).collect();
    let id = me.id.clone();
    if me.active_at.is_some() {
        v.push(me);
    }
    sorted(v)
        .into_iter()
        .map(|d| {
            let here = d.id == id;
            let mut j = serde_json::to_value(&d).unwrap_or_default();
            j["here"] = serde_json::Value::Bool(here);
            j
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dev(id: &str, kind: Kind, active_at: Option<i64>) -> Device {
        Device { id: id.into(), name: id.into(), kind, active_at, reported_at: 0, alarms: None }
    }

    #[test]
    fn a_phones_alarms_travel_with_its_report_and_an_older_core_still_understands_it() {
        let alarms = Alarms { exact: true, armed_at: 10, nudges: vec![1_000, 2_000] };
        let phone = Device { alarms: Some(alarms.clone()), ..dev("phone", Kind::Phone, None) };
        let json = serde_json::to_value(&phone).unwrap();
        assert_eq!(json["alarms"], serde_json::json!({ "exact": true, "armed_at": 10, "nudges": [1_000, 2_000] }));
        assert!(serde_json::to_value(dev("laptop", Kind::Desktop, Some(1))).unwrap().get("alarms").is_none(), "none: no key");
        let old: Device = serde_json::from_value(serde_json::json!({ "id": "a", "name": "a", "kind": "phone", "active_at": null, "reported_at": 0 })).unwrap();
        assert_eq!(old.alarms, None, "a device of an older core sends none");
        // kept by the server's table and handed to everyone
        let t = Table::default();
        let all = t.report(phone, 5);
        assert_eq!(all[0].alarms.as_ref(), Some(&alarms));
        // the phone's own view: its presence now (no alarms read) keeps the ones it reported
        let v = with_here(all, dev("phone", Kind::Phone, Some(7)));
        assert_eq!((v[0]["active_at"].as_i64(), v[0]["alarms"]["nudges"][1].as_i64()), (Some(7), Some(2_000)));
    }

    #[test]
    fn the_apps_alarms_file_is_read_and_a_wrong_one_is_none() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("alarms.json");
        assert_eq!(Alarms::read(&file), None, "no file: none set");
        std::fs::write(&file, r#"{"exact":false,"armed_at":3,"nudges":[]}"#).unwrap();
        assert_eq!(Alarms::read(&file), Some(Alarms { exact: false, armed_at: 3, nudges: vec![] }));
        std::fs::write(&file, "[1, 2]").unwrap();
        assert_eq!(Alarms::read(&file), None);
        std::fs::create_dir_all(dir.path().join(".atlas/cache")).unwrap();
        std::fs::write(dir.path().join(ALARMS_FILE), r#"{"exact":true,"armed_at":3,"nudges":[9]}"#).unwrap();
        assert_eq!(Alarms::of_vault(dir.path()), None, "a desktop's vault holds no alarms of its own, even synced from a phone");
    }

    #[test]
    fn a_report_is_kept_until_a_day_without_one() {
        let t = Table::default();
        t.report(dev("phone", Kind::Phone, Some(5)), 1_000);
        let all = t.report(dev("laptop", Kind::Desktop, Some(900)), 2_000);
        assert_eq!(
            all.iter().map(|d| (d.id.as_str(), d.reported_at)).collect::<Vec<_>>(),
            vec![("laptop", 2_000), ("phone", 1_000)]
        );
        let all = t.report(dev("laptop", Kind::Desktop, Some(950)), 1_000 + FORGET);
        assert_eq!(all.len(), 1, "the phone, silent a day, is forgotten: {all:?}");
        assert_eq!(all[0].active_at, Some(950), "a new report replaces the old");
    }

    #[test]
    fn this_device_is_its_presence_now_and_marked_here() {
        let me = Device { reported_at: 7, ..dev("laptop", Kind::Desktop, Some(3_000)) };
        let v = with_here(vec![dev("laptop", Kind::Desktop, Some(1_000)), dev("phone", Kind::Phone, None)], me);
        assert_eq!(v.len(), 2);
        assert_eq!(
            (v[0]["id"].as_str(), v[0]["active_at"].as_i64(), v[0]["here"].as_bool()),
            (Some("laptop"), Some(3_000), Some(true))
        );
        assert_eq!((v[1]["kind"].as_str(), v[1]["here"].as_bool()), (Some("phone"), Some(false)));
        let server = with_here(vec![dev("phone", Kind::Phone, Some(9))], dev("server", Kind::Desktop, None));
        assert_eq!(server.len(), 1, "a core with no presence of its own (a server) is not listed: {server:?}");
    }
}
