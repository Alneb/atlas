//! The SSH plugin's helper (`atlas-ssh`), in place of session.py, sftp.py and hosts.py. OpenSSH does the connecting; this keeps one shared connection per host, the long-lived
//! shells agents use (sessions.rs), the Files pane's sftp calls (sftp.rs), the page's terminal tabs and logins.
//!
//!   hosts · connections · status · connect · disconnect · command — the page's side tool and terminal menu
//!   open · run · read · send · close · sessions — atlas mcp's ssh_* tools
//!   terminal {host, command?, title?} → a tab in the user's window (a `tab` event the page answers with tab_opened)
//!   files_list / files_edit / files_save / files_get / files_put / files_mkdir / files_rename / files_delete
//!
//! Each call runs in a thread of its own (a long `run` holds up nothing; `terminal` waits for `tab_opened`). A watcher
//! emits `connections` (the hosts up) whenever that changes.
mod hosts;
mod proc;
mod sessions;
mod sftp;
mod shell;
mod ssh;
mod wire;

use atlas_plugin::{event, serve_threads, SharedMethods};
use serde_json::{json, Value};
use ssh::Settings;
use std::collections::HashMap;
use std::sync::{Condvar, LazyLock, Mutex};
use std::time::{Duration, Instant};

type Answer = Result<Value, String>;

/// Seconds between checks of which hosts are connected.
const WATCH_EVERY: Duration = Duration::from_secs(10);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The page's settings as last sent: the watcher reads the hosts with them.
static LATEST: LazyLock<Mutex<Settings>> = LazyLock::new(Default::default);

fn host(p: &Value, why: &str) -> Result<String, String> {
    p["host"].as_str().map(str::trim).filter(|h| !h.is_empty()).map(str::to_string).ok_or_else(|| format!("host: {why}"))
}

fn hosts(p: &Value) -> Answer {
    Ok(json!(Settings::of(p).hosts()))
}

/// The ssh command line for a terminal on `host`, sharing the connection.
fn command(p: &Value) -> Answer {
    let s = Settings::of(p);
    let host = host(p, "a name from ssh_hosts, or user@host[:port]")?;
    Ok(json!(command_line(&s, &host, p["command"].as_str().filter(|c| !c.is_empty()))))
}

fn command_line(s: &Settings, host: &str, command: Option<&str>) -> String {
    let line = shell::join(&s.argv(host, if command.is_some() { &["-t"] } else { &[] }));
    match command {
        Some(c) => format!("{line} {}", shell::quote(c)),
        None => line,
    }
}

/// The terminal tabs asked of the page, until it answers: id → whether it opened (None: no answer yet).
type Asked = Mutex<HashMap<String, Option<bool>>>;
static TABS: LazyLock<(Asked, Condvar)> = LazyLock::new(Default::default);

fn tab_wait() -> Duration {
    Duration::from_secs_f64(std::env::var("ATLAS_SSH_TAB_WAIT").ok().and_then(|w| w.parse().ok()).unwrap_or(15.0))
}

/// A visible terminal tab on `host` (the agent's "open me an ssh terminal"): the page opens it, as the "+" menu's
/// "SSH: <host>" does, and says so. No page answering (Atlas closed, the plugin off) is an error, never a claimed tab.
fn terminal(p: &Value) -> Answer {
    let s = Settings::of(p);
    let host = host(p, "a name from ssh_hosts, or user@host[:port]")?;
    let cmd = p["command"].as_str().filter(|c| !c.is_empty());
    let up = s.connected(&host);
    let title = p["title"].as_str().filter(|t| !t.is_empty()).map(str::to_string).unwrap_or_else(|| cmd.map_or(host.clone(), |c| format!("{host}: {c}")));
    let id = ssh::token();
    let (tabs, answered) = &*TABS;
    lock(tabs).insert(id.clone(), None);
    event("tab", json!({ "id": id, "host": host, "command": command_line(&s, &host, cmd), "title": title }));
    let end = Instant::now() + tab_wait();
    let mut t = lock(tabs);
    let opened = loop {
        if let Some(Some(ok)) = t.get(&id) {
            break Some(*ok);
        }
        let left = end.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break None;
        }
        t = answered.wait_timeout(t, left).unwrap_or_else(|e| e.into_inner()).0;
    };
    t.remove(&id);
    drop(t);
    match opened {
        None => Err("no Atlas window opened the tab: is Atlas open on this vault, with the SSH plugin on?".into()),
        Some(false) => Err("the Atlas window could not open a terminal".into()),
        Some(true) => Ok(json!({ "opened": title, "host": host, "connected": up,
            "note": if up { "the shared connection was up: no password asked" } else { "the user answers any passphrase / 2FA in that tab" } })),
    }
}

/// The page's answer to a `tab` event.
fn tab_opened(p: &Value) -> Answer {
    let (tabs, answered) = &*TABS;
    let id = p["id"].as_str().unwrap_or_default();
    let known = match lock(tabs).get_mut(id) {
        Some(slot) => {
            *slot = Some(p["ok"].as_bool().unwrap_or(false));
            true
        }
        None => false,
    };
    answered.notify_all();
    Ok(json!({ "known": known }))
}

