//! `GET /api/where` lists who is where — each device in the `where` live room and the file it said it shows — and a
//! local vault with a copy on a server answers with the server's room, where its pages are (live.rs, DESIGN-mirror-v2.md §3).
//! Its own test binary: it points `ATLAS_VAULTS` at a list of its own.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use atlas_core::local_lock::Lock;
use atlas_core::server::{serve_on, Listen};
use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// A device in the `where` room, past its hello.
async fn join(port: u16, name: &str) -> Socket {
    let req = format!("ws://127.0.0.1:{port}/api/live?path=.atlas/cache/where&name={name}").into_client_request().unwrap();
    let mut s = tokio_tungstenite::connect_async(req).await.unwrap().0;
    loop {
        match tokio::time::timeout(Duration::from_secs(10), s.next()).await.expect("a hello in time") {
            Some(Ok(Message::Text(t))) if t.contains(r#""t":"hello""#) => return s,
            Some(Ok(_)) => {}
            other => panic!("no hello: {other:?}"),
        }
    }
}

/// `GET /api/where`'s devices, asked until `done` holds of them (a message reaches the room a moment after it is sent).
async fn devices(port: u16, done: impl Fn(&[serde_json::Value]) -> bool) -> Vec<serde_json::Value> {
    let mut last = Vec::new();
    for _ in 0..50 {
        let v: serde_json::Value = reqwest::Client::new().get(format!("http://127.0.0.1:{port}/api/where")).header("x-atlas", "1").send().await.unwrap().json().await.unwrap();
        last = v["devices"].as_array().cloned().unwrap_or_default();
        if done(&last) {
            return last;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("never: {last:?}")
}

#[tokio::test(flavor = "multi_thread")]
async fn where_lists_the_devices_places_and_a_mirrored_vault_asks_its_server() {
    let (server, desktop, conf) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let list = conf.path().join("vaults.toml");
    std::env::set_var("ATLAS_VAULTS", &list);

    // a vault on its own: the room is this core's
    let srv = serve_on(server.path().to_path_buf(), Listen::Local(0, Lock::Open)).await.unwrap();
    assert!(devices(srv.port(), |d| d.is_empty()).await.is_empty(), "nobody is there");
    let mut phone = join(srv.port(), "phone").await;
    let mut boox = join(srv.port(), "Boox").await;
    assert!(devices(srv.port(), |d| d.is_empty()).await.is_empty(), "in the room, but nothing said yet");
    phone.send(Message::Text(r#"{"t":"at","path":"notes/a.md","line":7,"device":"p-1"}"#.into())).await.unwrap();
    boox.send(Message::Text(r#"{"t":"at","path":"refs/x.pdf","page":3}"#.into())).await.unwrap();
    let both = devices(srv.port(), |d| d.len() == 2).await;
    assert_eq!((both[0]["name"].as_str(), both[0]["path"].as_str(), both[0]["line"].as_u64(), both[0]["device"].as_str()), (Some("phone"), Some("notes/a.md"), Some(7), Some("p-1")));
    assert_eq!((both[1]["name"].as_str(), both[1]["path"].as_str(), both[1]["page"].as_u64()), (Some("Boox"), Some("refs/x.pdf"), Some(3)));

    // a local vault mirrored on that server: its core answers with the server's room
    atlas_core::vaults::remember(&list, desktop.path(), 0).unwrap();
    let root = atlas_core::paths::real(desktop.path()).unwrap();
    atlas_core::vaults::set_mirror(&list, &root.to_string_lossy(), Some(&format!("http://127.0.0.1:{}/", srv.port()))).unwrap();
    let here = serve_on(root, Listen::Local(0, Lock::Open)).await.unwrap();
    assert_eq!(devices(here.port(), |d| d.len() == 2).await, both, "the server's room, as the server says it");

    // a device that leaves is nowhere
    boox.close(None).await.unwrap();
    let left = devices(srv.port(), |d| d.len() == 1).await;
    assert_eq!(left[0]["name"].as_str(), Some("phone"));
}
