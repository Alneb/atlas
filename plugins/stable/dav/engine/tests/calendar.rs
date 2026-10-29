//! The Calendar methods (api.rs) against a real CalDAV / CardDAV server (`DAV_TEST_URL` + `DAV_TEST_USER` +
//! `DAV_TEST_PASSWORD`, RustiCal in podman as README.md says; skipped without), and an ICS subscription served here.
//! A second account (`DAV_TEST_USER2` + `DAV_TEST_PASSWORD2`, another principal on the same server) checks several
//! accounts: calendars grouped by account, writing to either, moving an event across them, each account's state.
//! One test, in process: the engine's cache and undo list are the process's.
use atlas_dav::api;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

fn call(method: &str, p: Value) -> Value {
    let f = api::table().into_iter().find(|(n, _)| *n == method).unwrap().1;
    f(p).unwrap_or_else(|e| panic!("{method}: {e}"))
}

/// A one-file web server for the subscription: answers 304 to its own ETag; counts the 200s.
fn feed(ics: &'static str) -> (String, Arc<AtomicUsize>) {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://127.0.0.1:{}/holidays.ics", l.local_addr().unwrap().port());
    let full = Arc::new(AtomicUsize::new(0));
    let n = full.clone();
    std::thread::spawn(move || {
        for s in l.incoming().flatten() {
            let mut r = BufReader::new(s.try_clone().unwrap());
            let mut same = false;
            loop {
                let mut line = String::new();
                if r.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
                same |= line.to_lowercase().starts_with("if-none-match: \"v1\"");
            }
            let mut s = s;
            if same {
                let _ = s.write_all(b"HTTP/1.1 304 Not Modified\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            } else {
                n.fetch_add(1, Ordering::SeqCst);
                let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/calendar\r\nETag: \"v1\"\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{ics}", ics.len());
            }
        }
    });
    (url, full)
}

const HOLIDAYS: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Holidays\r\nBEGIN:VEVENT\r\nUID:remembrance@example.org\r\nSUMMARY:Remembrance Day\r\nDTSTART;VALUE=DATE:20261111\r\nRRULE:FREQ=YEARLY\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

fn raw(method: &str, url: &str, user: &str, pw: &str, body: &str, ctype: &str) -> u16 {
    let m = reqwest::Method::from_bytes(method.as_bytes()).unwrap();
    reqwest::blocking::Client::new().request(m, url).basic_auth(user, Some(pw)).header("Content-Type", ctype).body(body.to_string()).send().unwrap().status().as_u16()
}

fn summaries(r: &Value) -> Vec<String> {
    r["events"].as_array().unwrap().iter().map(|e| format!("{} {}", &e["start"].as_str().unwrap()[..e["start"].as_str().unwrap().len().min(16)], e["summary"].as_str().unwrap())).collect()
}

