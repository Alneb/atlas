//! Where a vault's background work runs (docs/design/DESIGN-server-role.md). A vault can be served by several cores at
//! once: the desktop's, the phone's and a server's, each on its own copy kept in step by Syncthing (DESIGN-mirror-v2.md).
//! Work nobody asked for at that moment (a schedule, a hook on changed files, a hook when the vault starts) must then run
//! on the right one: a bank sync or a feed poll on the always-on server, which holds the secrets; a job that edits files
//! the person is editing at the same time (the Runs plugin's round) never on the server. A plugin says which in its
//! manifest (`background = "server" | "device" | "any"`, per plugin or per tool); a vault command in its own.
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Where a background job may run.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Background {
    /// Every core that serves the vault (the default, and the behaviour before this key existed).
    #[default]
    Any,
    /// The server, when the vault has one: needs an always-on machine or the secrets kept there (bank sync, a feed
    /// poll, push). A vault with no server runs it where it is served.
    Server,
    /// Never a server core: it works with what only a person's device has (an ssh session it may not open itself), or
    /// writes files the person edits at the same time.
    Device,
}

/// What this core is to the vault.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Seat {
    /// A server core (`atlas serve`, the Docker image).
    Server,
    /// A desktop or the phone, the vault having a copy on a server (the vault list's `mirror = …`).
    MirroredDevice,
    /// A desktop or the phone, the vault on no server.
    LoneDevice,
}

impl Seat {
    /// This core's seat for the vault at `root`: the server once server mode started, else whether the vault list
    /// names a mirror for it (read each time: linking a mirror takes effect at the next job).
    pub fn of(root: &Path) -> Seat {
        if crate::platform::Platform::current() == crate::platform::Platform::Server {
            Seat::Server
        } else if crate::mirror_guard::mirror_of(root).is_some() {
            Seat::MirroredDevice
        } else {
            Seat::LoneDevice
        }
    }
}

impl Background {
    /// A job's word after the vault's own (`[automation] background`, by the job's ids as the schedule log names them,
    /// most precise first: `plugin.finance.bank_sync`, then `plugin.finance`; a vault command by its id): the vault
    /// decides over the plugin, whose manifest a person does not edit.
    pub fn in_vault(self, chosen: &std::collections::BTreeMap<String, Background>, ids: &[&str]) -> Background {
        ids.iter().find_map(|id| chosen.get(*id).copied()).unwrap_or(self)
    }

    /// Whether a job of this kind runs on a core in `seat`.
    pub fn runs_at(self, seat: Seat) -> bool {
        match (self, seat) {
            (Background::Any, _) => true,
            (Background::Server, Seat::Server | Seat::LoneDevice) => true,
            (Background::Server, Seat::MirroredDevice) => false,
            (Background::Device, Seat::Server) => false,
            (Background::Device, Seat::MirroredDevice | Seat::LoneDevice) => true,
        }
    }

    /// For a log line or Settings: where it runs, in words.
    pub fn words(self) -> &'static str {
        match self {
            Background::Any => "on every computer that serves the vault",
            Background::Server => "on the vault's server (here when it has none)",
            Background::Device => "on the person's devices, never on a server",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_kind_runs_where_it_belongs() {
        use Background::{Any, Device};
        use Seat::{LoneDevice, MirroredDevice};
        for seat in [Seat::Server, MirroredDevice, LoneDevice] {
            assert!(Any.runs_at(seat), "any: everywhere, as before ({seat:?})");
        }
        assert!(Background::Server.runs_at(Seat::Server));
        assert!(!Background::Server.runs_at(MirroredDevice), "a mirrored device leaves it to the server");
        assert!(Background::Server.runs_at(LoneDevice), "no server: the device is all there is");
        assert!(!Device.runs_at(Seat::Server), "never on a server");
        assert!(Device.runs_at(MirroredDevice) && Device.runs_at(LoneDevice));
    }

    #[test]
    fn the_vaults_word_wins_and_the_most_precise_id_first() {
        let chosen: std::collections::BTreeMap<String, Background> =
            toml::from_str("\"plugin.runs\" = \"device\"\n\"plugin.runs.tick\" = \"any\"\n\"plugin.finance\" = \"server\"\n").unwrap();
        assert_eq!(Background::Any.in_vault(&chosen, &["plugin.runs.tick", "plugin.runs"]), Background::Any);
        assert_eq!(Background::Any.in_vault(&chosen, &["plugin.runs.status", "plugin.runs"]), Background::Device);
        assert_eq!(Background::Device.in_vault(&chosen, &["plugin.finance.prices", "plugin.finance"]), Background::Server);
        assert_eq!(Background::Server.in_vault(&chosen, &["plugin.mail.sync", "plugin.mail"]), Background::Server, "not named: the plugin's word");
    }

    #[test]
    fn the_manifest_words_are_lowercase_and_unknown_ones_refused() {
        #[derive(Deserialize)]
        struct M {
            background: Background,
        }
        let m: M = toml::from_str("background = \"server\"").unwrap();
        assert_eq!(m.background, Background::Server);
        assert!(toml::from_str::<M>("background = \"never-server\"").is_err(), "a typo is an error, not `any`");
    }
}
