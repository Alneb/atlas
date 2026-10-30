//! A pane of a mirrored vault whose server did not answer joins this core's room, alone; once the server answers, that
//! session ends and the page's reconnect lands in the server's room (DESIGN-mirror-v2.md §3: one room, one writer).
//! Its own test binary: it points `ATLAS_VAULTS` at a list of its own.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use atlas_core::local_lock::Lock;
use atlas_core::server::{serve_on, Listen};
use futures_util::StreamExt;
use std::time::Duration;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn join(port: u16) -> Socket {
    let req = format!("ws://127.0.0.1:{port}/api/live?path=log.md&name=t").into_client_request().unwrap();
    tokio_tungstenite::connect_async(req).await.unwrap().0
}

/// The room's hello: how many others were there.
async fn others(s: &mut Socket) -> u64 {
    loop {
        match tokio::time::timeout(Duration::from_secs(10), s.next()).await.expect("a hello in time") {
            Some(Ok(Message::Text(t))) => {
                let v: serde_json::Value = serde_json::from_str(&t).unwrap();
                if v["t"] == "hello" {
                    return v["others"].as_u64().unwrap();
                }
            }
            other => panic!("no hello: {other:?}"),
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn a_pane_in_the_fallback_room_moves_to_the_servers_once_it_answers() {
    let (server, desktop, conf) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    for d in [&server, &desktop] {
        std::fs::write(d.path().join("log.md"), "v1\n").unwrap();
    }
    // a port nobody listens on yet: the server's
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let list = conf.path().join("vaults.toml");
    std::env::set_var("ATLAS_VAULTS", &list);
    atlas_core::vaults::remember(&list, desktop.path(), 0).unwrap();
    let root = atlas_core::paths::real(desktop.path()).unwrap(); // as the list stores it (no `\\?\` on Windows)
    atlas_core::vaults::set_mirror(&list, &root.to_string_lossy(), Some(&format!("http://127.0.0.1:{port}/"))).unwrap();
    let here = serve_on(root, Listen::Local(0, Lock::Open)).await.unwrap();

    // the server down: the pane is alone in this core's room
    let mut pane = join(here.port()).await;
    assert_eq!(others(&mut pane).await, 0);

    // the server comes up with someone in its room; within the first re-probe (10 s) the pane's session is ended
    let _srv = serve_on(server.path().to_path_buf(), Listen::Local(port, Lock::Open)).await.unwrap();
    let mut phone = join(port).await;
    assert_eq!(others(&mut phone).await, 0);
    let ended = tokio::time::timeout(Duration::from_secs(25), async {
        while let Some(Ok(m)) = pane.next().await {
            if matches!(m, Message::Close(_)) {
                break;
            }
        }
    })
    .await;
    assert!(ended.is_ok(), "the fallback session was not ended once the server answered");

    // the page reconnects: now through the server's room, with the phone in it
    let mut again = join(here.port()).await;
    assert_eq!(others(&mut again).await, 1, "the server's room");
}