#[test]
fn the_calendar_against_a_real_server() {
    let (Ok(url), Ok(user), Ok(pw)) = (std::env::var("DAV_TEST_URL"), std::env::var("DAV_TEST_USER"), std::env::var("DAV_TEST_PASSWORD")) else {
        eprintln!("calendar test: skipped — set DAV_TEST_URL/USER/PASSWORD (RustiCal in podman: README.md)");
        return;
    };
    let dir = std::env::temp_dir().join(format!("atlas-cal-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("vault/notes")).unwrap();
    // SAFETY: set before the engine starts, in the test's only thread
    unsafe {
        std::env::set_var("ATLAS_ROOT", dir.join("vault"));
        std::env::set_var("ATLAS_PLUGIN_CACHE", dir.join("cache"));
    }
    std::fs::write(dir.join("vault/notes/Thesis.md"), "---\nimportant: true\ndue: 2026-11-20\n---\n# Thesis draft\n").unwrap();
    let tag = format!("{:x}", chrono::Utc::now().timestamp_micros());
    let base = url.trim_end_matches('/');
    let cal_url = format!("{base}/caldav/principal/{user}/cal-{tag}/");
    let cal = format!("main/cal-{tag}"); // the id: the account's name and the calendar's
    let second = match (std::env::var("DAV_TEST_USER2"), std::env::var("DAV_TEST_PASSWORD2")) {
        (Ok(u), Ok(p)) => Some((u, p)),
        _ => {
            eprintln!("calendar test: one account only — set DAV_TEST_USER2/PASSWORD2 for the second");
            None
        }
    };
    let book = format!("{base}/carddav/principal/{user}/book-{tag}/");
    let mk = format!(r#"<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>Cal {tag}</D:displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></D:prop></D:set></C:mkcalendar>"#);
    assert!((200..300).contains(&raw("MKCALENDAR", &cal_url, &user, &pw, &mk, "application/xml")));
    let cal2_url = second.as_ref().map(|(u2, p2)| {
        let at = format!("{base}/caldav/principal/{u2}/other-{tag}/");
        assert!((200..300).contains(&raw("MKCALENDAR", &at, u2, p2, &mk.replace("Cal ", "Other "), "application/xml")), "the second account's calendar");
        at
    });
    let cal2 = format!("second/other-{tag}");
    let mkbook = r#"<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:CARD="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><CARD:addressbook/></D:resourcetype><D:displayname>Book</D:displayname></D:prop></D:set></D:mkcol>"#;
    let have_book = (200..300).contains(&raw("MKCOL", &book, &user, &pw, mkbook, "application/xml"));
    if have_book {
        let card = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:c1\r\nFN:Ana Ruiz\r\nEMAIL:ana@example.org\r\nORG:Physics\r\nEND:VCARD\r\n";
        assert!((200..300).contains(&raw("PUT", &format!("{book}c1.vcf"), &user, &pw, card, "text/vcard")));
    }

    let (feed_url, fetched) = feed(HOLIDAYS);
    let p = |extra: Value| {
        let mut accounts = vec![json!({ "name": "main", "url": format!("{base}/caldav/"), "user": user })];
        let mut secrets = json!({ "accounts.main.password": pw });
        if let Some((u2, p2)) = &second {
            accounts.push(json!({ "name": "second", "url": format!("{base}/caldav/"), "user": u2, "color": "#22c55e" }));
            secrets["accounts.second.password"] = json!(p2);
        }
        let mut v = json!({
            "settings": { "accounts": accounts, "calendar": cal, "subscriptions": [{ "name": "holidays", "url": feed_url, "refresh": 60 }] },
            "secrets": secrets, "tz": "America/Toronto",
        });
        v.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        v
    };

    // the first pull: the account's calendars and the subscription
    assert_eq!(call("refresh", p(json!({})))["changed"], true);
    let src = call("sources", p(json!({})));
    let ids: Vec<&str> = src["sources"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap()).collect();
    assert!(ids.contains(&cal.as_str()) && ids.contains(&"sub:holidays"), "{src:#}");
    assert_eq!(src["write"], cal.as_str());
    let st = call("account_status", p(json!({})));
    assert_eq!(st["main"]["state"], "ok", "{st:#}");
    assert!(st["main"]["text"].as_str().unwrap().contains("synced just now"), "{st:#}");

    // several accounts: both read, each calendar under its own account, written and moved across them
    if let Some((u2, _)) = &second {
        assert!(ids.contains(&cal2.as_str()), "{ids:?}");
        let other = src["sources"].as_array().unwrap().iter().find(|s| s["id"] == cal2.as_str()).unwrap();
        assert_eq!((other["account"].as_str(), other["shown_color"].as_str()), (Some("second"), Some("#22c55e")), "the account's colour for a calendar without one");
        assert_eq!(st["second"]["state"], "ok", "{st:#}");
        let t = call("calendars", p(json!({})));
        let groups: Vec<&str> = t["accounts"].as_array().unwrap().iter().map(|a| a["account"].as_str().unwrap()).collect();
        assert_eq!(groups, ["main", "second"], "{t:#}");
        assert!(t["accounts"][1]["calendars"].as_array().unwrap().iter().any(|c| c["id"] == cal2.as_str()));
        let sug = call("suggest_calendars", p(json!({})));
        assert!(sug.as_array().unwrap().iter().any(|x| x["value"] == cal2.as_str() && x["label"].as_str().unwrap().starts_with("second · ")), "{sug:#}");
        // Claude adds to the second account's calendar by its id
        let a = call("add_event", p(json!({ "title": "Dentist", "start": "2026-11-05T09:00", "calendar": cal2, "source": format!("test-{tag}") })));
        assert_eq!((a["outcome"].as_str(), a["calendar"].as_str()), (Some("added"), Some(cal2.as_str())), "{a:#}");
        // made in the first account, moved to the second: there, and gone here (on both servers)
        let made = call("create", p(json!({ "summary": "Moving", "start": "2026-11-06T10:00", "end": "2026-11-06T11:00" })));
        assert_eq!(made["calendar"], cal.as_str(), "the default");
        let moved = call("update", p(json!({ "calendar": cal, "href": made["href"], "uid": made["uid"], "scope": "all", "move_to": cal2 })));
        assert_eq!(moved["calendar"], cal2.as_str(), "{moved:#}");
        call("refresh", p(json!({ "force": true })));
        let where_ = |id: &str| summaries(&call("range", p(json!({ "from": "2026-11-05", "to": "2026-11-06", "sources": [id] }))));
        assert_eq!(where_(&cal2), ["2026-11-05T09:00 Dentist", "2026-11-06T10:00 Moving"]);
        assert!(where_(&cal).is_empty(), "the first account's copy is gone");
        // undone: back where it was
        call("undo", p(json!({ "id": moved["undo"] })));
        call("refresh", p(json!({ "force": true })));
        assert_eq!(where_(&cal), ["2026-11-06T10:00 Moving"]);
        assert_eq!(where_(&cal2), ["2026-11-05T09:00 Dentist"]);
        // remove by UID finds the calendar it is in
        let gone = call("remove_event", p(json!({ "uid": a["uid"] })));
        assert_eq!((gone["removed"].as_bool(), gone["calendar"].as_str()), (Some(true), Some(cal2.as_str())), "{gone:#}");
        call("delete", p(json!({ "calendar": cal, "href": made["href"], "uid": made["uid"], "scope": "all" })));
        // a card's Test, with a wrong password typed, and with the kept one
        let bad = call("test_account", p(json!({ "record": { "name": "second", "url": format!("{base}/caldav/"), "user": u2, "password": "wrong" } })));
        assert_eq!(bad["ok"], false, "{bad:#}");
        assert!(bad["text"].as_str().unwrap().contains("app password rejected"), "{bad:#}");
        let good = call("test_account", p(json!({ "record": { "name": "second", "url": format!("{base}/caldav/"), "user": u2 } })));
        assert_eq!(good["ok"], true, "{good:#}");
        // an account with a refused password says so on its card, and the other one still syncs
        let mut wrong = p(json!({ "force": true }));
        wrong["secrets"]["accounts.second.password"] = json!("wrong");
        let r = call("refresh", wrong.clone());
        assert!(r["errors"].as_array().unwrap().iter().any(|e| e.as_str().unwrap().starts_with("second: app password rejected")), "{r:#}");
        let st = call("account_status", wrong);
        assert_eq!((st["main"]["state"].as_str(), st["second"]["state"].as_str()), (Some("ok"), Some("error")), "{st:#}");
        call("refresh", p(json!({ "force": true })));
    }

    // a weekly seminar, made in the user's zone: 10:00 before and after DST ends
    let made = call("create", p(json!({ "summary": "Seminar", "start": "2026-10-26T10:00", "end": "2026-10-26T11:00", "rrule": "FREQ=WEEKLY;COUNT=4" })));
    let (href, uid) = (made["href"].as_str().unwrap().to_string(), made["uid"].as_str().unwrap().to_string());
    let nov = || call("range", p(json!({ "from": "2026-10-25", "to": "2026-11-30", "sources": [cal] })));
    let r = nov();
    assert_eq!(summaries(&r), ["2026-10-26T10:00 Seminar", "2026-11-02T10:00 Seminar", "2026-11-09T10:00 Seminar", "2026-11-16T10:00 Seminar"]);
    assert!(r["events"][1]["start"].as_str().unwrap().ends_with("-05:00"), "{r:#}");
    assert_eq!(call("refresh", p(json!({})))["changed"], false, "the ctag did not move: nothing fetched");

    // this occurrence moved, then undone; the following ones deleted
    let moved = call("update", p(json!({ "calendar": cal, "href": href, "uid": uid, "rid": "20261102T100000", "scope": "this", "start": "2026-11-02T15:00", "end": "2026-11-02T16:00" })));
    assert_eq!(summaries(&nov())[1], "2026-11-02T15:00 Seminar");
    call("undo", p(json!({ "id": moved["undo"] })));
    assert_eq!(summaries(&nov())[1], "2026-11-02T10:00 Seminar");
    call("delete", p(json!({ "calendar": cal, "href": href, "uid": uid, "rid": "20261109T100000", "scope": "following" })));
    assert_eq!(summaries(&nov()).len(), 2);
    call("refresh", p(json!({})));
    assert_eq!(summaries(&nov()).len(), 2, "the server agrees after a pull");

    // the subscription and the vault's important note, in the visible range
    let all = call("range", p(json!({ "from": "2026-11-01", "to": "2026-11-30", "notes": true })));
    let s = summaries(&all);
    assert!(s.contains(&"2026-11-11 Remembrance Day".to_string()) && s.contains(&"2026-11-20 Due: Thesis draft".to_string()), "{s:?}");
    assert_eq!(fetched.load(Ordering::SeqCst), 1);
    call("refresh", p(json!({ "force": true })));
    assert_eq!(fetched.load(Ordering::SeqCst), 1, "the second fetch was a 304");
    assert_eq!(call("test_subscription", json!({ "record": { "name": "h", "url": feed_url } }))["events"], 1);

    // an invitation: filed with the answer, the same again unchanged, a new answer updated; its conflicts
    call("create", p(json!({ "summary": "Group meeting", "start": "2026-11-04T10:30", "end": "2026-11-04T11:30" })));
    let inv = &format!("BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:committee-{tag}@example.org\r\nDTSTAMP:20261020T100000Z\r\nSUMMARY:Committee\r\nDTSTART:20261104T150000Z\r\nDTEND:20261104T160000Z\r\nORGANIZER:mailto:prof@example.org\r\nATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:me@example.org\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n");
    let st = call("invite_status", p(json!({ "ics": inv, "attendee": "me@example.org" })));
    assert_eq!((st["in_calendar"].as_bool(), st["start"].as_str()), (Some(false), Some("2026-11-04T10:00:00-05:00")), "{st:#}");
    assert!(st["conflicts"].as_array().unwrap().iter().any(|c| c["summary"] == "Group meeting"), "{st:#}");
    let a = call("import_invite", p(json!({ "ics": inv, "source": "<m1@mail.example.org>", "partstat": "ACCEPTED", "attendee": "me@example.org" })));
    assert_eq!(a["status"], "added", "{a:#}");
    assert_eq!(call("import_invite", p(json!({ "ics": inv, "source": "<m1@mail.example.org>", "partstat": "ACCEPTED", "attendee": "me@example.org" })))["status"], "unchanged");
    assert_eq!(call("import_invite", p(json!({ "ics": inv, "source": "<m1@mail.example.org>", "partstat": "TENTATIVE", "attendee": "me@example.org" })))["status"], "updated");
    let st = call("invite_status", p(json!({ "ics": inv })));
    assert_eq!((st["in_calendar"].as_bool(), st["partstat"].as_str()), (Some(true), Some("TENTATIVE")), "as Email asks, with the ics only: {st:#}");

    // quick add, search, the agenda
    assert_eq!(call("quick", p(json!({ "text": "lunch with Ana tomorrow 13:00", "now": "2026-10-23T09:00" })))["start"], "2026-10-24T13:00");
    // (the account may hold other calendars: only this one's hit is checked)
    assert!(summaries(&call("search", p(json!({ "q": "committee" })))).contains(&"2026-11-04T10:00 Committee".to_string()));
    let today = chrono::Local::now().date_naive();
    call("create", p(json!({ "summary": "Today's thing", "start": format!("{today}T23:00"), "end": format!("{today}T23:30"), "tz": chrono_tz_local() })));
    let ag = call("agenda", p(json!({ "days": 1, "tz": chrono_tz_local() })));
    assert!(ag["events"].as_array().unwrap().iter().any(|e| e["line"] == "23:00 Today's thing"), "{ag:#}");

    if have_book {
        let c = call("contacts", p(json!({ "q": "ana" })));
        assert_eq!(c, json!([{ "name": "Ana Ruiz", "emails": ["ana@example.org"], "org": "Physics" }]));
    } else {
        eprintln!("calendar test: the server made no address book; contacts not checked");
    }

    for u in [&cal_url, &book] {
        raw("DELETE", u, &user, &pw, "", "text/plain");
    }
    if let (Some((u2, p2)), Some(at)) = (&second, &cal2_url) {
        raw("DELETE", at, u2, p2, "", "text/plain");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// The machine's zone (the agenda's "today" must be the test's).
fn chrono_tz_local() -> String {
    atlas_dav::zone::user_zone(None).name()
}
