//! WebDAV Push against a real server (RustiCal, README.md "Tests": `DAV_TEST_URL` + `DAV_TEST_USER` +
//! `DAV_TEST_PASSWORD`; skipped without). The push resource is a stand-in ntfy on this machine, so the server must
//! reach 127.0.0.1 (podman `--network host`). A calendar is subscribed, an event put in it, and the server's push must
//! arrive at the calendar's topic.
use atlas_dav::caldav::{Account, Client};
use atlas_dav::push;
use atlas_dav::store::Store;
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::mpsc;
use std::time::Duration;

fn raw(method: &str, url: &str, user: &str, pw: &str, body: &str, ctype: &str) -> u16 {
    reqwest::blocking::Client::new()
        .request(reqwest::Method::from_bytes(method.as_bytes()).unwrap(), url)
        .basic_auth(user, Some(pw))
        .header("Content-Type", ctype)
        .body(body.to_string())
        .send()
        .unwrap()
        .status()
        .as_u16()
}

/// A stand-in ntfy: every POST's path and headers sent on `tx`.
fn ntfy() -> (u16, mpsc::Receiver<String>) {
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for s in l.incoming() {
            let Ok(mut s) = s else { continue };
            let mut r = BufReader::new(s.try_clone().unwrap());
            let mut head = String::new();
            loop {
                let mut line = String::new();
                if r.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
                head.push_str(&line);
            }
            let len = head.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").and_then(|n| n.trim().parse::<usize>().ok())).unwrap_or(0);
            let mut b = vec![0; len];
            let _ = r.read_exact(&mut b);
            let _ = s.write_all(b"HTTP/1.1 201 Created\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            let _ = tx.send(head);
        }
    });
    (port, rx)
}

#[test]
fn a_change_to_a_subscribed_calendar_is_pushed_to_its_topic() {
    let (Ok(base), Ok(user), Ok(pw)) = (std::env::var("DAV_TEST_URL"), std::env::var("DAV_TEST_USER"), std::env::var("DAV_TEST_PASSWORD")) else {
        eprintln!("push test: skipped — set DAV_TEST_URL/USER/PASSWORD (a RustiCal the test's 127.0.0.1 can be reached from)");
        return;
    };
    let base = base.trim_end_matches('/').to_string();
    let tag = format!("push{}", std::process::id());
    let cal = format!("{base}/caldav/principal/{user}/{tag}/");
    let mk = r#"<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>Push</D:displayname></D:prop></D:set></C:mkcalendar>"#;
    assert!((200..300).contains(&raw("MKCALENDAR", &cal, &user, &pw, mk, "application/xml")), "MKCALENDAR {cal}");

    let client = Client::new(&Account { url: format!("{base}/caldav/"), user: user.clone(), password: pw.clone() }).unwrap();
    let url = url::Url::parse(&cal).unwrap();
    assert!(push::offers(&client, &url).unwrap(), "the calendar offers Web Push");
    let (port, pushes) = ntfy();
    let store = Store::memory();
    let server = format!("http://127.0.0.1:{port}");
    let topics = push::keep(&store, &server, &[("t/push".into(), &client, url.clone())]);
    assert_eq!(topics.len(), 1, "one topic for the calendar");
    let row = store.push_row("t/push").unwrap();
    assert!(!row.location.is_empty(), "the server named the subscription: {row:?}");
    assert_eq!(push::keep(&store, &server, &[("t/push".into(), &client, url.clone())]), topics, "a round with nothing due asks nothing new");

    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nBEGIN:VEVENT\r\nUID:push-1\r\nDTSTAMP:20261026T100000Z\r\nDTSTART:20261027T100000Z\r\nSUMMARY:pushed\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    assert!((200..300).contains(&raw("PUT", &format!("{cal}push-1.ics"), &user, &pw, ics, "text/calendar")));
    let got = pushes.recv_timeout(Duration::from_secs(20)).expect("the server pushed within 20 s");
    assert!(got.starts_with(&format!("POST /{}?up=1 ", topics[0].0)), "{got}");
    assert!(got.to_ascii_lowercase().contains("content-encoding: aes128gcm"), "encrypted to the subscription's key: {got}");

    // push switched off: the subscription removed from the server and the cache
    assert!(push::keep(&store, "", &[("t/push".into(), &client, url.clone())]).is_empty());
    assert!(store.push_rows().is_empty());
    let _ = raw("DELETE", &cal, &user, &pw, "", "text/plain");
}