/// Every host with its connection: up since when, how long it stays, its sessions — what the side panel draws.
fn status(p: &Value) -> Answer {
    let s = Settings::of(p);
    *lock(&LATEST) = s.clone();
    let out: Vec<Value> = s
        .hosts()
        .into_iter()
        .map(|h| {
            let since = s.master_since(&h.name);
            let mut v = json!(h);
            v["up"] = json!(since.is_some());
            v["since"] = json!(since);
            v["persist"] = json!(s.persist());
            v["sessions"] = json!(sessions::on_host(&h.name));
            v
        })
        .collect();
    Ok(Value::Array(out))
}

/// Ends the shared connection to a host (`ssh -O exit`): its tabs and sessions end with it.
fn disconnect(p: &Value) -> Answer {
    let s = Settings::of(p);
    let host = host(p, "a name from ssh_hosts")?;
    proc::run(&s.argv(&host, &["-O", "exit"]), None, Duration::from_secs(10));
    sessions::end_host(&host);
    Ok(json!({ "disconnected": host }))
}

/// Log in to `host` and nothing more: keys bring
/// the shared connection up quietly; a passphrase / 2FA opens the login tab, which closes once connected.
fn connect(p: &Value) -> Answer {
    let s = Settings::of(p);
    let host = host(p, "a name from ssh_hosts")?;
    if s.bring_up(&host) {
        return Ok(json!({ "connected": host }));
    }
    ssh::login(&s, &host, Duration::ZERO, ssh::Asker::User("you (Connect)"));
    Ok(json!({ "waiting_for_login": host, "message": format!("Log in to {host} in the terminal tab that opened (passphrase / 2FA); it closes once connected.") }))
}

/// The hosts with a live shared connection now; also hands the watcher the page's settings.
fn connections(p: &Value) -> Answer {
    let s = Settings::of(p);
    *lock(&LATEST) = s.clone();
    Ok(json!(up_hosts(&s)))
}

fn up_hosts(s: &Settings) -> Vec<String> {
    let mut up: Vec<String> = s.hosts().into_iter().map(|h| h.name).filter(|n| s.connected(n)).collect();
    up.sort();
    up
}

fn watch() {
    let mut last: Option<Vec<String>> = None;
    loop {
        let s = lock(&LATEST).clone();
        let up = up_hosts(&s);
        if last.as_ref() != Some(&up) {
            for h in up.iter().filter(|h| !last.as_ref().is_some_and(|l| l.contains(h))) {
                ssh::connected(h);
                let argv = s.subsystem_argv(h);
                std::thread::spawn(move || wire::warm(&argv));
            }
            event("connections", json!(up));
            last = Some(up);
        }
        std::thread::sleep(WATCH_EVERY);
    }
}

/// An explorer call: the connection first — a host that wants a passphrase / 2FA opens the login tab (as for agents'
/// sessions) and the answer is {waiting_for_login}: the pane calls again.
fn files(work: fn(&[String], &Value) -> Answer) -> impl Fn(&Value) -> Answer {
    move |p| {
        let s = Settings::of(p);
        let host = host(p, "a name from the ssh config, or user@host[:port]")?;
        if !s.bring_up(&host) {
            ssh::login(&s, &host, Duration::ZERO, ssh::Asker::User("Atlas's explorer to browse files there"));
            return Ok(json!({ "waiting_for_login": host, "message": format!("Log in to {host} in the terminal tab that opened (passphrase / 2FA).") }));
        }
        work(&s.sftp_argv(&host), p)
    }
}

/// A folder for the explorer: over the channel kept per host (wire.rs, a few round trips), else one sftp batch.
fn list_files(p: &Value) -> Answer {
    let s = Settings::of(p);
    let host = host(p, "a name from the ssh config, or user@host[:port]")?;
    let path = p["path"].as_str().unwrap_or_default();
    if !s.bring_up(&host) {
        return files(|a, p| sftp::listing(a, p["path"].as_str().unwrap_or_default()))(p);
    }
    match wire::listing(&s.subsystem_argv(&host), path) {
        Ok(v) => Ok(v),
        Err(wire::Failure::Host(_, m)) => Err(m),
        Err(wire::Failure::Channel(_)) => sftp::listing(&s.sftp_argv(&host), path),
    }
}

fn main() {
    let mut m = SharedMethods::new();
    let mut add = |name: &str, f: Box<dyn Fn(&Value) -> Answer + Send + Sync>| {
        m.add(name, move |p| f(&p).map_err(atlas_plugin::error));
    };
    add("hosts", Box::new(hosts));
    add("command", Box::new(command));
    add("terminal", Box::new(terminal));
    add("tab_opened", Box::new(tab_opened));
    add("status", Box::new(status));
    add("disconnect", Box::new(disconnect));
    add("connect", Box::new(connect));
    add("connections", Box::new(connections));
    add("open", Box::new(sessions::open));
    add("run", Box::new(sessions::run));
    add("read", Box::new(sessions::read));
    add("send", Box::new(sessions::send));
    add("close", Box::new(sessions::close));
    add("sessions", Box::new(sessions::list));
    add("files_list", Box::new(list_files));
    add("files_edit", Box::new(files(sftp::fetch_for_edit)));
    add("files_save", Box::new(files(sftp::save_edit)));
    add("files_get", Box::new(files(sftp::download)));
    add("files_put", Box::new(files(sftp::upload)));
    add("files_mkdir", Box::new(files(sftp::mkdir)));
    add("files_rename", Box::new(files(sftp::rename)));
    add("files_delete", Box::new(files(sftp::delete)));
    std::thread::spawn(watch);
    serve_threads(m);
}
