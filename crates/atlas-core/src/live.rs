//! Live rooms (docs/design/DESIGN-shared-notes.md §3). The devices with a file open join its room (`/api/live?path=…&name=…`) and
//! what each sends reaches the others, stamped with who sent it: `{"from": <peer>, "m": <its message>}`. The server
//! only relays — what a message means (a drawing's changed elements, a pen's pointer) is the clients' (ui lib/live.ts).
//! A joiner is told its own id (`{"t":"hello","peer":n,"writer":w}`); the others hear `{"t":"join"}` and `{"t":"leave"}`
//! from it. One device saves for the room, its **writer** (docs/design/DESIGN-mirror-v2.md §3): the earliest still there;
//! when it leaves, everyone hears `{"t":"writer","peer":w}` (unstamped, from the room itself).
use axum::extract::ws::{Message, WebSocket};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tokio::sync::broadcast;

/// A message larger than this is dropped (a drawing's change with a picture is sent through the file instead).
const MAX_MESSAGE: usize = 4 << 20;

/// A message from the room itself, not from a device: every device hears it.
const ROOM: u64 = 0;

/// What a room carries: who said it (a peer, or [`ROOM`]) and the message.
type Said = (u64, String);

struct Room {
    tx: broadcast::Sender<Said>,
    /// in the order they came: the first is the writer
    members: Vec<u64>,
}

#[derive(Default)]
pub struct Rooms {
    rooms: Mutex<HashMap<String, Room>>,
    next: AtomicU64,
}

impl Rooms {
    /// A new device in `path`'s room: its id, the room's channel, already listening, and who writes. Subscribed under
    /// the rooms' lock, so a writer leaving right after is heard (else the room would wait on a writer that is gone).
    fn join(&self, path: &str) -> (u64, broadcast::Sender<Said>, broadcast::Receiver<Said>, u64) {
        let peer = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let mut rooms = self.rooms.lock().expect("rooms");
        let room = rooms.entry(path.to_string()).or_insert_with(|| Room { tx: broadcast::channel(256).0, members: Vec::new() });
        room.members.push(peer);
        (peer, room.tx.clone(), room.tx.subscribe(), room.members[0])
    }

    /// `peer` left: the room goes with its last device; the writer leaving hands the room to the next.
    fn leave(&self, path: &str, peer: u64) {
        let mut rooms = self.rooms.lock().expect("rooms");
        let Some(room) = rooms.get_mut(path) else { return };
        let was = room.members.first().copied();
        room.members.retain(|&p| p != peer);
        match room.members.first().copied() {
            None => {
                rooms.remove(path);
            }
            Some(w) if Some(w) != was => {
                let _ = room.tx.send((ROOM, serde_json::json!({ "t": "writer", "peer": w }).to_string()));
            }
            Some(_) => {}
        }
    }

    /// How many devices have `path` open.
    pub fn count(&self, path: &str) -> usize {
        self.rooms.lock().expect("rooms").get(path).map_or(0, |r| r.members.len())
    }

    /// Who saves `path` for its room (`None`: nobody has it open).
    pub fn writer(&self, path: &str) -> Option<u64> {
        self.rooms.lock().expect("rooms").get(path).and_then(|r| r.members.first().copied())
    }
}

/// `{"from":peer,"m":<message>}` — the message is JSON already (checked), so it goes in as it came.
fn stamped(peer: u64, message: &str) -> String {
    format!(r#"{{"from":{peer},"m":{message}}}"#)
}

/// One device in `path`'s room until its socket closes.
pub async fn session(mut socket: WebSocket, rooms: std::sync::Arc<Rooms>, path: String, name: String) {
    let (peer, tx, mut rx, writer) = rooms.join(&path);
    let hello = serde_json::json!({ "t": "hello", "peer": peer, "others": tx.receiver_count() - 1, "writer": writer }).to_string();
    let _ = tx.send((peer, stamped(peer, &serde_json::json!({ "t": "join", "name": name }).to_string())));
    if socket.send(Message::Text(hello.into())).await.is_ok() {
        loop {
            tokio::select! {
                got = rx.recv() => match got {
                    Ok((from, text)) if from != peer => if socket.send(Message::Text(text.into())).await.is_err() { break },
                    Ok(_) => {}
                    Err(broadcast::error::RecvError::Lagged(_)) => continue, // a slow device misses pointers, not the file
                    Err(broadcast::error::RecvError::Closed) => break,
                },
                msg = socket.recv() => match msg {
                    Some(Ok(Message::Text(t))) => {
                        if t.len() <= MAX_MESSAGE && serde_json::from_str::<serde::de::IgnoredAny>(&t).is_ok() {
                            let _ = tx.send((peer, stamped(peer, &t)));
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(_)) => {}
                },
            }
        }
    }
    drop(rx);
    let _ = tx.send((peer, stamped(peer, r#"{"t":"leave"}"#)));
    drop(tx);
    rooms.leave(&path, peer);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_room_lives_while_a_device_is_in_it_and_its_first_device_writes() {
        let rooms = Rooms::default();
        let (a, _tx, mut rx, w) = rooms.join("d.excalidraw");
        assert_eq!(w, a, "alone: the writer");
        let (b, _, _, w) = rooms.join("d.excalidraw");
        assert_ne!(a, b);
        assert_eq!((w, rooms.count("d.excalidraw")), (a, 2), "the first stays the writer");
        rooms.leave("d.excalidraw", b);
        assert!(rx.try_recv().is_err(), "a reader leaving changes nothing");
        let (c, _, mut heard, _) = rooms.join("d.excalidraw");
        rooms.leave("d.excalidraw", a);
        // c joined before a left: it hears the handover even though its session had not started listening yet
        assert_eq!(heard.try_recv().unwrap().0, ROOM, "the newcomer hears it is the writer");
        let (from, said) = rx.try_recv().unwrap();
        let said: serde_json::Value = serde_json::from_str(&said).unwrap();
        assert_eq!((from, said), (ROOM, serde_json::json!({ "t": "writer", "peer": c })), "the writer left: the next one");
        assert_eq!(rooms.writer("d.excalidraw"), Some(c));
        drop(rx);
        rooms.leave("d.excalidraw", c);
        assert_eq!((rooms.count("d.excalidraw"), rooms.writer("d.excalidraw")), (0, None));
        assert_eq!(stamped(3, r#"{"t":"pointer","x":1}"#), r#"{"from":3,"m":{"t":"pointer","x":1}}"#);
    }
}
