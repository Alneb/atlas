//! Against a real CalDAV server (README.md, "Tests"), with a throwaway account:
//!   - `DAV_TEST_URL` + `DAV_TEST_USER` + `DAV_TEST_PASSWORD`: a server already running (RustiCal in podman, as the
//!     user's own server runs it);
//!   - else `DAV_TEST_PYTHON`, a Python with Radicale: started here on 127.0.0.1;
//!   - else it says it was skipped and passes.
//!
//! Each run makes calendars of its own (random names) in the account's home, and removes them.
use atlas_dav::caldav::{Account, Client, DavError, Existing, Outcome};
use atlas_dav::ics::{self, Event, When};
use atlas_dav::uid;
use chrono::{Duration, Local, NaiveDate, Utc};
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

const RADICALE_USER: &str = "alice";
const RADICALE_PASSWORD: &str = "app-password-1234";

struct Server {
    child: Option<Child>,
    dir: PathBuf,
    url: String,
    user: String,
    password: String,
}

impl Drop for Server {
    fn drop(&mut self) {
        if let Some(c) = &mut self.child {
            let _ = c.kill();
            let _ = c.wait();
        }
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

fn scratch(tag: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("atlas-dav-{tag}-{}-{}", std::process::id(), Utc::now().timestamp_micros()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn start() -> Option<Server> {
    if let (Ok(url), Ok(user), Ok(password)) =
        (std::env::var("DAV_TEST_URL"), std::env::var("DAV_TEST_USER"), std::env::var("DAV_TEST_PASSWORD"))
    {
        eprintln!("dav test: against {url}");
        return Some(Server { child: None, dir: scratch("external"), url, user, password });
    }
    let Ok(python) = std::env::var("DAV_TEST_PYTHON") else {
        eprintln!("dav test: skipped — set DAV_TEST_URL/USER/PASSWORD (a running server) or DAV_TEST_PYTHON (a Python with radicale)");
        return None;
    };
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let dir = scratch("radicale");
    std::fs::create_dir_all(dir.join("collections")).unwrap();
    std::fs::write(dir.join("users"), format!("{RADICALE_USER}:{RADICALE_PASSWORD}\n")).unwrap();
    let config = format!(
        "[server]\nhosts = 127.0.0.1:{port}\n[auth]\ntype = htpasswd\nhtpasswd_filename = {users}\nhtpasswd_encryption = plain\n[storage]\nfilesystem_folder = {col}\n[rights]\ntype = owner_only\n[logging]\nlevel = warning\n",
        users = dir.join("users").display(),
        col = dir.join("collections").display()
    );
    std::fs::write(dir.join("config"), config).unwrap();
    let child = Command::new(python)
        .args(["-m", "radicale", "--config"])
        .arg(dir.join("config"))
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("start radicale");
    let server = Server {
        child: Some(child),
        dir,
        url: format!("http://127.0.0.1:{port}/"),
        user: RADICALE_USER.into(),
        password: RADICALE_PASSWORD.into(),
    };
    for _ in 0..100 {
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Some(server);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    panic!("radicale did not start on {port}");
}

/// A calendar made with MKCALENDAR (the plugin itself never creates calendars) → its address.
fn mkcalendar(s: &Server, home: &url::Url, path: &str, name: &str, comps: &[&str]) -> url::Url {
    let at = home.join(path).unwrap();
    let comps: String = comps.iter().map(|c| format!("<C:comp name=\"{c}\"/>")).collect();
    let body = format!(
        r#"<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>{name}</D:displayname><C:supported-calendar-component-set>{comps}</C:supported-calendar-component-set></D:prop></D:set></C:mkcalendar>"#
    );
    let r = reqwest::blocking::Client::new()
        .request(reqwest::Method::from_bytes(b"MKCALENDAR").unwrap(), at.clone())
        .basic_auth(&s.user, Some(&s.password))
        .body(body)
        .send()
        .unwrap();
    assert!(r.status().is_success(), "MKCALENDAR {at}: {}", r.status());
    at
}

fn raw_put(s: &Server, at: url::Url, ics: &str) -> u16 {
    reqwest::blocking::Client::new()
        .put(at)
        .basic_auth(&s.user, Some(&s.password))
        .header("Content-Type", "text/calendar")
        .body(ics.to_string())
        .send()
        .unwrap()
        .status()
        .as_u16()
}

fn account(s: &Server, password: &str) -> Account {
    Account { url: s.url.clone(), user: s.user.clone(), password: password.into() }
}

fn day(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

/// The helper binary run as a command: `dav <method>` with params on stdin, in the vault `root`.
fn cli(root: &Path, method: &str, params: Value) -> Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_dav"))
        .arg(method)
        .env("ATLAS_ROOT", root)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(params.to_string().as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(out.status.success(), "dav {method} failed: {err}");
    eprint!("{err}");
    serde_json::from_slice(&out.stdout).unwrap()
}

#[test]
fn caldav_against_a_real_server() {
    let Some(s) = start() else { return };
    let home = Client::new(&account(&s, &s.password)).unwrap().home().unwrap();
    let tag = format!("{:x}", Utc::now().timestamp_micros());
    let (personal, tasks) = (format!("Personal {tag}"), format!("Tasks {tag}"));
    let made = mkcalendar(&s, &home, &format!("personal-{tag}/"), &personal, &["VEVENT"]);
    mkcalendar(&s, &home, &format!("tasks-{tag}/"), &tasks, &["VTODO"]);

    // a wrong app password is said as such
    let bad = Client::new(&account(&s, "wrong")).unwrap().discover().unwrap_err();
    assert!(matches!(bad, DavError::Auth { .. }), "{bad:?}");
    assert!(bad.to_string().starts_with("app password rejected"));

    // discovery: principal → home → calendars; the VTODO-only one does not take events
    let c = Client::new(&account(&s, &s.password)).unwrap();
    let cals = c.discover().unwrap();
    let names: Vec<(&str, bool)> = cals.iter().map(|c| (c.name.as_str(), c.takes_events())).collect();
    assert!(names.contains(&(personal.as_str(), true)) && names.contains(&(tasks.as_str(), false)), "{names:?}");
    let cal = c.resolve(&personal).unwrap();
    assert_eq!(cal, made, "found by its name");
    assert_eq!(c.resolve(cal.as_str()).unwrap(), cal, "as Settings stores it");
    assert!(c.resolve("Nope").unwrap_err().to_string().contains(&personal), "the error lists what there is");
    // an address that is the calendar itself is that calendar
    let direct =
        Client::new(&Account { url: cal.to_string(), ..account(&s, &s.password) }).unwrap().discover().unwrap();
    assert_eq!(direct.len(), 1);
    assert_eq!(direct[0].name, personal);

    // add → same again (unchanged) → changed (updated): one event throughout
    let mut ev = Event {
        uid: uid::derive("<abc@uni.example.org>", "due"),
        summary: "Due: rapport, v2; final".into(),
        start: When::parse("2026-11-15").unwrap(),
        end: None,
        description: Some("From the note mail/a.md in Atlas\nline two".into()),
        location: Some("Room 204, Main Building".into()),
        source: Some("mail/a.md".into()),
    };
    let put = |e: &Event| c.upsert(&cal, &e.uid, &e.to_ics(Utc::now()), Some(&e.hash()), Existing::Update).unwrap().0;
    assert_eq!(put(&ev), Outcome::Added);
    assert_eq!(put(&ev), Outcome::Unchanged);
    ev.summary = "Due: rapport final".into();
    assert_eq!(put(&ev), Outcome::Updated);
    let listed = c.events(&cal, day("2026-11-01"), day("2026-11-30")).unwrap();
    assert_eq!(listed.len(), 1, "{listed:?}");
    let got = &listed[0].event;
    assert_eq!((got.summary.as_str(), got.start.as_str(), got.all_day), ("Due: rapport final", "2026-11-15", true));
    assert_eq!(got.location.as_deref(), Some("Room 204, Main Building"), "escaping survives the server");
    assert_eq!(got.description.as_deref(), Some("From the note mail/a.md in Atlas\nline two"));
    assert!(c.events(&cal, day("2026-12-01"), day("2026-12-31")).unwrap().is_empty(), "the range is honoured");

    // an invite: kept as the server has it; its UID (with @) found again; a cancelled meeting is not this module's job
    let invite = &ics::split_invite("BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:meet/1@uni.example.org\r\nSUMMARY:Comité\r\nDTSTART:20261120T140000Z\r\nDTEND:20261120T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap()[0];
    assert_eq!(c.upsert(&cal, &invite.uid, &invite.ics, None, Existing::Keep).unwrap().0, Outcome::Added);
    assert_eq!(c.upsert(&cal, &invite.uid, &invite.ics, None, Existing::Keep).unwrap().0, Outcome::Unchanged);
    assert!(c.find_uid(&cal, &invite.uid).unwrap().is_some());

    // an event another program stored under a name of its own is found by its UID, never duplicated
    let other = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//other//EN\r\nBEGIN:VEVENT\r\nUID:thunderbird-42\r\nDTSTAMP:20261001T000000Z\r\nSUMMARY:Seminar\r\nDTSTART:20261125T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    assert!((200..300).contains(&raw_put(&s, cal.join("some-other-name.ics").unwrap(), other)));
    let again = ics::split_invite(other).unwrap().remove(0);
    let (o, at) = c.upsert(&cal, &again.uid, &again.ics, None, Existing::Keep).unwrap();
    assert_eq!(o, Outcome::Unchanged);
    assert!(at.as_str().ends_with("some-other-name.ics"), "{at}");
    assert_eq!(c.events(&cal, day("2026-11-01"), day("2026-11-30")).unwrap().len(), 3);

    // remove by UID (under our name and under the other program's); a second time there is nothing to remove
    assert!(c.remove(&cal, &ev.uid).unwrap());
    assert!(!c.remove(&cal, &ev.uid).unwrap());
    assert!(c.remove(&cal, "thunderbird-42").unwrap());
    assert!(c.remove(&cal, &invite.uid).unwrap(), "an invite under its hashed name (its UID has a /)");
    assert!(c.events(&cal, day("2026-11-01"), day("2026-11-30")).unwrap().is_empty());

    // the helper as a command, over a vault, with the 0.1 flat settings (one account, the `password` secret: read as
    // a card until the page moves them): the important notes and the agents' tools
    let vault = s.dir.join("vault");
    let mail = "mail/uni/Inbox/2026-10-20 Rapport.md";
    let note = "notes/Rapport.md";
    let when = (Local::now().date_naive() + Duration::days(20)).to_string();
    std::fs::create_dir_all(vault.join("mail/uni/Inbox/2026-10-20 Rapport files")).unwrap();
    std::fs::create_dir_all(vault.join("notes")).unwrap();
    std::fs::write(vault.join(mail), format!("---\ntype: email\nsubject: \"Rapport d'étape\"\nmessage_id: \"<r1@uni.example.org>\"\nimportant: true\ndue: {when}\n---\n# Rapport\n\n- ![[mail/uni/Inbox/2026-10-20 Rapport files/invite.ics]]\n")).unwrap();
    std::fs::write(vault.join(note), format!("---\nimportant: true\ndue: {when}\ntitle: Rapport d'étape\n---\n")).unwrap();
    let start = (Local::now().date_naive() + Duration::days(25)).format("%Y%m%d").to_string();
    std::fs::write(vault.join("mail/uni/Inbox/2026-10-20 Rapport files/invite.ics"), format!("BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:defence-7@uni.example.org\r\nSUMMARY:Défense\r\nDTSTART:{start}T140000Z\r\nDTEND:{start}T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")).unwrap();
    let params = |extra: Value| {
        let mut p = json!({ "settings": { "url": s.url, "user": s.user, "calendar": cal.as_str(), "past_days": 30, "push_notes": true }, "secrets": { "password": s.password } });
        p.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        p
    };
    // the note's date, never the mail's nor its invite (Email files invitations through import_invite)
    let first = cli(&vault, "sync", params(json!({})));
    assert_eq!(first["summary"], "1 added", "{first:#}");
    let second = cli(&vault, "sync", params(json!({ "paths": [note] })));
    assert_eq!(second["summary"], "1 unchanged", "{second:#}");
    let quiet = cli(&vault, "sync", params(json!({ "paths": ["notes/elsewhere.pdf"] })));
    assert!(quiet["skipped"].is_string(), "{quiet:#}");
    let mut off = params(json!({ "paths": [note] }));
    off["settings"]["push_notes"] = json!(false);
    assert!(cli(&vault, "sync", off)["skipped"].as_str().unwrap().contains("not put on the server"), "opt-in");

    let add = json!({ "title": "Thesis committee", "start": format!("{when}T10:00"), "end": format!("{when}T11:30"), "source": "<r1@uni.example.org>", "key": "committee", "location": "D3" });
    let a1 = cli(&vault, "add_event", params(add.clone()));
    assert_eq!(a1["outcome"], "added");
    assert_eq!(
        cli(&vault, "add_event", params(add.clone()))["outcome"],
        "unchanged",
        "the same date again is one event"
    );
    let mut moved = add.clone();
    moved["start"] = json!(format!("{when}T13:00"));
    moved["end"] = json!(format!("{when}T14:00"));
    let a3 = cli(&vault, "add_event", params(moved));
    assert_eq!((a3["outcome"].as_str(), a3["uid"].as_str()), (Some("updated"), a1["uid"].as_str()));
    let listed =
        // every visible calendar is the default since the Calendar pane (README.md): the account may hold others
        cli(&vault, "events", params(json!({ "to": (Local::now().date_naive() + Duration::days(40)).to_string(), "calendar": cal.as_str() })));
    assert_eq!(listed["events"].as_array().unwrap().len(), 2, "{listed:#}");
    let cals = cli(&vault, "calendars", params(json!({})));
    let first_account = &cals["accounts"][0];
    assert_eq!(first_account["account"], "calendar", "the old settings' account, named after its server: {cals:#}");
    assert!(first_account["calendars"].as_array().unwrap().iter().any(|c| c["name"] == personal.as_str()), "{cals:#}");
    let sug = cli(&vault, "suggest_calendars", params(json!({})));
    let labels: Vec<&str> = sug.as_array().unwrap().iter().filter_map(|x| x["label"].as_str()).collect();
    assert!(
        labels.contains(&format!("calendar · {personal}").as_str()) && !labels.iter().any(|l| l.ends_with(&tasks)),
        "only calendars that take events: {labels:?}"
    );
    let moved_out = cli(&vault, "migrate", params(json!({})));
    assert_eq!(moved_out["values"]["accounts"][0]["name"], "calendar", "{moved_out:#}");
    assert!(moved_out["values"]["url"].is_null());
    let gone = cli(&vault, "remove_event", params(json!({ "uid": a1["uid"] })));
    assert_eq!(gone["removed"], true);
    // leave the account as found: the test's calendars go
    for path in [format!("personal-{tag}/"), format!("tasks-{tag}/")] {
        let r = reqwest::blocking::Client::new()
            .delete(home.join(&path).unwrap())
            .basic_auth(&s.user, Some(&s.password))
            .send()
            .unwrap();
        assert!(r.status().is_success(), "DELETE {path}: {}", r.status());
    }
}
